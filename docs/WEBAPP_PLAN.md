# SmartHub Automation — Web App Migration & Returns Platform (Plan)

Reference plan for moving from CLI/`.bat`/Task Scheduler to a web-driven system,
and for building returns management as a first-class, expandable module.

> Status: planning. Core processing (`src/`) stays unchanged; new layers are additive.

---

## 1. Goals
1. Replace the CLI + `SmartHub.bat` menu + Windows Task Scheduler with a small
   **always-on web app** (control panel + scheduler + the shop "Today" page).
2. Aggregate **both Amazon accounts** into one private, access-controlled view.
3. Build **returns management** (tracking + physical-scan reconciliation + anti-theft)
   as an expandable module, not a bolt-on.
4. Keep a thin **debug CLI** for maintenance.

## 2. Machines & OS
| Machine | OS | Network | Role |
|---|---|---|---|
| **A** | Windows | Net 1 | Account 1 processor (Playwright + SmartHub session) + local control server |
| **B** | Windows | Net 2 (separated) | Account 2 processor + local control server |
| **C** | **Ubuntu (headless, SSH)** | Net 1 | **Central host**: database + web app (Today page, returns mgmt). No Amazon session. |

- **2 machines are mandatory** (one Amazon account each, on separate networks).
- **C is the always-on host.** It never touches Amazon — it only stores/serves data.
- The worker has no screen on C (SSH-only). The worker views the web app in a
  **browser on machine A (or a cheap counter tablet)**, served by C over Tailscale/LAN.
  The USB barcode scanner plugs into the machine the worker uses; scans post to C.

## 3. Networking & data bus
- **Tailscale mesh** connects A, B, C, and the owner's phone with private virtual IPs.
- **Tailscale is the live data bus:** A and B POST their artifacts (label PDFs +
  structured JSON: status, returns, OTPs) directly to **C's API** over Tailscale.
  Real-time, simple, no sync lag.
- ⚠️ **Amazon-separation caveat:** SmartHub/Amazon traffic must egress each machine's
  **own ISP**. Never configure a shared Tailscale **exit node**. Tailscale carries only
  internal app traffic between our machines — Amazon never sees it, and the two account
  machines keep distinct public IPs.
- **Google Drive = optional off-site backup/archive only** (nightly copy of PDFs +
  returns history), NOT the live path. On Windows use *Drive for Desktop*; on Ubuntu use
  *rclone*. Skip entirely if Tailscale backup-to-C is enough.

## 4. Component responsibilities
### Machine A / B (Windows processors) — "agent"
- Everything `src/` does today (activate → pack → label → print), unchanged.
- **Internal scheduler loop** (replaces Task Scheduler): every ~15 min + pre-cutoff.
- **Job queue**: serialize actions so nothing overlaps (removes the concurrency risk).
- **Local control page** (bound to Tailscale): buttons — Process now / Print / Print all /
  Status / Login / Reprint. Login button launches the headed browser and polls
  `checkSession()`.
- **Push to C** each cycle: `status.json`, today's label PDFs, `returns.json`
  (`SearchReturns`), `otps.json` (Amazon return OTP report).
- Boot auto-start: Windows service (NSSM / node-windows) or a startup task.

### Machine C (Ubuntu host) — "hub"
- **Database** (SQLite to start; Postgres if it grows) — single source of truth for
  aggregated orders, labels index, returns, scans, reconciliation.
- **Web app** served over Tailscale (+ password): the **Today page** and the
  **returns management** UI.
- **Ingest API**: receives pushes from A/B, upserts into the DB, stores PDFs.
- Boot auto-start: **systemd** service. Reverse proxy optional (Caddy/nginx) for TLS.

## 5. Design principle for expandability
**C is a real web application with a database — not a static page.** Orders, labels,
returns, scans, OTPs, and reconciliation are each a module (DB tables + API routes +
UI views). New features = new tables/routes/views, never a rewrite. This is what makes
returns management (and later: refund reconciliation, analytics, disposition workflows)
incremental.

## 6. Returns management (expandable module)
### Data model (on C)
`returns` (one row per return shipment):
- `return_id`, `tracking_id`, `order_id`, `marketplace`, `account`
- `status` (CREATED / IN_TRANSIT / DELIVERED / GRADING_COMPLETE …)
- `status_history` (append-only `[{status, ts}]` from each cycle snapshot)
- `otp` / `returned_with_otp`
- `expected_arrival` (if SmartHub exposes it — TBD via HAR)
- `delivered_ts` (from SmartHub status and/or delivered-parcel email)
- `scanned_ts` (physical receipt via USB scan)
- `reconciliation` (PENDING / MATCHED / ANOMALY)
- `disposition` (RESTOCKED / DAMAGED / REFUND_CHECKED / …) — future
- `notes`

### Pipeline
1. **Ingest:** A/B call `SearchReturns` each cycle → POST to C → upsert + append
   `status_history` snapshot. (Delivered-parcel emails from Gmail = optional 2nd source.)
2. **Physical scan:** worker scans each received parcel (USB → focused input → POST to C)
   → set `scanned_ts`.
3. **Reconcile:** compare delivered vs scanned →
   - delivered (SmartHub/email) **but never scanned** ⇒ **ANOMALY** (theft signal).
   - "marked delivered late / in bulk" pattern ⇒ flag.
4. **Surface:** anomaly strip at top of the Today page + optional email alert.

### Future extensions (all additive)
- Disposition workflow (grade returns, restock vs damage vs dispute).
- Refund reconciliation (did the marketplace refund/charge correctly).
- Return-rate analytics by SKU / reason.
- Per-return timeline view; export.

