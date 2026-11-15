/**
 * Client adapter for MOONK Netcode's session inventory wire.
 * Does not invent message names. Server inventory is in-memory and resets
 * on reconnect; {t:'inv'} is the truth while connected. There is no snap field.
 *
 *   {t:'buy', id}  ->  {t:'buyres', id, ok:true} then {t:'inv'}
 *                  or  {t:'buyres', id, ok:false, reason}
 *                      reason: unknown | not_for_sale | owned | moons | rate_limited
 *   {t:'inv', moons, owned:[ids], unlocks:[ids]}  after join and after every change
 *   {t:'cosrej', slot, id, reason}  reason: unknown | not_owned | locked
 *   {t:'unlock', id, items:[ids], reason}  then inv
 */

export const BUY_REASON_MSG = Object.freeze({
  unknown: 'Not in the shop',
  not_for_sale: 'Not for sale',
  owned: 'Already yours',
  moons: 'Not enough Moons',
  rate_limited: 'One moment...',
});

export const COSREJ_REASON_MSG = Object.freeze({
  unknown: 'Unknown item',
  not_owned: 'Not owned',
  locked: 'Locked',
});

export const DEFAULT_SLOT = Object.freeze({
  hat: null,
  face: null,
  fur: 'fur_moonk_gray',
  hand: null,
});

export function buyResMessage(msg) {
  if (!msg || msg.ok) return null;
  return BUY_REASON_MSG[msg.reason] || 'Cannot buy';
}

export function cosRejMessage(msg) {
  return COSREJ_REASON_MSG[msg?.reason] || 'Cannot equip';
}

export function unlockMessage(msg, nameOf) {
  const ids = Array.isArray(msg?.items) ? msg.items : [];
  const names = ids.map((id) => (typeof nameOf === 'function' ? nameOf(id) : null) || null).filter(Boolean);
  if (names.length === 1) return `Unlocked: ${names[0]}`;
  if (names.length === 2) return `Unlocked: ${names[0]}, ${names[1]}`;
  if (names.length > 2) return `Unlocked: ${names[0]}`;
  return 'Unlocked';
}

export function defaultForSlot(slot) {
  return slot === 'fur' ? DEFAULT_SLOT.fur : null;
}

/** Revert one slot of a loadout to its default. Other slots are left as they were. */
export function revertSlot(loadout, slot) {
  const next = {
    v: 1,
    hat: loadout?.hat ?? null,
    face: loadout?.face ?? null,
    fur: loadout?.fur ?? DEFAULT_SLOT.fur,
    hand: loadout?.hand ?? null,
  };
  if (slot === 'hat' || slot === 'face' || slot === 'fur' || slot === 'hand') {
    next[slot] = defaultForSlot(slot);
  }
  return next;
}

export function parseInv(msg) {
  const moons = Number(msg?.moons);
  return {
    moons: Number.isFinite(moons) ? moons : 0,
    owned: Array.isArray(msg?.owned) ? msg.owned.filter((id) => typeof id === 'string') : [],
    unlocks: Array.isArray(msg?.unlocks) ? msg.unlocks.filter((id) => typeof id === 'string') : [],
  };
}

/** Session inventory. Null until the first inv after join; cleared on disconnect. */
export function createShopSession() {
  let inv = null;
  return {
    get inv() { return inv; },
    get active() { return inv !== null; },
    applyInv(msg) { inv = parseInv(msg); return inv; },
    clear() { inv = null; },
  };
}
