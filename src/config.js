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
export const LABELS_DIR = path.join(ROOT, "labels");
// Local JSON state store (idempotency + audit).
export const DATA_DIR = path.join(ROOT, "data");

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
  },
  flipkart: {
    key: "flipkart",
    salesChannel: "FKSTANDARD",
    marketplace: "FLIPKART",
    isSelfShip: false,
    cutoff: "23:45",
  },
  // meesho: { ... }  // TODO: capture salesChannel + marketplace on first live run
};

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

// Fixed package used for ALL orders on every channel (per business decision).
// The validate endpoint's per-order recommended dims are ignored in favor of this.
export const DEFAULT_PACKAGE = {
  boxName: "CustomBox",
  length: { measure: 15, unitOfMeasure: "CM" },
  width: { measure: 15, unitOfMeasure: "CM" },
  height: { measure: 2, unitOfMeasure: "CM" },
  weight: { measure: 100, unitOfMeasure: "G" },
};
