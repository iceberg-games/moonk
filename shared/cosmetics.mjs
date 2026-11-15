// Cosmetic loadout catalog + validation (client and server share this module).
// Single source of ids: shared/cosmetics.json = a synced copy of /workspace/moonk-cosmetics/cosmetics.json (append-only; never rename or reuse an id).
// Refresh it with `npm run sync:cosmetics` (the client bundle can not import files outside the repo). Prices are free in-game Moons, no real money.
// Wire loadout: {v:1, hat, face, fur, hand}. sanitizeEquip also accepts the old shape without `v` and always returns v:1.
import KIT from './cosmetics.json' with { type: 'json' };

export const SLOTS = Object.freeze(['hat', 'face', 'fur', 'hand']);

/** Wire loadout. `v` is the schema version; ids are append-only in cosmetics.json. One hand id covers both arms. */
export const LOADOUT_VERSION = 1;

export const DEFAULT_EQUIP = Object.freeze({
  v: LOADOUT_VERSION,
  hat: null,
  face: null,
  fur: 'fur_moonk_gray',
  hand: null,
});

/** Starting wallet on a fresh client save. Matches src/save.js. */
export const STARTER_MOONS = 100;

/** price is a Moon cost, or null when the item is unlock-only (not for sale). */
export const CATALOG = Object.freeze(KIT.items.map((i) => Object.freeze({ id: i.id, slot: i.slot, name: i.name, price: i.price ?? null, unlock: i.unlock, unlockLabel: i.unlockLabel })));

export const KNOWN = new Map(CATALOG.map((i) => [i.id, i.slot]));
export const BY_ID = Object.fromEntries(CATALOG.map((i) => [i.id, i]));

export const STARTER_IDS = Object.freeze(
  CATALOG.filter((i) => i.unlock === 'starter' || i.price === 0).map((i) => i.id),
);

export const UNLOCK_ONLY = Object.freeze(
  CATALOG.filter((i) => i.price == null).map((i) => i.id),
);

/**
 * Allowlist a loadout for the wire. Unknown ids, wrong-slot ids, and
 * non-strings fall back to DEFAULT_EQUIP. This is what server.mjs calls
 * today — it does NOT check ownership or unlocks (see authorizeEquip).
 */
export function sanitizeEquip(e) {
  const o = { ...DEFAULT_EQUIP, v: LOADOUT_VERSION };
  if (e && typeof e === 'object') {
    for (const s of SLOTS) {
      if (typeof e[s] === 'string' && KNOWN.get(e[s]) === s) o[s] = e[s];
    }
  }
  return o;
}

/**
 * Stricter check for a future server path: the player must own the item,
 * or it must be a starter, and unlock-only items need a matching flag.
 * Returns { ok, equip, rejected } — does not mutate input.
 *
 * owned: iterable of item ids
 * unlocks: { hub_visits_5?, tag_catches_25?, night_lobby_win?, tag_streak_3? }
 */
export function authorizeEquip(e, { owned = [], unlocks = {} } = {}) {
  const have = new Set(owned);
  for (const id of STARTER_IDS) have.add(id);
  const clean = sanitizeEquip(e);
  const rejected = [];
  const out = { ...DEFAULT_EQUIP };
  for (const s of SLOTS) {
    const id = clean[s];
    if (id == null) { out[s] = s === 'fur' ? DEFAULT_EQUIP.fur : null; continue; }
    const item = BY_ID[id];
    if (!item) { rejected.push(id); continue; }
    const granted = have.has(id)
      || item.unlock === 'starter'
      || (item.price == null && item.unlock && !!unlocks[item.unlock]);
    if (!granted) { rejected.push(id); continue; }
    out[s] = id;
  }
  return { ok: rejected.length === 0, equip: out, rejected };
}

/** Plain id list (id, slot, price) derived from cosmetics.json. */
export const idList = { items: CATALOG.map((i) => ({ id: i.id, slot: i.slot, price: i.price })) };
