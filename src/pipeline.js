// Order-processing pipeline for one channel on one date.
// Mirrors the exact captured workflow: discover pick task -> validate ->
// pack -> slots -> invoices -> ship label -> download combined label PDF.
//
// Safety: defaults to DRY-RUN. In dry-run it performs only read-only calls
// (pick-task discovery + validate) and reports what it WOULD do, stopping
// before any irreversible write (packages / invoices / ship labels).

import { SHIP_LABEL_RESOLUTION, DEFAULT_PACKAGE } from "./config.js";
import { SmartHubClient } from "./api.js";
import { store } from "./store.js";
import { log } from "./log.js";

// Statuses that mean a shipment still needs packing/labelling.
const PACKABLE = new Set(["BOUND"]);

// Flatten the validate response's skuCustomerShipmentMapping into a flat list
// of unique shipments.
function extractShipments(validateResp) {
  const byId = new Map();
  const mapping = validateResp?.skuCustomerShipmentMapping || {};
  for (const sku of Object.keys(mapping)) {
    for (const csid of Object.keys(mapping[sku])) {
      const s = mapping[sku][csid];
      if (!byId.has(csid)) byId.set(csid, s);
    }
  }
  return [...byId.values()];
}

// Build csid -> [{ msku, qty }] from the validate response, so we can store each
// order's SKU lines at label time (the pick manifest at print time reads these).
function extractLineItems(validateResp) {
  const csidSku = validateResp?.customerShipmentSkuMapping || {}; // csid -> { skuId -> {requestedQuantity} }
  const detail = validateResp?.eskuToEskuDetailMap || {};
  const out = {};
  for (const csid of Object.keys(csidSku)) {
    const items = csidSku[csid] || {};
    out[csid] = Object.keys(items).map((skuId) => {
      const d = detail[skuId] || {};
      return {
        msku: String(d.msku || items[skuId].msku || skuId),
        qty: Number(items[skuId].requestedQuantity ?? 0),
      };
    });
  }
  return out;
}

// Extract orders that are already PACKED in SmartHub, with their SKU line items.
// Used to reconcile orphans: orders packed/labelled in SmartHub but missing from
// our local store (e.g. a generate-shiplabel call that timed out but actually
// succeeded, or orders processed manually / on another machine).
function extractPackedOrders(validateResp) {
  const packed = validateResp?.packedCustomerShipmentMapping || {};
  const detail = validateResp?.eskuToEskuDetailMap || {};
  const out = [];
  for (const csid of Object.keys(packed)) {
    const p = packed[csid] || {};
    const lineItems = (p.lineItems || []).map((li) => {
      const d = detail[li.eskuId] || {};
      return { msku: String(d.msku || li.eskuId), qty: Number(li.quantity ?? 0) };
    });
    out.push({ customerShipmentId: csid, orderId: p.orderId, lineItems });
  }
  return out;
}

