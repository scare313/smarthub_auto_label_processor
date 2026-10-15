# Risk Register — Planned Changes

Risks for changes to this system, written **before** implementation so trade-offs
are deliberate rather than discovered in production. Sections marked
**✅ IMPLEMENTED** are kept rather than deleted: the mitigation column records
what was actually done about each risk, and the ones still marked open are the
residual risk that shipping did not remove.

Implemented so far: §C attempt limit and exceptions, §E daily log file,
§J print-date filter, §K corrupt-state quarantine, and §A in reduced form
(local plus peer backups, off-site still open).

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
| **Print today's labels + any earlier unprinted, but never future ship dates** | ✅ **Solves the biggest risk (old B1)** — tomorrow's labels can't mix into today's PDF — **without** the stranding that a strict today-only filter would have caused. See §J (now implemented). |
| **Park an order after 5 hard failures rather than retrying forever** | ✅ Ends the retry loop that got orders permanently blocked by SmartHub. ⚠️ Moves the risk to "nobody looks at the parked list" — see §C. |
| **Stop the line on a corrupt `state.json` instead of restoring a backup automatically** | ✅ An automatic restore would re-mark recently printed orders as unprinted and relabel them. ⚠️ Costs availability: the agent refuses live work until a human restores — see §K. |
| **Back up `state.json` locally and to the peer machine, not to Drive** | ✅ Shipped now, with no new account, credential or quota. ⚠️ Both copies are in the same building — off-site is still open, see §A. |
| **Mark peer labels printed only after the hub confirms the merge saved** | ✅ Closes a silent-loss path: labels marked printed that never reached a PDF. ⚠️ A lost confirmation means a duplicate print, which is the safe direction. |

Net effect: **both** blockers on next-day processing are now solved — label
mixing (§J) and the attempt limit (§C). §B itself is still unbuilt, and B2
(pickup slot on a day-early label) is still unverified.

---

## A. Nightly backup to Google Drive — *scope reduced to `state.json`*

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| A1 | ~~Label PDFs contain customer PII~~ | ✅ | — | **Resolved** by backing up `state.json` only (verified PII-free). |
| A2 | **Silent sync failure** — Drive paused, signed out, quota full. You believe a backup exists; it doesn't. | 🔴 | S | ✅ **Partly resolved** by not using Drive: `store.backupDaily()` writes `data/backups/state-YYYY-MM-DD.json` and the hub copies the peer's file into `data/peer-backups/`. The degraded-state message names the newest backup it can actually read, so "a recent file is there" is checked at the moment it matters. |
| A6 | **Both copies are in the same building.** Local + peer survives one dead PC, not fire, theft or ransomware. | 🔴 | S | Still open. A periodic copy of `data/backups/` to anything off-site closes it; the files are small and PII-free. |
| A3 | ~~Unbounded growth~~ | ✅ | — | **Resolved** — `state.json` is small, and pruning keeps it that way. |
| A4 | **Restore never tested.** A backup you can't restore isn't a backup. | 🔴 | — | One real restore drill onto a spare folder. Process, not code. |
| A5 | Copied mid-write → corrupt backup. | 🟢 | — | Already safe: the store writes atomically (temp file + rename). |

**Overall: low risk. A4 is a process step, not code.**

---

## B. Processing next-day orders after 5 PM

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| B1 | ~~Today's and tomorrow's labels mix in one PDF~~ | ✅ | — | **Resolved** — the print filter (§J) excludes future ship dates. |
| B2 | **Labelling commits a courier pickup slot and starts the SLA clock.** A day-early label may book the wrong day's slot. | 🔴 | — | **Verify with `--limit 1`** on one real next-day order; check the slot in SmartHub. Same method as the `pickupSlotId` fix. Still unverified. |
| B3 | **More lead time → more cancellations after labelling.** An order cancelled overnight is already labelled. | 🔴 | M | Makes printed-cancelled (§F) more valuable; overnight is the window where it bites. |
| B4 | ~~**Compounds the missing retry limit.**~~ | ✅ | — | **Resolved** — §C is built. `LABEL_NOT_READY` is classified transient, so a not-yet-ready next-day order is retried without ever being pushed toward the cap. |
| B5 | Roughly doubles work per cycle → longer cycles, bigger batches, more 503s (seen on FBA at 85 orders). | 🟡 | S | Batching exists; may need a smaller batch size. Reduced by running at 5 PM, after the rush. |
| B6 | Status table and waiting-count show **today only** — tomorrow's work is invisible on the page. | 🟡 | M | Extend the status view to cover both dates. Unchanged by the look-back work, which widened *processing* dates, not the status view. |
| B7 | **5 PM is after Amazon's cutoff (1:45 PM) but *before* Flipkart's (11:45 PM) and Meesho's (10:50 PM).** So for those channels, today's orders are still arriving while tomorrow's are being processed — both days genuinely in flight at once. | 🟡 | S | Acceptable *because* the print filter (§J) keeps future-dated labels out of the PDF. If per-channel timing is ever wanted, the cutoffs are already in config. |
| B8 | Assumes stock exists for tomorrow's orders. | 🟡 | L | Accepted; inventory awareness isn't built. |

