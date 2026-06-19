// notify: email notifications via SMTP (nodemailer).
// Credentials live in config/alerts.json (gitignored) — never in source.
// If the config is missing or disabled, email is silently skipped (no crash).

import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { ROOT } from "./config.js";
import { log } from "./log.js";

const CONFIG_PATH = path.join(ROOT, "config", "alerts.json");

export function loadAlertConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

export function emailConfigured() {
  const c = loadAlertConfig();
  return !!(c && c.email && c.email.enabled && c.email.user && c.email.pass && c.email.to);
}

// Send an email. Returns true on success, false otherwise. Never throws.
export async function sendEmail(subject, text) {
  const c = loadAlertConfig();
  if (!emailConfigured()) {
    log.warn("Email not configured (config/alerts.json) — skipping email notification.");
    return false;
  }
  const e = c.email;
  try {
    const transporter = nodemailer.createTransport({
      host: e.smtpHost,
      port: e.smtpPort,
      secure: e.secure !== false, // true for 465
      auth: { user: e.user, pass: e.pass },
    });
    await transporter.sendMail({
      from: e.from || e.user,
      to: e.to,
      subject,
      text,
    });
    log.ok(`Email sent to ${e.to}: "${subject}"`);
    return true;
  } catch (err) {
    log.err(`Email send failed: ${err.message}`);
    return false;
  }
}
