// One processing cycle (activate + label, all channels) and the internal
// timer loop that replaces Windows Task Scheduler. Mirrors index.js `cmdAuto`
// exactly, but reuses the server's persistent client (src/agent.js) instead of
// launching a fresh browser each time.

import {
  CHANNELS,
  resolveChannel,
  todayIST,
  processingDates,
  LOOKBACK_DAYS,
  LOOKBACK_EVERY_MS,
} from "./config.js";
import { SessionExpiredError } from "./api.js";
import { activateChannel } from "./activate.js";
import { processChannel } from "./pipeline.js";
import { raiseSessionAlert, clearSessionAlert } from "./alert.js";
import { sendEmail } from "./notify.js";
import { store } from "./store.js";
import { log } from "./log.js";
import { getClient, checkSession } from "./agent.js";

// Look-back pacing. Today is processed every cycle (every 15 min). Yesterday and
// the day before are checked at most hourly.
//
// WHY the gate: with 4 channels and a 3-day window, every cycle would run 12
// pick-task discoveries and validations instead of 4. That tripled load on
// SmartHub for dates that are almost always finished, and 503s from SmartHub are
// the single most common failure this agent sees. Starting at 0 means the first
// cycle after any restart DOES include the look-back, which is when a missed day
// is most likely to be sitting there.
let lastLookbackAt = 0;

// Email about a degraded store once per outage, not once per cycle.
let degradedNotified = false;

// `lastAt` is injectable so this is testable without reaching into module state.
export function datesForThisCycle({ now = Date.now(), lookbackDays = LOOKBACK_DAYS, lastAt = lastLookbackAt } = {}) {
  const all = processingDates({ lookbackDays, now: new Date(now) });
  const due = now - lastAt >= LOOKBACK_EVERY_MS;
  return due ? all : all.slice(0, 1);
}

// Orders that have been announced as parked, so the operator is emailed once per
// order and not every 15 minutes. An id that stops being parked (retried, or
// finally labelled) is dropped, so if it parks again it is announced again.
const announcedParked = new Set();

async function notifyNewlyParked() {
  let parked;
  try {
    parked = store.listFailures({ parkedOnly: true });
  } catch {
    return;
  }
  const ids = new Set(parked.map((p) => p.customerShipmentId));
  for (const id of [...announcedParked]) if (!ids.has(id)) announcedParked.delete(id);

  const fresh = parked.filter((p) => !announcedParked.has(p.customerShipmentId));
  if (!fresh.length) return;
  for (const p of fresh) announcedParked.add(p.customerShipmentId);

  const lines = fresh.map(
    (p) => `  ${p.orderId || "(no order id)"} [${p.customerShipmentId}]  ${p.channel}  ship ${p.date}\n    ${p.reason}`
  );
  await sendEmail(
    `SmartHub: ${fresh.length} order(s) need attention`,
    [
      `${fresh.length} order(s) failed repeatedly and have been parked. The agent will NOT retry them until you say so.`,
      "",
      ...lines,
      "",
      "Open the control page and use 'Needs attention' to retry, or handle the order directly in SmartHub.",
      `A parked order is skipped, so nothing else is held up — but these parcels will not ship until someone acts.`,
    ].join("\n")
  ).catch((e) => log.warn(`Could not email the parked-order notice: ${e.message}`));
}

