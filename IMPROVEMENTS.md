# Improvements Backlog — SmartHub Auto-Processor

A prioritized list of further improvements, grounded in the current build
(Node + Playwright persistent session, `auto`/`run`/`print`/`picklist`/`activate`
commands, JSON store, Windows Task Scheduler). Tiered by urgency, with effort and
risk notes.

Legend — Effort: S(mall)/M(edium)/L(arge). Risk if NOT done: ●●● high … ● low.

---

## Tier 0 — Correctness & safety (do before trusting full automation)

### 0.1 Concurrency lock (mutex)  · S · ●●●
Task Scheduler fires every 15 min. If one `auto` run is slow (big batch, slow
network), the next can start **while the first is still running** → two processes
labelling the same orders → race / double-processing. The `BOUND`-filter + store
help, but a race window exists between read and write.
**Fix:** a lockfile (`data/auto.lock` with PID + timestamp); `auto` exits early if a
fresh lock exists, steals a stale one (> N min old).

### 0.2 Per-order failure isolation + exceptions queue  · M · ●●●
Today a batch is processed together; if `generate-shiplabel` fails for one order,
the whole channel batch can fail or be left in an unclear state. `bulk-pack/packages`
already returns `shipmentIdToErrorMap`, and label/invoice can partially fail.
**Fix:** process and record **per shipment**; push failures into an
`exceptions` list in the store with reason + timestamp; never mark a failed order
LABELED. Surface the queue in `status` and (later) the dashboard.

### 0.3 Packed cross-check  · S · ●●
Belt-and-suspenders beyond the `BOUND` filter and local store: skip any order
already present in `packedCustomerShipmentMapping` (authoritative SmartHub "done"
signal — has `packedDate`). Cheap insurance against double-pack.

### 0.4 Reconcile "packed but not labelled / not recorded"  · M · ●●●
If the process crashes between `packages` and `generate-shiplabel` (or before the
store write), an order is packed in SmartHub but we have no label/record. It then
sits invisible.
**Fix:** a reconciliation pass that finds orders in `packedCustomerShipmentMapping`
with no local LABELED record and completes them (retrieve label, record). Run at the
start of each `auto` cycle.

### 0.5 Retry with backoff for transient errors  · S · ●●
Network blips / 5xx currently fail the order. Add bounded retry (e.g. 3×, exp
backoff) around idempotent calls; treat irreversible calls carefully (don't blind-retry
`generate-shiplabel` without first checking packed state).

### 0.6 Global safety cap  · S · ●●
A bug or bad date could trigger mass processing. Add a configurable
`maxOrdersPerRun` kill-switch; if a run would exceed it, stop and alert instead.

### 0.7 Validate label PDF before marking printed  · S · ●
Confirm the downloaded PDF is non-empty / has a `%PDF` header before `markPrinted`,
so a bad download never silently marks orders printed.

---

## Tier 1 — Order-type edge cases (real money / SLA risk)

### 1.1 Special order flags  · M · ●●●
`validate` exposes `hasFastTrackOrders`, `hasGiftOrders`, `hasHazmatOrders`,
`hasSingleOrders`, `hasSerialNumRequiredOrders`, `hasReturnAuthenticityTagRequiredOrders`,
`hasTemperatureRatedOrders`. We currently pack everything with one default box and no
special handling. Fast-track has tighter SLAs; hazmat/gift/serial-number need distinct
flows.
**Fix:** detect these per order; route non-standard ones to the exceptions queue (or
channel-specific handling) instead of blind auto-pack.

### 1.2 Box dimension / weight accuracy  · M · ●●
Fixed 15×15×2 cm / 100 g is fine for caps, but if product mix widens, couriers bill
on actual weight/volume — wrong dims → **chargebacks / penalties**. Consider per-SKU
box profiles (a small SKU→box map) while keeping a default.

### 1.3 Multi-piece shipments  · S · ●
Data shows `boxesPerUnit`; multi-box orders aren't handled. Detect and route to
exceptions until supported.

### 1.4 Cancellations after labelling  · M · ●●
`validate` reports `numberOfConsumerCancelledShipments` / `SellerCancelled`. An order
cancelled after we labelled it must not be handed over. Detect cancellations and flag
already-labelled-but-cancelled orders for removal from the print batch.

---

## Tier 2 — Observability & alerting (so failures are never silent)

### 2.1 Phone/push alerting  · M · ●●●
The desktop `LOGIN-REQUIRED.txt` + toast only helps someone **looking at that PC**.
For a session dying overnight, add a real push: Telegram bot / WhatsApp / email / SMS
to the owner. Highest-value reliability upgrade.

