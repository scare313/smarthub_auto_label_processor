// heartbeat: notice when processing has silently STOPPED.
//
// The session alert (alert.js) covers "logged out". This covers the other ways
// order processing dies quietly:
//   - the scheduler stalled or a cycle hung
//   - the PC went to sleep / the server crashed
//   - the OTHER machine died (checked by the hub, which already polls peers)
//
// Emails once when a problem starts and once when it recovers — never on every
// check — matching the session-alert behaviour.
//
// KNOWN GAP: a machine cannot report its own total death. Self-checks catch
// stalls; peer-checks catch the other machine dying. If the hub itself is
// powered off, nothing emails you — that needs an external watcher (e.g. the
// always-on Ubuntu server) to close properly.

import { log } from "./log.js";
import { sendEmail } from "./notify.js";

// A cycle should complete every 15 min; allow generous slack so a slow batch or
// a long print never trips a false alarm.
const STALE_AFTER_MS = 45 * 60 * 1000;
const PEER_STALE_AFTER_MS = 45 * 60 * 1000;

// Which problems are currently "open", so each is emailed once, not repeatedly.
const active = new Set();

async function raise(key, subject, body) {
  if (active.has(key)) return; // already reported
  active.add(key);
  log.err(`HEARTBEAT: ${subject}`);
  await sendEmail(subject, body);
}

async function clear(key, subject, body) {
  if (!active.has(key)) return; // wasn't a problem
  active.delete(key);
  log.ok(`HEARTBEAT recovered: ${subject}`);
  await sendEmail(subject, body);
}

function minutesAgo(iso) {
  return Math.round((Date.now() - new Date(iso).getTime()) / 60000);
}

// Called periodically by the server.
//   selfName    - this machine's friendly name
//   lastCycleAt - ISO string of the last completed cycle (null if none yet)
//   peers       - [{ name, online, lastCycleAt }] (hub only; [] on a processor)
export async function checkHeartbeat({ selfName, lastCycleAt, peers = [] }) {
  // --- this machine: has a cycle completed recently? ---
  const key = "self-stale";
  if (!lastCycleAt) {
    // Server only just started and hasn't finished its first cycle — not a fault.
  } else if (Date.now() - new Date(lastCycleAt).getTime() > STALE_AFTER_MS) {
    await raise(
      key,
      `⚠ SmartHub: ${selfName} has stopped processing orders`,
      `No processing cycle has completed on ${selfName} for ${minutesAgo(lastCycleAt)} minutes ` +
        `(expected every 15).\n\nOrders are probably NOT being labelled. Check that the server is ` +
        `still running on that PC, and that the Amazon session is still logged in.\n\n` +
        `Last completed cycle: ${new Date(lastCycleAt).toLocaleString()}`
    );
  } else {
    await clear(
      key,
      `✅ SmartHub: ${selfName} is processing again`,
      `Processing resumed on ${selfName}.\n\nLast cycle: ${new Date(lastCycleAt).toLocaleString()}`
    );
  }

  // --- peers: is the other machine alive and still working? ---
  for (const p of peers) {
    const offKey = `peer-offline:${p.name}`;
    const staleKey = `peer-stale:${p.name}`;

    if (!p.online) {
      await raise(
        offKey,
        `⚠ SmartHub: ${p.name} is unreachable`,
        `${selfName} cannot reach ${p.name}.\n\nThat PC may be switched off, asleep, or its ` +
          `server may have stopped. Its orders are NOT being processed, and its labels will be ` +
          `missing from combined prints.`
      );
      continue;
    }

    await clear(offKey, `✅ SmartHub: ${p.name} is back online`, `${selfName} can reach ${p.name} again.`);

    if (p.lastCycleAt && Date.now() - new Date(p.lastCycleAt).getTime() > PEER_STALE_AFTER_MS) {
      await raise(
        staleKey,
        `⚠ SmartHub: ${p.name} has stopped processing orders`,
        `${p.name} is reachable but no cycle has completed there for ${minutesAgo(p.lastCycleAt)} ` +
          `minutes.\n\nIts Amazon session may have expired. Open that machine's page and log in.`
      );
    } else if (p.lastCycleAt) {
      await clear(staleKey, `✅ SmartHub: ${p.name} is processing again`, `${p.name} has resumed processing.`);
    }
  }
}

// Exposed for the control page / debugging.
export function activeHeartbeatIssues() {
  return [...active];
}
