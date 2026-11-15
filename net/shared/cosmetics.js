// Cosmetics loadout validation for MOONK.
// The allowlist is the launch kit JSON (loaded at server start, not copied here).
// Wire shape: { v: 1, hat, face, fur, hand } — all values are catalog ids or null.
// `hand` is a single id applied to both arms. Unknown ids are rejected.

export const SLOTS = Object.freeze(['hat', 'face', 'fur', 'hand']);
export const LOADOUT_VERSION = 1;
export const MAX_ID_LEN = 48;

// Default empty loadout (kit `emptyIds`). This is the shape, not the allowlist.
export const DEFAULT_COSMETICS = Object.freeze({
  v: LOADOUT_VERSION,
  hat: null,
  face: null,
  fur: 'fur_moonk_gray',
  hand: null,
});

const ALLOWED_KEYS = new Set(['v', ...SLOTS]);
const ID_RE = /^[a-z0-9_]+$/;

export function isUnlockOnly(item) {
  if (!item) return false;
  return item.unlock !== 'starter' && item.unlock !== 'purchase';
}

/** Build a catalog object from the parsed launch-kit JSON. Does not invent ids. */
export function catalogFromJson(json, path = null) {
  if (!json || json.version !== 1 || !Array.isArray(json.items)) {
    throw new Error('invalid MOONK cosmetics kit: expected version 1 with an items array');
  }
  const byId = new Map();
  const bySlot = { hat: new Set(), face: new Set(), fur: new Set(), hand: new Set() };
  for (const item of json.items) {
    if (!item || typeof item.id !== 'string' || !SLOTS.includes(item.slot)) {
      throw new Error(`invalid cosmetics item in kit${path ? ` (${path})` : ''}`);
    }
    byId.set(item.id, item);
    bySlot[item.slot].add(item.id);
  }
  const emptyIds = { ...DEFAULT_COSMETICS, ...(json.emptyIds || {}) };
  return {
    version: json.version,
    kit: json.kit || null,
    path,
    slots: json.slots || [...SLOTS],
    emptyIds: { v: LOADOUT_VERSION, hat: emptyIds.hat ?? null, face: emptyIds.face ?? null, fur: emptyIds.fur || 'fur_moonk_gray', hand: emptyIds.hand ?? null },
    items: json.items,
    byId,
    bySlot,
    size: byId.size,
  };
}

export function defaultLoadout(catalog) {
  const e = catalog?.emptyIds || DEFAULT_COSMETICS;
  return { v: LOADOUT_VERSION, hat: e.hat ?? null, face: e.face ?? null, fur: e.fur || 'fur_moonk_gray', hand: e.hand ?? null };
}

function asIdOrNull(v) {
  if (v == null) return { ok: true, id: null };
  if (typeof v !== 'string') return { ok: false };
  if (v.length === 0) return { ok: true, id: null };
  if (v.length > MAX_ID_LEN || !ID_RE.test(v)) return { ok: false };
  return { ok: true, id: v };
}

function unlocked(item, unlocks) {
  if (!isUnlockOnly(item)) return true;
  if (!unlocks) return false;
  const set = unlocks instanceof Set ? unlocks : new Set(unlocks);
  return set.has(item.id) || (item.unlock && set.has(item.unlock));
}

/**
 * Validate a loadout against a loaded kit.
 * @param {object|null} input
 * @param {object} opts
 * @param {object} opts.catalog  from catalogFromJson (required on the server)
 * @param {Set|Iterable} [opts.unlocks]  in-session unlocks for this player
 * @param {object} [opts.base]  previous / default loadout for omitted slots
 */
export function validateCosmetics(input, opts = {}) {
  const catalog = opts.catalog;
  const base = opts.base || defaultLoadout(catalog);
  if (!catalog) return { ok: false, reason: 'cosmetics_catalog' };
  if (input == null) return { ok: true, cosmetics: { ...base, v: LOADOUT_VERSION } };
  if (typeof input !== 'object' || Array.isArray(input)) return { ok: false, reason: 'cosmetics_schema' };
  const keys = Object.keys(input);
  if (keys.length > 10) return { ok: false, reason: 'cosmetics_schema' };
  for (const k of keys) {
    if (!ALLOWED_KEYS.has(k)) return { ok: false, reason: 'cosmetics_key' };
    const v = input[k];
    if (typeof v === 'string' && v.length > MAX_ID_LEN) return { ok: false, reason: 'cosmetics_length' };
  }
  if ('v' in input && input.v != null && Number(input.v) !== LOADOUT_VERSION) {
    return { ok: false, reason: 'cosmetics_version' };
  }
  const out = { v: LOADOUT_VERSION, hat: base.hat ?? null, face: base.face ?? null, fur: base.fur, hand: base.hand ?? null };
  for (const slot of SLOTS) {
    if (!(slot in input)) continue;
    const parsed = asIdOrNull(input[slot]);
    if (!parsed.ok) return { ok: false, reason: `cosmetics_${slot}` };
    if (parsed.id == null) {
      if (slot === 'fur') return { ok: false, reason: 'cosmetics_fur' }; // fur is required
      out[slot] = null;
      continue;
    }
    const item = catalog.byId.get(parsed.id);
    if (!item || item.slot !== slot) return { ok: false, reason: `cosmetics_${slot}` };
    if (!unlocked(item, opts.unlocks)) return { ok: false, reason: 'cosmetics_locked' };
    out[slot] = parsed.id;
  }
  return { ok: true, cosmetics: out };
}

export function cosmeticsEqual(a, b) {
  if (!a || !b) return false;
  return a.hat === b.hat && a.face === b.face && a.fur === b.fur && a.hand === b.hand;
}
