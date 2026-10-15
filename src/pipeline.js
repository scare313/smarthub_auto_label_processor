// Order-processing pipeline for one channel on one date.
// Mirrors the exact captured workflow: discover pick task -> validate ->
// pack -> slots -> invoices -> ship label -> download combined label PDF.
//
// Safety: defaults to DRY-RUN. In dry-run it performs only read-only calls
// (pick-task discovery + validate) and reports what it WOULD do, stopping
// before any irreversible write (packages / invoices / ship labels).

import { SHIP_LABEL_RESOLUTION, DEFAULT_PACKAGE, MAX_ORDER_ATTEMPTS, isTransientError } from "./config.js";
import { SmartHubClient } from "./api.js";
import { store } from "./store.js";
import { log } from "./log.js";

// Statuses that mean a shipment still needs packing/labelling.
const PACKABLE = new Set(["BOUND"]);

// Record one order's failure and say so out loud.
//
// WHY the log line: every one of these used to be audited into state.json and
// nowhere else, so the Activity Log showed "0 labelled, 12 failed" with no way
// to find out why without opening a JSON file. The reason now reaches the
// operator at the moment it happens.
//
// `transient` marks errors that are expected to clear on their own (label not
// ready, throttling, a 5xx). Those are logged and counted but do not spend the
// retry budget, so a slow morning cannot park orders that were going to work.
function noteFailure(channelKey, date, shipment, reason, { transient = false } = {}) {
  const csid = shipment.customerShipmentId;
  const short = String(reason).replace(/\s+/g, " ").slice(0, 160);
  let r;
  try {
    r = store.recordFailure(csid, {
      orderId: shipment.orderId,
      channel: channelKey,
      date,
      reason: short,
      transient,
    });
  } catch (e) {
    // A degraded store throws on write. The caller is already stopping; make
    // sure the reason itself still reaches the log.
    log.err(`[${channelKey}] ${shipment.orderId} [${csid}] ${short} (not recorded: ${e.message})`);
    return null;
  }
  const budget = transient ? "" : ` (failed attempt ${r.hardAttempts})`;
  log.warn(`[${channelKey}] ${shipment.orderId} [${csid}] ${short}${budget}`);
  if (r.newlyFlagged) {
    log.err(
      `[${channelKey}] ${shipment.orderId} [${csid}] has now failed ${r.hardAttempts} times and is shown on the control page. ` +
        `It is STILL being retried every cycle. Reason: ${short}`
    );
    store.audit(channelKey, "failing", `${shipment.orderId} [${csid}] after ${r.hardAttempts}: ${short}`);
  }
  return r;
}

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
  const byId = new Map(batch.map((s) => [s.customerShipmentId, s]));
  for (const id of Object.keys(pkgErrors)) {
    const detail = errorText(pkgErrors[id]);
    store.audit(channel.key, "pack-failed", `${id}: ${detail.slice(0, 120)}`);
    noteFailure(channel.key, date, byId.get(id) || { customerShipmentId: id }, `pack failed: ${detail}`, {
      transient: isTransientError(detail),
    });
  }
  if (!work.length) return { labeled: [], failed: [], packErrors: Object.keys(pkgErrors).length };

  const ids = work.map((s) => s.customerShipmentId);
  const slotsResp = await client.listPickupSlots(ids);
  const slotMap = SmartHubClient.recommendedSlotMap(slotsResp);

  if (channel.requiresPickupSlot) {
    const missing = work.filter((s) => !slotMap[s.customerShipmentId]);
    for (const s of missing) {
      store.audit(channel.key, "no-slot", `${s.orderId} [${s.customerShipmentId}]`);
      // Transient by nature: courier pickup slots are published through the day,
      // so an order with no slot at 09:00 usually has one by 11:00. Parking these
      // would strand perfectly good orders.
      noteFailure(channel.key, date, s, "no courier pickup slot offered yet", { transient: true });
    }
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
  // generate-shiplabel reports per-shipment reasons in the same shape as
  // createPackages. We used to ignore it and log a bare "no trackingId", which
  // told the operator nothing; the real code (e.g. LYCS_INVALID_INPUT) is here.
  const labelErrors = labelResp?.shipmentIdToErrorMap || {};

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
  for (const s of failed) {
    const detail = labelErrors[s.customerShipmentId]
      ? errorText(labelErrors[s.customerShipmentId])
      : "label call returned no tracking id and no error";
    store.audit(channel.key, "label-failed", `${s.orderId} [${s.customerShipmentId}] ${detail}`.slice(0, 160));
    noteFailure(channel.key, date, s, `label failed: ${detail}`, { transient: isTransientError(detail) });
  }

  return { labeled, failed, packErrors: Object.keys(pkgErrors).length };
}

