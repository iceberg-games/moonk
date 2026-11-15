import { disposeObject, triangleCount } from './geom.js';
import { EMPTY_IDS, ITEMS_BY_ID } from './cosmetics/catalog.js';
import { getFurSpec } from './cosmetics/furs.js';

const EQUIPPED = Symbol('moonkEquipped');

/** Wire version for the four-slot loadout. Keep ids append-only in cosmetics.json. */
export const LOADOUT_VERSION = 1;

export function emptyLoadout() {
  return {
    v: LOADOUT_VERSION,
    hat: EMPTY_IDS.hat,
    face: EMPTY_IDS.face,
    fur: EMPTY_IDS.fur,
    hand: EMPTY_IDS.hand,
  };
}

/**
 * Normalize any incoming payload to { v:1, hat, face, fur, hand }.
 * Unknown ids are dropped. One hand id covers both arms.
 */
export function normalizeLoadout(raw = {}) {
  const next = emptyLoadout();
  for (const slot of ['hat', 'face', 'fur', 'hand']) {
    if (raw[slot] === undefined) continue;
    const id = raw[slot];
    if (id == null || id === '' || id === `${slot}_none`) {
      next[slot] = slot === 'fur' ? EMPTY_IDS.fur : null;
      continue;
    }
    const item = ITEMS_BY_ID[id];
    if (!item || item.slot !== slot) continue;
    next[slot] = id;
  }
  return next;
}

/** Canonical object to send on the wire or persist. */
export function serializeLoadout(raw = {}) {
  const n = normalizeLoadout(raw);
  return { v: LOADOUT_VERSION, hat: n.hat, face: n.face, fur: n.fur, hand: n.hand };
}

/**
 * Clear previously equipped cosmetic meshes and apply a new loadout.
 * Returns { loadout, itemTris, roots }.
 *
 * Optional per-item `fit` on the catalog entry: { position, rotation, scale }
 * is applied in attach-local space (used if a live rig needs a kit-side tweak).
 */
export function applyLoadout(monkey, rawLoadout) {
  clearEquipped(monkey);
  const loadout = normalizeLoadout(rawLoadout);
  const roots = [];

  const furItem = ITEMS_BY_ID[loadout.fur] || ITEMS_BY_ID[EMPTY_IDS.fur];
  if (typeof monkey.applyFur === 'function') {
    monkey.applyFur(furItem?.furSpec || getFurSpec(loadout.fur));
  }

  if (!monkey.attach) return { loadout, itemTris: 0, roots };

  for (const slot of ['hat', 'face', 'hand']) {
    const id = loadout[slot];
    if (!id) continue;
    const item = ITEMS_BY_ID[id];
    if (!item?.build) continue;
    const points = Array.isArray(item.attach) ? item.attach : [item.attach];
    for (const point of points) {
      const parent = monkey.attach[point];
      if (!parent) continue;
      const piece = item.build();
      piece.userData.moonkSlot = slot;
      applyFit(piece, item.fit);
      parent.add(piece);
      roots.push(piece);
    }
  }

  monkey.root.userData[EQUIPPED] = roots;
  const itemTris = roots.reduce((sum, g) => sum + triangleCount(g), 0);
  return { loadout, itemTris, roots };
}

function applyFit(piece, fit) {
  if (!fit) return;
  if (fit.position) piece.position.set(fit.position[0], fit.position[1], fit.position[2]);
  if (fit.rotation) piece.rotation.set(fit.rotation[0], fit.rotation[1], fit.rotation[2]);
  if (fit.scale != null) {
    const s = fit.scale;
    if (Array.isArray(s)) piece.scale.set(s[0], s[1], s[2]);
    else piece.scale.setScalar(s);
  }
}

export function clearEquipped(monkey) {
  const prev = monkey.root?.userData?.[EQUIPPED] || [];
  for (const g of prev) {
    g.parent?.remove(g);
    disposeObject(g);
  }
  if (monkey.root) monkey.root.userData[EQUIPPED] = [];
}

export function parseLoadoutFromQuery(params) {
  const raw = {};
  for (const slot of ['hat', 'face', 'fur', 'hand']) {
    if (params.has(slot)) raw[slot] = params.get(slot) || null;
  }
  if (params.get('loadout')) {
    // compact form: hatId,faceId,furId,handId  (use - for empty)
    const parts = params.get('loadout').split(',');
    const keys = ['hat', 'face', 'fur', 'hand'];
    parts.forEach((p, i) => {
      if (!keys[i]) return;
      raw[keys[i]] = p === '-' || p === 'none' ? null : p;
    });
  }
  return normalizeLoadout(raw);
}
