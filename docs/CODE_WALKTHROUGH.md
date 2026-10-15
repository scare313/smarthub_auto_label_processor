# Code Walkthrough

How this tool is put together, so you can diagnose and fix things yourself.

Written for someone who can read code but didn't write this. Pair it with
**`TROUBLESHOOTING.md`** — that tells you *what's broken*, this tells you
*where it lives*.

---

## 1. The one-paragraph summary

A **Playwright browser** holds a logged-in Amazon SmartHub session. Every
15 minutes the server calls SmartHub's **internal API** — the same one their own
web app uses — from *inside* that browser page, so the request carries the real
session cookies. It activates pick lists, packs orders, generates invoices and
ship labels, and records what it did in a local JSON file. A second, separate
step downloads those labels as PDFs and prints them.

**Everything hangs off two facts:**

1. **The browser must be real, not headless.** Amazon's SSO stalls in headless
   mode. We run a normal browser parked off-screen at `-32000,-32000`.
2. **API calls go through `page.evaluate` + `fetch`, not Playwright's HTTP
   client.** Only same-origin requests from inside the page carry the refreshed
   SSO tokens. Using `context.request` returns an HTML login page instead of JSON.

Both are load-bearing. Changing either breaks authentication in ways that look
like unrelated failures.

---

## 2. Map of the code

```
server.js        717   Web server + routes + scheduler wiring      ← start here
index.js         401   CLI (same actions, for debugging)

src/
  config.js      180   Channels, box size, paths, dates, tunables  ← tunables
  api.js         351   SmartHubClient — every API call
  agent.js        67   Browser lifecycle + session state
  pipeline.js    398   THE CORE: pack → label → record             ← most bugs
  print.js       284   Download labels → combined PDF → mark printed
  scheduler.js   234   15-min clock-aligned loop, runCycle()
  store.js       417   state.json read/write, failures, backups
  activate.js     87   Turn new AND missed orders into pick lists
  status.js       48   "Today's status" numbers
  picklist.js    191   SKU pick manifest (Excel)
  merge.js        31   Merge PDFs + pick rows across machines
  peers.js        50   Cross-machine config
  queue.js        52   Job queue (prevents overlapping runs)
  heartbeat.js   106   Watchdog — "processing has stopped"
  alert.js        90   Login-expired alerts (file + toast + email)
  notify.js       53   Email sending
  log.js         117   Logging + the ring buffer + the daily log file

public/index.html     The control page (one file, no framework)
data/state.json       The ONLY durable record. Treat as precious.
data/backups/         Daily copies of state.json (14 days)
data/peer-backups/    The other machine's daily copies, pushed over Tailscale
data/logs/            agent-YYYY-MM-DD.log, one file per IST day (14 days)
config/peers.json     Machine-to-machine config (gitignored)
config/alerts.json    Email credentials (gitignored)
profile/              Logged-in browser session (gitignored)
labels/<date>/        Generated PDFs + pick lists
```

---

## 3. The main flow, end to end

What happens every 15 minutes:

```
scheduler.js  startScheduler()          fires on :00/:15/:30/:45
      │
      ▼
scheduler.js  runCycle()
      │
      ├─ store.health()                  state.json readable? else STOP
      ├─ agent.js   getClient()          reuse browser, or launch it
      ├─ agent.js   checkSession()       alive? else alert + stop
      ├─ recentDatesIST()                [oldest ... today], 3 days by default
      │
      └─ for each channel (amazon, flipkart, meesho, fba):
             │
             ├─ activate.js  activateChannel()     new + MISSED → pick list
             │
             └─ for each date: pipeline.js  processChannel()
                    │
                    ├─ findPickTasks(date)         what's to do today
                    ├─ validatePickTask(id)        shipments in that task
                    ├─ reconcile orphans           packed in SmartHub but not
                    │                              in our store → mark LABELED
                    │
                    └─ processBatch()  per 15 shipments:
                           ├─ createPackages()     ← fails here most often
                           ├─ listPickupSlots()
                           ├─ generateInvoices()
                           ├─ generateShipLabel()  ← IRREVERSIBLE
                           ├─ store.markProcessed(... status LABELED)
                           └─ store.recordFailure() for anything that failed
      │
      ├─ notify newly parked orders (email, once each)
      └─ store.backupDaily()             first cycle of each IST day
```

