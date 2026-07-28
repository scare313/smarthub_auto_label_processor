# Improvements Backlog — SmartHub Auto-Processor

Grounded in the current build: Node + Playwright, `server.js` web control app
(replaces the old CLI/`.bat`/Task Scheduler on each machine), JSON store,
cross-machine combined printing (hub + processor agents over Tailscale).
Tiered by urgency, with effort and risk notes.

Legend — Effort: S(mall)/M(edium)/L(arge). Risk if NOT done: ●●● high … ● low.
**Status** marked per item; this file is kept up to date as work lands.

---

## Tier 0 — Correctness & safety (do before trusting full automation)

### 0.1 Concurrency lock (mutex) — ✅ DONE · S · ●●●
Solved by `src/queue.js`: the web server's single-worker job queue serializes
the internal 15-min cycle and every manual button/peer action — no more
Task-Scheduler-vs-manual-run race.

### 0.2 Per-order failure isolation + exceptions queue — ⚠️ PARTIAL · M · ●●●
`pipeline.js` now processes in **batches** (isolated try/catch per batch) and
only records an order LABELED if a real tracking ID came back — failures are
logged (`store.audit`) and left `BOUND` to retry next cycle. **Still missing:**
a dedicated exceptions view/list surfacing "orders that keep failing" for
manual attention (they currently just retry forever, silently, in the log).

### 0.3 Packed cross-check — ✅ DONE (superseded by 0.4) · S · ●●
The reconciliation pass (0.4) subsumes this — it scans
`packedCustomerShipmentMapping` every cycle regardless.

### 0.4 Reconcile "packed but not labelled / not recorded" — ✅ DONE · M · ●●●
Built 2026-06-20: `pipeline.js` scans `packedCustomerShipmentMapping` each
cycle and records any packed order missing from the local store (handles
timeouts that actually succeeded server-side, and manual/other-machine
processing).

### 0.5 Retry with backoff for transient errors — ⚠️ PARTIAL · S · ●●
Session-expiry has auto-retry-once (`_withAuthRetry` in `api.js`) and API
calls use a generous 120s timeout. **Still missing:** general bounded
retry-with-backoff for transient 5xx/503 on individual calls (a 503 currently
just fails that batch and waits for the next 15-min cycle — acceptable but
not ideal).

### 0.6 Global safety cap — ❌ NOT DONE · S · ●●
No `maxOrdersPerRun` kill-switch yet. Still a real gap — a bug or bad date
could still trigger mass processing in one cycle.

### 0.7 Validate label PDF before marking printed — ❌ NOT DONE · S · ●
No explicit `%PDF` header / non-empty check before `markPrinted`. Low risk in
practice (downloads have been reliable) but still open.

---

## Tier 1 — Order-type edge cases (real money / SLA risk)

### 1.1 Special order flags — ❌ NOT DONE · M · ●●●
Still blind-packs everything with the fixed box; fast-track/gift/hazmat/
serial-number orders aren't detected or routed specially. **Highest-value
remaining correctness gap.**

### 1.2 Box dimension / weight accuracy — DECIDED, not "fixed" · M · ●●
Deliberate decision: fixed `CustomBox` 15×15×2cm/100g for all channels
(user-confirmed choice, not an oversight). Revisit only if product mix widens
beyond what that box fits.

### 1.3 Multi-piece shipments — ❌ NOT DONE · S · ●

### 1.4 Cancellations after labelling — ⚠️ PARTIAL · M · ●●
`orders/details?shipmentStatus=CANCELLED` is documented (`docs/SMARTHUB_API.md`)
and a raw "Cancelled" count is shown in Show Status, but there's no automated
pull of already-**printed**-but-now-cancelled orders out of a batch (the
"Printed Cancelled" feature discussed but not yet built).

---

## Tier 2 — Observability & alerting (so failures are never silent)

### 2.1 Phone/push alerting — ✅ DONE (email, not Telegram) · M · ●●●
Telegram is banned in India — built email alerting instead (`src/notify.js`,
Gmail SMTP). Fires once when the session dies, once on recovery.

### 2.2 Heartbeat / dead-scheduler detection — ❌ NOT DONE · S · ●●●
`lastCycleAt` is tracked and shown on the control page, but nothing actively
alerts if it goes stale (PC asleep, server crashed, scheduler silently
stopped). Still a real gap for unattended overnight operation.

