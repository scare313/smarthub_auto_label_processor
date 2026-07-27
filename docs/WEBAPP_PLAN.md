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

## 7. Phased task list
### Phase 0 — Setup (no app code)
- [ ] Confirm roles: A/B = Windows agents, C = Ubuntu hub.
- [ ] Install **Tailscale** on A, B, C, phone. Verify no exit-node; confirm A↔C, B↔C reachable.
- [ ] Verify SSH + Node LTS on C; pick a data dir (e.g. `/opt/smarthub`).
- [ ] (Optional) Drive/rclone only if off-site backup wanted.

### Phase 1 — Agent web server on A (then B), retire CLI triggers
- [ ] HTTP server reusing `src/`; **job queue**; **internal scheduler loop**.
- [ ] Control page (Process/Print/Print all/Status/Reprint) + **Login button** flow.
- [ ] Run alongside the current `.bat`/Task Scheduler; verify a few days.
- [ ] Retire Task Scheduler cron + `SmartHub.bat`; keep debug CLI. Boot auto-start (service).
- [ ] Repeat on B.

### Phase 2 — Push data to C
- [ ] Agents POST `status.json` + label PDFs + `returns.json` + `otps.json` to C's ingest API each cycle.

### Phase 3 — Hub app on C: the Today page
- [ ] SQLite schema + ingest API. Serve Today page (labels per courier, return OTPs with
      Reveal, returns list) over Tailscale + password. Per-account fresh/stale status.

### Phase 4 — Returns management + anti-theft
- [ ] Snapshot history; **scan-received** endpoint (USB); reconciliation engine; anomaly
      alerts; per-return timeline.

### Blocked on HARs
- [ ] **Generate Return OTP Report** (unblocks `otps.json`).
- [ ] **Returns page with dates** (confirms "arriving today").

## 8. First build on the critical path
Phase 1 on machine A (agent server + control page + internal scheduler). Proves the model
and lets us drop the `.bat` menu + Task Scheduler before any hub/returns work.

## 9. Open decisions
- DB: SQLite now (fine for this scale) → Postgres only if needed.
- Auth for the web app: shared password to start; per-user later if required.
- PDF transport: POST to C over Tailscale (simple) vs Drive (backup). Recommended: POST.
