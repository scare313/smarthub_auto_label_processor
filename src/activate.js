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

  // 2a. Pick-list cards for those windows. BOTH card types are needed: they
  //      return different windows and do not overlap. RECOMMENDED is the window
  //      open right now, UPCOMING is the days ahead. Asking only for UPCOMING
  //      is why today's orders were never activated while future ones were.
  let upcoming = [];
  if (pickupTimes.length) {
    for (const cardType of ["RECOMMENDED", "UPCOMING"]) {
      try {
        const cards = (await client.getRecommendedLists(pickupTimes, cardType)) || [];
        upcoming.push(...cards.filter(mineFor(channel)));
      } catch (e) {
        // One card type failing must not cost us the other.
        log.warn(`[${channel.key}] ${cardType} pick-list lookup failed: ${e.message}`);
      }
    }
  }

  // 2b. MISSED pick lists — windows already past, still not picked. Same card
  //     shape, so they activate through exactly the same call below.
  let missed = [];
  try {
    const missedCards = (await client.getMissedLists()) || [];
    missed = missedCards.filter(mineFor(channel)).map((c) => ({ ...c, _missed: true }));
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
    try {
      const id = await client.createPickList({
        expectedShipEpoch: c.expectedShipEpoch,
        numberOfOrders: c.numberOfOrders,
        salesChannel: channel.salesChannel,
        isSelfShip: c.displayableSalesChannel?.isSelfShip || false,
      });
      log.ok(`[${channel.key}] Activated ${c._missed ? "MISSED " : ""}pick list ${id} (${c.numberOfOrders} orders).`);
      store.audit(channel.key, "activated", `${id} orders=${c.numberOfOrders} ExSD=${c.expectedShipEpoch}`);
      created.push(id);
    } catch (e) {
      // One bad card must not stop the others - a missed list that SmartHub
      // refuses should never block today's orders from being activated.
      log.err(`[${channel.key}] could not activate ${c._missed ? "MISSED " : ""}list ExSD=${c.expectedShipEpoch} (${c.numberOfOrders} orders): ${e.message}`);
      store.audit(channel.key, "activate-failed", `ExSD=${c.expectedShipEpoch} orders=${c.numberOfOrders}: ${e.message}`.slice(0, 200));
    }
  }
  return { channel: channel.key, created };
}
