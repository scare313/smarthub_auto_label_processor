// Minimal timestamped logger with levels and simple coloring.
//
// Three sinks, all fed from the same line:
//   1. the console,
//   2. an in-memory ring buffer the web control page tails,
//   3. a daily file under data/logs/, rotated by IST date and pruned after
//      LOG_RETENTION_DAYS.
//
// WHY the file sink: the ring buffer holds 500 lines and dies with the process.
// After an overnight crash or a restart there was nothing left to read — the one
// moment the log actually matters. File writes are best-effort and never throw;
// if the disk is full or the path is unwritable the sink disables itself, says so
// once, and console + page logging carry on.
//
// NOTE: config.js must never import this module, or the import cycle breaks both.

import fs from "node:fs";
import path from "node:path";
import { DATA_DIR, LOG_RETENTION_DAYS, todayIST } from "./config.js";

const COLORS = {
  info: "\x1b[36m",   // cyan
  ok: "\x1b[32m",     // green
  warn: "\x1b[33m",   // yellow
  err: "\x1b[31m",    // red
  dim: "\x1b[90m",    // gray
  reset: "\x1b[0m",
};

function stamp() {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

// --- daily log file --------------------------------------------------------

const LOGS_DIR = path.join(DATA_DIR, "logs");
const LOG_NAME_RE = /^agent-(\d{4}-\d{2}-\d{2})\.log$/;
let openDay = null;        // IST date of the file we last appended to
let fileSinkBroken = false; // set once on failure so we don't spam

// Where today's log file is — for the control page and support bundles.
export function logFilePath() {
  return path.join(LOGS_DIR, `agent-${todayIST()}.log`);
}

// Delete log files older than the retention window. Driven off the date in the
// filename, not mtime, so a file that was merely touched isn't kept forever.
function pruneOldLogs() {
  try {
    const cutoff = new Date(Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);
    for (const name of fs.readdirSync(LOGS_DIR)) {
      const m = LOG_NAME_RE.exec(name);
      if (m && m[1] < cutoff) fs.unlinkSync(path.join(LOGS_DIR, name));
    }
  } catch {
    // Pruning is housekeeping. Never let it break logging.
  }
}

// Append one line to today's file. Synchronous on purpose: volume is a few
// hundred lines per cycle, and a line still sitting in a buffer when the process
// dies is exactly the line we needed.
function appendToFile(line) {
  if (fileSinkBroken) return;
  try {
    const day = todayIST();
    if (day !== openDay) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
      openDay = day;
      pruneOldLogs(); // once per day, on the first line after the rollover
    }
    fs.appendFileSync(path.join(LOGS_DIR, `agent-${day}.log`), line + "\r\n");
  } catch (e) {
    fileSinkBroken = true;
    console.log(`${stamp()} WARN Log file disabled (${e.message}) - console and page logging continue.`);
  }
}

// In-memory ring buffer so a web UI can show recent activity without tailing
// a file. Plain text lines (no ANSI colors) so they render cleanly in HTML.
const BUFFER_MAX = 500;
const buffer = [];

export function getRecentLogs(limit = 200) {
  return buffer.slice(-limit);
}

// Print a line with NO level/timestamp prefix (e.g. a table row) but still
// capture it into the ring buffer so the web control page's log tail sees it.
export function logRaw(text) {
  buffer.push(text);
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);
  appendToFile(text);
  console.log(text);
}

function emit(level, color, args) {
  const text = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  const plainLine = `${stamp()} ${level.toUpperCase().padEnd(4)} ${text}`;
  buffer.push(plainLine);
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);
  appendToFile(plainLine);

  const prefix = `${COLORS.dim}${stamp()}${COLORS.reset} ${color}${level.toUpperCase().padEnd(4)}${COLORS.reset}`;
  console.log(prefix, ...args);
}

export const log = {
  info: (...a) => emit("info", COLORS.info, a),
  ok: (...a) => emit("ok", COLORS.ok, a),
  warn: (...a) => emit("warn", COLORS.warn, a),
  err: (...a) => emit("err", COLORS.err, a),
  step: (...a) => emit("»", COLORS.info, a),
  raw: (text) => logRaw(text),
};