An order that fails is recorded with its reason and its attempt count. After
**5 non-transient attempts** it is *parked*: skipped by later cycles until
someone presses Retry. Transient errors (throttling, 503, label-not-ready) are
recorded but never count toward that cap.

Then, separately, when someone presses **Print New Labels**:

```
print.js  printNewLabels()
      ├─ store.health()                                 readable? else refuse
      ├─ store.listUnprinted({ maxDate: todayIST() })   today + earlier only
      ├─ retrieveCombinedLabelUrl(ids)                  ask SmartHub for a PDF
      ├─ splitByIncluded(...)                           what is REALLY in the PDF
      ├─ downloadBytes(url)                             fetch it
      ├─ sort by SKU                                    match the pick list
      ├─ writeRowsToXlsx()                              pick manifest
      └─ store.markPrinted(printedIds, batchId)         never reprints
```

**Processing and printing are deliberately separate.** Processing is automatic
and irreversible; printing is manual and repeatable. Keep them that way.

---

## 4. The files that matter most

### `src/config.js` — where most safe changes go

Almost every tunable lives here.

```js
export const CHANNELS = {
  amazon:   { salesChannel: "MFN",        cutoff: "13:45", requiresPickupSlot: true },
  flipkart: { salesChannel: "FKSTANDARD", cutoff: "23:45", requiresPickupSlot: false },
  meesho:   { salesChannel: "MEESHO",     cutoff: "22:50", requiresPickupSlot: false },
  fba:      { salesChannel: "FBA",        cutoff: "13:45", requiresPickupSlot: false },
};

export const DEFAULT_PACKAGE = {
  boxName: "CustomBox",
  length: { measure: 15, unitOfMeasure: "CM" },
  width:  { measure: 15, unitOfMeasure: "CM" },
  height: { measure: 2,  unitOfMeasure: "CM" },
  weight: { measure: 100, unitOfMeasure: "G" },   // verified accepted — see note below
};
```

`todayIST()` is the source of every date decision. It returns `YYYY-MM-DD` in
Asia/Kolkata. **Changing how this works changes which orders get processed** —
be careful.

The reliability tunables live at the bottom of the same file:

```js
export const LOOKBACK_DAYS = 2;              // today + 2 earlier days
export const MAX_ORDER_ATTEMPTS = 5;         // hard failures before parking
export const TRANSIENT_ERROR_PATTERNS = [...];  // these never count toward it
export const BACKUP_RETENTION_DAYS = 14;
export const LOG_RETENTION_DAYS = 14;
```

**`config.js` must never import `log.js`.** `log.js` imports `config.js` for the
data directory and the date, so the reverse direction would be a cycle and both
modules would come up empty.

> `cutoff` is currently **defined but unused**. Nothing warns you before a
> deadline. See `RISKS.md` §D.

### `src/pipeline.js` — where most bugs are

The heart of it. Two functions matter:

**`processChannel()`** — per channel, per day:
1. Find pick tasks for the date
2. Validate each → list of shipments
3. **Reconcile orphans** — anything packed in SmartHub but missing from our
   store gets added as `LABELED`, so it can still be printed. This is what
   rescues manual fixes, for every date the cycle is covering.
4. **Skip parked orders** — `store.parkedIds()` is read once, then anything in
   it is left out of the batch and counted in the `parked` return value.
5. Split into batches of 15 and process each

**`processBatch()`** — the irreversible part:

```js
const pkgResp = await client.createPackages(...);     // ← LYCS_INVALID_INPUT here
const pkgErrors = pkgResp?.shipmentIdToErrorMap || {};
for (const id of Object.keys(pkgErrors)) {
  store.audit(channel.key, "pack-failed", `${id}: ${detail}`);
  noteFailure(channel.key, date, shipment, `pack failed: ${detail}`, { transient });
}
```

`noteFailure()` is the single place a failure is recorded. It does three things:
writes the reason and the attempt count into `state.json`, logs the reason so it
shows up in the Activity Log on the page, and — when the attempt cap is reached —
logs an error and audits `parked`.

`errorText()` next to it flattens SmartHub's error payloads, which arrive as a
plain string, an array of strings or an object with a `message`, depending on the
endpoint. Every failure path goes through it, so there is no "undefined" in the
log.

**Failure reasons are visible on the page now** — they used to go only into
`state.json`, which is why failures looked invisible and the log said nothing but
"0 labelled successfully".

**Verify-before-record** is important and deliberate:

```js
// Only mark LABELED if a real trackingId came back
if (trackingId) store.markProcessed(...)
else store.audit(channel.key, "label-failed", ...)
```

Never weaken this. Recording a label that doesn't exist means an order silently
never ships.

### `src/api.js` — every SmartHub call

A thin wrapper. The critical piece:

```js
async _pageRequest(method, pathname, body, timeout = API_TIMEOUT) {
  return this.page.evaluate(..., async () => {
    const r = await fetch(url, { method, credentials: "include", ... });
    ...
  });
}
```

Requests run **inside the page**, so they carry live session cookies.

Two gotchas:
- **GraphQL responses are base64-encoded JSON.** Decode before parsing.
- `API_TIMEOUT = 120000` (2 min); downloads get 180s. SmartHub is genuinely slow
  under load — a timeout usually means slow, not broken.

To add a new API call, copy an existing method and consult `SMARTHUB_API.md`
(35 REST endpoints + 10 GraphQL operations documented).

### `src/store.js` — the durable record

One JSON file:

```js
{
  processed: { "<customerShipmentId>": {
      orderId, channel, date, labelFile, trackingId,
      status: "LABELED", ts, printed, printedAt, printBatchId
  }},
  failures:  { "<customerShipmentId>": {
      orderId, channel, date, reason, transient,
      attempts, hardAttempts, parked, firstAt, lastAt
  }},
  audit:     [ { ts, channel, action, detail } ],
  lastPrint: [ "<file paths>" ],
  backupDay: "YYYY-MM-DD"
}
```

- `processed` → idempotency. `printed: false` means "waiting to print".
- `failures` → why an order has not shipped, and how many times it has been
  tried. `attempts` counts every failure; `hardAttempts` counts only the
  non-transient ones, and that is the number compared against the cap. A
  successful `markProcessed()` deletes the order's entry.
- `audit` → append-only history, the first thing to read when something goes wrong.
- Writes are **atomic** (temp file + rename), so it can't be half-written.

**Two safety rules are built into the reader**, and both matter more than they
look:

1. **A parse failure is never treated as "no orders processed".** If it were,
   every order already labelled would look new and get a second label. Instead
   the bad file is renamed to `state.corrupt-<timestamp>.json`, the store goes
   **degraded**, and every live action refuses to run with a message naming the
   newest backup. Recovery is a human copying a backup over `state.json`.
2. **A missing file is normal** — that is a first run. But a missing file *next
   to* a `state.corrupt-*` marker is not, so that case stays degraded too.
   Otherwise one restart after a quarantine would look like a fresh install and
   reprint everything.

`store.backupDaily()` writes `data/backups/state-YYYY-MM-DD.json` on the first
cycle of each IST day, keeps 14, and the hub copies the peer's backup into
`data/peer-backups/` the same day. It never backs up an empty or degraded state.

**Deleting this file makes everything reprint.** It contains **no customer PII** —
no names, addresses, or phone numbers — so it's safe to back up or share.