// Max shipments per pack/label request. Large batches (e.g. 85 FBA orders in one
// createPackages call) make SmartHub return HTTP 503, so we chunk the work.
const BATCH_SIZE = 15;

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// Process ONE batch end-to-end: pack -> slots -> invoices -> ship labels -> record.
// Returns { labeled, failed, packErrors }. Records LABELED only on a real tracking id.
async function processBatch(client, { channel, date, batch, boxName, lineItemsByCsid }) {
  const pkgResp = await client.createPackages(batch.map((s) => buildPackage(s, boxName)));
  const pkgErrors = pkgResp?.shipmentIdToErrorMap || {};
  let work = batch.filter((s) => !pkgErrors[s.customerShipmentId]);
  for (const id of Object.keys(pkgErrors)) {
    store.audit(channel.key, "pack-failed", `${id}: ${JSON.stringify(pkgErrors[id]).slice(0, 120)}`);
  }
  if (!work.length) return { labeled: [], failed: [], packErrors: Object.keys(pkgErrors).length };

  const ids = work.map((s) => s.customerShipmentId);
  const slotsResp = await client.listPickupSlots(ids);
  const slotMap = SmartHubClient.recommendedSlotMap(slotsResp);

  if (channel.requiresPickupSlot) {
    const missing = work.filter((s) => !slotMap[s.customerShipmentId]);
    for (const s of missing) store.audit(channel.key, "no-slot", `${s.orderId} [${s.customerShipmentId}]`);
    work = work.filter((s) => slotMap[s.customerShipmentId]);
    if (!work.length) return { labeled: [], failed: [], packErrors: Object.keys(pkgErrors).length };
  }

  await client.generateInvoices(work.map((s) => s.customerShipmentId));

  const shipLabelRequests = work.map((s) => {
    const req = {
      selectedBoxId: boxName,
      customerShipmentId: s.customerShipmentId,
      shippingLabelPrinterResolution: SHIP_LABEL_RESOLUTION,
      salesChannel: channel.salesChannel,
    };
    if (slotMap[s.customerShipmentId]) req.pickupSlotId = slotMap[s.customerShipmentId];
    return req;
  });
  const labelResp = await client.generateShipLabel(shipLabelRequests);
  const trackingMap = labelResp?.shipmentIdToPackageTrackingInfoListMap || {};

  const labeled = work.filter((s) => ((trackingMap[s.customerShipmentId] || [])[0] || {}).trackingId);
  const failed = work.filter((s) => !((trackingMap[s.customerShipmentId] || [])[0] || {}).trackingId);

  for (const s of labeled) {
    const tInfo = (trackingMap[s.customerShipmentId] || [])[0] || {};
    store.markProcessed(s.customerShipmentId, {
      orderId: s.orderId,
      channel: channel.key,
      date,
      trackingId: tInfo.trackingId,
      lineItems: lineItemsByCsid[s.customerShipmentId] || [],
    });
  }
  for (const s of failed) store.audit(channel.key, "label-failed", `${s.orderId} [${s.customerShipmentId}] no trackingId`);

  return { labeled, failed, packErrors: Object.keys(pkgErrors).length };
}

function buildPackage(s, boxName) {
  // Fixed package dimensions for every order, per business decision.
  return {
    customerShipmentId: s.customerShipmentId,
    length: DEFAULT_PACKAGE.length,
    width: DEFAULT_PACKAGE.width,
    height: DEFAULT_PACKAGE.height,
    weight: DEFAULT_PACKAGE.weight,
    boxName,
    hazmatLabels: [],
    fragile: false,
  };
}

