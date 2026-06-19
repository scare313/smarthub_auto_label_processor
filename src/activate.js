// activate: auto-create (activate) the pick list(s) for a channel, exactly as a
// human would by clicking "activate pick list". Mirrors the captured 3-step flow:
//   cpts/recommended -> lists/recommended -> POST pick/list
//
// Low-risk write: activating a pick list only groups orders for picking; it does
// not ship or commit anything. Still dry-run by default for safety.

import { log } from "./log.js";
import { store } from "./store.js";

export async function activateChannel(client, { channel, dryRun }) {
  const mode = dryRun ? "DRY-RUN" : "LIVE";

  // 1. Which CPT windows currently have un-picklisted (new) orders?
  const cpts = await client.getRecommendedCpts();
  const windowsWithNew = cpts.filter((c) => (c.newOrders || 0) > 0);
  if (!windowsWithNew.length) {
    log.info(`[${channel.key}] No new orders awaiting pick-list activation.`);
    return { channel: channel.key, created: [] };
  }
  const pickupTimes = [...new Set(windowsWithNew.map((c) => c.startTime))];

  // 2. Recommended pick-list cards for those windows, filtered to this channel
  //    and to cards not yet generated.
  const cards = await client.getRecommendedLists(pickupTimes);
  const mine = cards.filter(
    (c) =>
      c?.displayableSalesChannel?.salesChannel === channel.salesChannel &&
      c.pickTaskNotGenerated &&
      (c.numberOfOrders || 0) > 0
  );

  if (!mine.length) {
    log.info(`[${channel.key}] No new pick lists to activate (already activated or no orders).`);
    return { channel: channel.key, created: [] };
  }

  log.info(`[${channel.key}] ${mine.length} pick list(s) to activate (${mine.reduce((s, c) => s + c.numberOfOrders, 0)} orders).`);

  if (dryRun) {
    for (const c of mine) {
      log.info(`   would activate ExSD=${c.expectedShipEpoch} orders=${c.numberOfOrders}`);
    }
    log.ok(`[${channel.key}] DRY-RUN: would activate ${mine.length} pick list(s). No changes made.`);
    return { channel: channel.key, created: [], dryRun: true };
  }

  // 3. Activate each.
  const created = [];
  for (const c of mine) {
    const id = await client.createPickList({
      expectedShipEpoch: c.expectedShipEpoch,
      numberOfOrders: c.numberOfOrders,
      salesChannel: channel.salesChannel,
      isSelfShip: c.displayableSalesChannel?.isSelfShip || false,
    });
    log.ok(`[${channel.key}] Activated pick list ${id} (${c.numberOfOrders} orders).`);
    store.audit(channel.key, "activated", `${id} orders=${c.numberOfOrders} ExSD=${c.expectedShipEpoch}`);
    created.push(id);
  }
  return { channel: channel.key, created };
}
