# Complete Setup Guide — From a Freshly Formatted PC

Follow this guide if one or both PCs have been formatted and you need to set
everything up from zero. No prior knowledge assumed.

**You will do this on BOTH PCs.** Most steps are identical; the few differences
are clearly marked **[SHOP PC ONLY]** or **[BLUDO PC ONLY]**.

Set aside about 45 minutes for the first PC.

---

## Before you start — what you need

Have these ready:

| Thing | Where to get it |
|---|---|
| Amazon SmartHub login (one per PC) | Your existing seller accounts |
| Tailscale account login | The account you already use (`deepu9422@gmail.com`) |
| Gmail address + App Password | For error emails (Step 7 explains how) |
| GitHub repo link | `https://github.com/scare313/smarthub_auto_label_processor.git` |

**Important:** Bludo PC and Shop PC must be on **different internet
connections**. Amazon requires the two accounts stay on separate networks.
Never change this.

---

## Step 1 — Install Node.js

Node.js is what runs the program.

1. Go to **https://nodejs.org**
2. Download the big green **LTS** button (currently Node 24)
3. Run the installer. Click **Next** through everything, accept defaults.
4. When it asks about "Tools for Native Modules" — leave it unchecked, click Next.

> [SCREENSHOT: Node.js download page showing the LTS button]

**Check it worked:** Press `Windows key`, type `powershell`, press Enter. In the
black window, type:

```powershell
node --version
```

You should see something like `v24.16.0` (any `v20` or higher is fine). If you
see "not recognized", restart the PC and try again.

---

## Step 2 — Install Git

Git is what downloads the program code.

1. Go to **https://git-scm.com/download/win**
2. Download and run the installer
3. Click **Next** through every screen (defaults are fine)

**Check it worked:** In PowerShell, type:

```powershell
git --version
```

You should see something like `git version 2.x.x`.

---

## Step 3 — Install Tailscale

Tailscale is the private network that lets the two PCs talk to each other.

1. Go to **https://tailscale.com/download/windows**
2. Download and install
3. Open Tailscale, click **Log in**
4. Sign in with your usual account (`deepu9422@gmail.com`)
5. Make sure it says **Connected**

> [SCREENSHOT: Tailscale showing "Connected" status]

⚠️ **Do NOT turn on "Use exit node".** That would route Amazon traffic through
the other PC and break the account separation rule.

**Write down this PC's Tailscale IP** — you'll need it later. In PowerShell:

```powershell
& "C:\Program Files\Tailscale\tailscale.exe" ip -4
```

It looks like `100.x.x.x`. Write it down and label it (Bludo or Shop).

---

## Step 4 — Download the program

In PowerShell, run these one at a time:

```powershell
mkdir C:\Automation
```

> If it says the folder already exists, that's fine — just continue.

```powershell
cd C:\Automation
```

```powershell
git clone https://github.com/scare313/smarthub_auto_label_processor.git auto_order_processor
```

This creates the folder `C:\Automation\auto_order_processor` with all the code.

---

## Step 5 — Install the program's parts

Still in PowerShell:

```powershell
cd C:\Automation\auto_order_processor
```

```powershell
npm install
```

Wait for it to finish (1–2 minutes). Some yellow warnings are normal — ignore them.

Then install the browser the program uses:

```powershell
npx playwright install chromium
```

This downloads about 130 MB. Wait for it to finish.

---

## Step 6 — Set up the connection between the two PCs

This is what lets Shop PC print labels from both accounts.

Pick a password-like secret text. **It must be exactly the same on both PCs.**
Example: `myshop-secret-2026-xyz`

### [BLUDO PC ONLY]

Create a file at `C:\Automation\auto_order_processor\config\peers.json`
containing exactly this:

```json
{
  "selfName": "bludo",
  "sharedSecret": "myshop-secret-2026-xyz",
  "peers": []
}
```

### [SHOP PC ONLY]

Create the same file, but with Bludo PC's Tailscale IP from Step 3:

```json
{
  "selfName": "shop",
  "sharedSecret": "myshop-secret-2026-xyz",
  "peers": [
    { "name": "bludo", "url": "http://100.71.144.124:4545" }
  ]
}
```

Replace `100.71.144.124` with **Bludo PC's actual Tailscale IP**.

⚠️ **No slash at the end of the URL.** `...:4545` is correct, `...:4545/` is wrong.

