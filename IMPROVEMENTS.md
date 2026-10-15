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

### 0.2 Per-order failure isolation + exceptions queue — ✅ DONE · M · ●●●
`pipeline.js` processes in **batches** (isolated try/catch per batch) and only
records an order LABELED if a real tracking ID came back. Every failure now also
goes through `noteFailure()`, which stores the reason and the attempt count in
`state.json`, **logs it** so it appears in the Activity Log, and parks the order
after `MAX_ORDER_ATTEMPTS` = 5 **hard** failures. Parked orders are skipped by
later cycles instead of retried forever.

Surfaced in four places: the amber "Needs attention" panel on the control page
(with per-order Retry and Retry all), `GET /api/exceptions`,
`node index.js exceptions`, and a one-time email per newly parked order.

### 0.3 Packed cross-check — ✅ DONE (superseded by 0.4) · S · ●●
The reconciliation pass (0.4) subsumes this — it scans
`packedCustomerShipmentMapping` every cycle regardless.

### 0.4 Reconcile "packed but not labelled / not recorded" — ✅ DONE · M · ●●●
Built 2026-06-20: `pipeline.js` scans `packedCustomerShipmentMapping` each
cycle and records any packed order missing from the local store (handles
timeouts that actually succeeded server-side, and manual/other-machine
processing).

### 0.5 Retry with backoff for transient errors — ⚠️ PARTIAL · S · ●●
Session-expiry has auto-retry-once (`_withAuthRetry` in `api.js`) and API calls
use a generous 120s timeout. Transient failures are now **classified** rather
than retried blindly: `TRANSIENT_ERROR_PATTERNS` in `config.js` covers 5xx,
throttling, timeouts, socket resets and `LABEL_NOT_READY`, and such a failure is
recorded and retried next cycle without ever counting toward the park cap.

**Still missing:** in-cycle retry with backoff. A 503 still fails that batch and
waits for the next 15-minute cycle. That is now a *latency* issue rather than a
correctness one, since the order can no longer be parked for it.

### 0.6 Global safety cap — ❌ NOT DONE · S · ●●
No `maxOrdersPerRun` kill-switch yet. Still a real gap — a bug or bad date
could still trigger mass processing in one cycle.

### 0.7 Validate label PDF before marking printed — ⚠️ PARTIAL · S · ●
Still no explicit `%PDF` header / non-empty check on the downloaded bytes. What
*is* checked now is the more dangerous half: SmartHub's combined-document
response says which orders it actually included, and `splitByIncluded()` in
`print.js` marks only those. An order we asked for but did not get is logged,
audited as `print-missing`, and left unprinted for the next press.

### 0.8 Look-back window (midnight rollover) — ✅ DONE · S · ●●●
A cycle used to process `todayIST()` only, so at midnight IST the previous day's
unpacked orders were abandoned — 19 were lost that way in August 2026.
`recentDatesIST()` in `config.js` now gives each cycle today plus the previous
`LOOKBACK_DAYS` (default 2), oldest first so the order closest to breaching is
handled first.

**It does not catch everything.** Processing finds orders through pick tasks, so
an order in no pick task on any date stays invisible to it. That was a separate
bug with a separate fix — see 0.11.

### 0.9 Corrupt-state quarantine + daily backups — ✅ DONE · S · ●●●
An unreadable `state.json` used to read as "nothing processed", which would
relabel and reprint everything. The store now renames the bad file to
`state.corrupt-<timestamp>.json`, goes **degraded**, and refuses every live
action with a message naming the newest usable backup. `backupDaily()` keeps 14
daily copies in `data/backups/`, and the hub pulls the peer's copy into
`data/peer-backups/`.

Restoring is deliberately manual: an automatic restore of a day-old backup would
mark recently printed orders unprinted and label them a second time. **Still
open:** an off-site copy. Both current copies sit in the same building.

### 0.11 Activate missed pick lists, not just recommended ones — ✅ DONE · S · ●●●
Activation read only `/pick/cpts/recommended` and `/pick/lists/recommended`.
Once a pickup window expires SmartHub stops returning it from both, so overdue
orders were never offered again: never picked, packed, labelled or dispatched,
and leaving no local trace, since an order that is never activated writes
nothing to `state.json`. The log said "No new pick lists to activate" and looked
healthy. This lost 13 Flipkart orders dated 13 October.

`activate.js` now also reads `/api/pick/lists/missed` each cycle, activates
missed lists first, de-duplicates across both sources, and cannot be blocked by
a failure of the missed lookup. Both endpoints had been documented in
`SMARTHUB_API.md` since June and were never wired in.

**The look-back window (0.8) does not overlap with this.** Processing finds
orders through pick tasks, and these were in no pick task on any date.

### 0.10 Confirm the peer's print before marking it printed — ✅ DONE · S · ●●
The peer used to mark its labels printed the moment it handed them to the hub,
so a failed merge lost them: marked printed, never in any PDF. The peer now
holds the batch pending (30-minute TTL) and the hub calls
`POST /api/peer/confirm-print` only after every merged file is written. An
unconfirmed batch stays unprinted, which risks a duplicate print rather than a
missing one. A peer on older code returns no `batchId`, gets no confirmation,
and behaves exactly as before.

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

### 2.2 Heartbeat / dead-scheduler detection — ✅ DONE · S · ●●●
`src/heartbeat.js` watches `lastCycleAt` and the peers the hub already polls,
and emails once when processing goes stale (45 min) and once on recovery.
**Known gap, documented in the file:** a machine cannot report its own total
death — if the hub is powered off, nothing emails. Closing that needs an
external watcher on a third always-on machine.

### 2.3 Log rotation + structured logs — ✅ DONE (rotation) · S · ●
`src/log.js` writes every line to three sinks: the console, the 500-line ring
buffer the control page reads, and `data/logs/agent-YYYY-MM-DD.log` — one file
per IST day, pruned to 14 days. The file sink disables itself with a single
warning if the directory cannot be written, so a full disk degrades logging
instead of stopping the agent.

The ring buffer alone was not enough in practice: it holds roughly a few hours
of a busy day, so anything that happened overnight had already scrolled away by
the time somebody looked. **Structured (JSON) logs are still not done**, and
there is no pressure for them while the files are read by eye.

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
1. **1.1 Special order flags** — the single highest real-money/SLA risk still open (fast-track/gift/hazmat/serial-number orders get blind-packed like everything else). Measure how common they are first.
2. **0.6 Global safety cap** — no kill-switch against a runaway mass-processing bug.
3. **Off-site backup copy (0.9)** — daily backups exist, but both copies are in the same building.
4. **Cutoff warnings** — the cutoff times have been sitting unused in `config.js` since the start; nothing warns before a handover deadline (`RISKS.md` §D).
5. **1.4 "Printed Cancelled"** — surfacing printed-but-now-cancelled orders before handover (API is ready, feature isn't built).
6. **4.1 Returns/RTO module** — fully designed, zero code (the anti-theft scan-reconciliation feature).
7. **6.4 Tests** — the pure logic is now separable (`recentDatesIST`, `splitByIncluded`, the store's failure accounting), so this got cheaper. There is still no runner.
8. Everything else in Tiers 4–6 (inventory, analytics, SQLite, installer) — lower urgency, no immediate pain driving them.
