// alert: make a dead session impossible to miss on an unattended PC.
// Writes a prominent file to the project root AND the user's Desktop, and pops a
// Windows toast/balloon via PowerShell. Cleared automatically on a healthy run.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { exec } from "node:child_process";
import { ROOT } from "./config.js";
import { log } from "./log.js";
import { sendEmail } from "./notify.js";

const ALERT_NAME = "LOGIN-REQUIRED.txt";
const desktop = path.join(os.homedir(), "Desktop");

function alertPaths() {
  const paths = [path.join(ROOT, ALERT_NAME)];
  if (fs.existsSync(desktop)) paths.push(path.join(desktop, ALERT_NAME));
  return paths;
}

export async function raiseSessionAlert(message) {
  // Throttle: only email on the FIRST cycle of an outage, not every 15 min.
  const alreadyActive = fs.existsSync(path.join(ROOT, ALERT_NAME));

  const body = [
    "================================================",
    "  SMARTHUB AUTO-PROCESSOR: LOGIN REQUIRED",
    "================================================",
    "",
    "The automated order processor could NOT run because",
    "the Amazon SmartHub session has expired.",
    "",
    "ACTION: Double-click \"Login.bat\" (or run: node index.js login)",
    "and log in again. Orders are NOT being processed until you do.",
    "",
    `Detected: ${new Date().toLocaleString()}`,
    `Reason: ${message}`,
  ].join("\r\n");

  for (const p of alertPaths()) {
    try {
      fs.writeFileSync(p, body);
    } catch {
      /* ignore */
    }
  }
  log.err("SESSION ALERT raised (LOGIN-REQUIRED.txt written to project + Desktop).");

  // Best-effort Windows toast/balloon notification.
  if (process.platform === "win32") {
    const ps =
      `[reflection.assembly]::LoadWithPartialName('System.Windows.Forms') > $null; ` +
      `$n = New-Object System.Windows.Forms.NotifyIcon; ` +
      `$n.Icon = [System.Drawing.SystemIcons]::Warning; $n.Visible = $true; ` +
      `$n.ShowBalloonTip(15000, 'SmartHub: Login Required', 'Order processing is paused. Please log in again.', 'Warning'); ` +
      `Start-Sleep -Seconds 16; $n.Dispose()`;
    exec(`powershell -NoProfile -WindowStyle Hidden -Command "${ps}"`, () => {});
  }

  // Email once per outage.
  if (!alreadyActive) {
    await sendEmail(
      "⚠ SmartHub: LOGIN REQUIRED — order processing paused",
      body + "\r\n\r\nThis is an automated alert. You will get a follow-up email when the session is restored."
    );
  }
}

export async function clearSessionAlert() {
  let cleared = false;
  for (const p of alertPaths()) {
    try {
      if (fs.existsSync(p)) {
        fs.unlinkSync(p);
        cleared = true;
      }
    } catch {
      /* ignore */
    }
  }
  if (cleared) {
    log.ok("Session healthy — cleared previous LOGIN-REQUIRED alert.");
    // Notify that processing has resumed.
    await sendEmail(
      "✅ SmartHub: session restored — processing resumed",
      `The SmartHub session is healthy again and order processing has resumed.\r\n\r\nRestored: ${new Date().toLocaleString()}`
    );
  }
}