**How to create the file:** Open Notepad → paste the text → File → Save As →
navigate to `C:\Automation\auto_order_processor\config\` → set "Save as type" to
**All Files** → filename `peers.json` → Save.

> [SCREENSHOT: Notepad "Save As" dialog with "All Files" selected]

---

## Step 7 — Set up error emails (optional but recommended)

This emails you if the Amazon login expires and processing stops.

**First, create a Gmail App Password:**

1. Go to **https://myaccount.google.com/security**
2. Turn on **2-Step Verification** if it isn't already
3. Search for **App passwords** in the settings search bar
4. Create one named "SmartHub" — Google shows you a 16-character password
5. Copy it

> [SCREENSHOT: Google App passwords screen showing the 16-character code]

**Then create the file** `C:\Automation\auto_order_processor\config\alerts.json`:

```json
{
  "email": {
    "enabled": true,
    "smtpHost": "smtp.gmail.com",
    "smtpPort": 465,
    "secure": true,
    "user": "deepu9422@gmail.com",
    "pass": "paste-the-16-character-password-here",
    "from": "SmartHub <deepu9422@gmail.com>",
    "to": "deepu9422@gmail.com"
  }
}
```

**Test it:**

```powershell
node index.js test-alert
```

You should get an email within a few seconds.

---

## Step 8 — Allow the two PCs to talk (firewall)

Windows blocks the connection by default. Do this on **both** PCs.

1. Press `Windows key`, type `powershell`
2. **Right-click** "Windows PowerShell" → **Run as administrator**
3. Click **Yes** on the popup
4. Paste this and press Enter:

```powershell
netsh advfirewall firewall add rule name="SmartHub Agent 4545" dir=in action=allow protocol=TCP localport=4545 remoteip=100.64.0.0/10
```

You should see `Ok.`

> [SCREENSHOT: PowerShell running as administrator showing "Ok."]

This only allows the Tailscale network — it does not open your PC to the internet.

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

1. Log in to SmartHub with **that PC's** Amazon account
2. Complete the OTP if asked
3. When you can see the SmartHub dashboard, go back to PowerShell and press **Enter**

> [SCREENSHOT: SmartHub dashboard after successful login]

⚠️ Make sure you use the **correct account for each PC** — Bludo's account on
Bludo PC, Shop's account on Shop PC.

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

**Leave this PowerShell window open.** Closing it stops the program.

The program now automatically processes orders every 15 minutes.

---

## Step 11 — Check it works

Open a web browser on either PC and go to:

```
http://localhost:4545
```

You should see the SmartHub Control page.

**On Shop PC**, the top row should show both machines with green dots:

```
🟢 shop   🟢 bludo   Queue: idle
```

> [SCREENSHOT: Control page showing both machines green]

If Bludo shows **red / unreachable**, see Troubleshooting below.

**You can also open it from your phone** (with Tailscale installed) using the
PC's Tailscale IP, e.g. `http://100.111.207.40:4545`

---

## Daily use (for the employee)

Everything runs automatically. The only regular action:

**On Shop PC**, open `http://localhost:4545` and click the big green
**Print New Labels** button. It shows how many labels are waiting, e.g.
"Print New Labels (12 waiting)".

This collects labels from **both** accounts, merges them into one PDF per
marketplace, and opens them ready to print — along with the pick list.

Other buttons:
- **Print All Today's Labels** — reprints everything from today
- **Reprint Last Labels** — reopens the last print (e.g. printer jammed)
- **Refresh** (under Today's Status) — updates the order counts

---

## Troubleshooting

### "bludo: unreachable" on Shop PC

Check in this order:

1. **Is Bludo PC's program running?** It needs `npm run serve` running in an open window.
2. **Trailing slash in the URL?** In `peers.json` it must be `http://100.x.x.x:4545`
   with **no slash at the end**.
3. **Correct IP?** Run on Bludo PC:
   `& "C:\Program Files\Tailscale\tailscale.exe" ip -4`
   and confirm it matches what's in Shop PC's `peers.json`.
4. **Firewall rule added on Bludo PC?** Repeat Step 8 there.
5. **Both PCs connected in Tailscale?** Check the Tailscale app on both.

### "Session: expired" or "login needed"

The Amazon login timed out. On that PC, open `http://localhost:4545`, expand
**Advanced**, and click **Login**. A browser window opens on that PC — complete
the OTP there and it resumes automatically.

> Use the web **Login** button, not `node index.js login`, while the program is
> running. Only one thing can use the saved login at a time, so the command
> version will fail with "profile is already in use" unless you stop the
> program first.

### The program stopped

The PowerShell window was probably closed or the PC restarted. Just run
`npm run serve` again from `C:\Automation\auto_order_processor`.

### Labels reprinting that were already printed

After a format, the record of what was already printed is gone (it's stored in
the `data\` folder, which isn't backed up). The program may reprint some labels
that were already printed before the format. Check against your paper records
for the first day after a rebuild.

---

## Optional — start automatically when the PC turns on

Not required, but avoids having to run `npm run serve` manually after a restart.

1. Press `Windows key`, type **Task Scheduler**, open it
2. Click **Create Basic Task** on the right
3. Name: `SmartHub Agent` → Next
4. Trigger: **When I log on** → Next
5. Action: **Start a program** → Next
6. Program/script: `cmd.exe`
7. Add arguments: `/c cd /d C:\Automation\auto_order_processor && npm run serve`
8. Finish

> [SCREENSHOT: Task Scheduler "Create Basic Task" action screen]

> Note: this method has not been tested yet on these machines — verify it works
> by restarting the PC and checking `http://localhost:4545` afterwards.

---

## What each config file does (reference)

| File | Purpose | Backed up in GitHub? |
|---|---|---|
| `config/peers.json` | Links the two PCs together | ❌ No — recreate manually (Step 6) |
| `config/alerts.json` | Email alerts | ❌ No — recreate manually (Step 7) |
| `profile/` | Saved Amazon login | ❌ No — log in again (Step 9) |
| `data/` | Record of processed/printed orders | ❌ No — starts fresh |
| `labels/` | Saved label PDFs | ❌ No — starts fresh |

Everything else (the actual program code) comes from GitHub automatically.

---

## Updating the program later

When there are code improvements:

```powershell
cd C:\Automation\auto_order_processor
```

```powershell
git pull origin main
```

Then stop the program (`Ctrl+C` in its window) and start it again
(`npm run serve`).

Your config files, login, and data are **not** affected by updates.
