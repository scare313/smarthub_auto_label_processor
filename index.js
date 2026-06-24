#!/usr/bin/env node
// SmartHub order auto-processor — Phase 1 CLI.
//
// Commands:
//   login                         Open a browser to log into Amazon SmartHub once (OTP).
//                                 The session persists in ./profile for later runs.
//
//   run [options]                 Process orders. DRY-RUN by default (safe).
//     --channel amazon|flipkart   Which marketplace (default: all configured)
//     --date YYYY-MM-DD           Ship date (default: today, IST)
//     --live                      Actually pack + generate labels (IRREVERSIBLE)
//     --limit N                   Process at most N shipments (e.g. --limit 1)
//     --headless                  Run browser headless (default: headed)
//
//   status                        Show local processed/audit summary.
//
// Examples:
//   node index.js login
//   node index.js run --channel flipkart --date 2026-06-20         (dry-run)
//   node index.js run --channel flipkart --date 2026-06-20 --live  (real)

import { BASE_URL, CHANNELS, resolveChannel } from "./src/config.js";
import { SmartHubClient, SessionExpiredError } from "./src/api.js";
import { processChannel } from "./src/pipeline.js";
import { dumpPicklist } from "./src/picklist.js";
import { printNewLabels, reprintLast } from "./src/print.js";
import { activateChannel } from "./src/activate.js";
import { raiseSessionAlert, clearSessionAlert } from "./src/alert.js";
import { sendEmail, emailConfigured } from "./src/notify.js";
import { store } from "./src/store.js";
import { log } from "./src/log.js";

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

// Today's date in IST (Asia/Kolkata), formatted YYYY-MM-DD.
function todayIST() {
  const f = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return f.format(new Date());
}

async function cmdLogin() {
  log.info("Opening SmartHub. Log in with your Amazon credentials + OTP, then press ENTER here.");
  const client = await SmartHubClient.launch({ visible: true });
  const page = await client.context.newPage();
  await page.goto(BASE_URL + "/", { waitUntil: "domcontentloaded" }).catch(() => {});
  await new Promise((resolve) => {
    process.stdin.resume();
    process.stdin.once("data", () => resolve());
  });
  const ok = await client.checkSession();
  if (ok) log.ok("Session is live and saved to ./profile. You can close this anytime.");
  else log.warn("Could not confirm session. Make sure you fully logged in before pressing ENTER.");
  await client.close();
  process.exit(0);
}

async function cmdRun(args) {
  const date = args.date || todayIST();
  const dryRun = !args.live;
  const headless = !!args.headless;
  const limit = args.limit !== undefined ? Number(args.limit) : Infinity;

  const channelKeys = args.channel ? [args.channel] : Object.keys(CHANNELS);
  const channels = channelKeys.map(resolveChannel);

  if (!dryRun) {
    log.warn("LIVE MODE — this will pack orders and generate REAL ship labels (irreversible).");
  } else {
    log.info("DRY-RUN — read-only. No orders will be packed or labelled. Use --live to execute.");
  }

  const client = await SmartHubClient.launch({ headless });
  try {
    const alive = await client.checkSession();
    if (!alive) {
      log.err("Session expired or not logged in. Run:  node index.js login");
      await client.close();
      process.exit(2);
    }

    const results = [];
    for (const ch of channels) {
      try {
        results.push(await processChannel(client, { channel: ch, date, dryRun, limit }));
      } catch (e) {
        if (e instanceof SessionExpiredError) {
          log.err(`Session died mid-run: ${e.message}`);
          log.err("Stopping. Re-login with:  node index.js login");
          store.audit(ch.key, "session-expired", e.message);
          break;
        }
        log.err(`[${ch.key}] Failed: ${e.message}`);
        store.audit(ch.key, "error", e.message);
      }
    }

    log.info("Summary:");
    for (const r of results) {
      log.info(`   ${r.channel}: ${r.shipments} shipment(s), ${r.processed} processed${r.dryRun ? " (dry-run)" : ""}`);
    }
  } finally {
    await client.close();
  }
}

async function cmdTestAlert() {
  if (!emailConfigured()) {
    log.err("Email not configured. Copy config/alerts.example.json to config/alerts.json and fill it in.");
    process.exit(1);
  }
  log.info("Sending test email...");
  const ok = await sendEmail(
    "✅ SmartHub Auto-Processor — test email",
    `This is a test alert from your SmartHub auto-processor.\r\n\r\nIf you received this, email notifications are working.\r\n\r\nSent: ${new Date().toLocaleString()}`
  );
  process.exit(ok ? 0 : 1);
}

function cmdStatus() {
  const s = store.all();
  const processed = Object.values(s.processed);
  log.info(`Processed shipments: ${processed.length}`);
  const recent = processed.slice(-10);
  for (const r of recent) {
    log.info(`   ${r.date} ${r.channel} ${r.orderId} -> ${r.trackingId || "(no tracking)"} ${r.labelFile ? "[label saved]" : ""}`);
  }
  log.info(`Audit entries: ${s.audit.length}`);
}

