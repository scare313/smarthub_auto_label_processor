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
import { marketStatus, forecast } from "./src/status.js";
import { getRecentLogs, log } from "./src/log.js";
import { todayIST, LABELS_DIR, DATA_DIR, MAX_ORDER_ATTEMPTS, BACKUP_RETENTION_DAYS, resolveChannel } from "./src/config.js";
import { listPeers, sharedSecret, isHub, selfName } from "./src/peers.js";
import { checkHeartbeat } from "./src/heartbeat.js";
import { VERSION, versionLine } from "./src/version.js";
import { mergePdfBuffers, mergePickRows } from "./src/merge.js";
import { writeRowsToXlsx } from "./src/picklist.js";
import { store } from "./src/store.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 4545;

const app = express();
// Body parsing. The default 100kb is right for every route EXCEPT the peer
// backup, which carries a whole state.json - already 3MB here and growing - and
// was failing with PayloadTooLargeError on every exchange, silently leaving the
// off-machine backup empty. That one path is parsed separately, and only AFTER
// peerAuth, so an unauthenticated caller can never make us buffer megabytes.
const BIG_BODY = "32mb";
const bigBodyPaths = new Set(["/api/peer/backup"]);
app.use((req, res, next) => {
  if (bigBodyPaths.has(req.path)) return next(); // handled on the route itself
  express.json()(req, res, next);
});
app.use(express.static(path.join(__dirname, "public")));

let lastCycleAt = null;

// Orders already booked for the next few days. Refreshed HOURLY, not per cycle:
// it costs one orders/summary call per channel per day, and a count for a day
// that has not arrived yet does not change minute to minute.
let upcoming = [];
let upcomingAt = 0;
const UPCOMING_EVERY_MS = 60 * 60 * 1000;
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
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const s = await r.json();
      // Carry the peer's own pending count + cached status rows so the hub can
      // show a combined "waiting to print" total and a both-accounts table.
      peerHealth[peer.name] = {
        url: peer.url,
        online: true,
        pending: s.pending ?? 0,
        summary: s.lastSummary || null,
        sessionAlive: s.sessionAlive ?? null,
        lastCycleAt: s.lastCycleAt ?? null, // so the hub can spot a stalled peer
        version: s.version?.id ?? null,      // so a machine left on old code is visible
        upcoming: Array.isArray(s.upcoming) ? s.upcoming : [],
        checkedAt: new Date().toISOString(),
      };
    } catch {
      peerHealth[peer.name] = { url: peer.url, online: false, pending: 0, summary: null, sessionAlive: null, lastCycleAt: null, version: null, upcoming: [], checkedAt: new Date().toISOString() };
    } finally {
      clearTimeout(timer);
    }
  }
}
if (isHub()) {
  checkPeerHealth();
  setInterval(checkPeerHealth, 20000);
  // Swap state backups with each peer once a day. The function is a no-op if it
  // already ran today, so a half-hourly tick just means "catch up whenever the
  // peer comes back online".
  const exchange = () => exchangePeerBackups().catch((e) => log.warn(`Peer backup exchange failed: ${e.message}`));
  setTimeout(exchange, 60 * 1000); // after startup settles
  setInterval(exchange, 30 * 60 * 1000);
}

// Watchdog: emails once if processing stops here or on a peer, and once when it
// recovers. Runs every 5 min — often enough to be useful, rare enough that a
// failing email server can't spam. Never throws into the event loop.
setInterval(() => {
  checkHeartbeat({
    selfName: selfName() || os.hostname(),
    lastCycleAt,
    peers: Object.entries(peerHealth).map(([name, v]) => ({
      name,
      online: v.online,
      lastCycleAt: v.lastCycleAt,
    })),
  }).catch((e) => log.warn(`Heartbeat check failed: ${e.message}`));
}, 5 * 60 * 1000);

