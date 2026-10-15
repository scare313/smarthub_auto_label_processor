// Live marketplace-wise status: total / processed / waiting (from SmartHub's
// orders/summary) + printed (from our local store).

import { CHANNELS, resolveChannel, todayIST } from "./config.js";
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
  log.raw("  " + pad("Channel", 10) + padN("Total", 7) + padN("Processed", 11) + padN("Waiting", 9) + padN("Printed", 9) + padN("Cancelled", 11));
  log.raw("  " + "-".repeat(57));
  let t = { total: 0, processed: 0, waiting: 0, printed: 0, cancelled: 0 };
  for (const r of rows) {
    log.raw("  " + pad(r.key, 10) + padN(r.total, 7) + padN(r.processed, 11) + padN(r.waiting, 9) + padN(r.printed, 9) + padN(r.cancelled, 11));
    for (const k of Object.keys(t)) t[k] += r[k];
  }
  log.raw("  " + "-".repeat(57));
  log.raw("  " + pad("TOTAL", 10) + padN(t.total, 7) + padN(t.processed, 11) + padN(t.waiting, 9) + padN(t.printed, 9) + padN(t.cancelled, 11));
  log.raw("");
  log.raw("  Processed = packed+shipped in SmartHub | Waiting = not yet packed | Printed = labels printed locally");
  return rows;
}

// How many orders are already booked for the NEXT few days, so stock and staff
// can be planned before the morning. Uses the same orders/summary call as the
// table above - SmartHub answers for future dates exactly as it does for past
// ones - so this needs no new endpoint.
//
// Read-only and non-essential: any date that fails is simply omitted rather
// than breaking the status the page actually depends on.
export async function forecast(client, { days = 3, from = null } = {}) {
  const base = from || todayIST();
  const out = [];
  for (let i = 1; i <= days; i++) {
    const d = new Date(`${base}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);

    let total = 0;
    let ok = false;
    for (const key of Object.keys(CHANNELS)) {
      const ch = resolveChannel(key);
      try {
        const sum = await client.getOrdersSummary(date, ch.salesChannel, ch.isSelfShip);
        total += n(sum && sum.totalOrders);
        ok = true;
      } catch (e) {
        log.warn(`[${key}] forecast for ${date} failed: ${e.message}`);
      }
    }
    if (ok) out.push({ date, total });
  }
  return out;
}
