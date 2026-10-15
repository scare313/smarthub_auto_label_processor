// activate: auto-create (activate) the pick list(s) for a channel, exactly as a
// human would by clicking "activate pick list". Mirrors the captured 3-step flow:
//   cpts/recommended -> lists/recommended -> POST pick/list
//
// Low-risk write: activating a pick list only groups orders for picking; it does
// not ship or commit anything. Still dry-run by default for safety.

import { log } from "./log.js";
import { store } from "./store.js";

const mineFor = (channel) => (c) =>
  c?.displayableSalesChannel?.salesChannel === channel.salesChannel &&
  c.pickTaskNotGenerated &&
  (c.numberOfOrders || 0) > 0;

export async function activateChannel(client, { channel, dryRun }) {
  const mode = dryRun ? "DRY-RUN" : "LIVE";

  // 1. Which CPT windows currently have un-picklisted (new) orders?
  //    Note this covers only CURRENT/UPCOMING windows. Orders whose window has
  //    already passed are handled by the missed list in step 2b — without that,
  //    they are never offered again and silently never ship.
  const cpts = await client.getRecommendedCpts();
  const windowsWithNew = cpts.filter((c) => (c.newOrders || 0) > 0);
  const pickupTimes = [...new Set(windowsWithNew.map((c) => c.startTime))];

  // 2a. Recommended pick-list cards for those windows, for this channel.
  let upcoming = [];
  if (pickupTimes.length) {
    const cards = await client.getRecommendedLists(pickupTimes);
    upcoming = cards.filter(mineFor(channel));
  }

  // 2b. MISSED pick lists — windows already past, still not picked. Same card
  //     shape, so they activate through exactly the same call below.
  let missed = [];
  try {
    const missedCards = (await client.getMissedLists()) || [];
    missed = missedCards.filter(mineFor(channel));
    if (missed.length) {
      const n = missed.reduce((a, c) => a + (c.numberOfOrders || 0), 0);
      log.warn(`[${channel.key}] ${n} MISSED order(s) past their ship date, in ${missed.length} pick list(s) — activating.`);
    }
  } catch (e) {
    // Never let the missed lookup break normal activation.
    log.warn(`[${channel.key}] could not fetch missed pick lists: ${e.message}`);
  }

  // Missed first: they are already overdue and the most urgent to get moving.
  const seen = new Set();
  const mine = [...missed, ...upcoming].filter((c) => {
    const k = `${c.expectedShipEpoch}:${c.numberOfOrders}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

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