## 7. Phased checklist (implementation order, kept up to date)

Legend: ✅ done · 🔶 partial/superseded · ⬜ pending · 🚧 blocked

### Phase 0 — Setup (no app code) — ✅ DONE (2026-07-27)
- [x] Confirm roles: A = Bludo PC, B = Shop PC (Windows agents), C = Server (Ubuntu hub).
- [x] Install **Tailscale** on A, B, C, phone. No exit-node configured. A↔C and A↔B
      reachability confirmed live.
- [x] Verify SSH + Node on C (Node 24.18.0 / npm 11.16.0 installed via NodeSource);
      data dir `/opt/smarthub` created.
- [ ] (Optional) Drive/rclone off-site backup — not set up, not currently needed
      (see Phase 2 note below — live path turned out to be direct P2P, not Drive).

### Phase 1 — Agent web server on A, then B — ✅ DONE
- [x] HTTP server (`server.js`, Express) reusing `src/` unchanged.
- [x] **Job queue** (`src/queue.js`) serializing scheduled cycles + manual/peer actions.
- [x] **Internal scheduler loop** (`src/scheduler.js`) — 15-min cycle runs inside the
      server process.
- [x] Control page (`public/index.html`): Process/Print/Print all/Status/Reprint/Login,
      live log tail, live status dashboard.
- [x] **Login button** flow (`src/agent.js` `doLogin`) — visible window + polling,
      replaces the old press-ENTER CLI step.
- [x] Shutdown handler (SIGINT/SIGTERM/crash) closes the browser cleanly — fixes
      profile-lock orphans.
- [x] Running live on **both** Bludo PC and Shop PC; confirmed auto-scheduling active
      on both (verified via Show Status + live log during this session).
- [ ] Explicit retirement of `SmartHub.bat` / Task Scheduler cron — left in place as a
      fallback; not a blocker, can be removed once fully trusted.
- [ ] Boot auto-start as a proper Windows service (NSSM/node-windows) — not set up yet;
      currently started manually (`npm run serve`) each time. **Real gap**: server does
      not survive a reboot unattended.

### Phase 1.5 — Cross-machine combined printing — ✅ DONE (2026-07-27, not in original plan)
Solved the "WhatsApp a PDF between machines" pain **directly peer-to-peer over
Tailscale**, without needing C at all — done ahead of the hub because it was the
immediate real problem.
- [x] `src/peers.js` (shared-secret config), `src/merge.js` (PDF + pick-row merging).
- [x] `POST /api/peer/print` (token-protected) + `POST /api/print-combined` (hub action).
- [x] Role-aware UI (hub vs processor) on the control page.
- [x] Graceful degrade if a peer is unreachable (never blocks local printing).
- [ ] `config/peers.json` actually filled in + verified end-to-end on both real
      machines (built and unit-tested; live cross-machine run not yet confirmed by user).

### Phase 2 — Push data to C — ⬜ NOT STARTED
Note: this phase's *printing* motivation is now moot (solved by Phase 1.5, P2P). What's
still needed here is narrower: getting **returns + OTP data** onto C for the Today page.
- [ ] Agents POST `status.json` (order counts) to C's ingest API each cycle.
- [ ] Agents POST `returns.json` (`SearchReturns` snapshot) to C each cycle.
- [ ] Agents POST `otps.json` (Amazon return-OTP report) to C each cycle. 🚧 blocked —
      see HARs below.
- [ ] C's ingest API itself doesn't exist yet (depends on Phase 3).

### Phase 3 — Hub app on C: the Today page — ⬜ NOT STARTED
Nothing built on Server C yet — it's fully set up (Node, Tailscale) but has zero
application code.
- [ ] SQLite schema (orders/labels index, returns, OTPs).
- [ ] Ingest API (receives Phase 2 pushes from A/B).
- [ ] Today page UI (shipped labels per courier, return OTPs with Reveal-to-log,
      returns arriving today) — mockup already designed, not yet built.
- [ ] Serve over Tailscale + password protection.
- [ ] Per-account fresh/stale status indicator.
- [ ] systemd service for boot auto-start on C.

### Phase 4 — Returns management + anti-theft — ⬜ NOT STARTED
- [ ] Snapshot `SearchReturns` status history over time (delivered-timeline).
- [ ] USB **scan-received** endpoint + worker flow.
- [ ] Reconciliation engine (delivered-but-not-scanned → ANOMALY).
- [ ] Anomaly alert strip on the Today page (+ optional email).
- [ ] Per-return timeline view.

### Blocked on HARs — 🚧 STILL BLOCKED
- [ ] **Generate Return OTP Report** screen capture — unblocks `otps.json` / the OTP
      section of the Today page.
- [ ] **Returns page showing dates** — confirms whether SmartHub exposes an
      "expected arrival" date or only in-transit status, for "returns arriving today".

## 8. Next build on the critical path
Phase 1 and 1.5 are done and live on both machines. The next actual step is **Phase 3**:
stand up the hub app on Server C (even a minimal version — SQLite + ingest API +
a bare-bones Today page) so Phase 2's data pushes have somewhere to land. The two
blocking HARs (§ above) should ideally be captured before or alongside this, since the
OTP section is a core part of the page's value.

## 9. Open decisions
- DB: SQLite now (fine for this scale) → Postgres only if needed.
- Auth for the web app: shared password to start; per-user later if required.
- PDF transport: POST to C over Tailscale (simple) vs Drive (backup). Recommended: POST.