### `src/print.js`

```js
const source = all
  ? store.listLabeled({ date: date || printDayIST() })
  : store.listUnprinted({ date, maxDate: date || todayIST() });
```

- **"Print New Labels"** → unprinted, ship date **today or earlier**, never
  future. Past dates are deliberately included so a missed day still prints.
- **"Print All Today's Labels"** → everything for today, printed or not.

Files are grouped by **print date** (`printDayIST()`), not ship date — so a
morning print and an evening print land in the same day's folder.

Labels are sorted by SKU so they line up with the pick manifest.

**What we asked for is not always what we got.** SmartHub's combined-document
response carries an `ordersIncluded` list and an `errors` list, and an order can
be left out of the PDF. Marking such an order printed means that parcel never
gets a label and never ships, so `splitByIncluded()` reconciles the two lists
before anything is marked:

```js
const { printed, missing, trustedRequest } = splitByIncluded(orders, ordersIncluded, docErrors);
```

Only `printed` is marked. `missing` is logged, audited as `print-missing`, and
stays unprinted so the next press picks it up. If `ordersIncluded` comes back in
a shape we do not recognise — no id in it matches anything we asked for — the
request list is trusted instead and the fallback is audited as
`print-no-included-list`. That direction is deliberate: a duplicate print is
visible and cheap, a parcel with no label is neither.

### `src/scheduler.js`

```js
export function msUntilNextBoundary(intervalMs, now = new Date()) {
  const msIntoDay = now.getHours()*3600000 + now.getMinutes()*60000 + ...;
  return intervalMs - (msIntoDay % intervalMs);
}
```

Re-arms with `setTimeout` after each run (not `setInterval`), so it lands on
:00/:15/:30/:45 and can't drift. It also runs once immediately on startup.

```js
const dates = date ? [date] : recentDatesIST();   // [oldest ... today]
```

A cycle used to process `todayIST()` and nothing else, so at midnight IST it
moved to the new date and never looked at the old one again. That cost 19 orders
in August 2026 and 13 Flipkart orders on 13 October.

Each cycle now processes **today plus the previous `LOOKBACK_DAYS`** (default 2),
**oldest first**, so the order closest to breaching is handled before the rest.
An explicit `--date` on the CLI still processes only that one day. Earlier dates
are passed `quietIfEmpty`, so they only appear in the log when they actually
have work.

Activation runs **once per channel**, not once per date — SmartHub decides which
pick lists are outstanding, so asking per-date would repeat the same call.

`runCycle()` also starts with a `store.health()` guard. A degraded state file
stops the cycle before the browser is touched, emails once, and returns
`{ ok: false, reason: "store-degraded" }`.

> **The look-back does not rescue everything.** It finds orders through pick
> tasks, so an order in no pick task on any date is invisible to it. That is a
> separate failure with a separate fix — see `activate.js` and the missed pick
> lists below.

### `src/activate.js` — the step before everything else

Nothing can be packed, labelled or printed until its order is in an **activated
pick list**. This module creates them, and it reads **two** sources:

```js
const cards = await client.getRecommendedLists(pickupTimes);   // current windows
const missedCards = (await client.getMissedLists()) || [];     // windows gone by
const mine = [...missed, ...upcoming].filter(dedupe);          // missed first
```

**Only the first one existed at first, and that lost 13 Flipkart orders on 13
October.** Once a pickup window expires, SmartHub stops returning it from the
recommended endpoints, so those orders were never offered again: never picked,
packed, labelled or dispatched. They left no local trace either, because an
order that is never activated writes nothing to `state.json` — the log said
`No new pick lists to activate` and looked healthy.

**The look-back window could not have caught this.** Processing finds orders
through pick tasks, and these were in no pick task on any date.

Three details in there are deliberate:

- **Missed lists are activated first.** They are already overdue.
- **A failure of the missed lookup cannot block normal activation** — it is
  caught, warned about, and the upcoming lists still go through.
