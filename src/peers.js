// Peer-agent config: lets one agent (the "hub", e.g. Shop PC — the one with the
// physical printer) reach another agent (e.g. Bludo PC) over Tailscale to pull
// its labels for a combined print. Both machines share the same secret so each
// can verify incoming peer requests; only the hub machine needs a non-empty
// "peers" list (the machine(s) it calls out to).
//
// config/peers.json is gitignored (holds a shared secret + Tailscale IPs).

import fs from "node:fs";
import path from "node:path";
import { ROOT } from "./config.js";

const CONFIG_PATH = path.join(ROOT, "config", "peers.json");

let cached = null;
export function loadPeersConfig() {
  if (cached) return cached;
  try {
    cached = JSON.parse(fs.readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    cached = { sharedSecret: null, peers: [] };
  }
  return cached;
}

export function sharedSecret() {
  return loadPeersConfig().sharedSecret || null;
}

export function listPeers() {
  return loadPeersConfig().peers || [];
}

// Friendly name for THIS machine (e.g. "shop"), shown in the combined status
// table and print results. Falls back to the OS hostname if unset.
export function selfName() {
  return loadPeersConfig().selfName || null;
}

// This machine is the "hub" (has a printer + peers to pull from) if it has at
// least one configured outbound peer. Otherwise it's a plain "processor".
export function isHub() {
  return listPeers().length > 0;
}