app.get("/api/status", (req, res) => {
  // Local labels waiting to be printed — cheap (reads the JSON store, no
  // browser/session involved), so it's safe to poll and to expose to peers.
  let pending = 0;
  try {
    pending = store.listUnprinted({}).length;
  } catch {}

  // A broken state file is the one condition under which nothing else on this
  // page can be trusted, so it goes out with every status poll and the page
  // shows it as a banner.
  let health = { ok: true };
  try {
    health = store.health();
  } catch (e) {
    health = { ok: false, reason: e.message };
  }

  let exceptions = { failing: 0, flagged: 0 };
  try {
    exceptions = store.failureCounts();
  } catch {}

  res.json({
    version: VERSION,
    upcoming,
    host: os.hostname(),
    name: selfName() || os.hostname(),
    date: todayIST(),
    role: isHub() ? "hub" : "processor",
    sessionAlive: getSessionState(),
    pending,
    health,
    exceptions,
    lastSummary,
    peers: Object.entries(peerHealth).map(([name, v]) => ({ name, ...v })),
    queue: { busy: queue.busy, current: queue.current, pending: queue.pendingNames },
    lastCycleAt,
  });
});

// --- Exceptions: orders that failed repeatedly (item 2) ---------------------

// Why is an order not being activated? Dumps the three things activation
// actually looks at, raw and unfiltered, so the answer is visible instead of
// inferred. Read-only.
//
// Added because "No new pick lists to activate" is true but useless: it does
// not say whether SmartHub offered nothing, or offered something we filtered
// out. Guessing at that cost 13 orders and most of a day.
app.get("/api/activation-debug", async (req, res) => {
  try {
    const key = String(req.query.channel || "flipkart");
    const ch = resolveChannel(key);
    const out = await queue.run("activation-debug", async () => {
      const client = await getClient();
      const cpts = await client.getRecommendedCpts();
      const windowsWithNew = (cpts || []).filter((c) => (c.newOrders || 0) > 0);
      const pickupTimes = [...new Set(windowsWithNew.map((c) => c.startTime))];
      const recommended = pickupTimes.length ? await client.getRecommendedLists(pickupTimes) : [];
      let missed = [];
      let missedCount = null;
      try {
        missed = (await client.getMissedLists()) || [];
        missedCount = await client.getMissedCount();
      } catch (e) {
        missed = [{ error: e.message }];
      }
      // Say explicitly WHY each card was or was not taken, instead of leaving
      // the reader to re-derive the filter.
      const verdict = (c) => ({
        expectedShipEpoch: c.expectedShipEpoch,
        shipDate: c.expectedShipEpoch ? new Date(c.expectedShipEpoch * 1000).toISOString() : null,
        numberOfOrders: c.numberOfOrders,
        salesChannel: c?.displayableSalesChannel?.salesChannel,
        pickTaskNotGenerated: c.pickTaskNotGenerated,
        wouldActivate:
          c?.displayableSalesChannel?.salesChannel === ch.salesChannel &&
          !!c.pickTaskNotGenerated &&
          (c.numberOfOrders || 0) > 0,
      });
      return {
        channel: key,
        salesChannel: ch.salesChannel,
        cptsTotal: (cpts || []).length,
        cptsWithNewOrders: windowsWithNew.map((c) => ({ startTime: c.startTime, newOrders: c.newOrders })),
        recommended: (recommended || []).map(verdict),
        missedCount,
        missed: missed.map((c) => (c.error ? c : verdict(c))),
      };
    });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/exceptions", (req, res) => {
  try {
    res.json({
      counts: store.failureCounts(),
      failures: store.listFailures({ flaggedOnly: req.query.flagged === "1" }),
      maxAttempts: MAX_ORDER_ATTEMPTS,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Clear the failure history for one order, or for all of them, so the next
// cycle treats them as new. Does not touch SmartHub: if the underlying problem
// is still there the order simply fails again and re-parks.
app.post("/api/exceptions/retry", (req, res) => {
  try {
    if (req.body && req.body.all) {
      const n = store.unparkAll();
      log.info(`Exceptions cleared by operator: ${n} order(s) will be retried next cycle.`);
      store.audit("-", "retry-all", `${n} orders`);
      return res.json({ message: n ? `${n} order(s) will be retried on the next cycle.` : "Nothing to retry." });
    }
    const id = req.body && req.body.customerShipmentId;
    if (!id) return res.status(400).json({ error: "Pass customerShipmentId, or all:true." });
    const ok = store.unpark(String(id));
    if (!ok) return res.status(404).json({ error: `No failure record for ${id}.` });
    log.info(`Exception cleared by operator: ${id} will be retried next cycle.`);
    store.audit("-", "retry", String(id));
    res.json({ message: `${id} will be retried on the next cycle.` });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/log", (req, res) => res.json(getRecentLogs()));

// Refuse print actions while the state file is unreadable, BEFORE anything
// expensive happens. printNewLabels checks this too, but by then a browser has
// already been launched and a peer may already have been asked to print.
// Returns true if the caller should stop.
function blockedByState(res) {
  let health;
  try {
    health = store.health();
  } catch (e) {
    health = { ok: false, reason: e.message, hint: "" };
  }
  if (health.ok) return false;
  res.status(503).json({
    error: `Cannot print — ${health.reason}. ${health.hint || ""}`.trim(),
    health,
  });
  return true;
}

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
  if (blockedByState(res)) return;
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
  if (blockedByState(res)) return;
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
    // Optional `date` (YYYY-MM-DD) so a past day can be audited — e.g. checking
    // whether SmartHub had more orders on a date than we ever activated.
    const date = (req.body && /^\d{4}-\d{2}-\d{2}$/.test(req.body.date)) ? req.body.date : todayIST();
    const rows = await queue.run("summary", async () => {
      const client = await getClient();
      return marketStatus(client, { date });
    });
    // Only cache the status table when it is actually today's.
    if (date === todayIST()) lastSummary = rows;
    res.json({ message: `Status updated (${date}).`, date, rows });
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

// Peer-side half of the print confirmation handshake (item 5).
//
// The PDF this machine produces for the hub is an intermediate. The labels the
// warehouse actually uses come out of the hub's MERGED file, so until that file
// is on the hub's disk these orders must stay unprinted. If the hub crashes, the
// network drops, or the merge fails, the next print run includes them again —
// a duplicate is visible on the page count; a parcel with no label is not.
//
// batchId -> { ids, channel, at }. Swept after PEER_CONFIRM_TTL_MS so a hub that
// never confirms leaves no permanent growth; the orders simply stay unprinted,
// which is the safe side.
const pendingPeerPrints = new Map();
const PEER_CONFIRM_TTL_MS = 30 * 60 * 1000;

setInterval(() => {
  const cutoff = Date.now() - PEER_CONFIRM_TTL_MS;
  for (const [batchId, v] of pendingPeerPrints) {
    if (v.at < cutoff) {
      pendingPeerPrints.delete(batchId);
      log.warn(
        `Hub never confirmed print batch ${batchId} (${v.ids.length} order(s)). They remain UNPRINTED and will be included in the next print.`
      );
    }
  }
}, 5 * 60 * 1000);

// Called BY another agent (the hub) to run this machine's own print-new-labels
// and hand back the PDF bytes + pick-manifest rows for merging.
app.post("/api/peer/print", peerAuth, async (req, res) => {
  if (blockedByState(res)) return;
  try {
    // `all: true` = every label from today (not just unprinted), matching the
    // hub's "Print All Today's Labels" action.
    const all = !!(req.body && req.body.all);
    const results = await queue.run(all ? "peer-print-all" : "peer-print", async () => {
      const client = await getClient();
      return printNewLabels(client, { open: false, all, deferMark: true });
    });
    const payload = results.map((r) => {
      if (r.pendingIds && r.pendingIds.length) {
        pendingPeerPrints.set(r.batchId, { ids: r.pendingIds, channel: r.channel, at: Date.now() });
      }
      return {
        channel: r.channel,
        count: r.count,
        batchId: r.batchId,
        pdfBase64: fs.readFileSync(r.file).toString("base64"),
        pickRows: r.pickRows || [],
      };
    });
    res.json({ results: payload });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// The hub calls this once its merged file is safely written. Only now do these
// orders count as printed. Idempotent: confirming twice is a no-op, so a retried
// request cannot cause trouble.
app.post("/api/peer/confirm-print", peerAuth, (req, res) => {
  try {
    const batchIds = (req.body && req.body.batchIds) || [];
    const confirmed = [];
    const unknown = [];
    for (const batchId of batchIds) {
      const entry = pendingPeerPrints.get(batchId);
      if (!entry) {
        unknown.push(batchId);
        continue;
      }
      store.markPrinted(entry.ids, batchId);
      store.audit(entry.channel, "printed", `${entry.ids.length} confirmed by hub (batch ${batchId})`);
      pendingPeerPrints.delete(batchId);
      confirmed.push({ batchId, count: entry.ids.length });
    }
    const n = confirmed.reduce((s, c) => s + c.count, 0);
    if (n) log.ok(`Hub confirmed ${n} label(s) across ${confirmed.length} batch(es) — now marked printed.`);
    if (unknown.length) {
      // Already confirmed, or expired past the TTL. Either way nothing is lost:
      // unconfirmed orders are still unprinted and will print again.
      log.warn(`Hub confirmed unknown batch id(s): ${unknown.join(", ")} — ignored.`);
    }
    res.json({ confirmed, unknown });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

async function fetchPeer(peer, { all = false } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 180000); // peer may be mid-cycle; allow up to 3 min
  try {
    const r = await fetch(`${peer.url}/api/peer/print`, {
      method: "POST",
      headers: { "X-Agent-Token": sharedSecret(), "Content-Type": "application/json" },
      body: JSON.stringify({ all }),
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

// Tell a peer its labels are safely in the hub's merged file, so it can mark
// them printed (item 5). Called ONLY after every merged file is written.
//
// A peer running the older code returns no batchId, so there is nothing to
// confirm and it keeps its old behaviour of marking printed immediately. That
// keeps a mixed-version pair working, which matters because hub and peer are
// deployed by hand.
async function confirmPeer(peer, batchIds) {
  if (!batchIds.length) return { ok: true, skipped: true };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30000);
  try {
    const r = await fetch(`${peer.url}/api/peer/confirm-print`, {
      method: "POST",
      headers: { "X-Agent-Token": sharedSecret(), "Content-Type": "application/json" },
      body: JSON.stringify({ batchIds }),
      signal: controller.signal,
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      throw new Error(body.error || `HTTP ${r.status}`);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

// The HUB machine's real "Print New Labels" action: prints locally AND pulls
// from every configured peer, then merges same-channel PDFs + pick-manifests
// into one combined set. Gracefully degrades to local-only if a peer is
// unreachable (never fails the whole action for that).
app.post("/api/print-combined", async (req, res) => {
  if (blockedByState(res)) return;
  try {
    // Optional source filter: "all" (default), "local", or a peer's name.
    const source = (req.body && req.body.source) || "all";
    // allToday: every label from today rather than only unprinted ones —
    // "Print All Today's Labels", applied across ALL machines, not just local.
    const allToday = !!(req.body && req.body.all);
    const wantLocal = source === "all" || source === "local";
    const peers = listPeers().filter(() => source === "all" || source !== "local").filter((p) => source === "all" || source === p.name);
    const localLabel = selfName() || "local";

    const [localSettled, peerSettled] = await Promise.allSettled([
      wantLocal
        ? queue.run(allToday ? "print-all" : "print", async () => {
            const client = await getClient();
            return printNewLabels(client, { open: false, all: allToday });
          })
        : Promise.resolve([]),
      Promise.all(peers.map((p) => fetchPeer(p, { all: allToday }))),
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
      for (const r of localSettled.value) addSource(r.channel, fs.readFileSync(r.file), r.pickRows || [], r.count, localLabel);
    } else {
      warnings.push(`Local print failed: ${localSettled.reason.message}`);
    }

    // peer name -> batch ids awaiting confirmation once the merge is on disk.
    const peerBatches = new Map();
    if (peerSettled.status === "fulfilled") {
      for (const p of peerSettled.value) {
        if (!p.ok) {
          warnings.push(`${p.peer} unreachable (${p.error}) — its labels are NOT included.`);
          continue;
        }
        for (const r of p.results) {
          addSource(r.channel, Buffer.from(r.pdfBase64, "base64"), r.pickRows || [], r.count, p.peer);
          if (r.batchId) {
            if (!peerBatches.has(p.peer)) peerBatches.set(p.peer, []);
            peerBatches.get(p.peer).push(r.batchId);
          }
        }
      }
    } else {
      warnings.push(`Peer fetch failed: ${peerSettled.reason.message}`);
    }

    if (!bySource.size) {
      const none = allToday ? "No labels found for today." : "No new labels to print.";
      res.json({ message: warnings.length ? `${none} ${warnings.join(" ")}` : none, warnings });
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
      const prefix = allToday ? "combined-all" : "combined";
      const file = path.join(dayDir, `${prefix}-${day}-${channel}-${stamp}-${totalCount}orders.pdf`);
      fs.writeFileSync(file, mergedPdf);
      combinedFiles.push(file);

      const mergedRows = mergePickRows(b.pickRowArrays);
      let pickFile = null;
      if (mergedRows.length) {
        pickFile = path.join(dayDir, `${prefix}-picklist-${day}-${channel}-${stamp}.xlsx`);
        await writeRowsToXlsx(mergedRows, pickFile);
        combinedFiles.push(pickFile);
      }

      // Per-source breakdown, e.g. "amazon: 20 (shop 12 + bludo 8)"
      const breakdown = b.sourceNames.map((n, i) => `${n} ${b.counts[i]}`).join(" + ");
      summaryLines.push(`${channel}: ${totalCount} (${breakdown})`);
      openFile(file);
      if (pickFile) openFile(pickFile);
    }

    store.setLastPrint(combinedFiles);

    // Every merged file is now on disk, so it is safe to tell each peer its
    // labels really were printed (item 5). Deliberately AFTER the writes: a
    // confirmation sent earlier could mark orders printed for a file that never
    // materialised, and those parcels would never get a label.
    for (const [peerName, batchIds] of peerBatches) {
      const peer = listPeers().find((p) => p.name === peerName);
      if (!peer) continue;
      const c = await confirmPeer(peer, batchIds);
      if (!c.ok) {
        // The peer keeps them unprinted, so they will come back in the next
        // print run. Say so, because that next run WILL be a duplicate of labels
        // that are already in the PDF now sitting in the printer.
        warnings.push(
          `Could not confirm the print to ${peerName} (${c.error}) — its ${batchIds.length} batch(es) stay marked unprinted there and will appear again in the next print.`
        );
        log.warn(`Print confirmation to ${peerName} failed: ${c.error}`);
      }
    }

    log.ok(`Combined print: ${summaryLines.join(", ")}`);

    const message = `Printed — ${summaryLines.join(" · ")}` + (warnings.length ? ` — ${warnings.join(" ")}` : "");
    res.json({ message, warnings });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Off-machine state backup (item 4) --------------------------------------
//
// A daily copy of state.json is kept locally, but a local copy does not survive
// the failure that matters most: the disk or the machine itself. The two agents
// already trust each other over Tailscale, so each keeps the other's backup.
// Nothing sensitive is involved — state.json holds order ids, tracking ids and
// SKUs, no customer names or addresses.

// The peer chooses its own name, so it decides part of a filename we write.
// Keep that to a single safe path segment: letters, digits, dot, dash and
// underscore, no leading dot, never empty.
function safePeerName(raw) {
  const cleaned = String(raw)
    .replace(/[^A-Za-z0-9._-]/g, "_")
    .replace(/^\.+/, "");
  return cleaned.slice(0, 40) || "peer";
}

// A peer asks for our current state so it can keep a copy.
app.get("/api/peer/state", peerAuth, (req, res) => {
  const text = store.snapshotText();
  if (!text) return res.status(503).json({ error: "State unavailable (no state file yet, or it is degraded)." });
  res.json({ name: selfName() || os.hostname(), date: todayIST(), state: text });
});

// A peer hands us its state to keep. Stored under its own name so the two
// machines' backups can never collide.
app.post("/api/peer/backup", peerAuth, express.json({ limit: BIG_BODY }), (req, res) => {
  try {
    const name = safePeerName((req.body && req.body.name) || "peer");
    const date = String((req.body && req.body.date) || todayIST()).replace(/[^0-9-]/g, "");
    const text = req.body && req.body.state;
    if (typeof text !== "string" || !text.length) return res.status(400).json({ error: "Missing state." });
    // Parse before storing: a backup we cannot read is not a backup.
    JSON.parse(text);
    const dir = path.join(DATA_DIR, "peer-backups");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${name}-state-${date}.json`);
    fs.writeFileSync(file, text);
    res.json({ message: `Stored ${file}`, bytes: text.length });
  } catch (e) {
    res.status(400).json({ error: `Rejected: ${e.message}` });
  }
});

// Hub-driven, once per IST day: pull each peer's state and push ours to it.
// Best-effort — a failed exchange is logged and retried tomorrow, and never
// interferes with order processing.
let lastExchangeDay = null;

async function exchangePeerBackups() {
  const day = todayIST();
  if (lastExchangeDay === day) return;
  const peers = listPeers();
  if (!peers.length || !sharedSecret()) return;
  if (store.isDegraded()) return; // nothing worth exchanging, and nothing safe to overwrite

  lastExchangeDay = day; // set before the work so a slow run cannot stack up
  const dir = path.join(DATA_DIR, "peer-backups");
  for (const peer of peers) {
    // Pull theirs.
    try {
      const r = await fetch(`${peer.url}/api/peer/state`, { headers: { "X-Agent-Token": sharedSecret() } });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      JSON.parse(j.state);
      fs.mkdirSync(dir, { recursive: true });
      const safeName = safePeerName(j.name || peer.name);
      fs.writeFileSync(path.join(dir, `${safeName}-state-${day}.json`), j.state);
      log.info(`Kept a backup of ${peer.name}'s state for ${day}.`);
    } catch (e) {
      log.warn(`Could not back up ${peer.name}'s state: ${e.message}`);
    }
    // Push ours.
    try {
      const text = store.snapshotText();
      if (!text) throw new Error("no local state to send");
      const r = await fetch(`${peer.url}/api/peer/backup`, {
        method: "POST",
        headers: { "X-Agent-Token": sharedSecret(), "Content-Type": "application/json" },
        body: JSON.stringify({ name: selfName() || os.hostname(), date: day, state: text }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      log.info(`Sent our state to ${peer.name} for safekeeping.`);
    } catch (e) {
      log.warn(`Could not send our state to ${peer.name}: ${e.message}`);
    }
  }
  prunePeerBackups(dir);
}

// Same retention as local backups, same reasoning: enough history to recover
// from a problem noticed a week later, not an unbounded pile.
function prunePeerBackups(dir) {
  try {
    const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    for (const name of fs.readdirSync(dir)) {
      const m = /-state-(\d{4}-\d{2}-\d{2})\.json$/.exec(name);
      if (m && m[1] < cutoff) fs.unlinkSync(path.join(dir, name));
    }
  } catch {
    // Housekeeping only.
  }
}

// Open today's labels folder in Explorer ON THE SERVER MACHINE (where the PDFs
// and the printer are). Falls back to the labels root if today's folder doesn't
// exist yet. Purely local — nothing is sent anywhere.
app.post("/api/open-labels", (req, res) => {
  try {
    const day = printDayIST();
    const dayDir = path.join(LABELS_DIR, day);
    const target = fs.existsSync(dayDir) ? dayDir : LABELS_DIR;
    fs.mkdirSync(target, { recursive: true });
    openFile(target);
    res.json({ message: `Opened ${target}` });
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
  log.info(`Version ${versionLine()}`);
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
      // Refresh the cached status table after each cycle so the control page
      // (and any hub pulling this machine's status) always has fresh numbers
      // without anyone clicking Refresh.
      try {
        const client = await getClient();
        lastSummary = await marketStatus(client, { date: todayIST() });
        if (Date.now() - upcomingAt > UPCOMING_EVERY_MS) {
          upcoming = await forecast(client, { days: 3 });
          upcomingAt = Date.now();
        }
      } catch (e) {
        log.warn(`Post-cycle status refresh failed: ${e.message}`);
      }
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
