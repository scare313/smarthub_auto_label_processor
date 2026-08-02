# Risk Register — Planned Changes

Risks for changes under consideration but **not yet built**. Written before
implementation so trade-offs are deliberate rather than discovered in production.

**Severity** = impact if it happens, not likelihood.
🔴 costs money / mis-ships · 🟡 disrupts work · 🟢 annoyance

**Code** = size of the change needed. **S** ≈ under 50 lines · **M** ≈ 50–150 ·
**L** ≈ 150+ or touches core logic.

> Context that shapes everything below: this system processes **real orders with
> real money and marketplace SLAs**, runs **unattended**, and is used daily by
> staff who won't debug it. There is **no staging environment and no automated
> test suite** — every change is validated in production.

---

## Decisions taken (and what they resolved)

| Decision | Effect |
|---|---|
| **Back up `state.json` only**, not `labels/` | ✅ Removes the customer-PII risk entirely — *verified*: `state.json` holds only `orderId, channel, date, labelFile, trackingId, status, ts, printed, printedAt, printBatchId`. No names, addresses, or phone numbers. Also removes the Drive-quota risk. |
| **Prune shipped/picked-up orders from `state.json`** | ✅ Keeps the file small and fast. ⚠️ Introduces a reprint trap — see §I. |
| **Process next-day orders after 5 PM** (single fixed time, not per-channel cutoffs) | ✅ Simpler than per-channel logic, and after the day's pickup rush. ⚠️ Partial — see §B7. |
| **Print only labels whose ship date is today** | ✅ **Solves the biggest risk (old B1)** — today's and tomorrow's labels can no longer mix in one PDF. ⚠️ Introduces a stranding risk — see §J. |

Net effect: the two blockers on next-day processing are now **one solved** (label
mixing) and **one still open** (attempt limit, §C).

---

## A. Nightly backup to Google Drive — *scope reduced to `state.json`*

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| A1 | ~~Label PDFs contain customer PII~~ | ✅ | — | **Resolved** by backing up `state.json` only (verified PII-free). |
| A2 | **Silent sync failure** — Drive paused, signed out, quota full. You believe a backup exists; it doesn't. | 🔴 | S | Check the *destination* file exists and is recent; alert if stale. Verifying "the copy ran" is not the same as verifying "a recent file is there". |
| A3 | ~~Unbounded growth~~ | ✅ | — | **Resolved** — `state.json` is small, and pruning keeps it that way. |
| A4 | **Restore never tested.** A backup you can't restore isn't a backup. | 🔴 | — | One real restore drill onto a spare folder. Process, not code. |
| A5 | Copied mid-write → corrupt backup. | 🟢 | — | Already safe: the store writes atomically (temp file + rename). |

**Overall: low risk. A4 is a process step, not code.**

---

## B. Processing next-day orders after 5 PM

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| B1 | ~~Today's and tomorrow's labels mix in one PDF~~ | ✅ | — | **Resolved** by the today-only print filter (§J covers its own risk). |
| B2 | **Labelling commits a courier pickup slot and starts the SLA clock.** A day-early label may book the wrong day's slot. | 🔴 | — | **Verify with `--limit 1`** on one real next-day order; check the slot in SmartHub. Same method as the `pickupSlotId` fix. Still unverified. |
| B3 | **More lead time → more cancellations after labelling.** An order cancelled overnight is already labelled. | 🔴 | M | Makes printed-cancelled (§F) more valuable; overnight is the window where it bites. |
| B4 | **Compounds the missing retry limit.** Next-day orders are likelier to be not-ready (`LABEL_NOT_READY`); without an attempt cap the tool retries every 15 min until SmartHub blocks them — the `FORBIDDEN: Maximum number of retry reached` incident of 30 June. | 🔴 | — | **Build §C first.** Still the open blocker. |
| B5 | Roughly doubles work per cycle → longer cycles, bigger batches, more 503s (seen on FBA at 85 orders). | 🟡 | S | Batching exists; may need a smaller batch size. Reduced by running at 5 PM, after the rush. |
| B6 | Status table and waiting-count show **today only** — tomorrow's work is invisible on the page. | 🟡 | M | Extend the status view to cover both dates. |
| B7 | **5 PM is after Amazon's cutoff (1:45 PM) but *before* Flipkart's (11:45 PM) and Meesho's (10:50 PM).** So for those channels, today's orders are still arriving while tomorrow's are being processed — both days genuinely in flight at once. | 🟡 | S | Acceptable *because* of the today-only print filter. If per-channel timing is ever wanted, the cutoffs are already in config. |
| B8 | Assumes stock exists for tomorrow's orders. | 🟡 | L | Accepted; inventory awareness isn't built. |

**Change size: ~35 lines** (a `datesForChannel()` helper + a loop in `scheduler.js`).
Activation already handles future ship dates — no change needed there.

---

## C. Attempt limit + exceptions queue — *prerequisite for §B*

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| C1 | **Threshold too low** → orders parked that a retry would have fixed → never ship. | 🔴 | S | Generous cap (~5); count only hard failures, not network blips. |
| C2 | **Parked orders become a black hole** if nobody looks. | 🔴 | M | Surface on the page and in alerts — not a hidden list. |
| C3 | No way to **un-park** after fixing the cause. | 🟡 | S | Ship a "retry this order" action from day one. |

**Change size: M** (~100 lines: attempt counter in the store, park logic in
`pipeline.js`, a page section). **Not building this is itself a risk** — it has
already caused permanently blocked Flipkart orders.

---

## D. Cutoff warnings

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| D1 | **Alert fatigue** → staff ignore it, then miss a real one. | 🟡 | S | One alert per channel per day, only when the count is non-zero. |
| D2 | Miscounts "waiting" → false alarms. | 🟡 | S | Reuse the figures already shown in the status table so screen and alert agree. |
| D3 | Wrong cutoff values in config. | 🟢 | — | Confirm each marketplace's real handover time before enabling. |