**Change size: ~35 lines** (a `datesForChannel()` helper + a loop in `scheduler.js`).
Activation already handles future ship dates — no change needed there.

---

## C. Attempt limit + exceptions queue — ✅ IMPLEMENTED

| # | Risk | Sev | Code | Status |
|---|---|---|---|---|
| C1 | **Threshold too low** → orders parked that a retry would have fixed → never ship. | ✅ | S | **Mitigated as planned.** Cap is 5, and the store counts `hardAttempts` separately from `attempts`: throttling, 5xx, timeouts, socket resets and `LABEL_NOT_READY` are recorded but never counted toward it. Only a real rejection moves an order toward parking. |
| C2 | **Parked orders become a black hole** if nobody looks. | 🟡 | M | **Mitigated, not eliminated.** Parked orders appear in the amber "Needs attention" panel on the control page, in `GET /api/exceptions`, in `node index.js exceptions`, and each newly parked order is emailed once. Residual risk: all of that still needs somebody to read it. |
| C3 | No way to **un-park** after fixing the cause. | ✅ | S | **Shipped with it** — a Retry button per row plus Retry all on the page, and `node index.js retry --order <csid>` or `retry --all` from the CLI. Retrying clears the failure record, so the next cycle treats the order as new. |
| C4 | **NEW — the cap could hide a systemic outage.** If SmartHub is broken for everything, 5 cycles park the whole day's orders at once. | 🟡 | — | Accepted. Transient classification covers the outages that announce themselves (5xx, throttling, timeouts); a systemic failure that reports itself as a per-order rejection would indeed park in bulk, and the email plus the panel are the signal. Retry all is one click. |

**Built as:** `failures` map in `src/store.js` (`recordFailure`, `parkedIds`,
`listFailures`, `unpark`, `unparkAll`), `noteFailure()` in `src/pipeline.js`,
`MAX_ORDER_ATTEMPTS` and `TRANSIENT_ERROR_PATTERNS` in `src/config.js`, the
exceptions routes in `server.js`, and the panel in `public/index.html`.

**Note on `LYCS_INVALID_INPUT`:** its own message says "Please retry generating
shiplabel and invoice", and it is deliberately **not** classified transient. One
real order failed with it 96 times. Treating it as transient would have defeated
the cap entirely.

---

## D. Cutoff warnings

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| D1 | **Alert fatigue** → staff ignore it, then miss a real one. | 🟡 | S | One alert per channel per day, only when the count is non-zero. |
| D2 | Miscounts "waiting" → false alarms. | 🟡 | S | Reuse the figures already shown in the status table so screen and alert agree. |
| D3 | Wrong cutoff values in config. | 🟢 | — | Confirm each marketplace's real handover time before enabling. |

**Change size: S** (~50 lines; cutoffs and the email path already exist).

---

## E. Log file — ✅ IMPLEMENTED (in the agent, not the `.bat`)

| # | Risk | Sev | Code | Status |
|---|---|---|---|---|
| E1 | **Unbounded growth fills the disk** — taking down the agent it was meant to help debug. | ✅ | S | **Mitigated as planned.** One file per IST day (`data/logs/agent-YYYY-MM-DD.log`), pruned to `LOG_RETENTION_DAYS` = 14 on each day's first write. |
| E2 | Logs contain order IDs. | 🟢 | — | Unchanged, and still not backed up — the backup is `state.json` only. |
| E3 | **NEW — a broken log sink must not break the agent.** A full disk or a permission error while appending would otherwise throw from inside every log call. | ✅ | S | The file sink is wrapped: the first failure disables it, warns once, and the console and the page's ring buffer carry on. Logging can degrade; processing does not stop. |

**Built in `src/log.js`** rather than in the `.bat`, because the web server is
now the thing that runs unattended. All three sinks — console, the 500-line ring
buffer the page reads, and the daily file — are written from the same call, so
nothing can appear on the page but be missing from the file.

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

## J. Print-date filter — ✅ IMPLEMENTED

**Rule: print everything unprinted with ship date _today or earlier_; exclude
ship dates in the _future_.**

The original plan was "today only". Real data killed it: on 26 Sept the queue
held 10 Meesho orders labelled on the 25th and never printed. A strict
today-only filter would have made them invisible forever — a second silent-loss
bug, on top of the 19 orders already lost to the midnight rollover.

| # | Risk | Sev | Code | Status |
|---|---|---|---|---|
| J1 | ~~Yesterday's unprinted labels become invisible~~ | ✅ | S | **Resolved by design** — past dates are included, so nothing strands. No rescue warning needed. |
| J2 | ~~A shifted ship date drops out of view~~ | ✅ | — | **Resolved** — only future dates are excluded; a date moved earlier still prints. |
| J3 | Staff expect "Print New Labels" to mean everything new. | 🟢 | S | Now accurate again — it *is* everything new, minus future-dated orders that shouldn't ship yet. |

