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

  // 2. Validate each pick task and collect shipments (+ SKU line items).
  let shipments = [];
  const lineItemsByCsid = {};
  for (const t of tasks) {
    const v = await client.validatePickTask(t.id);
    const list = extractShipments(v).map((s) => ({ ...s, pickTaskId: t.id }));
    Object.assign(lineItemsByCsid, extractLineItems(v));
    log.info(`[${channel.key}] ${t.id}: ${v.numberOfShipments} shipments, ${v.numberOfShipmentsPacked} already packed`);
    shipments.push(...list);
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

  // 3. LIVE — irreversible from here.
  const boxName = channel.boxName || DEFAULT_PACKAGE.boxName;
  log.step(`[${channel.key}] Creating packages for ${todo.length} shipment(s)...`);
  const pkgResp = await client.createPackages(todo.map((s) => buildPackage(s, boxName)));
  const pkgErrors = pkgResp?.shipmentIdToErrorMap || {};

  // Drop any shipment that failed to pack — do not try to label those.
  let work = todo.filter((s) => !pkgErrors[s.customerShipmentId]);
  if (Object.keys(pkgErrors).length) {
    log.warn(`[${channel.key}] ${Object.keys(pkgErrors).length} package error(s): ${JSON.stringify(pkgErrors).slice(0, 300)}`);
    for (const id of Object.keys(pkgErrors)) store.audit(channel.key, "pack-failed", `${id}: ${JSON.stringify(pkgErrors[id]).slice(0, 120)}`);
  }
  if (!work.length) {
    log.err(`[${channel.key}] All shipments failed to pack. Nothing labelled.`);
    return { channel: channel.key, shipments: unique.length, processed: 0, failed: todo.length };
  }

  const ids = work.map((s) => s.customerShipmentId);

  log.step(`[${channel.key}] Listing pickup slots...`);
  const slotsResp = await client.listPickupSlots(ids);
  const slotMap = SmartHubClient.recommendedSlotMap(slotsResp);

  // Amazon MFN requires a pickupSlotId on the label call; bail if missing.
  if (channel.requiresPickupSlot) {
    const missing = work.filter((s) => !slotMap[s.customerShipmentId]);
    if (missing.length) {
      log.err(`[${channel.key}] ${missing.length} shipment(s) have no pickup slot — cannot label. Will retry next cycle.`);
      for (const s of missing) store.audit(channel.key, "no-slot", `${s.orderId} [${s.customerShipmentId}]`);
      work = work.filter((s) => slotMap[s.customerShipmentId]);
    }
    if (!work.length) {
      return { channel: channel.key, shipments: unique.length, processed: 0, failed: todo.length };
    }
  }

  log.step(`[${channel.key}] Generating invoices...`);
  await client.generateInvoices(work.map((s) => s.customerShipmentId));

  log.step(`[${channel.key}] Generating ship labels...`);
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

  // 4. VERIFY success per order: only orders that actually got a tracking ID back
  //    are recorded as LABELED. Orders with no tracking (e.g. a SmartHub backend
  //    failure that returns OK but doesn't persist) are left UNRECORDED so they
  //    stay BOUND and get retried on the next cycle — never falsely marked done.
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

  if (failed.length) {
    log.err(`[${channel.key}] ${failed.length} shipment(s) returned NO tracking ID — not recorded, will retry next cycle.`);
    for (const s of failed) store.audit(channel.key, "label-failed", `${s.orderId} [${s.customerShipmentId}] no trackingId`);
  }
  store.audit(channel.key, "labeled", `${labeled.length} ok, ${failed.length} failed, ${Object.keys(pkgErrors).length} pack-errors`);

  if (!labeled.length) {
    log.err(`[${channel.key}] LIVE: 0 labelled successfully (SmartHub may be having issues). Will retry next cycle.`);
  } else {
    log.ok(`[${channel.key}] LIVE complete. Labelled ${labeled.length} shipment(s). Run \`print\` to get the PDF.`);
  }
  return { channel: channel.key, shipments: unique.length, processed: labeled.length, failed: failed.length };
}
