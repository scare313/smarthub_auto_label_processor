// picklist: fetch the live pick-task validate response(s) for a channel/date,
// dump the raw JSON for inspection, and analyze which SKU/quantity fields are
// populated. This is the diagnostic step before building the Excel manifest —
// it answers "do we actually get quantities live?".
//
// Read-only: only calls PickTaskByFilters + validate. Never packs or labels.

import fs from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { DATA_DIR, LABELS_DIR } from "./config.js";
import { log } from "./log.js";

// Build manifest rows from stored order line items (used by `print`).
// orders: [{ lineItems: [{msku, qty}], ... }] -> [{msku, qty, orders}]
export function rowsFromOrders(orders) {
  const m = new Map();
  for (const o of orders) {
    const seenInOrder = new Set();
    for (const li of o.lineItems || []) {
      const cur = m.get(li.msku) || { msku: li.msku, qty: 0, orders: 0 };
      cur.qty += Number(li.qty || 0);
      if (!seenInOrder.has(li.msku)) {
        cur.orders += 1;
        seenInOrder.add(li.msku);
      }
      m.set(li.msku, cur);
    }
  }
  return [...m.values()].sort((a, b) => String(a.msku).localeCompare(String(b.msku)));
}

// Merge SKU rows (across multiple pick tasks) by msku, summing qty/orders.
function mergeRows(rows) {
  const m = new Map();
  for (const r of rows) {
    const cur = m.get(r.msku) || { msku: r.msku, qty: 0, orders: 0 };
    cur.qty += r.qty;
    cur.orders += r.orders;
    m.set(r.msku, cur);
  }
  return [...m.values()].sort((a, b) => String(a.msku).localeCompare(String(b.msku)));
}

// Low-level: write manifest rows (SKU | Qty | Orders + total) to a given file.
export async function writeRowsToXlsx(rows, file) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pick Manifest");
  ws.columns = [
    { header: "SKU (msku)", key: "msku", width: 34 },
    { header: "Qty", key: "qty", width: 10 },
    { header: "Orders", key: "orders", width: 10 },
  ];
  ws.getRow(1).font = { bold: true };
  for (const r of rows) ws.addRow({ msku: r.msku, qty: r.qty, orders: r.orders });

  const totalQty = rows.reduce((s, r) => s + r.qty, 0);
  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
  const totalRow = ws.addRow({ msku: "TOTAL", qty: totalQty, orders: totalOrders });
  totalRow.font = { bold: true };

  fs.mkdirSync(path.dirname(file), { recursive: true });
  await wb.xlsx.writeFile(file);
  return { file, totalQty, totalOrders };
}

// Diagnostic helper: write the per-channel/date manifest into labels/<date>/.
async function writeManifestXlsx(rows, { channel, date }) {
  const file = path.join(LABELS_DIR, date, `picklist-${date}-${channel.key}.xlsx`);
  return writeRowsToXlsx(rows, file);
}

function summarize(value) {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `array[${value.length}]`;
  if (typeof value === "object") {
    const keys = Object.keys(value);
    return keys.length ? `object{${keys.length} keys}` : "object{} (EMPTY)";
  }
  return JSON.stringify(value);
}