**Implemented:** `store.listUnprinted({ maxDate })`, with `print.js` passing
`todayIST()`. Verified read-only against the live queue: 38 of 38 orders still
print today (zero change), and when the 26th is treated as future, all 28 of its
orders are correctly excluded while the 25th's 10 still come through.

**Note:** this is currently a no-op — no future-dated labels exist until §B ships.
It was landed first precisely so §B can't introduce mixed-day PDFs.

---

## K. NEW — Stopping the line on a corrupt `state.json` ✅ IMPLEMENTED

`state.json` is the only record of what has already been labelled and printed.
A read failure used to be indistinguishable from "nothing processed yet", which
means a single unreadable file would have relabelled and reprinted the whole day.

The store now quarantines the bad file to `state.corrupt-<timestamp>.json`, goes
**degraded**, and refuses every live action with a message naming the newest
usable backup. That is a deliberate trade of availability for correctness.

| # | Risk | Sev | Code | Status |
|---|---|---|---|---|
| K1 | **Availability.** The agent stops processing until a human restores a backup. In the worst case that is a day's orders not shipping. | 🔴 | — | Accepted, and it is the whole point: the alternative is duplicate labels and duplicate courier pickups on every order. The recovery is one file copy, the message says which file, and dry-run stays allowed so the damage can be inspected first. |
| K2 | **A restored backup is up to a day old**, so orders labelled since that backup look unprocessed and would be labelled again. | 🔴 | — | The degraded message warns to check SmartHub for `BOUND` status before resuming. The reconciliation pass also re-adopts anything already packed server-side, which limits the window to orders labelled but not yet packed. |
| K3 | **A quarantine followed by a restart could look like a first run** — an empty directory is a legitimate first install. | ✅ | S | Resolved: a missing `state.json` next to a `state.corrupt-*` marker keeps the store degraded rather than starting fresh. |
| K4 | **A degraded store could be overwritten** by the next successful write, destroying the evidence and persisting an empty state. | ✅ | S | Resolved: `write()` throws while degraded. Nothing can persist over a quarantine. |
| K5 | **Backups of a bad state.** A degraded or empty state must never become today's backup. | ✅ | S | Resolved: `backupDaily()` skips both. |

---

## Cross-cutting risks (apply to every change)

| # | Risk | Sev | Code | Mitigation |
|---|---|---|---|---|
| X1 | **No test suite** — regressions surface in production, on real orders. | 🔴 | M | Dry-run and `--limit 1` before anything irreversible. Pure logic is being pulled out so it *can* be checked without a browser: `datesForThisCycle()`, `splitByIncluded()`, `recordFailure()` and the watchdog and merge helpers all take plain inputs and return plain values. There is still no runner that executes them on every change. |
| X2 | **Version skew between machines.** Hub and peer share a protocol; updating one silently broke combined printing before (the `all` flag). | 🔴 | — | Always `git pull` + restart **both** PCs together — one deployment, not two. |
| X3 | **Irreversible operations.** `generate-shiplabel` commits shipments. A bug can't be undone by rolling back code. | 🔴 | — | Dry-run → single order → batch. Never skip the middle step. |
| X4 | **Restart required to deploy**, and the agent is the only thing processing. | 🟡 | — | Deploy away from cutoff windows. |
| X5 | **Single maintainer** — nobody else can debug this. | 🟡 | — | Keep `SETUP_GUIDE.md` and these docs current; prefer boring, readable code. |

---

## Suggested order (lowest risk first)

| # | Change | Code | Why here |
|---|---|---|---|
| 1 | ~~Backup `state.json` (§A)~~ | S | ✅ **Done** — daily, local plus the peer machine. Off-site (A6) is still open. |
| 2 | **Prune `state.json` (§I)** | S | Still open. Safe rule: `date < today && printed`. Less urgent now that the file is backed up daily. |
| 3 | ~~Log file (§E)~~ | S | ✅ **Done** — daily rotation in `log.js`, 14 days kept. |
| 4 | ~~Attempt limit + exceptions (§C)~~ | M | ✅ **Done** — cap 5 hard failures, parked orders surfaced and retryable. |
| 5 | **Cutoff warnings (§D)** | S | **Now the top open item.** Uses cutoffs already sitting unused in config. |
| 6 | **Printed-cancelled (§F)** | M | Becomes more valuable once §B adds overnight lead time. |
| 7 | ~~Print-date filter (§J)~~ | S | ✅ **Done** — today + earlier, never future. |
| 8 | **Next-day processing (§B)** | S | Both prerequisites (§C, §J) are now done. Still needs B2 (pickup slot) verified on one real order first. |
| 9 | **Special-order flags (§G)** | M | Measure frequency first. |
| 10 | **Off-site backup copy (§A6)** | S | The files are small and PII-free; only the destination is undecided. |
