# SmartHub Order Auto-Processor — Phase 1

Automates the repetitive pick → pack → invoice → ship-label → download workflow on
**smarthub.amazon.in** by calling the same internal API the web app uses, from inside
a logged-in Playwright browser session.

> **Phase 1 goal:** prove the full pipeline end-to-end on real orders, safely.
> Scheduling, continuous polling, and auto-print come in Phase 2.

## How it works

- A **persistent browser profile** (`./profile/`) holds your logged-in Amazon session.
  You log in **once** (with OTP); the session is reused on later runs.
- The processor calls the SmartHub API directly (no fragile button-clicking).
- **DRY-RUN by default** — it only reads (discovers pick tasks + lists shipments) and
  reports what it *would* do. Nothing is packed or labelled until you pass `--live`.
- Labels are saved as a combined PDF to `./labels/YYYY-MM-DD/`.
- A local JSON store (`./data/state.json`) prevents double-processing and keeps an audit log.

## Setup (already done)

```
npm install
npx playwright install chromium
```

## Usage

### 1. Log in (once)
```
node index.js login
```
A browser opens. Log into Amazon SmartHub (username, password, OTP). When you can see
your SmartHub dashboard, return to the terminal and press **ENTER**. The session is saved.

### 2. Dry-run (safe — no changes)
```
node index.js run --channel flipkart --date 2026-06-20
```
Shows the activated pick task, lists every shipment and its box dimensions, and reports
how many it *would* process. **Always do this first.**

### 3. Live run (real — labels the orders)
```
node index.js run --channel flipkart --date 2026-06-20 --live
```
Packs the orders and generates invoices + ship labels in SmartHub. It does **not** download
a PDF — that is the `print` step. Already-processed orders are skipped automatically.

### 4. Print new labels (+ pick list) — combine + open
```
node index.js print
```
Combines every labelled-but-unprinted order into one combined PDF per marketplace, **and
generates the matching SKU pick manifest** (`picklist-<date>-<batch>.xlsx`) for exactly those
orders, saved together in `./labels/<date>/`. Opens both (labels to print, pick list to pick).
Running it again only picks up NEW labels — **never reprints** what was already printed.
Use `--no-open` to skip opening, `--channel`/`--date` to narrow.

The pick manifest is built from each order's SKU lines captured at label time, so it always
matches the labels in the same batch: **pick the products from the manifest, then pack using
the labels.**

### For employees — one icon: `SmartHub.bat`
Double-click **`SmartHub.bat`** to open a simple menu (no terminal knowledge needed):

```
  [1] Print New Labels      [6] Login
  [2] Pick List (Excel)     --- Admin ---
  [3] Reprint Last Labels   [7] Setup Scheduler
  [4] Open Labels Folder    [8] Test Email Alert
  [5] Process Orders Now    [9] Remove Scheduler
                            [0] Exit
```

Pin it to the desktop/taskbar (right-click → Send to → Desktop). That single menu
replaces all the individual `.bat` files.

`run-auto.bat` is internal (called by Windows Task Scheduler) — leave it alone.

Every print run saves a **new, timestamped combined PDF** into `labels\<date>\` and never
deletes earlier ones, so any past batch can always be reopened and reprinted.

### Other
```
node index.js status                 # local processing + print/audit summary
node index.js run                    # all channels, today (IST), dry-run
```

## Email alerts (login expiry + failures)

If the Amazon session expires, the processor emails you (once when it goes down, once
when restored) in addition to the Desktop alert + Windows notification.

### Setup (one time)
1. Copy `config/alerts.example.json` to `config/alerts.json`.
2. Create a **Gmail App Password** (needed — your normal password won't work):
   - Enable 2-Step Verification on your Google account.
   - Go to Google Account → Security → **App passwords** → create one for "Mail".
   - Copy the 16-character password into `config/alerts.json` under `"pass"`.
3. Set `"user"`, `"from"`, and `"to"` to your email address.
4. Test it:
   ```
   node index.js test-alert
   ```
   You should receive a test email within a few seconds.

`config/alerts.json` is gitignored — it holds your app password, keep it private.

## Safety notes

- **`--live` is irreversible** — generating a ship label confirms the order, commits a
  courier pickup slot, and starts the marketplace SLA clock. Test with dry-run first, then
  one real order, before trusting it on a full batch.
- If your Amazon session expires mid-run, the tool **stops and tells you to re-login**
  rather than silently failing.

## Channels

| Channel  | salesChannel | Cutoff (IST) |
|----------|--------------|--------------|
| amazon   | MFN          | 1:45 PM      |
| flipkart | FKSTANDARD   | 11:45 PM     |
| meesho   | _TBD_        | 10:50 PM     |

Meesho's channel code will be captured on the first run that includes a Meesho order.
