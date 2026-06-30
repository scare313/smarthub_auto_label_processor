// Tiny JSON-file state store for idempotency + audit.
// Zero native dependencies (avoids better-sqlite3 build pain on Windows).
//
// Shape:
// {
//   processed: { "<customerShipmentId>": { orderId, channel, date, status, labelFile, trackingId, ts } },
//   audit: [ { ts, channel, action, detail } ]
// }

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./config.js";

const STORE_PATH = path.join(DATA_DIR, "state.json");

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function read() {
  ensureDir();
  try {
    return JSON.parse(fs.readFileSync(STORE_PATH, "utf8"));
  } catch {
    return { processed: {}, audit: [] };
  }
}

// Atomic write: write to temp then rename, so a crash never corrupts state.
function write(state) {
  ensureDir();
  const tmp = STORE_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, STORE_PATH);
}

export const store = {
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
    write(s);
  },

  // Labelled-but-not-yet-printed shipments, optionally filtered.
  listUnprinted({ date, channel } = {}) {
    const s = read();
    return Object.entries(s.processed)
      .filter(([, r]) => r.status === "LABELED" && !r.printed)
      .filter(([, r]) => (date ? r.date === date : true))
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
