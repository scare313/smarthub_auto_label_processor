// print: combine all labelled-but-unprinted orders into one PDF per channel,
// save it, mark those orders as printed, and (optionally) auto-open for printing.
//
// Duplicate-print safe: only orders with printed=false are included, and they are
// flipped to printed=true once the PDF is saved. Re-running picks up only NEW
// labels. Reprints are possible by reopening the saved batch PDF on disk.

import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { LABELS_DIR, todayIST } from "./config.js";
import { resolveChannel } from "./config.js";
import { store } from "./store.js";
import { log } from "./log.js";
import { rowsFromOrders, writeRowsToXlsx } from "./picklist.js";

// Today's date in IST (Asia/Kolkata) as YYYY-MM-DD — used to group print output
// by the day it was PRINTED (not by each order's ship date), so a day's morning
// and afternoon prints always stay in the same folder.
export function printDayIST() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export function openFile(file) {
  // Windows: `start` opens with the default app (PDF viewer).
  if (process.platform === "win32") {
    exec(`start "" "${file}"`, { shell: "cmd.exe" });
  } else if (process.platform === "darwin") {
    exec(`open "${file}"`);
  } else {
    exec(`xdg-open "${file}"`);
  }
}

// Split the orders we asked for into those SmartHub actually put in the PDF and
// those it left out. Exported so the behaviour is testable on its own.
//
// WHY this exists: the print step used to mark every REQUESTED order as printed.
// When SmartHub silently dropped one from the combined PDF, that order was
// recorded as printed, never appeared in a later batch, and the parcel sat on the
// shelf with no label. Only what is in the file may be marked printed.
//
// The fallback matters as much as the main path. If `ordersIncluded` is missing,
// empty, or shares nothing with our ids (an API shape change, or an id format we
// do not recognise), an empty intersection would mark NOTHING printed and reprint
// the whole batch on the next run. In that case we trust the request, exactly as
// the old code did, and say so loudly.
export function splitByIncluded(orders, ordersIncluded, docErrors = []) {
  const failedIds = new Set();
  for (const e of docErrors || []) if (e && e.orderId) failedIds.add(String(e.orderId));

  const included = new Set((ordersIncluded || []).map(String));
  const overlaps = orders.some((o) => included.has(String(o.customerShipmentId)));

  if (!overlaps) {
    // Unusable signal. Trust the request, minus anything explicitly reported as
    // failed — a duplicate print is visible and recoverable; an unlabelled parcel
    // is neither.
    const kept = orders.filter((o) => !failedIds.has(String(o.customerShipmentId)));
    return {
      printed: kept,
      missing: orders.filter((o) => failedIds.has(String(o.customerShipmentId))),
      trustedRequest: true,
    };
  }

  const printed = [];
  const missing = [];
  for (const o of orders) {
    const id = String(o.customerShipmentId);
    if (included.has(id) && !failedIds.has(id)) printed.push(o);
    else missing.push(o);
  }
  return { printed, missing, trustedRequest: false };
}

