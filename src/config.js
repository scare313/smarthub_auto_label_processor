// Central configuration for the SmartHub order auto-processor.
// All values are derived from real captured traffic on smarthub.amazon.in.

import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(__dirname, "..");

export const BASE_URL = "https://smarthub.amazon.in";

// Persistent Playwright profile (holds the logged-in Amazon session).
export const PROFILE_DIR = path.join(ROOT, "profile");
// Where downloaded label PDFs are written: labels/YYYY-MM-DD/...
// AOP_LABELS_DIR overrides it for the same reason AOP_DATA_DIR exists — so a
// test never drops files into the real print folder an employee works from.
export const LABELS_DIR = process.env.AOP_LABELS_DIR || path.join(ROOT, "labels");
// Local JSON state store (idempotency + audit). AOP_DATA_DIR overrides it, so a
// test or a dry experiment can point at a scratch directory instead of the live
// state file.
export const DATA_DIR = process.env.AOP_DATA_DIR || path.join(ROOT, "data");

// Per-marketplace settings. salesChannel is the exact code the API expects;
// marketplace is what RetrieveBatchOrderDocuments expects for label retrieval.
// Meesho is intentionally left out for now (channel code to be captured on first run).
export const CHANNELS = {
  amazon: {
    key: "amazon",
    salesChannel: "MFN",
    marketplace: "AMAZON",
    isSelfShip: false,
    cutoff: "13:45", // IST handover cutoff
    boxName: "CustomBox", // CustomBox forces our 15x15x2 dims (RecommendedPackage lets Amazon substitute). Label response can be slow on Amazon but reconciliation self-heals any timeout.
    requiresPickupSlot: true, // Amazon MFN requires pickupSlotId on the label call
  },
  flipkart: {
    key: "flipkart",
    salesChannel: "FKSTANDARD",
    marketplace: "FLIPKART",
    isSelfShip: false,
    cutoff: "23:45",
    boxName: "CustomBox",
    requiresPickupSlot: false,
  },
  meesho: {
    key: "meesho",
    salesChannel: "MEESHO", // confirmed from orders/summary
    marketplace: "MEESHO", // ASSUMED — verify on first label retrieval (Amazon=AMAZON, Flipkart=FLIPKART)
    isSelfShip: false,
    cutoff: "22:50",
    boxName: "CustomBox", // ASSUMED — verify on first live processing
    requiresPickupSlot: false, // ASSUMED — verify on first live processing (Amazon needed it)
  },
  fba: {
    key: "fba",
    salesChannel: "FBA", // confirmed from orders/summary
    marketplace: "AMAZON", // ASSUMED — verify on first label retrieval
    isSelfShip: false,
    cutoff: "13:45", // ASSUMED same as Amazon MFN — confirm FBA handover cutoff
    boxName: "CustomBox", // forces our 15x15x2 dims (see amazon note)
    requiresPickupSlot: false, // FBA does not require a pickup slot
  },
};

// Shared IST (Asia/Kolkata) date formatter. India has no DST, so treating a day
// as exactly 24h is exact for calendar arithmetic here.
const IST_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Kolkata",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

// Today's date in IST (Asia/Kolkata), formatted YYYY-MM-DD.
export function todayIST() {
  return IST_DATE.format(new Date());
}

// [oldest ... today] in IST, inclusive. Processing walks these in order so the
// oldest (most urgent, closest to breaching) is handled first.
//
// WHY look back at all: the cycle used to process todayIST() and nothing else,
// so at midnight IST it moved to the new date and never looked at the old one
// again. Orders still unpacked for the previous day were abandoned silently —
// 19 in August 2026 and 13 Flipkart orders on 13 October — and the reconcile
// pass could not rescue them either, because it only scans the date being
// processed.
export function recentDatesIST(lookback = LOOKBACK_DAYS) {
  const today = todayIST();
  const out = [];
  for (let i = lookback; i >= 0; i--) {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export function resolveChannel(name) {
  const c = CHANNELS[String(name || "").toLowerCase()];
  if (!c) {
    const valid = Object.keys(CHANNELS).join(", ");
    throw new Error(`Unknown channel "${name}". Valid channels: ${valid}`);
  }
  return c;
}

// Label printer resolution used in the captured generate-shiplabel calls.
export const SHIP_LABEL_RESOLUTION = 300;

// --- Reliability tunables --------------------------------------------------

// How many PREVIOUS days each cycle also processes, on top of today.
// Orders can miss their own ship date for many reasons — a late pick list, a
// pack failure that later clears, a stalled agent, a marketplace hiccup. Before
// this existed the date rolled over at midnight IST and those orders were
// abandoned permanently: never retried, never reconciled, never printed.
// 2 means each cycle works on today plus the two days before it.
//
// Every cycle covers every one of these dates. An earlier draft of this change
// re-checked the older days only hourly, to save a pick-task query per channel
// per date; that was dropped because catching an abandoned day up to an hour
// sooner is worth more than the queries it costs.
export const LOOKBACK_DAYS = 2;

// Hard per-order failures allowed before an order is PARKED: taken out of the
// retry loop and surfaced for manual attention.
//
// WHY: there was no cap at all. A failing order was retried every 15 minutes
// forever — one reached 96 attempts, and 867 doomed attempts were logged on one
// account in nine days. SmartHub eventually hard-blocks such an order with
// "FORBIDDEN_REQUEST: Maximum number of retry reached", which no amount of
// further retrying can undo, so the retrying itself is what breaks the order.
// 5 is deliberately generous, and only HARD failures count (see below), so a
// network blip or a not-yet-ready label never pushes an order toward parking.
export const MAX_ORDER_ATTEMPTS = 5;

// Error text meaning "try again later" rather than "this order is broken".
// Matched case-insensitively against the error detail. These still bump an
// order's visible attempt count, but never count toward MAX_ORDER_ATTEMPTS.
//
// NOTE: LYCS_INVALID_INPUT is deliberately NOT in this list. Its message says
// "Please retry generating shiplabel and invoice", but in practice it is a real
// rejection — the same order failed 96 times. Treating it as transient would
// defeat the cap entirely.
export const TRANSIENT_ERROR_PATTERNS = [
  "LABEL_NOT_READY",
  "THROTTL",
  "TOO_MANY_REQUESTS",
  "SERVICE_UNAVAILABLE",
  "INTERNAL_SERVER_ERROR",
  "TIMEOUT",
  "TIMED_OUT",
  "ECONNRESET",
  "SOCKET HANG UP",
  "HTTP 429",
  "HTTP 500",
  "HTTP 502",
  "HTTP 503",
  "HTTP 504",
];

export function isTransientError(detail) {
  const s = String(detail || "").toUpperCase();
  return TRANSIENT_ERROR_PATTERNS.some((p) => s.includes(p));
}

// How many days of daily state.json backups and agent log files to keep.
export const BACKUP_RETENTION_DAYS = 14;
export const LOG_RETENTION_DAYS = 14;

// Fixed package used for ALL orders on every channel (per business decision).
// The validate endpoint's per-order recommended dims are ignored in favor of this.
export const DEFAULT_PACKAGE = {
  boxName: "CustomBox",
  length: { measure: 15, unitOfMeasure: "CM" },
  width: { measure: 15, unitOfMeasure: "CM" },
  height: { measure: 2, unitOfMeasure: "CM" },
  weight: { measure: 100, unitOfMeasure: "G" },
};
