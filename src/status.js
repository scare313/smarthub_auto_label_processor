// Live marketplace-wise status: total / processed / waiting (from SmartHub's
// orders/summary) + printed (from our local store).

import { CHANNELS, resolveChannel } from "./config.js";
import { store } from "./store.js";
import { log } from "./log.js";

const n = (x) => (x && x.total) || 0;

export async function marketStatus(client, { date }) {
  const local = store.countsByChannel(date);

  const rows = [];
  for (const key of Object.keys(CHANNELS)) {
    const ch = resolveChannel(key);
    let summary = null;
    try {
      summary = await client.getOrdersSummary(date, ch.salesChannel, ch.isSelfShip);
    } catch (e) {
      log.warn(`[${key}] could not fetch summary: ${e.message}`);
    }
    const total = summary ? n(summary.totalOrders) : 0;
    const packed = summary ? n(summary.packedOrders) : 0;
    const shipped = summary ? n(summary.shippedOrders) : 0;
    const cancelled = summary ? n(summary.cancelledOrders) : 0;
    // Waiting to process = everything not yet packed/shipped/cancelled.
    const waiting = summary ? Math.max(0, total - packed - shipped - cancelled) : 0;
    const printed = (local[key] && local[key].printed) || 0;
    rows.push({ key, total, processed: packed + shipped, waiting, printed, cancelled });
  }

  // Render a simple aligned table.
  const pad = (s, w) => String(s).padEnd(w);
  const padN = (s, w) => String(s).padStart(w);
  log.info(`Marketplace status for ${date} (IST):`);
  console.log("  " + pad("Channel", 10) + padN("Total", 7) + padN("Processed", 11) + padN("Waiting", 9) + padN("Printed", 9) + padN("Cancelled", 11));
  console.log("  " + "-".repeat(57));
  let t = { total: 0, processed: 0, waiting: 0, printed: 0, cancelled: 0 };
  for (const r of rows) {
    console.log("  " + pad(r.key, 10) + padN(r.total, 7) + padN(r.processed, 11) + padN(r.waiting, 9) + padN(r.printed, 9) + padN(r.cancelled, 11));
    for (const k of Object.keys(t)) t[k] += r[k];
  }
  console.log("  " + "-".repeat(57));
  console.log("  " + pad("TOTAL", 10) + padN(t.total, 7) + padN(t.processed, 11) + padN(t.waiting, 9) + padN(t.printed, 9) + padN(t.cancelled, 11));
  console.log("");
  console.log("  Processed = packed+shipped in SmartHub | Waiting = not yet packed | Printed = labels printed locally");
  return rows;
}