- **There is no early return when no window is recommended.** That early return
  was itself part of the bug: a missed order is exactly the case where nothing
  is recommended.
- **A list appearing in both sources is activated once**, keyed on its ship
  epoch and order count.

Both endpoints had been sitting documented in `SMARTHUB_API.md` since a June HAR
capture and were simply never wired in.

### `server.js`

| Route | Does |
|---|---|
| `GET /api/status` | Session, pending count, status table, peers, store health, exception counts |
| `GET /api/log` | Recent log lines for the page |
| `POST /api/run` | Process now |
| `POST /api/print` | Print locally |
| `POST /api/print-combined` | **Hub:** pull from peers, merge, print |
| `GET /api/exceptions` | Orders that keep failing, and why (`?parked=1` to narrow) |
| `POST /api/exceptions/retry` | Clear one order or all of them |
| `POST /api/peer/print` | **Processor:** return my labels (token-auth) |
| `POST /api/peer/confirm-print` | **Processor:** the hub saved the merge — mark them printed |
| `GET /api/peer/state` | **Processor:** hand my state.json to the hub for backup |
| `POST /api/peer/backup` | Store the other machine's daily backup copy |
| `POST /api/login` | Open the login window on this machine |

The four print routes all begin with `blockedByState(res)`, which returns a 503
with recovery instructions when the state file is degraded — **before** a browser
is launched or a peer is contacted.

**The peer print handshake matters.** The peer used to mark its labels printed
the moment it handed them to the hub, so if the merge then failed those labels
were lost: marked printed, never in a PDF. Now the peer keeps the batch pending
(`pendingPeerPrints`, 30-minute TTL), and the hub calls `confirm-print` only
**after** every merged file is written. An unconfirmed batch simply stays
unprinted, which is the safe direction.

A peer running older code returns no `batchId`, so the hub sends no confirmation
and that peer keeps its old immediate-mark behaviour. Version skew is tolerated
deliberately, but still deploy both machines together.

Everything goes through `queue.run(...)` so a scheduled cycle and a button press
can never overlap. Only **one** browser can use the profile at a time — this
queue is what enforces that.

---

## 5. Where to change common things

| Want to change | File | Notes |
|---|---|---|
| Box size / weight | `src/config.js` → `DEFAULT_PACKAGE` | **Test with `--limit 1` first** |
| Add a channel | `src/config.js` → `CHANNELS` | Needs the right `salesChannel` code |
| Cycle interval | `src/scheduler.js` → `startScheduler(fn, ms)` | Stays clock-aligned |
| How far back a cycle looks | `src/config.js` → `LOOKBACK_DAYS` | Each day costs queries per channel |
| Retries before parking | `src/config.js` → `MAX_ORDER_ATTEMPTS` | Only hard failures count |
| What counts as "try again later" | `src/config.js` → `TRANSIENT_ERROR_PATTERNS` | Read the note on `LYCS_INVALID_INPUT` first |
| Backup / log retention | `src/config.js` → `*_RETENTION_DAYS` | Default 14 days each |
| Batch size (503s) | `src/pipeline.js` → `BATCH_SIZE` | Lower it |
| Watchdog sensitivity | `src/heartbeat.js` → `STALE_AFTER_MS` | Default 45 min |
| Port | `server.js` → `PORT` | Update firewall + `peers.json` too |
| Page layout | `public/index.html` | One file, no build step |
| Peer machines | `config/peers.json` | **No trailing slash on URLs** |

---

## 6. How to debug safely

**The golden rule: dry-run → one order → full batch. Never skip the middle step.**

```bash
node index.js run --channel meesho
```
Reads only. Shows what it *would* do.

```bash
node index.js run --channel meesho --live --limit 1
```
**One real order.** This is how both the `pickupSlotId` and weight problems were
diagnosed. If it works, the batch will work.

**Check what is failing first** — this is now the fastest first question:

```bash
node index.js exceptions
```

