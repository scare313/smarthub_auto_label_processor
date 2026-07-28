// One processing cycle (activate + label, all channels) and the internal
// timer loop that replaces Windows Task Scheduler. Mirrors index.js `cmdAuto`
// exactly, but reuses the server's persistent client (src/agent.js) instead of
// launching a fresh browser each time.

import { CHANNELS, resolveChannel, todayIST } from "./config.js";
import { SessionExpiredError } from "./api.js";
import { activateChannel } from "./activate.js";
import { processChannel } from "./pipeline.js";
import { raiseSessionAlert, clearSessionAlert } from "./alert.js";
import { store } from "./store.js";
import { log } from "./log.js";
import { getClient, checkSession } from "./agent.js";

export async function runCycle({ date } = {}) {
  const shipDate = date || todayIST();
  const channels = Object.keys(CHANNELS).map(resolveChannel);
  const client = await getClient();

  log.info(`Cycle start — ${shipDate} — channels: ${channels.map((c) => c.key).join(", ")}`);

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
  for (const ch of channels) {
    try {
      await activateChannel(client, { channel: ch, dryRun: false });
      const r = await processChannel(client, { channel: ch, date: shipDate, dryRun: false, limit: Infinity });
      results.push(r);
    } catch (e) {
      if (e instanceof SessionExpiredError) {
        await raiseSessionAlert(e.message);
        store.audit(ch.key, "session-expired", e.message);
        break;
      }
      log.err(`[${ch.key}] cycle error: ${e.message}`);
      store.audit(ch.key, "auto-error", e.message);
    }
  }
  log.ok("Cycle complete.");
  return { ok: true, results };
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