**Change size: S** (~50 lines; cutoffs and the email path already exist).

---

## E. Log file for `run-agent.bat`

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| E1 | **Unbounded growth fills the disk** — taking down the agent it was meant to help debug. | 🟡 | S | Daily rotation; delete older than N days. |
| E2 | Logs contain order IDs. | 🟢 | — | Not backed up (backup is `state.json` only). |

**Change size: S** (a few lines in the `.bat` plus a small rotation step).

---

## F. Printed-but-cancelled detection

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| F1 | **False positives** → staff pull parcels that are fine. | 🟡 | S | Show reason + order ID; human confirms. |
| F2 | **Polling gap** — cancelled after the last check but before handover. | 🟡 | S | Check during the pre-cutoff sweep, when it matters most. |

**Change size: M** (~80 lines; the API is already documented and understood).

---

## G. Special-order flags (fast-track / gift / hazmat / serial)

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| G1 | If these flags are **common**, parking them could halt a large share of orders. | 🔴 | S | **Measure frequency first** (read-only) before changing behaviour. |
| G2 | Fast-track has **tighter** SLAs — parking could miss deadlines. | 🔴 | M | Fast-track likely needs *prioritising*, not parking. |

**Change size: M**, but gate it behind a read-only frequency measurement (S).

---

## H. Config file externalisation

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| H1 | A bad hand-edit **breaks startup** — and a non-developer is now editing it. | 🟡 | S | Validate on load; fall back to defaults with a loud warning instead of crashing. |
| H2 | Someone changes box size / cutoffs without understanding the effect. | 🟡 | — | Comment heavily; keep dangerous values out. |

**Change size: M** (~100 lines, touches config plumbing across modules).

---

## I. NEW — Pruning `state.json` ⚠️

Removing shipped/picked-up orders keeps the file small, but interacts with the
reconciliation step in a way that can cause **reprints**.

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| I1 | **Pruning too early causes a reprint.** Reconciliation re-adds any packed order *missing from the store* as `printed: false`. Prune a record while its order is still in today's pick task, and the next cycle re-adds it and it prints again. | 🔴 | S | **Only prune records whose ship `date` is in the past.** Reconciliation only scans the date being processed (today), so past-dated orders are never re-scanned — verified in `pipeline.js`. |
| I2 | Pruning removes the **audit trail** (what was printed, when, tracking IDs) — useful for marketplace disputes. | 🟡 | S | Move pruned rows to a dated archive file rather than deleting outright. |
| I3 | Pruning while a cycle is mid-write. | 🟢 | — | Run it through the existing job queue, like every other action. |

**Change size: S** (~40 lines). **The safe rule is one line: prune only
`date < today` AND `printed === true`.**

---

## J. NEW — Today-only print filter ⚠️

Filtering prints to today's ship date solves the mixing problem, but creates a
way for labels to go **silently missing**.

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| J1 | **Yesterday's unprinted labels become invisible.** If a print failed or was missed, those labels are filtered out permanently and never surface again. | 🔴 | S | Show a warning when unprinted labels exist for *past* dates ("3 unprinted labels from 01 Aug"), and let "Print All" reach them. |
| J2 | A ship date that shifts (order re-planned to a later date) drops out of today's view. | 🟡 | S | Covered by the same past-date warning. |
| J3 | Staff expect "Print New Labels" to mean *everything* new; it now silently means *today's*. | 🟡 | S | Say so on the button/hint text. |

**Change size: S** (~30 lines: a date filter plus the stranded-labels warning).
**J1's warning should ship with the filter, not after it** — otherwise the filter
converts a visible problem into an invisible one.

---

## Cross-cutting risks (apply to every change)

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| X1 | **No test suite** — regressions surface in production, on real orders. | 🔴 | M | Dry-run and `--limit 1` before anything irreversible. Add tests for pure logic (done for the watchdog and merge helpers). |
| X2 | **Version skew between machines.** Hub and peer share a protocol; updating one silently broke combined printing before (the `all` flag). | 🔴 | — | Always `git pull` + restart **both** PCs together — one deployment, not two. |
| X3 | **Irreversible operations.** `generate-shiplabel` commits shipments. A bug can't be undone by rolling back code. | 🔴 | — | Dry-run → single order → batch. Never skip the middle step. |
| X4 | **Restart required to deploy**, and the agent is the only thing processing. | 🟡 | — | Deploy away from cutoff windows. |
| X5 | **Single maintainer** — nobody else can debug this. | 🟡 | — | Keep `SETUP_GUIDE.md` and these docs current; prefer boring, readable code. |

---

## Suggested order (lowest risk first)

| # | Change | Code | Why here |
|---|---|---|---|
| 1 | **Backup `state.json` (§A)** | S | Trivial, additive, removes a real single point of failure. |
| 2 | **Prune `state.json` (§I)** | S | Pairs naturally with backup. Safe rule: `date < today && printed`. |
| 3 | **Log file (§E)** | S | Small, and needed to debug everything after it. |
| 4 | **Attempt limit + exceptions (§C)** | M | Fixes a failure that already happened. **Prerequisite for §B.** |
| 5 | **Cutoff warnings (§D)** | S | Uses cutoffs already sitting unused in config. |
| 6 | **Printed-cancelled (§F)** | M | Becomes more valuable once §B adds overnight lead time. |
| 7 | **Today-only print filter + stranded warning (§J)** | S | Ship together, before §B. |
| 8 | **Next-day processing (§B)** | S | Only after §C and §J, and once B2 (pickup slot) is verified on one order. |
| 9 | **Special-order flags (§G)** | M | Measure frequency first. |