export async function runCycle({ date } = {}) {
  // Refuse to touch live orders on a broken state file. A degraded store reads
  // as EMPTY, which would make every order on the floor look unprocessed and
  // produce a second label for all of them. Stop, shout, and wait for a human.
  const health = store.health();
  if (!health.ok) {
    log.err(`Cycle ABORTED — ${health.reason}`);
    if (health.quarantinedTo) log.err(`The unreadable file was moved to ${health.quarantinedTo}`);
    log.err(health.hint);
    if (!degradedNotified) {
      degradedNotified = true;
      await sendEmail(
        "SmartHub: processing STOPPED — state file unreadable",
        [
          "The agent has stopped processing orders because its state file could not be read.",
          "",
          `Reason: ${health.reason}`,
          health.quarantinedTo ? `Corrupt file kept at: ${health.quarantinedTo}` : "",
          "",
          health.hint,
          "",
          "Nothing will be labelled or printed until this is fixed. No orders have been lost.",
        ]
          .filter(Boolean)
          .join("\n")
      ).catch((e) => log.warn(`Could not email the degraded-state notice: ${e.message}`));
    }
    return { ok: false, reason: "store-degraded", health };
  }
  degradedNotified = false;

  // One explicit date (a manual catch-up run) or today plus the look-back window.
  const dates = date ? [date] : datesForThisCycle();
  const didLookback = dates.length > 1;
  const channels = Object.keys(CHANNELS).map(resolveChannel);
  const client = await getClient();

  log.info(
    `Cycle start — ${dates.join(", ")} — channels: ${channels.map((c) => c.key).join(", ")}` +
      (didLookback ? ` (including ${dates.length - 1} look-back day(s))` : "")
  );

  // Use agent.js's checkSession (not client.checkSession directly) so the
  // cached session state — what the web page's status bar reads — actually
  // gets updated every cycle, not just when the Login button runs.
  const alive = await checkSession();
  if (!alive) {
    await raiseSessionAlert("checkSession failed at start of cycle");
    return { ok: false, reason: "session-expired" };
  }
  await clearSessionAlert();

  const results = [];
  let expired = false;
  for (const ch of channels) {
    try {
      // Activation is date-agnostic: it reads SmartHub's recommended pick-list
      // slots for upcoming pickups. Run it ONCE per channel, not once per date,
      // or a 3-date cycle would activate the same lists three times over.
      await activateChannel(client, { channel: ch, dryRun: false });
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        await raiseSessionAlert(e.message);
        store.audit(ch.key, "session-expired", e.message);
        break;
      }
      log.err(`[${ch.key}] activation error: ${e.message}`);
      store.audit(ch.key, "auto-error", `activate: ${e.message}`);
    }

    for (let i = 0; i < dates.length; i++) {
      const shipDate = dates[i];
      try {
        const r = await processChannel(client, {
          channel: ch,
          date: shipDate,
          dryRun: false,
          limit: Infinity,
          // Index 0 is today — always reported. Earlier dates stay quiet unless
          // they actually have work, so the log doesn't fill with "nothing on
          // 2026-10-13" four times an hour.
          quietIfEmpty: i > 0,
        });
        results.push(r);
      } catch (e) {
        if (e instanceof SessionExpiredError) {
          await raiseSessionAlert(e.message);
          store.audit(ch.key, "session-expired", e.message);
          expired = true;
          break;
        }
        log.err(`[${ch.key}] cycle error on ${shipDate}: ${e.message}`);
        store.audit(ch.key, "auto-error", `${shipDate}: ${e.message}`);
      }
    }
    if (expired) break;
  }

  // Only mark the look-back as done once it actually ran, so a cycle that bailed
  // early doesn't push the next catch-up attempt an hour away.
  if (didLookback) lastLookbackAt = Date.now();

  await notifyNewlyParked();

  // Daily safety copy of state.json. Cheap, idempotent (once per IST day) and
  // skipped while degraded, so a bad state can never overwrite a good backup.
  const backup = store.backupDaily();
  if (backup) log.info(`State backed up to ${backup}`);

  log.ok("Cycle complete.");
  return { ok: true, results, dates };
}

let timer = null;

// Milliseconds until the next wall-clock boundary for this interval, using the
// machine's LOCAL time. With a 15-min interval that means :00, :15, :30, :45 —
// not "15 minutes after whenever the server happened to start".
// If we're exactly on a boundary, returns a full interval (never fires twice).
export function msUntilNextBoundary(intervalMs, now = new Date()) {
  const msIntoDay =
    now.getHours() * 3600000 +
    now.getMinutes() * 60000 +
    now.getSeconds() * 1000 +
    now.getMilliseconds();
  return intervalMs - (msIntoDay % intervalMs);
}

// Start the processing loop, aligned to the clock. Runs once immediately (so a
// restart doesn't idle for up to a full interval), then on each boundary.
// Re-arms with setTimeout after every run rather than setInterval, so it can't
// drift out of alignment over days of running.
// Callers should route every invocation through the job queue so it never
// overlaps a manual action.
export function startScheduler(runFn, intervalMs = 15 * 60 * 1000) {
  if (timer) return;
  const tick = () => runFn().catch((e) => log.err(`Scheduled cycle failed: ${e.message}`));

  const armNext = () => {
    const delay = msUntilNextBoundary(intervalMs);
    const at = new Date(Date.now() + delay);
    log.info(`Next scheduled cycle at ${at.toLocaleTimeString()}`);
    timer = setTimeout(async () => {
      await tick();
      armNext();
    }, delay);
  };

  tick();
  armNext();
}

export function stopScheduler() {
  if (timer) clearTimeout(timer);
  timer = null;
}
