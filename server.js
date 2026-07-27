#!/usr/bin/env node
// SmartHub agent web server — Phase 1 of the CLI/.bat/Task-Scheduler replacement.
//
// Runs on a Windows account-processor machine (A or B). Serves a control page
// with buttons (Process/Print/Print all/Reprint/Status/Login) and runs the
// 15-min processing cycle internally, replacing Windows Task Scheduler.
//
// Everything here is a thin wrapper around the existing src/ modules — no
// pack/label/print logic changes. A single job queue (src/queue.js) ensures
// the scheduled cycle and manual button clicks never run at the same time.
//
// Start with:  node server.js   (or `npm run serve`)

import express from "express";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { queue } from "./src/queue.js";
import { getClient, getSessionState, doLogin, closeClient } from "./src/agent.js";
import { runCycle, startScheduler } from "./src/scheduler.js";
import { printNewLabels, reprintLast } from "./src/print.js";
import { marketStatus } from "./src/status.js";
import { getRecentLogs, log } from "./src/log.js";
import { todayIST } from "./src/config.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4545;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let lastCycleAt = null;
let lastSummary = null; // cached rows from the last /api/summary call

app.get("/api/status", (req, res) => {
  res.json({
    host: os.hostname(),
    date: todayIST(),
    sessionAlive: getSessionState(),
    lastSummary,
    queue: { busy: queue.busy, current: queue.current, pending: queue.pendingNames },
    lastCycleAt,
  });
});

app.get("/api/log", (req, res) => res.json(getRecentLogs()));

app.post("/api/run", async (req, res) => {
  try {
    const result = await queue.run("manual-run", async () => {
      const r = await runCycle({});
      lastCycleAt = new Date().toISOString();
      return r;
    });
    res.json({ message: result.ok ? "Processing complete." : `Stopped: ${result.reason}` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/print", async (req, res) => {
  try {
    const results = await queue.run("print", async () => {
      const client = await getClient();
      return printNewLabels(client, { open: false });
    });
    const count = results.reduce((s, r) => s + r.count, 0);
    res.json({ message: results.length ? `Printed ${count} label(s).` : "No new labels to print.", results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/print-all", async (req, res) => {
  try {
    const results = await queue.run("print-all", async () => {
      const client = await getClient();
      return printNewLabels(client, { open: false, all: true });
    });
    const count = results.reduce((s, r) => s + r.count, 0);
    res.json({ message: results.length ? `Printed ALL: ${count} label(s).` : "No labels found for today.", results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/reprint", async (req, res) => {
  try {
    const files = await queue.run("reprint", async () => reprintLast());
    res.json({ message: files.length ? `Reopened ${files.length} file(s).` : "No previous print batch found." });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/summary", async (req, res) => {
  try {
    const rows = await queue.run("summary", async () => {
      const client = await getClient();
      return marketStatus(client, { date: todayIST() });
    });
    lastSummary = rows;
    res.json({ message: "Status updated.", rows });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/login", (req, res) => {
  // Respond immediately — login can take minutes (waiting on OTP entry in the
  // visible window that pops up on THIS server machine's screen).
  res.json({ message: "Opening the login window on the server machine. Complete OTP there." });
  queue.run("login", () => doLogin()).catch((e) => log.err(`Login failed: ${e.message}`));
});

app.listen(PORT, () => {
  log.ok(`SmartHub control server listening on http://0.0.0.0:${PORT}  (open via this machine's Tailscale IP)`);

  // Set AGENT_NO_SCHEDULE=1 to start the server WITHOUT the internal 15-min
  // cycle — useful to verify the control page/session/login first before
  // trusting it to process live orders unattended.
  if (process.env.AGENT_NO_SCHEDULE === "1") {
    log.warn("AGENT_NO_SCHEDULE=1 — internal scheduler NOT started. Use the Process button manually.");
    return;
  }
  startScheduler(() =>
    queue.run("scheduled-cycle", async () => {
      const r = await runCycle({});
      lastCycleAt = new Date().toISOString();
      return r;
    })
  );
});

// Close the persistent browser cleanly on shutdown (Ctrl+C / service stop /
// Windows logoff) so it never orphans a Chromium process that locks the
// profile and blocks the next launch.
let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.warn(`Received ${signal} — closing browser session and exiting...`);
  await closeClient().catch(() => {});
  process.exit(0);
}
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
// Also on unexpected crashes, best-effort cleanup before the process dies.
process.on("uncaughtException", async (e) => {
  log.err(`Uncaught exception: ${e.stack || e.message}`);
  await closeClient().catch(() => {});
  process.exit(1);
});
