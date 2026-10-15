// Tiny JSON-file state store for idempotency + audit.
// Zero native dependencies (avoids better-sqlite3 build pain on Windows).
//
// Shape:
// {
//   processed: { "<customerShipmentId>": { orderId, channel, date, status, labelFile, trackingId, ts } },
//   failures:  { "<customerShipmentId>": { orderId, channel, date, reason, attempts, hardAttempts, parked, firstAt, lastAt } },
//   audit:     [ { ts, channel, action, detail } ],
//   lastPrint: { files, ts },
//   backupDay: "YYYY-MM-DD"
// }
//
// Two safety rules govern everything below.
//
// 1. A PARSE FAILURE IS NEVER TREATED AS "NO STATE". This file is the record of
//    which orders already have labels. Reading a truncated or corrupt file as an
//    empty object would make every order on the floor look unprocessed, and the
//    next cycle would generate a second set of labels for all of them. So a
//    corrupt file is quarantined, the store latches into a degraded state, and
//    callers must stop. A human restores a backup and restarts. We deliberately
//    do NOT auto-restore: an older backup would mark recently printed orders as
//    unprinted and reprint them.
//
// 2. A MISSING FILE IS NORMAL. First run on a fresh machine has no state.json,
//    and that must not look like corruption. ENOENT is the one error we accept.

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, MAX_ORDER_ATTEMPTS, BACKUP_RETENTION_DAYS, todayIST } from "./config.js";

const STORE_PATH = path.join(DATA_DIR, "state.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");
const BACKUP_NAME_RE = /^state-(\d{4}-\d{2}-\d{2})\.json$/;

const EMPTY = () => ({ processed: {}, failures: {}, audit: [] });

