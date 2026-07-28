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
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { queue } from "./src/queue.js";
import { getClient, getSessionState, doLogin, closeClient } from "./src/agent.js";
import { runCycle, startScheduler } from "./src/scheduler.js";
import { printNewLabels, reprintLast, printDayIST, openFile } from "./src/print.js";
import { marketStatus } from "./src/status.js";
import { getRecentLogs, log } from "./src/log.js";
import { todayIST, LABELS_DIR } from "./src/config.js";
import { listPeers, sharedSecret, isHub } from "./src/peers.js";
import { mergePdfBuffers, mergePickRows } from "./src/merge.js";
import { writeRowsToXlsx } from "./src/picklist.js";
import { store } from "./src/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4545;

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

let lastCycleAt = null;
let lastSummary = null; // cached rows from the last /api/summary call

// --- Peer health (hub only): a lightweight background ping of each configured
// peer's own /api/status (cheap — no browser/session touched on the peer side)
// so the control page can show "online"/"unreachable" for each machine without
// waiting for a print action to find out. -------------------------------------
let peerHealth = {}; // name -> { url, online, checkedAt }

async function checkPeerHealth() {
  for (const peer of listPeers()) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const r = await fetch(`${peer.url}/api/status`, { signal: controller.signal });
      peerHealth[peer.name] = { url: peer.url, online: r.ok, checkedAt: new Date().toISOString() };
    } catch {
      peerHealth[peer.name] = { url: peer.url, online: false, checkedAt: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
    }
  }
}
if (isHub()) {
  checkPeerHealth();
  setInterval(checkPeerHealth, 20000);
}

app.get("/api/status", (req, res) => {
  res.json({
    host: os.hostname(),
    date: todayIST(),
    role: isHub() ? "hub" : "processor",
    sessionAlive: getSessionState(),
    lastSummary,
    peers: Object.entries(peerHealth).map(([name, v]) => ({ name, ...v })),
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

// --- Cross-machine combined printing (hub machine only has peers configured;
// any machine can SERVE a peer request if it has the shared secret set) ------

// Verifies X-Agent-Token against config/peers.json's sharedSecret. Refuses if
// no secret is configured (safe default — must be set up deliberately).
function peerAuth(req, res, next) {
  const secret = sharedSecret();
  if (!secret) return res.status(503).json({ error: "Peer auth not configured (config/peers.json missing sharedSecret)." });
  if (req.header("x-agent-token") !== secret) return res.status(401).json({ error: "Invalid or missing agent token." });
  next();
}

// Called BY another agent (the hub) to run this machine's own print-new-labels
// and hand back the PDF bytes + pick-manifest rows for merging. This machine's
// own idempotency/print-state bookkeeping happens exactly as normal.
app.post("/api/peer/print", peerAuth, async (req, res) => {
  try {
    const results = await queue.run("peer-print", async () => {
      const client = await getClient();
      return printNewLabels(client, { open: false });
    });
    const payload = results.map((r) => ({
      channel: r.channel,
      count: r.count,
      pdfBase64: fs.readFileSync(r.file).toString("base64"),
      pickRows: r.pickRows || [],
    }));
    res.json({ results: payload });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function fetchPeer(peer) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000); // peer may be mid-cycle; allow up to 3 min
  try {
    const r = await fetch(`${peer.url}/api/peer/print`, {
      method: "POST",
      headers: { "X-Agent-Token": sharedSecret() },
      signal: controller.signal,
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${r.status}`);
    }
    const j = await r.json();
    return { peer: peer.name, ok: true, results: j.results || [] };
  } catch (e) {
    return { peer: peer.name, ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// The HUB machine's real "Print New Labels" action: prints locally AND pulls
// from every configured peer, then merges same-channel PDFs + pick-manifests
// into one combined set. Gracefully degrades to local-only if a peer is
// unreachable (never fails the whole action for that).
app.post("/api/print-combined", async (req, res) => {
  try {
    const peers = listPeers();
    const [localSettled, peerSettled] = await Promise.allSettled([
      queue.run("print", async () => {
        const client = await getClient();
        return printNewLabels(client, { open: false });
      }),
      Promise.all(peers.map(fetchPeer)),
    ]);

    const bySource = new Map(); // channel -> { pdfBuffers, pickRowArrays, counts, sourceNames }
    function addSource(channel, pdfBuf, pickRows, count, sourceName) {
      if (!bySource.has(channel)) bySource.set(channel, { pdfBuffers: [], pickRowArrays: [], counts: [], sourceNames: [] });
      const b = bySource.get(channel);
      b.pdfBuffers.push(pdfBuf);
      b.pickRowArrays.push(pickRows);
      b.counts.push(count);
      b.sourceNames.push(sourceName);
    }

    const warnings = [];
    if (localSettled.status === "fulfilled") {
      for (const r of localSettled.value) addSource(r.channel, fs.readFileSync(r.file), r.pickRows || [], r.count, "local");
    } else {
      warnings.push(`Local print failed: ${localSettled.reason.message}`);
    }

    if (peerSettled.status === "fulfilled") {
      for (const p of peerSettled.value) {
        if (!p.ok) {
          warnings.push(`${p.peer} unreachable (${p.error}) — its labels are NOT included.`);
          continue;
        }
        for (const r of p.results) addSource(r.channel, Buffer.from(r.pdfBase64, "base64"), r.pickRows || [], r.count, p.peer);
      }
    } else {
      warnings.push(`Peer fetch failed: ${peerSettled.reason.message}`);
    }

    if (!bySource.size) {
      res.json({ message: warnings.length ? `No labels. ${warnings.join(" ")}` : "No new labels to print.", warnings });
      return;
    }

    const day = printDayIST();
    const dayDir = path.join(LABELS_DIR, day);
    fs.mkdirSync(dayDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(11, 19);

    const combinedFiles = [];
    const summaryLines = [];
    for (const [channel, b] of bySource) {
      const totalCount = b.counts.reduce((s, c) => s + c, 0);
      const mergedPdf = await mergePdfBuffers(b.pdfBuffers);
      const file = path.join(dayDir, `combined-${day}-${channel}-${stamp}-${totalCount}orders.pdf`);
      fs.writeFileSync(file, mergedPdf);
      combinedFiles.push(file);

      const mergedRows = mergePickRows(b.pickRowArrays);
      let pickFile = null;
      if (mergedRows.length) {
        pickFile = path.join(dayDir, `combined-picklist-${day}-${channel}-${stamp}.xlsx`);
        await writeRowsToXlsx(mergedRows, pickFile);
        combinedFiles.push(pickFile);
      }

      summaryLines.push(`${channel}: ${totalCount} (${b.sourceNames.join("+")})`);
      openFile(file);
      if (pickFile) openFile(pickFile);
    }

    store.setLastPrint(combinedFiles);
    log.ok(`Combined print: ${summaryLines.join(", ")}`);

    const message = `Printed combined: ${summaryLines.join(", ")}.` + (warnings.length ? ` ${warnings.join(" ")}` : "");
    res.json({ message, warnings });
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