// SmartHub error payloads are sometimes a string, sometimes an object with a
// code and/or message, sometimes a list. Pull out something an operator can
// actually read, and fall back to compact JSON rather than "[object Object]".
function errorText(err) {
  if (err == null) return "unknown error";
  if (typeof err === "string") return err;
  if (Array.isArray(err)) return err.map(errorText).join("; ");
  const code = err.errorCode || err.code || err.type;
  const msg = err.errorMessage || err.message || err.description || err.reason;
  if (code && msg) return `${code}: ${msg}`;
  if (code || msg) return String(code || msg);
  try {
    return JSON.stringify(err).slice(0, 200);
  } catch {
    return String(err);
  }
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

// `quietIfEmpty` is for the look-back dates (item 3). Yesterday and the day
// before are checked every hour and are almost always empty, so with normal
// logging they would bury today's real activity in "No activated pick task
// found" warnings and write an audit row each time. When quiet, a look-back
// date only speaks up if it actually has work.
export async function processChannel(client, { channel, date, dryRun, limit, quietIfEmpty = false }) {
  const mode = dryRun ? "DRY-RUN" : "LIVE";
  if (!quietIfEmpty) {
    log.step(`[${channel.key}] ${mode} — date ${date}`);
    store.audit(channel.key, "run-start", `${mode} date=${date}`);
  }

  // 1. Discover activated pick tasks for this channel/date.
  const tasks = await client.findPickTasks(date, channel.salesChannel);
  if (!tasks.length) {
    if (quietIfEmpty) return { channel: channel.key, shipments: 0, processed: 0, date, quiet: true };
    log.warn(`[${channel.key}] No activated pick task found for ${date}. Activate the pick list first.`);
    return { channel: channel.key, shipments: 0, processed: 0, date };
  }
  if (quietIfEmpty) {
    // There IS work on an earlier date — that is worth saying.
    log.step(`[${channel.key}] ${mode} — catching up on ${date}`);
    store.audit(channel.key, "run-start", `${mode} date=${date} (look-back)`);
  }
  log.info(`[${channel.key}] Found ${tasks.length} pick task(s): ${tasks.map((t) => `${t.id}(${t.status})`).join(", ")}`);

  // Skip tasks already proven finished (see store.markSettled below). Nothing in
  // them can change, so re-validating only costs an API call per task per cycle,
  // forever, for every pick list ever created.
  const live = tasks.filter((t) => !store.isSettled(t.id));
  const settledNow = tasks.length - live.length;
  if (settledNow) {
    log.info(`[${channel.key}] ${settledNow} pick task(s) already finished — skipped.`);
  }
  if (!live.length) {
    if (!quietIfEmpty) log.ok(`[${channel.key}] Nothing to process.`);
    return { channel: channel.key, shipments: 0, processed: 0, date, quiet: !!quietIfEmpty, settledSkipped: settledNow };
  }

  // 2. Validate each pick task and collect shipments (+ SKU line items + packed).
  let shipments = [];
  const lineItemsByCsid = {};
  const packedOrders = [];
  const taskInfo = [];
  for (const t of live) {
    const v = await client.validatePickTask(t.id);
    const list = extractShipments(v).map((s) => ({ ...s, pickTaskId: t.id }));
    Object.assign(lineItemsByCsid, extractLineItems(v));
    packedOrders.push(...extractPackedOrders(v));
    log.info(`[${channel.key}] ${t.id}: ${v.numberOfShipments} shipments, ${v.numberOfShipmentsPacked} already packed`);
    shipments.push(...list);
    taskInfo.push({
      id: t.id,
      status: t.status,
      fullyPacked: Number(v.numberOfShipments) > 0 && Number(v.numberOfShipments) === Number(v.numberOfShipmentsPacked),
      csids: [...new Set([...list.map((x) => x.customerShipmentId), ...extractPackedOrders(v).map((x) => x.customerShipmentId)])],
    });
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

    // 2c. A task is finished only on EVIDENCE, never on status alone: COMPLETED,
    // every shipment packed, and every one of them now in our store. Checked
    // after reconciliation so an orphan is rescued before we stop looking at the
    // task that would have revealed it.
    for (const t of taskInfo) {
      const done =
        String(t.status).toUpperCase() === "COMPLETED" &&
        t.fullyPacked &&
        t.csids.length > 0 &&
        t.csids.every((id) => store.isProcessed(id));
      if (done && store.markSettled(t.id)) {
        log.info(`[${channel.key}] ${t.id} is finished — it will not be checked again.`);
      }
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

  // Orders that keep failing are FLAGGED for visibility but never skipped: the
  // agent retries them every cycle, forever, with no human step. An earlier
  // design parked them after N failures on the belief that retrying itself got
  // orders hard-blocked. The audit disproves that - FORBIDDEN_REQUEST
  // ("maximum number of retry reached") appeared at attempt 11, lasted five
  // attempts and then cleared back to the original error on its own. It is
  // temporary throttling, not a permanent block, so there is nothing to protect
  // an order from and stopping only traded an automatic recovery for a click.
  const flagged = store.flaggedIds();

  let todo = [];
  const stillFailing = [];
  for (const s of unique) {
    // SmartHub status is the SOURCE OF TRUTH for idempotency: only BOUND
    // shipments still need packing. A packed/labelled order moves out of BOUND,
    // so re-running can never double-process. We deliberately do NOT gate on the
    // local store here — the store can drift from SmartHub (e.g. a backend
    // failure that returns OK but doesn't persist), and must never block an order
    // that SmartHub still shows as unpacked.
    if (!PACKABLE.has(s.shipmentStatus)) continue;
    if (flagged.has(s.customerShipmentId)) stillFailing.push(s); // noted, NOT skipped
    todo.push(s);
  }

  if (stillFailing.length) {
    log.warn(
      `[${channel.key}] ${stillFailing.length} order(s) have failed ${MAX_ORDER_ATTEMPTS}+ times and are STILL being retried: ` +
        stillFailing.map((s) => s.orderId).join(", ") +
        " — they may need fixing in SmartHub, but the agent keeps trying either way."
    );
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
    return { channel: channel.key, shipments: unique.length, processed: 0, dryRun: true, date, stillFailing: stillFailing.length };
  }

  if (!todo.length) {
    log.ok(`[${channel.key}] Nothing to process.`);
    return { channel: channel.key, shipments: unique.length, processed: 0, date, stillFailing: stillFailing.length };
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
      // Charge the whole batch, so an order that is genuinely poisoning the
      // call (rather than a passing 503) eventually parks instead of taking the
      // batch down with it every 15 minutes forever.
      const transient = isTransientError(e.message);
      for (const s of batch) noteFailure(channel.key, date, s, `batch error: ${e.message}`, { transient });
    }
  }

  store.audit(channel.key, "labeled", `${labeledCount} ok, ${failedCount} failed, ${packErrCount} pack-errors`);
  if (!labeledCount) {
    log.err(`[${channel.key}] LIVE: 0 labelled successfully. Will retry next cycle.`);
  } else {
    log.ok(`[${channel.key}] LIVE complete. Labelled ${labeledCount} shipment(s)${failedCount ? `, ${failedCount} to retry` : ""}. Run \`print\` to get the PDF.`);
  }
  return {
    channel: channel.key,
    shipments: unique.length,
    processed: labeledCount,
    failed: failedCount,
    date,
    stillFailing: stillFailing.length,
  };
}