Parked orders are listed first, with the reason and the attempt count. Clear one
with `node index.js retry --order <customerShipmentId>`, or all of them with
`node index.js retry --all`. The same list is the "Needs attention" panel on the
control page.

**Read today's log file** when the page's ring buffer has already scrolled past
the problem:

```bash
tail -n 100 data/logs/agent-$(date +%F).log
```

One file per IST day, 14 kept. If the directory cannot be written the file sink
turns itself off with one warning and the console and the page keep working.

**Read the audit trail** — still the deepest view:

```bash
node -e "const s=require('./data/state.json');console.log(s.audit.slice(-30).map(a=>a.ts+' '+a.channel+' '+a.action+' | '+(a.detail||'').slice(0,120)).join('\n'))"
```

**Watch the browser** when you can't tell what's happening — launch it visible:

```js
SmartHubClient.launch({ visible: true })
```

**When an API call starts failing, capture a HAR.** Do the same action manually
in SmartHub with DevTools → Network recording, then diff the request payload
against ours. This solved the Amazon `pickupSlotId` bug and found the missed
pick-list endpoint.

**But a payload diff is a hypothesis, not a cause.** A HAR once showed `100 G`
vs `0.2 KG` as the only difference on a failing Meesho order, and that was
written up as the root cause. It was wrong: the same SKU packs fine with `100 G`
15 times over. Before acting on a diff, check whether the current payload
already succeeds elsewhere — if it does, the difference is a coincidence and the
real variable is in the order, not the request.

---

## 7. Things that will bite you

| Trap | Why |
|---|---|
| **Switching to headless** | Amazon SSO stalls. Looks like a login bug, isn't. |
| **Using `context.request`** | Returns HTML, not JSON — no SSO tokens. Use `page.evaluate` + fetch. |
| **Running CLI and server together** | Both want the browser profile; one fails with "already in use". |
| **Deleting `state.json`** | Everything reprints. Copy a file from `data/backups/` instead. |
| **"Fixing" a degraded store by deleting the corrupt file** | The agent then sees a first run and relabels everything. Restore a backup. |
| **Importing `log.js` from `config.js`** | Circular import; both modules come up empty at startup. |
| **Pruning `state.json` too eagerly** | Reconciliation re-adds the order as unprinted → it prints again. Only prune `date < today && printed`. |
| **Forgetting GraphQL is base64** | You'll parse garbage. |
| **Updating only one machine** | Hub and peer share a protocol; version skew breaks combined printing silently. |
| **Trusting "it worked yesterday"** | SmartHub changes server-side. Our code has been unchanged through two separate breakages. |

---

## 8. Known gaps (deliberate, documented)

These are *missing*, not broken — don't be surprised by them:

| Gap | Effect | Fix |
|---|---|---|

| **Cutoffs unused** | No warning before a deadline | `RISKS.md` §D |
| **No external watcher** | If the hub itself dies, nothing alerts | Needs the always-on third machine |
| **No automated tests** | Every change is verified by hand | `IMPROVEMENTS.md` §6.4 |
| **Backups are local plus one peer** | Both machines in the same shop; a site loss loses both | Off-site copy |
| **Degraded state needs a human** | The agent stops rather than restoring a backup itself | Deliberate: auto-restore would reprint |

---

## 9. If you change something

1. `node --check <file>` — catches syntax errors instantly
2. Dry-run, then `--limit 1`, then the full batch
3. **Deploy to both PCs together** (`git pull` + restart on each)
4. Watch one full cycle before walking away

And if a change makes things worse: `git log --oneline`, then
`git revert <hash>`. Every commit message explains *why*, not just what — those
messages are part of the documentation.

---

See also: **`TROUBLESHOOTING.md`** (symptom → fix), **`RISKS.md`** (planned
changes and their risks), **`SMARTHUB_API.md`** (every endpoint),
**`SETUP_GUIDE.md`** (rebuild a machine from scratch).
