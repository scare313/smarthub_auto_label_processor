# Troubleshooting & FAQ

Every problem we've actually hit, plus the ones most likely to come next.
Each entry: **what you see → what it means → how to fix it.**

> **Fastest first move for almost anything:** open the control page
> (`http://localhost:4545`), look at the session dot and the Activity Log at the
> bottom. Nine times out of ten the answer is there.

---

## Quick index

| Symptom | Section |
|---|---|
| Orders not being processed at all | [A1](#a1-nothing-is-processing) |
| "Session: unknown" / login expired | [A2](#a2-amazon-login-expired) |
| Some orders fail every cycle | [B1](#b1-lycs_invalid_input--pack-keeps-failing) |
| "Maximum number of retry reached" | [B2](#b2-forbidden_request--maximum-number-of-retry-reached) |
| Orders from a previous day never shipped | [B3](#b3-yesterdays-orders-were-never-processed) |
| SmartHub's "Missed orders" tab has a count | [B3b](#b3b-orders-sit-in-smarthubs-missed-orders-tab) |
| Marketplace says label ready, SmartHub doesn't | [B4](#b4-marketplace-shows-label-downloaded-but-smarthub-isnt-packed) |
| "0 labelled successfully" with no reason | [B5](#b5-0-labelled-successfully-but-no-error-shown) |
| An order is parked / "Needs attention" | [B8](#b8-an-order-is-parked--needs-attention) |
| Red banner: state file unreadable | [B9](#b9-state-file-degraded--the-agent-refuses-to-run) |
| Labels won't print / nothing in the PDF | [C1](#c1-no-labels-to-print) |
| Only one account's labels printed | [C2](#c2-combined-print-missing-the-other-machine) |
| Peer shows offline / unreachable | [D1](#d1-peer-shows-offline-or-unreachable) |
| Tailscale health warning | [D2](#d2-tailscale-cant-reach-its-coordination-server) |
| Some websites / GitHub won't load | [D3](#d3-some-sites-fail-github-times-out) |
| Server won't start | [E1](#e1-server-wont-start) |
| Server gone after a reboot | [E2](#e2-nothing-running-after-a-restart) |
| Browser profile locked | [E3](#e3-profile-is-locked--already-in-use) |
| No alert emails | [F1](#f1-not-receiving-alert-emails) |

---

# A. Nothing is running

## A1. Nothing is processing

**Check in this order:**

**1. Is the agent running?**

```bash
netstat -ano | findstr :4545
```

No output means it isn't running. Start it:

```bash
cd C:\Automation\auto_order_processor && node server.js
```

**2. Is the session alive?** A red dot on the page → see [A2](#a2-amazon-login-expired).

**3. Is the scheduler ticking?** The Activity Log should show `Cycle start — <date>`
every 15 minutes, on the quarter hour (:00 / :15 / :30 / :45). Nothing for 45+
minutes means the watchdog should have emailed you.

**4. Is the state file readable?** A red banner about the state file means the
agent has stopped on purpose — see
[B9](#b9-state-file-degraded--the-agent-refuses-to-run). Cycles log
`Cycle stopped — store-degraded` in this case.

**5. Are the orders parked?** If cycles are running and finding nothing, check the
amber "Needs attention" panel. Parked orders are skipped on purpose until
retried — [B8](#b8-an-order-is-parked--needs-attention).

**6. Was it started with the scheduler disabled?** `AGENT_NO_SCHEDULE=1` starts the
page **without** automatic processing. Restart without it.

## A2. Amazon login expired

**You see:** a red banner *"Amazon login expired"*, a red session dot,
`LOGIN-REQUIRED.txt` on the Desktop, or an alert email.

**Means:** the saved browser session expired (roughly every 12–24h, or after an
Amazon-side security event). **Nothing is processed until you fix it.**

**Fix:** click **Log in now** on the banner — or run `node index.js login` — then
complete the OTP **in the window that opens on that PC**. The browser window
normally sits off-screen; the login flow brings it into view.

> If the banner names a **different machine** ("not being processed on: bludo"),
> log in on *that* PC. Logging in here won't help it.

**Why it needs a visible window:** Amazon's SSO stalls in a headless browser, so
the agent always runs a real browser, just parked off-screen. This is deliberate —
don't "fix" it by switching to headless.

---

# B. Orders failing

## B1. `LYCS_INVALID_INPUT` — pack keeps failing

**You see:** repeatedly, in the `state.json` audit trail:

```
pack-failed | <shipmentId>: {"errorCode":"LYCS_INVALID_INPUT",
              "errorMessage":"Something went wrong. Please retry generating shiplabel and invoice."}
```

**Means:** the marketplace's logistics system rejected the package details.
Despite what the message says, **retrying does not help** an order that fails
repeatedly — we have seen the same order fail 96 times.

**Two different cases:**

| Pattern | Meaning | Action |
|---|---|---|
| Fails once, succeeds next cycle | Transient hiccup | Ignore — it self-heals |
| Fails every cycle, never succeeds | Real rejection | Needs a fix (below) |

**Known cause (Meesho, from 24 Aug 2026):** the fixed package weight. We send
`{ measure: 100, unitOfMeasure: "G" }`; SmartHub's own UI sends
`{ measure: 0.2, unitOfMeasure: "KG" }`. A HAR capture of a successful manual
pack showed that to be the **only** difference — every other field byte-identical.

**To fix:** edit `DEFAULT_PACKAGE.weight` in `src/config.js`, then test on a
single order before rolling out:

```bash
node index.js run --channel meesho --live --limit 1
```

Try `{ measure: 0.1, unitOfMeasure: "KG" }` first — same physical weight, so no
change to shipping cost. Only move to `0.2` if `0.1` is rejected, since a heavier
declared weight can cost more per parcel.

**To list every currently stuck order:**

```bash
node -e "const s=require('./data/state.json');const f=s.audit.filter(a=>a.action==='pack-failed');const ids=new Set();f.forEach(a=>{const i=(a.detail||'').split(':')[0].trim();if(!s.processed[i])ids.add(i)});console.log('stranded:',ids.size);console.log([...ids].join('\n'))"
```

## B2. `FORBIDDEN_REQUEST` — "Maximum number of retry reached"

**Means:** SmartHub has **hard-blocked** that order because we retried too many
times. It will not recover on its own.

**This is self-inflicted.** The tool retries failed orders every 15 minutes with
no limit. One order reached 96 attempts; across one account, 867 doomed attempts
were logged in nine days.

**Fix:** process those orders **manually in SmartHub**, then fix the underlying
failure ([B1](#b1-lycs_invalid_input--pack-keeps-failing)) so the loop stops.

> **Prevention is now built.** An order is parked after **5 hard failures** and
> is not retried again until somebody presses Retry, so the loop can no longer
> run an order into a hard block. Transient errors (503, throttling,
> `LABEL_NOT_READY`) do not count toward the cap. If you still see this message,
> it is from an order blocked *before* the cap existed, or one retried manually
> too many times. See [B8](#b8-an-order-is-parked--needs-attention).

## B3. Yesterday's orders were never processed

**You see:** the marketplace shows orders from a previous day still unprocessed,
while our logs show nothing wrong.

**This used to be the midnight rollover**, and it was the single biggest source
of silently lost orders — 19 in August 2026 and 13 Flipkart orders on 13
October. The cycle processed `todayIST()` only, so at midnight IST it switched to
the new date and never looked back.

**Fixed.** Each cycle processes **today plus the previous `LOOKBACK_DAYS`**
(default 2, in `src/config.js`), oldest first so the order closest to breaching
goes first. Reconciliation runs for each of those dates too, so an order you
packed by hand yesterday is picked up and becomes printable.

If orders older than the window are stuck, raise `LOOKBACK_DAYS` — each extra
day adds one more pass per channel per cycle.

**If orders from a previous day are still unprocessed, the cause is now one of:**

| Cause | How to tell | Fix |
|---|---|---|
| **In no pick list at all** | SmartHub's Missed orders tab shows a count | See [B3b](#b3b-orders-sit-in-smarthubs-missed-orders-tab) — the look-back cannot reach these |
| **Older than the look-back window** (3+ days) | Ship date is older than two days | Handle in SmartHub manually, including the label download |
| **Parked after repeated failures** | It is listed in "Needs attention" on the page | Fix the cause, then Retry — see [B8](#b8-an-order-is-parked--needs-attention) |
| **The agent was not running** | Gap in `data/logs/agent-*.log` | Start it; the next cycle catches up within the window |
| **State file degraded** | Red banner on the page | See [B9](#b9-state-file-degraded--the-agent-refuses-to-run) |

To confirm the look-back is running, watch the Activity Log for one cycle: the
`Cycle start` line names every date it is covering, oldest first.

**Useful trick:** if you manually pack an order **on its own ship date**, the next
cycle reconciles it automatically and it becomes printable. Do it the next day and
you must download the label yourself.

> 19 orders were lost this way in August, before the look-back window existed.
> The 13 Flipkart orders of 13 October were lost to [B3b](#b3b-orders-sit-in-smarthubs-missed-orders-tab) instead, which the look-back could not have caught.

## B3b. Orders sit in SmartHub's "Missed orders" tab

**You see:** the marketplace says orders are pending dispatch, SmartHub's
**Missed orders** tab shows a count, but the tool reports
`No new pick lists to activate` and nothing happens.

**Means:** their pickup window has passed. SmartHub stops offering expired
windows through the "recommended" endpoints, so activation never sees them.
Because they are in no pick list, processing cannot find them either — on any
date, including with the look-back window.

**This is now handled automatically:** activation also reads
`/api/pick/lists/missed` every cycle and activates overdue lists first. The log
shows:

```
[flipkart] 13 MISSED order(s) past their ship date, in 1 pick list(s) - activating.
```

**If they are still stuck**, activate them by hand from the Missed orders tab in
SmartHub. Once they are in an activated pick list, the next cycle packs,
labels and prints them normally.

**This is the one previous-day failure the look-back window cannot fix.**
Processing finds orders through pick tasks, and these are in no pick task on any
date, so widening the dates never reaches them. The fix had to be in activation.

---

## B4. Marketplace shows "label downloaded" but SmartHub isn't packed

**Means:** the label was created on the **courier's** side, but SmartHub's pack
step was rejected. SmartHub therefore has no packed shipment and won't give you a
label — and our tool has no record of the order at all.

This is the visible symptom of [B1](#b1-lycs_invalid_input--pack-keeps-failing).

**Fix:** pack it manually in SmartHub. Note that repeated failed attempts may have
created duplicate label requests downstream — worth checking with the courier if
you see duplicates.

## B5. "0 labelled successfully" but no error shown

**You see** in the Activity Log:

```
[meesho] Batch 1/1 — packing+labelling 1 shipment(s)...
[meesho] LIVE: 0 labelled successfully. Will retry next cycle.
```

…and nothing explaining why.

**Means:** you are looking at an old log. Pack and label failures now print the
reason on the line after the summary, like this:

```
[meesho] pack failed for 408-1234567 [CS-9001]: LYCS_INVALID_INPUT ... (attempt 2/5)
```

If the reason is still missing, the failure happened before this was added, or
the whole batch threw before any per-order error came back — in which case the
batch-level error is logged instead.

**To read the stored reasons for any order:**

```bash
node index.js exceptions
```

That lists every failing order with its reason and attempt count, parked ones
first. **For the raw audit trail:**

```bash
node -e "const s=require('./data/state.json');console.log(s.audit.filter(a=>a.action==='pack-failed'||a.action==='label-failed').slice(-20).map(a=>a.ts+' '+a.channel+' '+a.action+' | '+(a.detail||'')).join('\n'))"
```

> The reason text comes from `errorText()` in `src/pipeline.js`, which flattens
> SmartHub's error payloads — they arrive as a string, an array of strings, or an
> object with a `message`, depending on the endpoint.

## B6. `LABEL_NOT_READY`

**Means:** the marketplace hasn't finished preparing the shipment. **This one
genuinely is transient** — the next cycle usually succeeds. No action needed
unless it persists for hours.

## B7. HTTP 503 on a large batch

**Means:** too many shipments in one request. Already mitigated by batching
(`BATCH_SIZE = 15` in `src/pipeline.js`). If it returns, lower that number.

It is also classified as **transient**, so a 503 never pushes an order toward
being parked.

## B8. An order is parked / "Needs attention"

**You see:** an amber panel on the control page headed *"N order(s) having
trouble"*, or an email saying an order has been parked.

**Means:** that order failed **5 times for a real reason** — not a network blip —
so the agent stopped retrying it. This is deliberate. Retrying forever is what
got orders permanently blocked by SmartHub ([B2](#b2-forbidden_request--maximum-number-of-retry-reached)).

**A parked order will not ship until somebody acts.** That is the trade: a
visible stop instead of a silent loop.

**What to do:**

1. **Read the reason** in the panel, or run `node index.js exceptions`.
2. **Fix the cause.** Most parked orders are
   [B1](#b1-lycs_invalid_input--pack-keeps-failing) — the weight or box values
   the marketplace rejected.
3. **Retry it** — the button on the row, or:

```bash
node index.js retry --order <customerShipmentId>
```

4. **Or handle it manually in SmartHub.** If you do, the next cycle reconciles it
   and it becomes printable, as long as its ship date is still inside the
   look-back window.

Retry clears the failure record completely, so the order gets a fresh set of
attempts. Retrying without fixing the cause just parks it again 5 cycles later.

**"waiting" vs "retry" vs "PARKED"** in the CLI listing: *waiting* is a
transient error that will be retried on its own, *retry* is a hard failure still
under the cap, *PARKED* has stopped.

## B9. State file degraded / the agent refuses to run

**You see:** a red banner on the control page saying the state file is unreadable,
and every action returning *"Stopped: store-degraded"* or a 503.

**Means:** `data\state.json` could not be read or parsed. The agent has renamed
it to `data\state.corrupt-<timestamp>.json` and **deliberately stopped**.

**Why it stops instead of carrying on:** that file is the only record of what has
already been labelled and printed. An unreadable file looks exactly like "nothing
has been processed", so continuing would relabel and reprint the entire day,
booking a second courier pickup for every parcel.

**Recovery — do this in order:**

1. **Stop the agent** on this machine.
2. **Find the newest backup.** The banner names it. Otherwise look in
   `data\backups\` (14 daily copies), or `data\peer-backups\` for the copy the
   other machine pushed.
3. **Copy it over `data\state.json`.**
4. **Check SmartHub before restarting.** A backup can be up to a day old, so
   orders labelled after it was taken will look unprocessed. Anything already
   `BOUND` in SmartHub is re-adopted by the reconciliation pass, but check the
   printed queue against what staff actually have in hand.
5. **Restart the agent** and watch one full cycle.

**Do not just delete the corrupt file.** An empty data directory reads as a first
install, and everything reprints. The agent guards against this — it stays
degraded if it sees a `state.corrupt-*` file with no `state.json` beside it — but
restore a backup rather than relying on that.

**Dry runs still work** while degraded (`node index.js run`, no `--live`), which
is the safe way to see what the damage would have been.

---

# C. Printing

## C1. "No labels to print"

**Expected** when everything is already printed. Otherwise check:

**1. Is anything actually waiting?**

```bash
node -e "const s=require('./data/state.json');const u=Object.values(s.processed).filter(r=>r.status==='LABELED'&&!r.printed);console.log('waiting:',u.length)"
```

**2. Were they already printed?** "Print New Labels" never reprints. Use **Reprint
Last Labels**, or reopen the PDF from `labels\<date>\`.

**3. Future-dated orders are excluded by design.** Printing covers *today and
earlier*, never future ship dates — so pre-processed next-day labels can't mix
into today's batch and get handed to the wrong courier.

> **Note:** orders from **previous days that were never printed still print.**
> That's deliberate — nothing strands. See `RISKS.md` §J.

## C2. Combined print missing the other machine

**You see:** a warning naming an unreachable peer, and only one account's labels.

**Means:** the hub couldn't reach the processor machine. It **never blocks** — it
prints what it can and warns about the rest.

**Fix:** see [D1](#d1-peer-shows-offline-or-unreachable). Meanwhile print on each
machine separately (**Advanced → Print Locally**) — you get two PDFs instead of
one merged, and nothing is lost.

## C3. Labels in the wrong order

Labels are sorted **alphabetically by SKU** so they match the pick list. Pick from
the manifest top to bottom and the labels line up.

---

# D. Network and machines

## D1. Peer shows offline or unreachable

Work through these in order — each has genuinely been the cause at least once:

**1. Is the other agent running?** On that PC:

```bash
netstat -ano | findstr :4545
```

**2. Trailing slash in `config/peers.json`.** `http://100.x.x.x:4545/` produces
`//api/status` → 404 → "unreachable". The code strips it now, but check anyway:

```json
{ "peers": [{ "name": "bludo", "url": "http://100.71.144.124:4545" }] }
```

**3. Firewall rule missing.** On the machine being *reached*, as Administrator:

```bash
netsh advfirewall firewall add rule name="SmartHub Agent 4545" dir=in action=allow protocol=TCP localport=4545
```

**4. Tailscale health.** See [D2](#d2-tailscale-cant-reach-its-coordination-server).

**How to tell the causes apart:**

| Behaviour | Cause |
|---|---|
| **Instant** "connection refused" | Nothing listening — the agent is down |
| **Hangs, then times out** | Packets dropped — firewall or Tailscale |
| `SYN_SENT` stuck in `netstat` | Sent, no reply — same as above |

## D2. Tailscale can't reach its coordination server

**You see:**

```
# Health check:
#     - Unable to connect to the Tailscale coordination server...
```

with peers showing `offline` even though both machines are on.

**Means:** that machine's Tailscale can't reach `controlplane.tailscale.com`, so
it can't refresh peer keys. Connections then hang. Confusingly, `tailscale ping`
may still work via relay — that is **not** proof the link is healthy.

**Fix, in order** (Administrator):

```bash
net stop Tailscale && net start Tailscale
```

Then if needed:

```bash
"C:\Program Files\Tailscale\tailscale.exe" down
```
```bash
"C:\Program Files\Tailscale\tailscale.exe" up
```

Then check the clock — wrong time breaks TLS and causes exactly this:

```bash
w32tm /resync
```

Last resort: reboot.

## D3. Some sites fail, GitHub times out

**You see:** `git pull` failing with
`Failed to connect to github.com port 443 after 21101 ms`, some websites not
loading, and Tailscale unable to reach its servers.

**Read the error carefully — it tells you which layer broke:**

| Error | Meaning |
|---|---|
| `Could not resolve host` | **DNS** problem |
| `Failed to connect ... port 443` | DNS fine, **connection** dropped |

**Most likely cause: broken IPv6.** Indian mobile broadband is often IPv6 with
NAT64. If the IPv6 path breaks, sites *with* IPv6 (GitHub, Tailscale) time out
while IPv4-only sites work fine — which is why only *some* sites fail.

**Test:**

```bash
curl -4 -I -m 15 https://github.com
```
```bash
curl -6 -I -m 15 https://github.com
```

`-4` works and `-6` times out confirms it.

**Fix:** untick **Internet Protocol Version 6 (TCP/IPv6)** in the adapter's
Properties, then:

```bash
ipconfig /flushdns
```

**If DNS is the problem instead**, set DNS servers to `1.1.1.1` and `8.8.8.8`.

**If both fail**, test on a phone hotspot. If it works there, it's your ISP.

> **Orders keep processing through all of this.** Only cross-machine printing is
> affected. Print locally on each PC meanwhile.

## D4. Must the two accounts stay on separate networks?

**Yes — this is a hard rule.** Two machines, two separate internet connections.

**Never enable a Tailscale exit node** — that would route one machine's Amazon
traffic out through the other's connection.

**Verify no exit node:**

```bash
"C:\Program Files\Tailscale\tailscale.exe" debug prefs | findstr ExitNode
```

Both `ExitNodeID` and `ExitNodeIP` must be empty.

**Verify different public IPs:**

```bash
"C:\Program Files\Tailscale\tailscale.exe" status
```

The other machine's public IP (shown after `direct`) must **differ** from this
one's. Re-check after any router or ISP change.

Tailscale itself is safe: without an exit node it only carries `100.x` traffic
between your PCs. Amazon traffic goes out each machine's own ISP.

---

# E. Server and Windows

## E1. Server won't start

| Error | Fix |
|---|---|
| `EADDRINUSE :4545` | Already running, or a stale process. Find it with `netstat -ano \| findstr :4545`, then `taskkill /F /PID <pid>` |
| `ProfileDir is already in use` | See [E3](#e3-profile-is-locked--already-in-use) |
| `Cannot find module` | `npm install` |
| `playwright ... executable doesn't exist` | `npx playwright install chromium` |

## E2. Nothing running after a restart

**Means:** autostart was never set up on that PC. The agent doesn't come back by
itself.

**Fix:** double-click **`Setup Autostart.bat`** once per machine. From then on it
starts at login and **restarts itself if it crashes**.

> It triggers on **log in**, not power-on. A PC sitting at the lock screen runs
> nothing. For unattended operation, enable Windows automatic sign-in.
>
> It is deliberately **not** a Windows service — services get no desktop, and
> Amazon's login needs a real browser session.

## E3. "Profile is locked / already in use"

**Means:** an orphaned Chromium still holds `profile\`.

```bash
tasklist | findstr chrome
```
```bash
taskkill /F /IM chrome.exe
```

Then restart the agent. If it persists, delete `profile\SingletonLock`.

> Only **one** process may use the profile at a time. Never run `index.js` and
> `server.js` simultaneously.

## E4. Disk filling up

`labels\` grows daily and is never cleaned. Archive or delete old `labels\<date>\`
folders — they're only needed for reprints and disputes. That is the only folder
that grows without limit.

`data\logs\`, `data\backups\` and `data\peer-backups\` prune themselves to 14
days. Log files are a few hundred KB a day and the backups are small.

**Never delete `data\state.json`** — it's the record of what's been printed.
Deleting it makes **everything reprint**. If it is already unreadable, restore a
backup: [B9](#b9-state-file-degraded--the-agent-refuses-to-run).

---

# F. Alerts and monitoring

## F1. Not receiving alert emails

1. **Is it configured?** `config/alerts.json` must exist (copy from
   `config/alerts.example.json`) — on **both** machines.
2. **Test it:** `node index.js test-alert`
3. **Gmail needs an App Password**, not your normal password (requires 2-Step
   Verification enabled).
4. Check spam.

## F2. What alerts exist?

| Alert | Trigger |
|---|---|
| Login expired | Session dies (once), and again when restored |
| Processing stopped | No cycle for 45+ minutes on this machine |
| Peer unreachable | Hub can't reach a processor machine |
| Peer not processing | Peer reachable but its cycles are stale |
| Order parked | An order hit the 5-attempt cap. Once per order, with the reason — [B8](#b8-an-order-is-parked--needs-attention) |
| State file unreadable | `state.json` was quarantined and the agent has stopped. Once per occurrence — [B9](#b9-state-file-degraded--the-agent-refuses-to-run) |

## F3. Something broke and nothing alerted me

**Known gap:** a machine can't report its own death. If the **hub** is powered off
or its agent is killed outright, nothing emails you — there's no external watcher.

This has bitten twice: a Tailscale break went unnoticed for hours, and the Ubuntu
server sat offline for days. Closing it properly needs an always-on third machine
monitoring the other two.

---

# G. Problems we haven't hit yet

Plausible, and worth recognising early:

| Problem | Early sign | Prepare by |
|---|---|---|
| **SmartHub changes its API** | Everything fails at once after working fine, with our code unchanged | Capture a HAR of the manual flow and diff the payloads — how both the `pickupSlotId` and the weight issues were solved |
| ~~**`state.json` corrupted**~~ | Red banner, actions refused | **Handled** — quarantined automatically, with 14 daily backups locally and on the peer. See [B9](#b9-state-file-degraded--the-agent-refuses-to-run). Still worth an off-site copy: both current copies are in the same building |
| **Clock drift** | TLS failures, Tailscale won't connect, wrong ship dates | `w32tm /resync`; keep automatic time on |
| **Node / Playwright upgrade breaks it** | Worked yesterday, fails after an update | Pin versions; don't upgrade mid-season |
| **Marketplace tightens validation again** | A slice of orders starts failing while the rest are fine | Same HAR-diff method as above |
| **Order volume grows** | Cycles take longer than 15 minutes; 503s appear | Lower `BATCH_SIZE` in `src/pipeline.js` |
| **Both PCs end up on one connection** | Public IPs match in `tailscale status` | Check after any router or ISP change — see [D4](#d4-must-the-two-accounts-stay-on-separate-networks) |

---

# H. Useful commands

```bash
node index.js status
```
```bash
node index.js run
```
```bash
node index.js run --channel meesho --live --limit 1
```
```bash
node index.js print
```
```bash
node index.js login
```
```bash
node index.js test-alert
```
```bash
node index.js exceptions
```
```bash
node index.js retry --order <customerShipmentId>
```
```bash
node index.js retry --all
```

**Today's log file** (one per IST day, 14 kept):

```bash
tail -n 100 data/logs/agent-$(date +%F).log
```

**Inspect state** (read-only):

```bash
node -e "const s=require('./data/state.json');console.log(Object.keys(s.processed).length,'orders tracked')"
```

**Recent failures:**

```bash
node -e "const s=require('./data/state.json');console.log(s.audit.filter(a=>a.action.includes('failed')).slice(-20).map(a=>a.ts+' '+a.channel+' '+a.action+' | '+(a.detail||'').slice(0,120)).join('\n'))"
```

---

## When you're stuck

Collect these before asking for help — they answer most questions:

1. **`data\state.json`** — safe to share; no customer names, addresses, or phones
2. **The Activity Log** from the control page
3. **What changed recently** — a reboot, an update, a network change
4. **A HAR capture** of doing the same thing manually in SmartHub — by far the most
   valuable artefact when an API call starts failing

See also: **`CODE_WALKTHROUGH.md`** (where in the code each problem lives),
**`RISKS.md`** (known gaps and planned fixes), **`SETUP_GUIDE.md`** (rebuilding a
machine from scratch).
