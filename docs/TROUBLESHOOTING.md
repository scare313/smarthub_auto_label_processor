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
| Marketplace says label ready, SmartHub doesn't | [B4](#b4-marketplace-shows-label-downloaded-but-smarthub-isnt-packed) |
| "0 labelled successfully" with no reason | [B5](#b5-0-labelled-successfully-but-no-error-shown) |
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

**4. Was it started with the scheduler disabled?** `AGENT_NO_SCHEDULE=1` starts the
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

> **Prevention is still unbuilt.** An attempt cap (~5 tries, then park the order
> and alert) is the single most valuable pending change. See `RISKS.md` §C.

## B3. Yesterday's orders were never processed

**You see:** the marketplace shows orders from a previous day still unprocessed,
while our logs show nothing wrong.

**Means:** **the midnight rollover abandoned them.** The cycle processes
`todayIST()` only. At midnight IST it switches to the new date and *never looks
back*. Anything still unprocessed for the old date becomes invisible — the tool
will never attempt it again.

This has three knock-on effects:

- Unprocessed orders are abandoned
- Reconciliation won't rescue them either (it only scans the current date)
- Even if you **manually pack** one later, the tool won't notice or print it

**Fix now:** handle them manually in SmartHub, and **download those labels
manually too** — the tool won't fetch them.

**Useful trick:** if you manually pack an order **on its own ship date**, the next
cycle reconciles it automatically and it becomes printable. Do it the next day and
you must download the label yourself.

> **Prevention is unbuilt.** A look-back window (process today plus the previous
> 1–2 days) would close all three effects. 19 orders were lost this way in August.

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

**Means:** a **known observability gap**, not a separate bug. Pack and label
failures are written to the `state.json` audit trail, but only a summary line
reaches the log you can see.

**To get the real reason:**

```bash
node -e "const s=require('./data/state.json');console.log(s.audit.filter(a=>a.action==='pack-failed'||a.action==='label-failed').slice(-20).map(a=>a.ts+' '+a.channel+' '+a.action+' | '+(a.detail||'')).join('\n'))"
```

> Fixing this properly means logging the error detail in `src/pipeline.js`
> (`processBatch`), where `store.audit(..., "pack-failed", ...)` is called.

## B6. `LABEL_NOT_READY`

**Means:** the marketplace hasn't finished preparing the shipment. **This one
genuinely is transient** — the next cycle usually succeeds. No action needed
unless it persists for hours.

## B7. HTTP 503 on a large batch

**Means:** too many shipments in one request. Already mitigated by batching
(`BATCH_SIZE = 15` in `src/pipeline.js`). If it returns, lower that number.

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
folders — they're only needed for reprints and disputes.

**Never delete `data\state.json`** — it's the record of what's been printed.
Deleting it makes **everything reprint**.

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
| **`state.json` corrupted** | Server won't start; JSON parse error | Back it up — it contains **no customer PII**, so it's safe to copy to Drive |
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