async function cmdActivate(args) {
  const dryRun = !args.live;
  const headless = !!args.headless;
  const channelKeys = args.channel ? [args.channel] : Object.keys(CHANNELS);
  const channels = channelKeys.map(resolveChannel);

  log.info(dryRun ? "ACTIVATE DRY-RUN — no pick lists will be created." : "ACTIVATE LIVE — creating pick lists.");
  const client = await SmartHubClient.launch({ headless });
  try {
    const alive = await client.checkSession();
    if (!alive) {
      log.err("Session expired. Run:  node index.js login");
      process.exit(2);
    }
    for (const ch of channels) {
      try {
        await activateChannel(client, { channel: ch, dryRun });
      } catch (e) {
        log.err(`[${ch.key}] ${e.message}`);
      }
    }
  } finally {
    await client.close();
  }
}

// Unattended entrypoint for Windows Task Scheduler: activate today's pick lists,
// then label all eligible orders, for every channel. Always LIVE. Raises a
// session alert if the login has expired so an employee knows to re-login.
async function cmdAuto(args) {
  const date = args.date || todayIST();
  const channels = Object.keys(CHANNELS).map(resolveChannel);

  log.info(`AUTO cycle — ${date} — channels: ${channels.map((c) => c.key).join(", ")}`);
  const client = await SmartHubClient.launch({ headless: true });
  try {
    const alive = await client.checkSession();
    if (!alive) {
      await raiseSessionAlert("checkSession failed at start of auto cycle");
      await client.close();
      process.exit(2);
    }
    await clearSessionAlert(); // healthy

    for (const ch of channels) {
      try {
        await activateChannel(client, { channel: ch, dryRun: false });
        await processChannel(client, { channel: ch, date, dryRun: false, limit: Infinity });
      } catch (e) {
        if (e instanceof SessionExpiredError) {
          await raiseSessionAlert(e.message);
          store.audit(ch.key, "session-expired", e.message);
          break;
        }
        log.err(`[${ch.key}] auto cycle error: ${e.message}`);
        store.audit(ch.key, "auto-error", e.message);
      }
    }
    log.ok("AUTO cycle complete.");
  } finally {
    await client.close();
  }
}

async function cmdPrint(args) {
  const date = args.date || undefined; // default: all unprinted regardless of date
  const headless = !!args.headless;
  const channelKeys = args.channel ? [args.channel] : undefined; // default: all
  const open = !args["no-open"];

  log.info("PRINT — combining unprinted labels into PDF(s).");
  const client = await SmartHubClient.launch({ headless });
  try {
    const alive = await client.checkSession();
    if (!alive) {
      log.err("Session expired or not logged in. Run:  node index.js login");
      process.exit(2);
    }
    await printNewLabels(client, { channelKeys, date, open });
  } catch (e) {
    if (e instanceof SessionExpiredError) {
      log.err(`Session died: ${e.message}. Re-login with:  node index.js login`);
    } else {
      log.err(e.message);
    }
  } finally {
    await client.close();
  }
}

function cmdReprint() {
  // Pure local file reopen — no browser/session needed.
  reprintLast();
}

async function cmdPicklist(args) {
  const date = args.date || todayIST();
  const headless = !!args.headless;
  const channelKeys = args.channel ? [args.channel] : Object.keys(CHANNELS);
  const channels = channelKeys.map(resolveChannel);

  log.info("PICKLIST diagnostic — read-only. Dumps live validate data to inspect SKU/quantity fields.");
  const client = await SmartHubClient.launch({ headless });
  try {
    const alive = await client.checkSession();
    if (!alive) {
      log.err("Session expired or not logged in. Run:  node index.js login");
      process.exit(2);
    }
    for (const ch of channels) {
      try {
        await dumpPicklist(client, { channel: ch, date });
      } catch (e) {
        if (e instanceof SessionExpiredError) {
          log.err(`Session died: ${e.message}`);
          break;
        }
        log.err(`[${ch.key}] Failed: ${e.message}`);
      }
    }
  } finally {
    await client.close();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  const cmd = argv[0];
  const args = parseArgs(argv.slice(1));

  switch (cmd) {
    case "login":
      return cmdLogin();
    case "run":
      return cmdRun(args);
    case "status":
      return cmdStatus();
    case "picklist":
      return cmdPicklist(args);
    case "print":
      return cmdPrint(args);
    case "reprint":
      return cmdReprint();
    case "activate":
      return cmdActivate(args);
    case "auto":
      return cmdAuto(args);
    case "test-alert":
      return cmdTestAlert();
    default:
      console.log(`SmartHub order auto-processor

Usage:
  node index.js login                                  Log in once (persists session)
  node index.js auto [--date YYYY-MM-DD]               Unattended: activate + label all channels
                                                       (entrypoint for Windows Task Scheduler)
  node index.js activate [--channel ...] [--live]      Auto-create pick lists (DRY-RUN by default)
  node index.js run [--channel amazon|flipkart]        Label orders (DRY-RUN by default)
            [--date YYYY-MM-DD] [--live] [--limit N] [--headless]
  node index.js print [--channel ...] [--date ...]     Combine unprinted labels -> PDF + open
            [--no-open] [--headless]
  node index.js reprint                                Reopen the last print PDF(s) (no re-processing)
  node index.js picklist [--channel ...] [--date ...]  SKU pick manifest (.xlsx)
  node index.js status                                 Show local processing summary
  node index.js test-alert                             Send a test email (verify alerts)

Configured channels: ${Object.keys(CHANNELS).join(", ")}
`);
      process.exit(cmd ? 1 : 0);
  }
}

main().catch((e) => {
  log.err(e.stack || e.message);
  process.exit(1);
});
