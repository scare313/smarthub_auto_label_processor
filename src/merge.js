// Merge label PDFs and pick-manifest rows from multiple machines (this
// machine's own results + any peer agents') into one combined set per
// marketplace channel. Used by the hub machine's /api/print-combined.

import { PDFDocument } from "pdf-lib";

// Concatenate multiple PDF byte buffers into one PDF (page order = input order).
export async function mergePdfBuffers(buffers) {
  const merged = await PDFDocument.create();
  for (const buf of buffers) {
    const doc = await PDFDocument.load(buf);
    const pages = await merged.copyPages(doc, doc.getPageIndices());
    for (const p of pages) merged.addPage(p);
  }
  return Buffer.from(await merged.save());
}

// Merge pick-manifest row arrays ([{msku, qty, orders}, ...]) from multiple
// sources by summing qty/orders per SKU. Same shape as picklist.js's rows.
export function mergePickRows(rowArrays) {
  const m = new Map();
  for (const rows of rowArrays) {
    for (const r of rows || []) {
      const cur = m.get(r.msku) || { msku: r.msku, qty: 0, orders: 0 };
      cur.qty += Number(r.qty || 0);
      cur.orders += Number(r.orders || 0);
      m.set(r.msku, cur);
    }
  }
  return [...m.values()].sort((a, b) => String(a.msku).localeCompare(String(b.msku)));
}
