// Minimal timestamped logger with levels and simple coloring.

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

// In-memory ring buffer so a web UI can show recent activity without tailing
// a file. Plain text lines (no ANSI colors) so they render cleanly in HTML.
const BUFFER_MAX = 500;
const buffer = [];

export function getRecentLogs(limit = 200) {
  return buffer.slice(-limit);
}

function emit(level, color, args) {
  const text = args.map((a) => (typeof a === "string" ? a : JSON.stringify(a))).join(" ");
  const plainLine = `${stamp()} ${level.toUpperCase().padEnd(4)} ${text}`;
  buffer.push(plainLine);
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX);

  const prefix = `${COLORS.dim}${stamp()}${COLORS.reset} ${color}${level.toUpperCase().padEnd(4)}${COLORS.reset}`;
  console.log(prefix, ...args);
}

export const log = {
  info: (...a) => emit("info", COLORS.info, a),
  ok: (...a) => emit("ok", COLORS.ok, a),
  warn: (...a) => emit("warn", COLORS.warn, a),
  err: (...a) => emit("err", COLORS.err, a),
  step: (...a) => emit("»", COLORS.info, a),
};
