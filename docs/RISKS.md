# Risk Register — Planned Changes

Risks for changes under consideration but **not yet built**. Written before
implementation so decisions are deliberate rather than discovered in production.

**Severity** = impact if it happens, not likelihood.
🔴 costs money / mis-ships · 🟡 disrupts work · 🟢 annoyance

> Context that shapes everything below: this system processes **real orders with
> real money and marketplace SLAs**, runs **unattended**, and is used daily by
> staff who won't debug it. There is **no staging environment and no automated
> test suite** — every change is validated in production.

---

## A. Nightly backup to Google Drive

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| A1 | Label PDFs contain **customer names, addresses, phone numbers**. Copying them to Drive puts customer PII on Google's servers. | 🔴 | Decide deliberately. Option: back up only `state.json` (the printed-record — no PII) and skip `labels/`. |
| A2 | **Silent sync failure** — Drive paused, signed out, or quota full. You believe a backup exists; it doesn't. | 🔴 | Verify the *destination* (file present + recent timestamp), not just that the copy ran. Alert if the newest backup is stale. |
| A3 | **Unbounded growth** — `labels/` grows daily. A full Drive quota can stop syncing *everything else* too. | 🟡 | Retention limit (e.g. keep 30–60 days), or back up state only. |
| A4 | **Restore never tested.** A backup that can't be restored isn't a backup. | 🔴 | Do one real restore drill onto a spare folder before relying on it. |
| A5 | Copy runs mid-write → partial PDF captured. | 🟢 | Low impact (next night's copy fixes it). `state.json` is written atomically, so it's safe. |

**Overall: low technical risk, but A1 and A4 are decisions, not code.**

---

## B. Processing next-day orders after cutoff

The code is small (~35 lines). **The risk is operational, not technical.**

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| B1 | **Today's and tomorrow's labels mix in one PDF.** Printing ignores ship date, so once tomorrow's orders are labelled they land in the same combined PDF. Staff could hand tomorrow's parcels to today's courier. | 🔴🔴 | **Must be solved before building.** Separate PDFs per ship date, and/or a clear ship-date header on each batch. |
| B2 | **Labelling commits a courier pickup slot and starts the SLA clock.** A day-early label may book the wrong day's slot. | 🔴 | Verify with `--limit 1` on one real next-day order and check the assigned slot in SmartHub — same method used for the `pickupSlotId` fix. |
| B3 | **More lead time → more cancellations after labelling.** An order cancelled overnight is already labelled and may be handed over. | 🔴 | Raises the value of the "printed-cancelled" check (§F) — arguably a prerequisite. |
| B4 | **Compounds the missing retry limit.** Next-day orders are more likely to be not-ready (`LABEL_NOT_READY`). Without an attempt cap, the tool retries every 15 min until SmartHub blocks them — *exactly* the `FORBIDDEN: Maximum number of retry reached` incident from 30 June. | 🔴 | **Build the attempt limit (§C) first.** Doing B before C repeats a known failure. |
| B5 | **Roughly doubles work per cycle** → longer cycles, bigger batches, more 503s (already seen on FBA at 85 orders). | 🟡 | Batching is in place; may need a smaller batch size. |
| B6 | Status table and waiting-count show **today only** — tomorrow's work is invisible on the page. | 🟡 | Extend the status view to show both dates. |
| B7 | Assumes **stock exists** for tomorrow's orders. | 🟡 | Accepted risk; inventory awareness isn't built. |

**Overall: highest-risk change on the list. B1 and B4 are blockers, not caveats.**

---

## C. Attempt limit + exceptions queue

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| C1 | **Threshold too low** → orders parked that a transient retry would have fixed → they never ship. | 🔴 | Generous threshold (e.g. 5 attempts), and only count *hard* failures, not network blips. |
| C2 | **Parked orders become a black hole** if nobody looks at the queue. | 🔴 | Surface prominently on the page + include in the daily/cutoff alert. Not a hidden list. |
| C3 | No way to **un-park** an order after fixing the cause. | 🟡 | A "retry this order" action from day one. |

**Note:** not building this is itself a risk — it has already caused permanently
blocked Flipkart orders.

---

## D. Cutoff warnings

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| D1 | **Alert fatigue** — fires too often, staff learn to ignore it, then miss a real one. | 🟡 | One alert per channel per day; only when the count is genuinely non-zero near cutoff. |
| D2 | **Miscounts "waiting"** (e.g. counting cancelled orders) → false alarms. | 🟡 | Reuse the same figures shown in the status table so screen and alert always agree. |
| D3 | Wrong cutoff values in config → alerts at the wrong time. | 🟢 | Confirm each marketplace's real handover time before enabling. |

---

## E. Log file for `run-agent.bat`

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| E1 | **Unbounded growth** fills the disk — which would take down the agent it's meant to help debug. | 🟡 | Daily rotation + delete older than N days. |
| E2 | Logs contain order IDs and marketplace data; if backed up to Drive, same PII consideration as A1. | 🟢 | Exclude logs from backup, or accept. |

---

## F. Printed-but-cancelled detection

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| F1 | **False positives** → staff pull parcels that are actually fine. | 🟡 | Show the cancellation reason and order ID; let a human confirm. |
| F2 | **Polling gap** — cancelled after the last check but before handover is missed. | 🟡 | Check as part of the pre-cutoff sweep, when it matters most. |

---

## G. Special-order flags (fast-track / gift / hazmat / serial)

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| G1 | If these flags are **common**, routing them to exceptions could park a large share of orders → work stops. | 🔴 | Measure frequency first (read-only) before changing any behaviour. |
| G2 | Fast-track has **tighter SLAs** — parking them for manual handling could miss deadlines. | 🔴 | Fast-track may need *prioritising*, not parking. |

---

## H. Config file externalisation

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| H1 | A bad hand-edit (typo, invalid JSON) **breaks startup** — and now a non-developer is editing it. | 🟡 | Validate on load; fall back to defaults with a loud warning rather than crashing. |
| H2 | Someone changes box size / cutoffs without understanding the effect. | 🟡 | Comment the file heavily; keep dangerous values out of it. |

---

## Cross-cutting risks (apply to every change)

| # | Risk | Sev | Mitigation |
|---|---|---|---|
| X1 | **No test suite.** Regressions surface in production, on real orders. | 🔴 | Dry-run and `--limit 1` before trusting anything irreversible. Add tests for pure logic (already done for the watchdog and merge helpers). |
| X2 | **Version skew between machines.** The hub and peer speak a shared protocol — updating only one can silently break combined printing (already seen with the `all` flag). | 🔴 | Always `git pull` + restart **both** PCs together; treat them as one deployment. |
| X3 | **Irreversible operations.** `generate-shiplabel` commits shipments; `UpdateReturnItem` changes inventory. A bug can't be undone by rolling back code. | 🔴 | Dry-run → single order → batch. Never skip the middle step. |
| X4 | **Restart required to deploy**, and the agent is the only thing processing orders. | 🟡 | Deploy outside peak/near-cutoff windows. |
| X5 | **Single maintainer** — nobody else can debug this. | 🟡 | Keep `SETUP_GUIDE.md` and these docs current; prefer boring, readable code. |

---

## Suggested order (lowest risk first)

1. **Backup (§A)** — trivial, additive, removes a real single point of failure.
2. **Log file (§E)** — small, and needed to debug everything else.
3. **Attempt limit + exceptions (§C)** — fixes a failure that has already happened, and is a **prerequisite for §B**.
4. **Cutoff warnings (§D)** — uses data already in config.
5. **Printed-cancelled (§F)** — becomes more important if §B goes ahead.
6. **Next-day processing (§B)** — only after C and F, and only once B1 (label separation) is designed and B2 (pickup slot) is verified.
7. **Special-order flags (§G)** — measure frequency before changing behaviour.