// Sticky: once we have seen a corrupt state file, this process refuses to do
// live work until it is restarted with a good file. Not persisted on purpose —
// restarting after restoring a backup is exactly how you clear it.
let degraded = null; // null = healthy, else { reason, quarantinedTo, at }

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Move the unreadable file aside so the operator still has the bytes to inspect
// (or salvage by hand) and so a later good write cannot overwrite the evidence.
function quarantine(err) {
  let movedTo = null;
  try {
    const stampedName = `state.corrupt-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    movedTo = path.join(DATA_DIR, stampedName);
    fs.renameSync(STORE_PATH, movedTo);
  } catch {
    movedTo = null; // could not move it; the degraded latch below still protects us
  }
  degraded = {
    reason: `state.json is unreadable (${err.message})`,
    quarantinedTo: movedTo,
    at: new Date().toISOString(),
  };
  return degraded;
}

// Is there a quarantined file lying about? If state.json is missing AND one of
// these exists, this is not a fresh install — it is the restart after a
// corruption, and an empty state would silently re-label every order on the
// floor. Treat it as degraded until a human puts a real file back.
function hasQuarantineMarker() {
  try {
    return fs.readdirSync(DATA_DIR).some((n) => n.startsWith("state.corrupt-"));
  } catch {
    return false;
  }
}

function read() {
  ensureDir();
  let text;
  try {
    text = fs.readFileSync(STORE_PATH, "utf8");
  } catch (e) {
    if (e.code === "ENOENT") {
      if (!degraded && hasQuarantineMarker()) {
        degraded = {
          reason: "state.json is missing but a quarantined state.corrupt-* file is present",
          quarantinedTo: null,
          at: new Date().toISOString(),
        };
        return EMPTY();
      }
      return EMPTY(); // first run — genuinely no state yet
    }
    if (!degraded) quarantine(e);
    return EMPTY();
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || typeof parsed.processed !== "object") {
      throw new Error("missing the processed map");
    }
  } catch (e) {
    if (!degraded) quarantine(e);
    return EMPTY();
  }
  // Tolerate files written by an older version that had no failures map.
  if (!parsed.failures || typeof parsed.failures !== "object") parsed.failures = {};
  if (!Array.isArray(parsed.audit)) parsed.audit = [];
  return parsed;
}

// Atomic write: write to temp then rename, so a crash never corrupts state.
//
// Throws while degraded. Callers are supposed to check health() before doing
// live work, and this is the backstop for any path that forgets: a degraded
// read hands back an EMPTY state, so an unguarded write would persist that
// empty state as the new truth and the next cycle would re-label everything.
// Failing loudly is the only safe behaviour here.
function write(state) {
  if (degraded) {
    throw new Error(
      `Refusing to write state while degraded: ${degraded.reason}. Restore a backup from ${BACKUP_DIR} and restart.`
    );
  }
  ensureDir();
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

function newestUsableBackup() {
  try {
    const names = fs.readdirSync(BACKUP_DIR).filter((n) => BACKUP_NAME_RE.test(n)).sort();
    const newest = names[names.length - 1];
    return newest ? path.join(BACKUP_DIR, newest) : null;
  } catch {
    return null;
  }
}

function pruneBackups() {
  try {
    const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    for (const name of fs.readdirSync(BACKUP_DIR)) {
      const m = BACKUP_NAME_RE.exec(name);
      if (m && m[1] < cutoff) fs.unlinkSync(path.join(BACKUP_DIR, name));
    }
  } catch {
    // Housekeeping only.
  }
}

export const store = {
  // --- health ------------------------------------------------------------

  // Every caller that is about to generate labels or print must check this
  // first. ok:false means "do not touch live orders".
  health() {
    read(); // a first call on a corrupt file is what sets the latch
    if (!degraded) return { ok: true };
    const backup = newestUsableBackup();
    return {
      ok: false,
      reason: degraded.reason,
      quarantinedTo: degraded.quarantinedTo,
      newestBackup: backup,
      hint: backup
        ? `Copy ${backup} over ${STORE_PATH}, then restart the agent. Orders labelled after that backup will be re-labelled, so check SmartHub for BOUND status before printing.`
        : `No backup found in ${BACKUP_DIR}. Start from an empty state only if you have confirmed in SmartHub which orders are already BOUND — otherwise they will be labelled twice.`,
    };
  },

  isDegraded() {
    return !store.health().ok;
  },

  // --- daily backup ------------------------------------------------------

  // Copy state.json to data/backups/state-<IST date>.json, once per day.
  // Returns the path written, or null if nothing was done.
  //
  // Blocked while degraded: a degraded read returns an EMPTY state, and writing
  // that over today's backup would destroy the only copy worth restoring.
  backupDaily() {
    if (!store.health().ok) return null;
    const day = todayIST();
    const s = read();
    if (s.backupDay === day) return null; // already done today
    if (!Object.keys(s.processed).length) return null; // nothing worth keeping yet
    try {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
      const dest = path.join(BACKUP_DIR, `state-${day}.json`);
      fs.copyFileSync(STORE_PATH, dest);
      s.backupDay = day;
      write(s);
      pruneBackups();
      return dest;
    } catch {
      return null; // a failed backup must never stop order processing
    }
  },

  newestBackup() {
    return newestUsableBackup();
  },

  // Snapshot for the peer backup exchange. Returns the raw file text so the
  // peer stores byte-for-byte what we have, not a re-serialized copy.
  snapshotText() {
    if (!store.health().ok) return null;
    try {
      return fs.readFileSync(STORE_PATH, "utf8");
    } catch {
      return null;
    }
  },

  // --- idempotency -------------------------------------------------------

  isProcessed(customerShipmentId) {
    const s = read();
    const rec = s.processed[customerShipmentId];
    return !!(rec && rec.status === "LABELED");
  },

  markProcessed(customerShipmentId, info) {
    const s = read();
    const existing = s.processed[customerShipmentId] || {};
    s.processed[customerShipmentId] = {
      ...existing,
      ...info,
      status: "LABELED",
      printed: existing.printed || false, // preserve print state across re-processing
      ts: new Date().toISOString(),
    };
    // Success clears any failure history in the SAME atomic write, so an order
    // that finally goes through disappears from the exceptions panel by itself
    // and can never sit there "parked" while already labelled.
    delete s.failures[customerShipmentId];
    write(s);
  },

  // Labelled-but-not-yet-printed shipments, optionally filtered.
  // `maxDate` (inclusive) excludes ship dates AFTER it. Printing passes today,
  // so a batch always covers today plus any earlier day that was missed, but
  // never orders pre-processed for a FUTURE day — those would otherwise land in
  // the same PDF and could be handed to today's courier by mistake.
  listUnprinted({ date, channel, maxDate } = {}) {
    const s = read();
    return Object.entries(s.processed)
      .filter(([, r]) => r.status === "LABELED" && !r.printed)
      .filter(([, r]) => (date ? r.date === date : true))
      .filter(([, r]) => (maxDate ? String(r.date) <= maxDate : true))
      .filter(([, r]) => (channel ? r.channel === channel : true))
      .map(([customerShipmentId, r]) => ({ customerShipmentId, ...r }));
  },

  // All LABELED shipments (printed or not), optionally filtered by date/channel.
  listLabeled({ date, channel } = {}) {
    const s = read();
    return Object.entries(s.processed)
      .filter(([, r]) => r.status === "LABELED")
      .filter(([, r]) => (date ? r.date === date : true))
      .filter(([, r]) => (channel ? r.channel === channel : true))
      .map(([customerShipmentId, r]) => ({ customerShipmentId, ...r }));
  },

  // Counts of labeled/printed shipments per channel for a date (local view).
  countsByChannel(date) {
    const s = read();
    const out = {};
    for (const r of Object.values(s.processed)) {
      if (date && r.date !== date) continue;
      out[r.channel] = out[r.channel] || { labeled: 0, printed: 0 };
      if (r.status === "LABELED") out[r.channel].labeled++;
      if (r.printed) out[r.channel].printed++;
    }
    return out;
  },

  markPrinted(customerShipmentIds, printBatchId) {
    const s = read();
    const now = new Date().toISOString();
    for (const id of customerShipmentIds) {
      if (s.processed[id]) {
        s.processed[id].printed = true;
        s.processed[id].printedAt = now;
        s.processed[id].printBatchId = printBatchId;
      }
    }
    write(s);
  },

  // --- failures and parking (item 2) -------------------------------------

  // Record one failed attempt at an order and decide whether to stop retrying.
  //
  // Two counters, because they answer different questions:
  //   attempts     — how many times we have tried at all (shown to the operator)
  //   hardAttempts — how many of those were NOT a known-transient error, and so
  //                  count toward the cap.
  // A label that simply is not ready yet, or a 503, must not burn the budget;
  // otherwise a slow morning would park orders that were going to succeed.
  //
  // Returns { attempts, hardAttempts, parked, newlyParked }.
  recordFailure(customerShipmentId, { orderId, channel, date, reason, transient = false } = {}) {
    const s = read();
    const prev = s.failures[customerShipmentId] || {
      attempts: 0,
      hardAttempts: 0,
      parked: false,
      firstAt: new Date().toISOString(),
    };
    const rec = {
      ...prev,
      orderId: orderId ?? prev.orderId,
      channel: channel ?? prev.channel,
      date: date ?? prev.date,
      reason: reason || prev.reason || "unknown",
      transient,
      attempts: prev.attempts + 1,
      hardAttempts: prev.hardAttempts + (transient ? 0 : 1),
      lastAt: new Date().toISOString(),
    };
    const wasParked = !!prev.parked;
    rec.parked = rec.hardAttempts >= MAX_ORDER_ATTEMPTS;
    s.failures[customerShipmentId] = rec;
    write(s);
    return {
      attempts: rec.attempts,
      hardAttempts: rec.hardAttempts,
      parked: rec.parked,
      newlyParked: rec.parked && !wasParked,
    };
  },

  // Bulk accessor for the hot path. processChannel filters every candidate
  // order against this, so it must be ONE read of the state file, not one per
  // order — a 300-order day would otherwise re-read and re-parse the file 300
  // times inside a single loop.
  parkedIds() {
    const s = read();
    const out = new Set();
    for (const [id, r] of Object.entries(s.failures)) if (r.parked) out.add(id);
    return out;
  },

  // Everything the exceptions panel needs, newest trouble first.
  listFailures({ parkedOnly = false, channel, date } = {}) {
    const s = read();
    return Object.entries(s.failures)
      .filter(([, r]) => (parkedOnly ? r.parked : true))
      .filter(([, r]) => (channel ? r.channel === channel : true))
      .filter(([, r]) => (date ? r.date === date : true))
      .map(([customerShipmentId, r]) => ({ customerShipmentId, ...r }))
      .sort((a, b) => String(b.lastAt || "").localeCompare(String(a.lastAt || "")));
  },

  failureCounts() {
    const s = read();
    let failing = 0;
    let parked = 0;
    for (const r of Object.values(s.failures)) {
      failing++;
      if (r.parked) parked++;
    }
    return { failing, parked };
  },

  // Operator pressed Retry. Deleting the record (rather than zeroing the
  // counters) gives a genuinely clean slate: the order is picked up by the next
  // cycle like any other, and if it fails again it starts a fresh count with a
  // fresh first-seen time.
  unpark(customerShipmentId) {
    const s = read();
    if (!s.failures[customerShipmentId]) return false;
    delete s.failures[customerShipmentId];
    write(s);
    return true;
  },

  unparkAll() {
    const s = read();
    const n = Object.keys(s.failures).length;
    s.failures = {};
    write(s);
    return n;
  },

  // --- audit and misc ----------------------------------------------------

  audit(channel, action, detail = "") {
    const s = read();
    s.audit.push({ ts: new Date().toISOString(), channel, action, detail });
    // keep the audit log bounded
    if (s.audit.length > 5000) s.audit = s.audit.slice(-5000);
    write(s);
  },

  // Remember the files written by the most recent print run (for easy reprint).
  setLastPrint(files) {
    const s = read();
    s.lastPrint = { files, ts: new Date().toISOString() };
    write(s);
  },

  getLastPrint() {
    return read().lastPrint || null;
  },

  all() {
    return read();
  },
};