### 2.2 Heartbeat / dead-scheduler detection  · S · ●●●
If Task Scheduler is disabled, PC asleep, or `auto` keeps crashing, processing stops
silently. Write a `lastRun` timestamp each cycle; a separate tiny check (or the
dashboard) alerts if it's stale (> 30–45 min).

### 2.3 Log rotation + structured logs  · S · ●
`data/auto.log` grows unbounded. Rotate by date/size. Optionally JSON logs for easy
querying.

### 2.4 Daily summary report  · M · ●
End-of-day: orders processed per channel, failures, exceptions, SLA near-misses,
unprinted-at-cutoff warnings. Email or save to `reports/`.

---

## Tier 3 — Printing & warehouse workflow

### 3.1 QZ Tray auto-print  · M · ●
Direct thermal printing (SmartHub already uses QZ Tray locally) — eliminate the manual
Ctrl+P. Print labels straight to the thermal printer as batches finalize.

### 3.2 Reprint command  · S · ●
`reprint --batch <id>` / `--order <id>` to regenerate/open a prior batch without
changing print state (printer jams, lost paper). Batch PDFs are already kept on disk.

### 3.3 Pick-path / bin-location ordering  · M · ●
If bin/location data is available, sort the pick manifest by warehouse path to speed
picking. (`binDispositionQuantityMap` seen in data — investigate.)

### 3.4 Sort labels to match pick order  · S · ●
Order the combined label PDF to match the pick manifest so pack-station flow aligns.

---

## Tier 4 — Returns, inventory, BI

### 4.1 Returns / RTO workflow  · L · ●●
Entirely untouched. Returns and RTO need inventory restock + reconciliation. A future
module.

### 4.2 Inventory awareness  · L · ●●
Detect low stock / oversell risk across channels before it causes cancellations and
marketplace penalties.

### 4.3 Sales analytics  · M · ●
SKU velocity, per-channel trends, restock suggestions from the data we already pull.

---

## Tier 5 — Scale & architecture

### 5.1 JSON store → SQLite  · M · ●●
The JSON store rewrites the whole file on every op and has no real concurrency
control. At thousands of orders/day it becomes a bottleneck and a corruption risk.
Move to SQLite (Node 24 has built-in `node:sqlite`) for indexed queries + safe
concurrent access. Pairs with the mutex (0.1).

### 5.2 Incremental processing  · M · ●
The 15-min full re-scan per channel grows with volume. Track a watermark and process
only deltas.

### 5.3 Config file (no code edits)  · S · ●●
Move channels, box dims, cutoffs, schedule, alert settings, safety caps into a
`config.json` so a non-developer can adjust without touching source. Currently in
`src/config.js`.

### 5.4 Multi-warehouse / multi-account  · L · ●
Generalize for more than one SmartHub warehouse/login if the business grows.

---

## Tier 6 — UX, security, maintainability

### 6.1 Local web dashboard  · L · ●
`localhost` page: live order counts per channel, session status, exceptions queue,
one-click Process/Print/Pick-List, today's numbers, last-run heartbeat. The natural
successor to the `.bat` files.

### 6.2 Protect the session profile  · S · ●●
`./profile/` holds live Amazon session cookies — effectively a logged-in credential.
Ensure the PC uses disk encryption + a locked user account; restrict folder access.
Document this.

### 6.3 Meesho + channel generalization  · S · ●●
Add Meesho's `salesChannel` (pending a captured Meesho order) and its `marketplace`
value for label retrieval. Generalize self-ship vs easy-ship handling.

### 6.4 Tests + mock API  · M · ●
Unit tests for SKU aggregation, idempotency, print-state transitions; a recorded-HAR
mock so logic can be tested without touching the live account.

### 6.5 One-click installer  · S · ●
A setup script: `npm install` + `playwright install` + scheduler registration +
first-login, so the system can be redeployed on a new PC easily.

---

## Suggested near-term order
1. **0.1 mutex**, **0.2 exceptions queue**, **0.4 reconciliation** — make unattended runs trustworthy.
2. **2.1 push alerting** + **2.2 heartbeat** — never fail silently.
3. **1.1 special-order routing** + **1.4 cancellations** — avoid mis-ships.
4. **6.3 Meesho** — complete channel coverage.
5. Then scale/UX: **5.1 SQLite**, **5.3 config file**, **6.1 dashboard**.