### 2.3 Log rotation + structured logs — mostly moot · S · ●
The old file-based `auto.log` is superseded by the in-memory ring buffer
(`src/log.js`, capped at 500 lines) feeding the web control page. No
unbounded file growth risk anymore.

### 2.4 Daily summary report — ❌ NOT DONE · M · ●
"Show Status" is on-demand only; no scheduled end-of-day email/report.

---

## Tier 3 — Printing & warehouse workflow

### 3.1 QZ Tray auto-print — ❌ NOT DONE · M · ●
Still opens the PDF for manual Ctrl+P.

### 3.2 Reprint command — ✅ DONE · S · ●
`reprint` (CLI + web button) reopens the last print batch without changing
state.

### 3.3 Pick-path / bin-location ordering — ❌ NOT DONE · M · ●

### 3.4 Sort labels to match pick order — ✅ DONE · S · ●
Labels are now SKU-sorted before requesting the combined PDF, matching the
pick manifest order.

---

## Tier 4 — Returns, inventory, BI

### 4.1 Returns / RTO workflow — 📋 PLANNED, not built · L · ●●
API discovered and documented (`SearchReturns`/`GetReturn`/`UpdateReturnItem`,
`orders/details` cancelled list). Full design exists (`docs/WEBAPP_PLAN.md`,
returns anti-theft scan-reconciliation) but no code yet.

### 4.2 Inventory awareness — API discovered, not built · L · ●●
`updateInventoryQuantity` (write), `getInventoryItemsDetail` documented in
`docs/SMARTHUB_API.md`. Nothing implemented.

### 4.3 Sales analytics — API discovered, not built · M · ●
6 QuickSight dashboard endpoints documented. Nothing implemented.

---

## Tier 5 — Scale & architecture

### 5.1 JSON store → SQLite — ❌ NOT DONE · M · ●●
Still `data/state.json`. Fine at current volume; revisit if order volume
grows significantly (pairs with 0.1, which is now solved a different way —
the job queue avoids the concurrent-write scenario SQLite would also fix).

### 5.2 Incremental processing — ❌ NOT DONE · M · ●

### 5.3 Config file (no code edits) — ⚠️ PARTIAL · S · ●●
Channels/box/cutoffs still in `src/config.js`. Partial precedent set though:
`config/alerts.json` and `config/peers.json` externalize email + peer-machine
settings without code edits.

### 5.4 Multi-warehouse / multi-account — ✅ DONE (2-account) · L · ●
Solved via the hub/processor peer architecture (`src/peers.js`,
`/api/print-combined`) across Bludo PC + Shop PC. Not a generalized
N-account system, but the real 2-account need is met.

---

## Tier 6 — UX, security, maintainability

### 6.1 Local web dashboard — ✅ DONE · L · ●
`server.js` + `public/index.html` — fully replaces the old `.bat` menu, with
a live dashboard, role-aware UI (hub vs processor), and combined printing.

### 6.2 Protect the session profile — ❌ NOT DONE / not documented · S · ●●
Still an open item — no explicit disk-encryption/access-control guidance
given for the `profile/` directory on each machine.

### 6.3 Meesho + channel generalization — ✅ DONE · S · ●●
Meesho + FBA channels added and confirmed via `orders/summary` discovery.

### 6.4 Tests + mock API — ❌ NOT DONE · M · ●
No automated test suite. Verification throughout has been manual (dry-runs,
`--limit 1`, mocked-client unit checks for specific fixes).

### 6.5 One-click installer — ❌ NOT DONE · S · ●

---

## What's actually left, in priority order
1. **1.1 Special order flags** — the single highest real-money/SLA risk still open (fast-track/gift/hazmat/serial-number orders get blind-packed like everything else).
2. **2.2 Heartbeat / dead-scheduler detection** — nothing currently notices if the scheduler silently stops (PC sleep, crash).
3. **0.6 Global safety cap** — no kill-switch against a runaway mass-processing bug.
4. **1.4 "Printed Cancelled"** — surfacing printed-but-now-cancelled orders before handover (API is ready, feature isn't built).
5. **4.1 Returns/RTO module** — fully designed, zero code (the anti-theft scan-reconciliation feature).
6. Everything else in Tiers 4–6 (inventory, analytics, SQLite, tests, installer) — lower urgency, no immediate pain driving them.
