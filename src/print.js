// print: combine all labelled-but-unprinted orders into one PDF per channel,
// save it, mark those orders as printed, and (optionally) auto-open for printing.
//
// Duplicate-print safe: only orders with printed=false are included, and they are
// flipped to printed=true once the PDF is saved. Re-running picks up only NEW
// labels. Reprints are possible by reopening the saved batch PDF on disk.

import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { LABELS_DIR } from "./config.js";
import { resolveChannel } from "./config.js";
import { store } from "./store.js";
import { log } from "./log.js";
import { rowsFromOrders, writeRowsToXlsx } from "./picklist.js";

// Today's date in IST (Asia/Kolkata) as YYYY-MM-DD — used to group print output
// by the day it was PRINTED (not by each order's ship date), so a day's morning
// and afternoon prints always stay in the same folder.
function printDayIST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function openFile(file) {
  // Windows: `start` opens with the default app (PDF viewer).
  if (process.platform === "win32") {
    exec(`start "" "${file}"`, { shell: "cmd.exe" });
  } else if (process.platform === "darwin") {
    exec(`open "${file}"`);
  } else {
    exec(`xdg-open "${file}"`);
  }
}

// Generate one combined label PDF for a set of channels.
// - default: only UNPRINTED orders ("Print New Labels", incremental).
// - all=true: ALL labeled orders for today's processing ("Print all today's
//   labels", a complete master set). Still marks them printed.
export async function printNewLabels(client, { channelKeys, date, open = true, all = false } = {}) {
  const source = all
    ? store.listLabeled({ date: date || printDayIST() }) // all labeled for the day
    : store.listUnprinted({ date }); // only unprinted

  if (!source.length) {
    log.ok(all ? "No labels found for today." : "No unprinted labels. Nothing to print.");
    return [];
  }

  const byChannel = new Map();
  for (const r of source) {
    if (channelKeys && !channelKeys.includes(r.channel)) continue;
    if (!byChannel.has(r.channel)) byChannel.set(r.channel, []);
    byChannel.get(r.channel).push(r);
  }

  if (!byChannel.size) {
    log.ok("No labels for the requested channel(s).");
    return [];
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const results = [];

  for (const [channelKey, orders] of byChannel) {
    const channel = resolveChannel(channelKey);
    // Sort by SKU so the combined PDF (which SmartHub renders in orderIds order)
    // comes out grouped by SKU, matching the pick manifest.
    const skuOf = (o) => String((o.lineItems && o.lineItems[0] && o.lineItems[0].msku) || "~");
    orders.sort((a, b) => skuOf(a).localeCompare(skuOf(b)));
    const ids = orders.map((o) => o.customerShipmentId);
    log.step(`[${channelKey}] Combining ${ids.length} ${all ? "" : "unprinted "}label(s)... (SKU-sorted)`);

    let url;
    try {
      ({ url } = await client.retrieveCombinedLabelUrl(ids, channel.marketplace));
    } catch (e) {
      log.err(`[${channelKey}] Could not retrieve combined PDF: ${e.message}`);
      store.audit(channelKey, "print-error", e.message);
      continue;
    }
    const bytes = await client.downloadBytes(url);

    // Group by the date we are PRINTING (today, IST), so all of a day's prints
    // — morning and afternoon — land in the same folder regardless of each
    // order's ship date.
    const day = printDayIST();
    const dayDir = path.join(LABELS_DIR, day);
    fs.mkdirSync(dayDir, { recursive: true });
    const batchId = `${channelKey}-${stamp.slice(11)}`;
    const prefix = all ? "print-all" : "print";
    const file = path.join(dayDir, `${prefix}-${day}-${batchId}-${ids.length}orders.pdf`);
    fs.writeFileSync(file, bytes);

    // Pick manifest for exactly these orders, saved alongside the labels so the
    // employee picks the products, then packs using the labels.
    let pickFile = null;
    try {
      const rows = rowsFromOrders(orders);
      if (rows.length) {
        pickFile = path.join(dayDir, `picklist-${day}-${batchId}.xlsx`);
        const { totalQty } = await writeRowsToXlsx(rows, pickFile);
        log.ok(`[${channelKey}] Pick manifest: ${pickFile} (${rows.length} SKUs, ${totalQty} units)`);
      } else {
        log.warn(`[${channelKey}] No SKU line items stored for these orders — pick manifest skipped.`);
      }
    } catch (e) {
      log.err(`[${channelKey}] Pick manifest failed: ${e.message}`);
    }

    // Append to the day's print log (cumulative, never overwritten) so there's
    // an end-of-day record of how many labels were printed and at what time.
    try {
      const logLine = `${new Date().toISOString()}\t${channelKey}\t${ids.length} orders\t${path.basename(file)}\t${orders.map((o) => o.orderId).join(",")}\n`;
      fs.appendFileSync(path.join(dayDir, `print-log-${day}.tsv`), logLine);
    } catch (e) {
      log.warn(`[${channelKey}] Could not write print log: ${e.message}`);
    }

    // Mark printed only AFTER the PDF is safely written.
    store.markPrinted(ids, batchId);
    store.audit(channelKey, "printed", `${ids.length} -> ${path.basename(file)}`);

    log.ok(`[${channelKey}] Printed batch: ${file} (${ids.length} orders, ${bytes.length} bytes)`);
    results.push({ channel: channelKey, file, pickFile, count: ids.length });

    if (open) {
      openFile(file);
      if (pickFile) openFile(pickFile);
    }
  }

  // Remember this run's files so `reprint` can reopen them after a print failure.
  if (results.length) store.setLastPrint(results.map((r) => r.file));

  const total = results.reduce((s, r) => s + r.count, 0);
  log.info(`Done. ${total} label(s) across ${results.length} channel(s).${open ? " Opening PDF(s) for printing." : ""}`);
  return results;
}

// Reopen the most recent print batch PDF(s) WITHOUT changing any state — for when
// the physical print failed (jam, wrong tray) and the employee needs another copy.
export function reprintLast() {
  const last = store.getLastPrint();
  if (!last || !last.files || !last.files.length) {
    log.warn("No previous print batch found. Run `print` first.");
    return [];
  }
  const existing = last.files.filter((f) => fs.existsSync(f));
  if (!existing.length) {
    log.warn("Previous print PDF(s) no longer on disk.");
    return [];
  }
  log.info(`Reopening ${existing.length} PDF(s) from the last print (${last.ts}). No orders re-processed.`);
  for (const f of existing) {
    log.info(`   ${f}`);
    openFile(f);
  }
  return existing;
}
