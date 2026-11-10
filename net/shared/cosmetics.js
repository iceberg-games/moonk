// Small, allowlist-validated cosmetics loadout.
// The game can widen these lists later; the server must keep the same catalog.

export const COSMETIC_SLOTS = {
  hat: Object.freeze(['none', 'cap', 'beanie', 'visor', 'leaf', 'horn', 'crown']),
  face: Object.freeze(['none', 'smile', 'grin', 'wink', 'mask', 'shades']),
  badge: Object.freeze(['none', 'star', 'moon', 'leaf', 'comet', 'acorn']),
};

export const COLOR_RE = /^#[0-9A-Fa-f]{6}$/;
export const DEFAULT_COLOR = '#C4A574';
export const DEFAULT_COSMETICS = Object.freeze({
  hat: 'none',
  face: 'none',
  badge: 'none',
  color: DEFAULT_COLOR,
});

const MAX_FIELD_LEN = 24;
const ALLOWED_KEYS = new Set(['hat', 'face', 'badge', 'color']);

function asId(v) {
  if (typeof v !== 'string') return null;
  if (v.length === 0 || v.length > MAX_FIELD_LEN) return null;
  if (!/^[a-z0-9_\-]+$/i.test(v)) return null;
  return v.toLowerCase();
}

/**
 * Validate and sanitize a cosmetics payload.
 * Unknown keys are stripped. Invalid values fail the whole update (ok:false)
 * so a client cannot sneak a non-catalog id through. Missing keys on a
 * partial update are filled from `base` (defaults on join).
 */
export function validateCosmetics(input, base = DEFAULT_COSMETICS) {
  if (input == null) return { ok: true, cosmetics: { ...base } };
  if (typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, reason: 'cosmetics_schema' };
  }
  const keys = Object.keys(input);
  if (keys.length > 8) return { ok: false, reason: 'cosmetics_schema' };
  for (const k of keys) {
    if (!ALLOWED_KEYS.has(k)) return { ok: false, reason: 'cosmetics_key' };
    const v = input[k];
    if (typeof v === 'string' && v.length > MAX_FIELD_LEN) return { ok: false, reason: 'cosmetics_length' };
  }
  const out = { ...base };
  if ('hat' in input) {
    const id = asId(input.hat);
    if (!id || !COSMETIC_SLOTS.hat.includes(id)) return { ok: false, reason: 'cosmetics_hat' };
    out.hat = id;
  }
  if ('face' in input) {
    const id = asId(input.face);
    if (!id || !COSMETIC_SLOTS.face.includes(id)) return { ok: false, reason: 'cosmetics_face' };
    out.face = id;
  }
  if ('badge' in input) {
    const id = asId(input.badge);
    if (!id || !COSMETIC_SLOTS.badge.includes(id)) return { ok: false, reason: 'cosmetics_badge' };
    out.badge = id;
  }
  if ('color' in input) {
    if (typeof input.color !== 'string' || !COLOR_RE.test(input.color)) return { ok: false, reason: 'cosmetics_color' };
    out.color = input.color.toUpperCase();
  }
  return { ok: true, cosmetics: out };
}

export function cosmeticsEqual(a, b) {
  return a.hat === b.hat && a.face === b.face && a.badge === b.badge && a.color === b.color;
}