// Build a SKU -> {msku, productTitle, qty, orders} aggregation.
//
// Authoritative source (verified against live data):
//   customerShipmentSkuMapping: csid -> { skuId -> { requestedQuantity, ... } }
//   eskuToEskuDetailMap:        skuId -> { msku, productTitle }
// requestedQuantity is the per-SKU, per-shipment ordered quantity, so this
// handles both multi-unit and multi-SKU orders correctly.
function aggregateSkus(v) {
  const eskuDetail = v.eskuToEskuDetailMap || {};
  const csidSku = v.customerShipmentSkuMapping || {}; // csid -> { skuId -> {requestedQuantity} }

  const rows = new Map(); // skuId -> { msku, productTitle, qty, orders:Set }
  const ensure = (skuId, fallbackMsku) => {
    if (!rows.has(skuId)) {
      const d = eskuDetail[skuId] || {};
      rows.set(skuId, {
        skuId,
        msku: String(d.msku || fallbackMsku || skuId),
        productTitle: String(d.productTitle || ""),
        qty: 0,
        orders: new Set(),
      });
    }
    return rows.get(skuId);
  };

  let qtySource = "none";
  if (Object.keys(csidSku).length > 0) {
    qtySource = "customerShipmentSkuMapping.requestedQuantity (authoritative)";
    for (const csid of Object.keys(csidSku)) {
      const items = csidSku[csid] || {};
      for (const skuId of Object.keys(items)) {
        const it = items[skuId] || {};
        const qty = Number(it.requestedQuantity ?? 0);
        const r = ensure(skuId, it.msku);
        r.qty += qty;
        r.orders.add(csid);
      }
    }
  } else {
    // No per-shipment SKU data (e.g. all already packed) — list known SKUs only.
    for (const skuId of Object.keys(eskuDetail)) ensure(skuId);
  }

  const out = [...rows.values()].map((r) => ({
    msku: r.msku,
    productTitle: r.productTitle,
    qty: r.qty,
    orders: r.orders.size,
  }));
  out.sort((a, b) => String(a.msku).localeCompare(String(b.msku)));
  return { rows: out, qtySource, ok: qtySource.startsWith("customerShipment") };
}

export async function dumpPicklist(client, { channel, date }) {
  log.step(`[${channel.key}] picklist diagnostic — date ${date}`);

  const tasks = await client.findPickTasks(date, channel.salesChannel);
  if (!tasks.length) {
    log.warn(`[${channel.key}] No activated pick task found for ${date}. Activate the pick list first.`);
    return;
  }
  log.info(`[${channel.key}] Pick task(s): ${tasks.map((t) => `${t.id}(${t.status})`).join(", ")}`);

  fs.mkdirSync(DATA_DIR, { recursive: true });

  const merged = []; // combined sku rows across tasks
  for (const t of tasks) {
    const v = await client.validatePickTask(t.id);

    // 1. Dump raw response for inspection.
    const dumpFile = path.join(DATA_DIR, `validate-${date}-${channel.key}-${t.id}.json`);
    fs.writeFileSync(dumpFile, JSON.stringify(v, null, 2));
    log.ok(`[${channel.key}] Raw dump: ${dumpFile}`);

    // 2. Report which relevant fields are populated.
    log.info(`[${channel.key}] Field population for ${t.id}:`);
    const fields = [
      "numberOfShipments",
      "numberOfShipmentsPacked",
      "skuCustomerShipmentMapping",
      "customerShipmentSkuMapping",
      "customerShipmentExpectedItemsAggregatedQuantity",
      "customerShipmentScannedItemsAggregatedQuantity",
      "eskuToEskuDetailMap",
      "packedCustomerShipmentMapping",
    ];
    for (const f of fields) log.info(`     ${f}: ${summarize(v[f])}`);

    // 3. Try to aggregate SKUs.
    const agg = aggregateSkus(v);
    log.info(`[${channel.key}] SKU quantity source: ${agg.qtySource}`);
    log.info(`[${channel.key}] ${agg.rows.length} SKU(s) detected${agg.ok ? "" : "  (⚠ quantity unreliable — see note)"}`);
    for (const r of agg.rows) {
      log.info(`     ${r.msku}  qty=${r.qty}  orders=${r.orders}  | ${r.productTitle.slice(0, 50)}`);
    }
    merged.push(...agg.rows);
  }

  // Write the consolidated pick manifest .xlsx for this channel.
  const rows = mergeRows(merged);
  if (rows.length) {
    const { file, totalQty, totalOrders } = await writeManifestXlsx(rows, { channel, date });
    log.ok(`[${channel.key}] Pick manifest: ${file}  (${rows.length} SKUs, ${totalQty} units, ${totalOrders} orders)`);
  } else {
    log.warn(`[${channel.key}] No SKUs to pick (nothing unpacked). No manifest written.`);
  }
  return rows;
}
