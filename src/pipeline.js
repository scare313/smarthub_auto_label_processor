// Order-processing pipeline for one channel on one date.
// Mirrors the exact captured workflow: discover pick task -> validate ->
// pack -> slots -> invoices -> ship label -> download combined label PDF.
//
// Safety: defaults to DRY-RUN. In dry-run it performs only read-only calls
// (pick-task discovery + validate) and reports what it WOULD do, stopping
// before any irreversible write (packages / invoices / ship labels).

import { SHIP_LABEL_RESOLUTION, DEFAULT_PACKAGE } from "./config.js";
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

function buildPackage(s) {
  // Fixed package dimensions for every order, per business decision.
  return {
    customerShipmentId: s.customerShipmentId,
    length: DEFAULT_PACKAGE.length,
    width: DEFAULT_PACKAGE.width,
    height: DEFAULT_PACKAGE.height,
    weight: DEFAULT_PACKAGE.weight,
    boxName: DEFAULT_PACKAGE.boxName,
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
    if (store.isProcessed(s.customerShipmentId)) continue; // idempotency
    if (!PACKABLE.has(s.shipmentStatus)) continue; // already packed/shipped/cancelled
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
  const ids = todo.map((s) => s.customerShipmentId);

  log.step(`[${channel.key}] Creating packages for ${ids.length} shipment(s)...`);
  const pkgResp = await client.createPackages(todo.map(buildPackage));
  const pkgErrors = pkgResp?.shipmentIdToErrorMap || {};
  if (Object.keys(pkgErrors).length) {
    log.warn(`[${channel.key}] Package errors: ${JSON.stringify(pkgErrors).slice(0, 300)}`);
  }

  log.step(`[${channel.key}] Listing pickup slots...`);
  await client.listPickupSlots(ids);

  log.step(`[${channel.key}] Generating invoices...`);
  await client.generateInvoices(ids);

  log.step(`[${channel.key}] Generating ship labels...`);
  const shipLabelRequests = todo.map((s) => ({
    selectedBoxId: "CustomBox",
    customerShipmentId: s.customerShipmentId,
    shippingLabelPrinterResolution: SHIP_LABEL_RESOLUTION,
    salesChannel: channel.salesChannel,
  }));
  const labelResp = await client.generateShipLabel(shipLabelRequests);
  const trackingMap = labelResp?.shipmentIdToPackageTrackingInfoListMap || {};

  // 4. Record each order as LABELED + printed:false. The printable PDF is NOT
  //    downloaded here — that is deferred to the `print` command, which combines
  //    all unprinted labels on demand (avoids duplicate prints / per-run PDFs).
  for (const s of todo) {
    const tInfo = (trackingMap[s.customerShipmentId] || [])[0] || {};
    store.markProcessed(s.customerShipmentId, {
      orderId: s.orderId,
      channel: channel.key,
      date,
      trackingId: tInfo.trackingId || null,
      lineItems: lineItemsByCsid[s.customerShipmentId] || [],
    });
  }
  store.audit(channel.key, "labeled", `${ids.length} shipments`);

  log.ok(`[${channel.key}] LIVE complete. Labelled ${todo.length} shipment(s). Run \`print\` to get the PDF.`);
  return { channel: channel.key, shipments: unique.length, processed: todo.length };
}