export async function processChannel(client, { channel, date, dryRun, limit }) {
  const mode = dryRun ? "DRY-RUN" : "LIVE";
  log.step(`[${channel.key}] ${mode} — date ${date}`);
  store.audit(channel.key, "run-start", `${mode} date=${date}`);

  // 1. Discover activated pick tasks for this channel/date.
  const tasks = await client.findPickTasks(date, channel.salesChannel);
  if (!tasks.length) {
    log.warn(`[${channel.key}] No activated pick task found for ${date}. Activate the pick list first.`);
    return { channel: channel.key, shipments: 0, processed: 0 };
  }
  log.info(`[${channel.key}] Found ${tasks.length} pick task(s): ${tasks.map((t) => `${t.id}(${t.status})`).join(", ")}`);

  // 2. Validate each pick task and collect shipments (+ SKU line items + packed).
  let shipments = [];
  const lineItemsByCsid = {};
  const packedOrders = [];
  for (const t of tasks) {
    const v = await client.validatePickTask(t.id);
    const list = extractShipments(v).map((s) => ({ ...s, pickTaskId: t.id }));
    Object.assign(lineItemsByCsid, extractLineItems(v));
    packedOrders.push(...extractPackedOrders(v));
    log.info(`[${channel.key}] ${t.id}: ${v.numberOfShipments} shipments, ${v.numberOfShipmentsPacked} already packed`);
    shipments.push(...list);
  }

  // 2b. Reconcile orphans: orders packed in SmartHub but not in our store become
  // recorded as LABELED (printed:false) so `print` can fetch their labels.
  if (!dryRun) {
    let reconciled = 0;
    for (const p of packedOrders) {
      if (!store.isProcessed(p.customerShipmentId)) {
        store.markProcessed(p.customerShipmentId, {
          orderId: p.orderId,
          channel: channel.key,
          date,
          trackingId: null, // not returned for already-packed orders; print uses the doc API
          lineItems: p.lineItems,
          reconciled: true,
        });
        reconciled++;
      }
    }
    if (reconciled) {
      log.ok(`[${channel.key}] Reconciled ${reconciled} packed order(s) missing from local store (now printable).`);
      store.audit(channel.key, "reconciled", `${reconciled} packed orders`);
    }
  }

  // De-dup across tasks and split into to-do vs skipped.
  const seen = new Set();
  const unique = [];
  for (const s of shipments) {
    if (seen.has(s.customerShipmentId)) continue;
    seen.add(s.customerShipmentId);
    unique.push(s);
  }

  let todo = [];
  for (const s of unique) {
    // SmartHub status is the SOURCE OF TRUTH for idempotency: only BOUND
    // shipments still need packing. A packed/labelled order moves out of BOUND,
    // so re-running can never double-process. We deliberately do NOT gate on the
    // local store here — the store can drift from SmartHub (e.g. a backend
    // failure that returns OK but doesn't persist), and must never block an order
    // that SmartHub still shows as unpacked.
    if (!PACKABLE.has(s.shipmentStatus)) continue;
    todo.push(s);
  }

  // Optional cap (e.g. --limit 1 for a careful first live test).
  if (Number.isFinite(limit) && limit >= 0 && todo.length > limit) {
    log.warn(`[${channel.key}] --limit ${limit}: processing only ${limit} of ${todo.length} eligible shipment(s).`);
    todo = todo.slice(0, limit);
  }

  log.info(`[${channel.key}] ${unique.length} unique shipment(s); ${todo.length} to process.`);

  // Report the plan. Dimensions shown are the FIXED package that will be sent.
  const P = DEFAULT_PACKAGE;
  const boxStr = `${P.length.measure}x${P.width.measure}x${P.height.measure}cm ${P.weight.measure}g`;
  for (const s of todo) {
    log.info(`   - ${s.orderId} [${s.customerShipmentId}] box=${boxStr} status=${s.shipmentStatus}`);
  }

  if (dryRun) {
    log.ok(`[${channel.key}] DRY-RUN complete. Would pack+label ${todo.length} shipment(s). No changes made.`);
    store.audit(channel.key, "dry-run", `would process ${todo.length}`);
    return { channel: channel.key, shipments: unique.length, processed: 0, dryRun: true };
  }

  if (!todo.length) {
    log.ok(`[${channel.key}] Nothing to process.`);
    return { channel: channel.key, shipments: unique.length, processed: 0 };
  }

  // 3. LIVE — irreversible from here. Process in BATCHES so large channels (e.g.
  // 85 FBA orders) never send one oversized request (SmartHub 503s on those), and
  // so a failure in one batch doesn't lose the others.
  const boxName = channel.boxName || DEFAULT_PACKAGE.boxName;
  const batches = chunk(todo, BATCH_SIZE);
  let labeledCount = 0;
  let failedCount = 0;
  let packErrCount = 0;

  for (let i = 0; i < batches.length; i++) {
    const batch = batches[i];
    log.step(`[${channel.key}] Batch ${i + 1}/${batches.length} — packing+labelling ${batch.length} shipment(s)...`);
    try {
      const r = await processBatch(client, { channel, date, batch, boxName, lineItemsByCsid });
      labeledCount += r.labeled.length;
      failedCount += r.failed.length;
      packErrCount += r.packErrors;
    } catch (e) {
      // One batch failing (e.g. HTTP 503) must not abort the rest. Those orders
      // stay BOUND and are retried next cycle.
      failedCount += batch.length;
      log.err(`[${channel.key}] Batch ${i + 1} failed: ${e.message}. Continuing with next batch.`);
      store.audit(channel.key, "batch-error", `batch ${i + 1}/${batches.length}: ${e.message}`.slice(0, 160));
    }
  }

  store.audit(channel.key, "labeled", `${labeledCount} ok, ${failedCount} failed, ${packErrCount} pack-errors`);
  if (!labeledCount) {
    log.err(`[${channel.key}] LIVE: 0 labelled successfully. Will retry next cycle.`);
  } else {
    log.ok(`[${channel.key}] LIVE complete. Labelled ${labeledCount} shipment(s)${failedCount ? `, ${failedCount} to retry` : ""}. Run \`print\` to get the PDF.`);
  }
  return { channel: channel.key, shipments: unique.length, processed: labeledCount, failed: failedCount };
}
