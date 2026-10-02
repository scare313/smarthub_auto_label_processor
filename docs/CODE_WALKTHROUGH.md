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
server.js        408   Web server + routes + scheduler wiring      ← start here
index.js         339   CLI (same actions, for debugging)

src/
  config.js       92   Channels, box size, paths, todayIST()       ← tunables
  api.js         347   SmartHubClient — every API call
  agent.js        67   Browser lifecycle + session state
  pipeline.js    277   THE CORE: pack → label → record             ← most bugs
  print.js       166   Download labels → combined PDF → mark printed
  scheduler.js    94   15-min clock-aligned loop, runCycle()
  store.js       130   state.json read/write (what's processed/printed)
  activate.js     62   Turn new orders into pick lists
  status.js       48   "Today's status" numbers
  picklist.js    191   SKU pick manifest (Excel)
  merge.js        31   Merge PDFs + pick rows across machines
  peers.js        50   Cross-machine config
  queue.js        52   Job queue (prevents overlapping runs)
  heartbeat.js   106   Watchdog — "processing has stopped"
  alert.js        90   Login-expired alerts (file + toast + email)
  notify.js       53   Email sending
  log.js          50   Logging + the ring buffer the page shows

public/index.html     The control page (one file, no framework)
data/state.json       The ONLY durable record. Treat as precious.
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
scheduler.js  runCycle({ date })        date = todayIST()   ← ONLY today
      │
      ├─ agent.js   getClient()         reuse browser, or launch it
      ├─ agent.js   checkSession()      alive? else alert + stop
      │
      └─ for each channel (amazon, flipkart, meesho, fba):
             │
             ├─ activate.js  activateChannel()     new orders → pick list
             │
             └─ pipeline.js  processChannel()
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
                           └─ store.markProcessed(... status LABELED)
```

Then, separately, when someone presses **Print New Labels**:

```
print.js  printNewLabels()
      ├─ store.listUnprinted({ maxDate: todayIST() })   today + earlier only
      ├─ retrieveCombinedLabelUrl(ids)                  ask SmartHub for a PDF
      ├─ downloadBytes(url)                             fetch it
      ├─ sort by SKU                                    match the pick list
      ├─ writeRowsToXlsx()                              pick manifest
      └─ store.markPrinted(ids, batchId)                never reprints
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
  weight: { measure: 100, unitOfMeasure: "G" },   // ← the Meesho failure lives here
};
```

`todayIST()` is the source of every date decision. It returns `YYYY-MM-DD` in
Asia/Kolkata. **Changing how this works changes which orders get processed** —
be careful.

> `cutoff` is currently **defined but unused**. Nothing warns you before a
> deadline. See `RISKS.md` §D.

### `src/pipeline.js` — where most bugs are

The heart of it. Two functions matter:

**`processChannel()`** — per channel, per day:
1. Find pick tasks for the date
2. Validate each → list of shipments
3. **Reconcile orphans** — anything packed in SmartHub but missing from our
   store gets added as `LABELED`, so it can still be printed. This is what
   rescues manual fixes, *but only for the date currently being processed.*
4. Split into batches of 15 and process each

**`processBatch()`** — the irreversible part:

```js
const pkgResp = await client.createPackages(...);     // ← LYCS_INVALID_INPUT here
const pkgErrors = pkgResp?.shipmentIdToErrorMap || {};
for (const id of Object.keys(pkgErrors)) {
  store.audit(channel.key, "pack-failed", `${id}: ...`);   // audit only, NOT logged
}
```

**That last line is why failures look invisible.** The error goes into
`state.json`, but the Activity Log only shows "0 labelled successfully". To make
failures visible on the page, add a `log.warn(...)` next to that `store.audit`.

Also note: **there is no attempt limit.** A failing order is retried every cycle
forever, which is how SmartHub ends up hard-blocking orders.

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

One JSON file, three top-level keys:

```js
{
  processed: { "<customerShipmentId>": {
      orderId, channel, date, labelFile, trackingId,
      status: "LABELED", ts, printed, printedAt, printBatchId
  }},
  audit:     [ { ts, channel, action, detail } ],
  lastPrint: [ "<file paths>" ]
}
```

- `processed` → idempotency. `printed: false` means "waiting to print".
- `audit` → append-only history. **This is where failure reasons live**, and
  it's the first thing to read when something goes wrong.
- Writes are **atomic** (temp file + rename), so it can't be half-written.

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
const shipDate = date || todayIST();   // ← the midnight-rollover gap
```

**That one line is the cause of abandoned previous-day orders.** Making it a
*list* of dates (today plus the last day or two) is the look-back fix.

### `server.js`

| Route | Does |
|---|---|
| `GET /api/status` | Session, pending count, status table, peers |
| `GET /api/log` | Recent log lines for the page |
| `POST /api/run` | Process now |
| `POST /api/print` | Print locally |
| `POST /api/print-combined` | **Hub:** pull from peers, merge, print |
| `POST /api/peer/print` | **Processor:** return my labels (token-auth) |
| `POST /api/login` | Open the login window on this machine |

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

**Read the audit trail** — the single most useful debugging move:

```bash
node -e "const s=require('./data/state.json');console.log(s.audit.slice(-30).map(a=>a.ts+' '+a.channel+' '+a.action+' | '+(a.detail||'').slice(0,120)).join('\n'))"
```

**Watch the browser** when you can't tell what's happening — launch it visible:

```js
SmartHubClient.launch({ visible: true })
```

**When an API call starts failing, capture a HAR.** Do the same action manually
in SmartHub with DevTools → Network recording, then diff the request payload
against ours. This has solved every API-side failure so far — including one where
the *only* difference was `100 G` vs `0.2 KG`.

---

## 7. Things that will bite you

| Trap | Why |
|---|---|
| **Switching to headless** | Amazon SSO stalls. Looks like a login bug, isn't. |
| **Using `context.request`** | Returns HTML, not JSON — no SSO tokens. Use `page.evaluate` + fetch. |
| **Running CLI and server together** | Both want the browser profile; one fails with "already in use". |
| **Deleting `state.json`** | Everything reprints. |
| **Pruning `state.json` too eagerly** | Reconciliation re-adds the order as unprinted → it prints again. Only prune `date < today && printed`. |
| **Forgetting GraphQL is base64** | You'll parse garbage. |
| **Updating only one machine** | Hub and peer share a protocol; version skew breaks combined printing silently. |
| **Trusting "it worked yesterday"** | SmartHub changes server-side. Our code has been unchanged through two separate breakages. |

---

## 8. Known gaps (deliberate, documented)

These are *missing*, not broken — don't be surprised by them:

| Gap | Effect | Fix |
|---|---|---|
| **No attempt limit** | Failing orders retry forever until SmartHub blocks them | `RISKS.md` §C |
| **Today-only processing** | Previous-day orders abandoned at midnight | Look-back window |
| **Errors not logged** | Failures invisible on the page | Add `log.warn` beside `store.audit` in `pipeline.js` |
| **Cutoffs unused** | No warning before a deadline | `RISKS.md` §D |
| **No external watcher** | If the hub itself dies, nothing alerts | Needs the always-on third machine |

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