// Generate one combined label PDF for a set of channels.
// - default: only UNPRINTED orders ("Print New Labels", incremental).
// - all=true: ALL labeled orders for today's processing ("Print all today's
//   labels", a complete master set). Still marks them printed.
// - deferMark=true: write the PDF but do NOT mark anything printed; return the
//   ids as `pendingIds` instead. Used when this machine is a peer and the hub
//   still has to merge and save the combined file — see server.js.
export async function printNewLabels(client, { channelKeys, date, open = true, all = false, deferMark = false } = {}) {
  // A degraded state file means we cannot tell what has already been printed.
  // Printing from an EMPTY state would reprint every label for the day.
  const health = store.health();
  if (!health.ok) {
    log.err(`Printing BLOCKED — ${health.reason}`);
    log.err(health.hint);
    throw new Error(`Cannot print: ${health.reason}`);
  }

  const source = all
    ? store.listLabeled({ date: date || printDayIST() }) // all labeled for the day
    // Only unprinted: today plus any earlier day missed, never a future ship date.
    : store.listUnprinted({ date, maxDate: date || todayIST() });

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
    let ordersIncluded = [];
    let docErrors = [];
    try {
      ({ url, ordersIncluded = [], errors: docErrors = [] } = await client.retrieveCombinedLabelUrl(
        ids,
        channel.marketplace
      ));
    } catch (e) {
      log.err(`[${channelKey}] Could not retrieve combined PDF: ${e.message}`);
      store.audit(channelKey, "print-error", e.message);
      continue;
    }
    const bytes = await client.downloadBytes(url);

    // Item 1: only what is actually in the PDF may be marked printed.
    const { printed, missing, trustedRequest } = splitByIncluded(orders, ordersIncluded, docErrors);

    if (trustedRequest) {
      log.warn(
        `[${channelKey}] SmartHub returned no usable ordersIncluded list (got ${JSON.stringify(ordersIncluded).slice(0, 120)}). ` +
          `Falling back to trusting the request for all ${ids.length} order(s). Check the PDF page count before handing it over.`
      );
      store.audit(channelKey, "print-no-included-list", `${ids.length} orders, trusted the request`);
    }

    if (missing.length) {
      const detail = missing.map((o) => `${o.orderId} [${o.customerShipmentId}]`).join(", ");
      const reasons = (docErrors || [])
        .map((e) => `${e.orderId}: ${e.errorMessage}`)
        .join("; ")
        .slice(0, 200);
      log.warn(
        `[${channelKey}] ${missing.length} of ${ids.length} order(s) were NOT in the combined PDF and stay unprinted ` +
          `(they will be included in the next print): ${detail}${reasons ? ` — ${reasons}` : ""}`
      );
      store.audit(channelKey, "print-missing", `${missing.length} not in PDF: ${detail}`.slice(0, 160));
    }

    if (!printed.length) {
      log.err(
        `[${channelKey}] The combined PDF contained none of the ${ids.length} requested order(s). ` +
          `Nothing marked printed; the file was not saved. This usually means the labels are not ready yet.`
      );
      store.audit(channelKey, "print-empty", `${ids.length} requested, 0 included`);
      continue;
    }

    // Everything below — the file name, the pick manifest, the print log and the
    // printed flag — must describe the PRINTED subset, not the request.
    const printedIds = printed.map((o) => o.customerShipmentId);

    // Group by the date we are PRINTING (today, IST), so all of a day's prints
    // — morning and afternoon — land in the same folder regardless of each
    // order's ship date.
    const day = printDayIST();
    const dayDir = path.join(LABELS_DIR, day);
    fs.mkdirSync(dayDir, { recursive: true });
    const batchId = `${channelKey}-${stamp.slice(11)}`;
    const prefix = all ? "print-all" : "print";
    const file = path.join(dayDir, `${prefix}-${day}-${batchId}-${printedIds.length}orders.pdf`);
    fs.writeFileSync(file, bytes);

    // Pick manifest for exactly the orders in the PDF, saved alongside the
    // labels so the employee picks the products, then packs using the labels.
    let pickFile = null;
    const pickRows = rowsFromOrders(printed); // exposed on the result too, for cross-machine merging
    try {
      const rows = pickRows;
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
      const logLine = `${new Date().toISOString()}\t${channelKey}\t${printedIds.length} orders\t${path.basename(file)}\t${printed.map((o) => o.orderId).join(",")}\n`;
      fs.appendFileSync(path.join(dayDir, `print-log-${day}.tsv`), logLine);
    } catch (e) {
      log.warn(`[${channelKey}] Could not write print log: ${e.message}`);
    }

    // Mark printed only AFTER the PDF is safely written — and only the orders
    // that are actually in it.
    //
    // deferMark (item 5): on a peer machine the PDF written here is an
    // intermediate. The labels the warehouse will actually use are in the hub's
    // merged file, so the hub confirms once that file is on disk. Until then
    // these orders stay unprinted, which means a lost confirmation reprints them
    // rather than losing them.
    if (deferMark) {
      log.info(`[${channelKey}] ${printedIds.length} label(s) held as unprinted until the hub confirms the merge.`);
    } else {
      store.markPrinted(printedIds, batchId);
      store.audit(channelKey, "printed", `${printedIds.length} -> ${path.basename(file)}`);
    }

    log.ok(`[${channelKey}] Printed batch: ${file} (${printedIds.length} orders, ${bytes.length} bytes)`);
    results.push({
      channel: channelKey,
      file,
      pickFile,
      pickRows,
      count: printedIds.length,
      batchId,
      requested: ids.length,
      missing: missing.length,
      pendingIds: deferMark ? printedIds : [],
    });

    // Nothing to open on a peer: the operator never looks at the intermediate.
    if (open && !deferMark) {
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

// Fetch ONE order's label on demand - the scan-a-parcel-and-reprint case.
//
// Deliberately does NOT touch printed/printedAt. This is a reprint: the parcel
// was already handed over or is about to be, and rewriting that record would
// corrupt the only account of what has actually been printed.
export async function fetchOneLabel(client, { customerShipmentId, channel, orderId }) {
  const ch = resolveChannel(channel);
  const { url, errors = [] } = await client.retrieveCombinedLabelUrl([customerShipmentId], ch.marketplace);
  if (!url) {
    const why = errors.length ? JSON.stringify(errors).slice(0, 200) : "SmartHub returned no document URL";
    throw new Error(`No label available for ${orderId || customerShipmentId}: ${why}`);
  }
  const bytes = await client.downloadBytes(url);
  const dir = path.join(LABELS_DIR, printDayIST(), "reprints");
  fs.mkdirSync(dir, { recursive: true });
  const safe = String(orderId || customerShipmentId).replace(/[^A-Za-z0-9_-]/g, "");
  const file = path.join(dir, `${safe}-${new Date().toISOString().slice(11, 19).replace(/:/g, "")}.pdf`);
  fs.writeFileSync(file, bytes);
  store.audit(ch.key, "reprint-one", `${orderId || customerShipmentId} -> ${path.basename(file)}`);
  return { file, bytes };
}
