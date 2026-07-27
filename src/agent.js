// Manages ONE persistent SmartHubClient (browser context) for the whole server
// process, reused across scheduled cycles and manual button actions. All uses
// go through the job queue (src/queue.js) so only one action touches the
// browser at a time.
//
// Login is special: it needs a VISIBLE window for OTP entry, and Chromium only
// allows one instance per profile — so logging in closes the persistent
// (off-screen) client first, then reopens it after.

import { SmartHubClient } from "./api.js";
import { log } from "./log.js";

let client = null;
let sessionAlive = null; // last known state (null = unknown yet)

export async function getClient() {
  if (!client) {
    log.info("Launching SmartHub browser session (off-screen)...");
    client = await SmartHubClient.launch({});
  }
  return client;
}

export async function closeClient() {
  if (client) {
    await client.close().catch(() => {});
    client = null;
  }
}

export function getSessionState() {
  return sessionAlive;
}

export async function checkSession() {
  try {
    const c = await getClient();
    sessionAlive = await c.checkSession();
  } catch (e) {
    log.warn(`checkSession error: ${e.message}`);
    sessionAlive = false;
  }
  return sessionAlive;
}

// Log in: close the persistent (off-screen) client, open a VISIBLE one for the
// user to complete OTP, poll until the session settles, then close it and let
// the next action reopen the persistent off-screen client fresh.
export async function doLogin({ timeoutMs = 5 * 60 * 1000, pollMs = 3000 } = {}) {
  await closeClient();
  log.info("Opening visible SmartHub login window...");
  const loginClient = await SmartHubClient.launch({ visible: true });
  const page = await loginClient.context.newPage();
  await page.goto("https://smarthub.amazon.in/", { waitUntil: "domcontentloaded" }).catch(() => {});

  const deadline = Date.now() + timeoutMs;
  let ok = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollMs));
    ok = await loginClient.checkSession().catch(() => false);
    if (ok) break;
  }
  await loginClient.close().catch(() => {});
  sessionAlive = ok;
  log.info(ok ? "Login successful — session is live." : "Login window timed out without a confirmed session.");
  return ok;
}
