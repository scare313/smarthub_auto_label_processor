# Complete Setup Guide — From a Blank Windows PC

Step-by-step instructions to set this up from zero. No prior technical
knowledge assumed. Follow it in order.

---

## What this system does

If you sell on Amazon (and Flipkart / Meesho / FBA) and process orders through
**Amazon SmartHub**, this automates the repetitive part:

- Every 15 minutes it automatically activates pick lists, packs orders, and
  generates shipping labels — no clicking through SmartHub.
- When you're ready to ship, you click **one button** and it gives you all new
  labels merged into a single PDF per marketplace, plus a matching SKU pick list.
- If you run **two seller accounts on two PCs**, the PC with the printer can pull
  labels from the other PC too, so you print everything from one place.

### Do you need one PC or two?

| Your situation | What to do |
|---|---|
| **One seller account** | Set up one PC. Skip Step 6 entirely. |
| **Two seller accounts** | Set up both PCs. Amazon requires each account to be on a **separate internet connection** — this is not optional. |

Throughout this guide, when two PCs are involved:

- **PRINTER PC** — the one connected to your label printer. It collects labels
  from both accounts and prints them.
- **OTHER PC** — the second seller account's machine. It processes its own
  orders and hands its labels to the Printer PC when asked.

Most steps are identical on both. Differences are marked **[PRINTER PC ONLY]**
or **[OTHER PC ONLY]**.

Set aside about 45 minutes for the first PC.

---

## Before you start — what you need

| Thing | Notes |
|---|---|
| Amazon SmartHub login | One account per PC |
| A Tailscale account | Free — sign up at tailscale.com (only needed for 2 PCs) |
| A Gmail address | For error emails (optional but recommended) |
| The code | `https://github.com/scare313/smarthub_auto_label_processor.git` |

---

## Step 1 — Install Node.js

Node.js is what runs the program.

1. Go to **https://nodejs.org**
2. Download the big green **LTS** button
3. Run the installer — click **Next** through everything, accept defaults
4. If it asks about "Tools for Native Modules", leave it unchecked

> [SCREENSHOT: Node.js download page showing the LTS button]

**Check it worked:** Press the `Windows key`, type `powershell`, press Enter.
In the blue/black window type:

```powershell
node --version
```

You should see something like `v24.16.0` (anything `v20` or higher is fine).
If it says "not recognized", restart the PC and try again.

---

## Step 2 — Install Git

Git downloads the program code and lets you update it later.

1. Go to **https://git-scm.com/download/win**
2. Download and run the installer
3. Click **Next** through every screen (defaults are fine)

**Check it worked:**

```powershell
git --version
```

You should see something like `git version 2.x.x`.

---

## Step 3 — Install Tailscale

> **Only needed if you're using two PCs.** Skip to Step 4 if you have one PC.

Tailscale creates a private network so the two PCs can talk to each other
securely, even on different internet connections.

