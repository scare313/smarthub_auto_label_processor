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

function emit(level, color, args) {
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