1. Go to **https://tailscale.com/download/windows**
2. Download and install
3. Open Tailscale and click **Log in**
4. Sign in (create a free account if you don't have one) — use the **same
   account on both PCs**
5. Confirm it says **Connected**

> [SCREENSHOT: Tailscale showing "Connected" status]

⚠️ **Do NOT turn on "Use exit node."** That would send one account's traffic
through the other PC's internet connection and break Amazon's requirement that
the two accounts stay on separate networks.

**Write down this PC's Tailscale IP** — you'll need it in Step 6:

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" ip -4
```

It looks like `100.x.x.x`. Note it down and label which PC it belongs to.

---

## Step 4 — Download the program

Run these one at a time in PowerShell:

```powershell
mkdir C:\Automation
```

> If it says the folder already exists, that's fine — continue.

```powershell
cd C:\Automation
```

```powershell
git clone https://github.com/scare313/smarthub_auto_label_processor.git auto_order_processor
```

This creates `C:\Automation\auto_order_processor` containing the program.

---

## Step 5 — Install the program's parts

```powershell
cd C:\Automation\auto_order_processor
```

```powershell
npm install
```

Wait 1–2 minutes. Yellow warnings are normal — ignore them.

Then install the browser the program uses internally:

```powershell
npx playwright install chromium
```

This downloads about 130 MB. Wait for it to finish.

---

## Step 6 — Link the two PCs together

> **Skip this step if you only have one PC.**

This is what lets the Printer PC collect labels from the Other PC.

First, invent a shared secret — any long random text, like a password.
**It must be exactly the same on both PCs.** Example: `orders-link-9f3kd2la0z`

You'll create a file called `peers.json` in
`C:\Automation\auto_order_processor\config\` on each PC.

**How to create it:** Open Notepad → paste the text below → File → Save As →
navigate to that `config` folder → change "Save as type" to **All Files** →
filename `peers.json` → Save.

> [SCREENSHOT: Notepad "Save As" dialog with "All Files" selected]

### [OTHER PC ONLY]

```json
{
  "selfName": "second",
  "sharedSecret": "orders-link-9f3kd2la0z",
  "peers": []
}
```

### [PRINTER PC ONLY]

Use the **Other PC's** Tailscale IP from Step 3:

```json
{
  "selfName": "main",
  "sharedSecret": "orders-link-9f3kd2la0z",
  "peers": [
    { "name": "second", "url": "http://100.101.102.103:4545" }
  ]
}
```

Replace `100.101.102.103` with the Other PC's real Tailscale IP.

⚠️ **No slash at the end of the URL.** `...:4545` is correct — `...:4545/` will
silently fail to connect.

`selfName` is just a friendly label shown on screen — call them whatever makes
sense to you (`main`/`second`, `shop`/`warehouse`, etc.).

---

## Step 7 — Set up error emails (optional but recommended)

This emails you if the Amazon login expires and processing quietly stops —
otherwise you might not notice for hours.

**First, create a Gmail App Password** (a normal Gmail password won't work):

1. Go to **https://myaccount.google.com/security**
2. Turn on **2-Step Verification** if it isn't already
3. Search for **App passwords** in the settings search bar
4. Create one named "SmartHub" — Google shows a 16-character password
5. Copy it

> [SCREENSHOT: Google App passwords screen showing the 16-character code]

**Then create** `C:\Automation\auto_order_processor\config\alerts.json`
(same Notepad method as Step 6):

```json
{
  "email": {
    "enabled": true,
    "smtpHost": "smtp.gmail.com",
    "smtpPort": 465,
    "secure": true,
    "user": "youraddress@gmail.com",
    "pass": "paste-the-16-character-password-here",
    "from": "SmartHub <youraddress@gmail.com>",
    "to": "youraddress@gmail.com"
  }
}
```

**Test it:**

```powershell
node index.js test-alert
```

You should receive an email within a few seconds.

---

## Step 8 — Allow the two PCs to talk (firewall)

> **Skip this step if you only have one PC.**

Windows blocks the connection by default. Do this on **both** PCs.

1. Press `Windows key`, type `powershell`
2. **Right-click** "Windows PowerShell" → **Run as administrator** → **Yes**
3. Paste this and press Enter:

```powershell
netsh advfirewall firewall add rule name="SmartHub Agent 4545" dir=in action=allow protocol=TCP localport=4545 remoteip=100.64.0.0/10
```

You should see `Ok.`

> [SCREENSHOT: PowerShell running as administrator showing "Ok."]

This only allows Tailscale addresses — it does **not** expose your PC to the
internet.

---

## Step 9 — Log in to Amazon SmartHub

Each PC logs into its own Amazon account.

```powershell
cd C:\Automation\auto_order_processor
```

```powershell
node index.js login
```

A browser window opens.

1. Log in to SmartHub with **this PC's** Amazon account
2. Complete the OTP if asked
3. Once you can see the SmartHub dashboard, return to PowerShell and press **Enter**

> [SCREENSHOT: SmartHub dashboard after successful login]

⚠️ Double-check you're using the right account on the right PC.

---

## Step 10 — Start the program

```powershell
cd C:\Automation\auto_order_processor
```

```powershell
npm run serve
```

You should see:

```
SmartHub control server listening on http://0.0.0.0:4545
```

**Leave this window open** — closing it stops the program.

It now processes orders automatically every 15 minutes.

---

## Step 11 — Check it works

Open a browser and go to:

```
http://localhost:4545
```

You should see the SmartHub Control page.

**If you set up two PCs**, the Printer PC should show both machines with green
dots at the top:

```
🟢 main   🟢 second   Queue: idle
```

> [SCREENSHOT: Control page showing both machines green]

If the other machine shows red / unreachable, see Troubleshooting.

**From your phone:** install Tailscale on it, then open
`http://<that PC's Tailscale IP>:4545`

---

## Daily use

Everything runs automatically. The only regular action is printing.

**On the Printer PC**, open `http://localhost:4545` and click the big green
**Print New Labels** button. It shows how many are waiting, e.g.
"Print New Labels (12 waiting)".

It merges all new labels into one PDF per marketplace (from both accounts if you
have two PCs) and opens them ready to print, along with the SKU pick list.

Other buttons:
- **Print All Today's Labels** — everything from today, not just new ones
- **Reprint Last Labels** — reopens the last print (printer jam, etc.)
- **Refresh** under Today's Status — updates the order counts
- **Print from** dropdown — print from all machines, or just one

> **Single-PC users:** the main button will say **Process Orders Now** instead.
> Your print buttons are inside the **Advanced** section — that's normal, since
> the combined-print mode only turns on when another PC is configured.

---

## Troubleshooting

### The other machine shows "unreachable"

Check in this order:

1. **Is the program running on that PC?** It needs `npm run serve` running in an
   open window.
2. **Trailing slash?** In `peers.json` the URL must end in `:4545` with **no**
   slash after it.
3. **Right IP?** On the other PC run
   `& "C:\Program Files\Tailscale\tailscale.exe" ip -4`
   and confirm it matches what's in the Printer PC's `peers.json`.
4. **Firewall rule added on that PC?** Repeat Step 8 there.
5. **Both PCs connected in Tailscale?** Check the Tailscale app on each.
6. **Same `sharedSecret` on both?** It must match exactly.

### "Session: expired" or "login needed"

The Amazon login timed out (roughly every 12 hours). Open
`http://localhost:4545` on that PC, expand **Advanced**, click **Login**, and
complete the OTP in the window that appears.

> Use the web **Login** button, not `node index.js login`, while the program is
> running — only one thing can use the saved login at a time, so the command
> version will fail with "profile is already in use" unless you stop the program
> first.

### The program stopped

The window was closed or the PC restarted. Run `npm run serve` again from
`C:\Automation\auto_order_processor`.

### Labels reprinting that were already printed

The record of what's been printed lives in the `data\` folder, which isn't
backed up. After a fresh install it starts empty, so the program may re-offer
labels printed before the rebuild. Check against your records on the first day.

---

## Optional — start automatically when the PC turns on

Avoids having to run `npm run serve` manually after every restart.

1. Press `Windows key`, type **Task Scheduler**, open it
2. Click **Create Basic Task**
3. Name: `SmartHub Agent` → Next
4. Trigger: **When I log on** → Next
5. Action: **Start a program** → Next
6. Program/script: `cmd.exe`
7. Add arguments: `/c cd /d C:\Automation\auto_order_processor && npm run serve`
8. Finish

> [SCREENSHOT: Task Scheduler "Create Basic Task" action screen]

> Note: this method hasn't been verified on these machines yet — after setting
> it up, restart the PC and check `http://localhost:4545` to confirm it worked.

---

## Reference — what's saved where

| File/folder | Purpose | Comes from GitHub? |
|---|---|---|
| `config/peers.json` | Links the two PCs | ❌ Create manually (Step 6) |
| `config/alerts.json` | Email alerts | ❌ Create manually (Step 7) |
| `profile/` | Saved Amazon login | ❌ Log in again (Step 9) |
| `data/` | Record of processed/printed orders | ❌ Starts fresh |
| `labels/` | Saved label PDFs and pick lists | ❌ Starts fresh |

Everything else (the program code) comes from GitHub automatically.

---

## Updating later

```powershell
cd C:\Automation\auto_order_processor
```

```powershell
git pull origin main
```

Then stop the program (`Ctrl+C` in its window) and start it again with
`npm run serve`.

Your configs, login, and data are not affected by updates.
