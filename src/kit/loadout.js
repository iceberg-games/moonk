import { disposeObject, triangleCount } from './geom.js';
import { EMPTY_IDS, ITEMS_BY_ID } from './cosmetics/catalog.js';
import { getFurSpec } from './cosmetics/furs.js';

const EQUIPPED = Symbol('moonkEquipped');

export function emptyLoadout() {
  return { hat: EMPTY_IDS.hat, face: EMPTY_IDS.face, fur: EMPTY_IDS.fur, hand: EMPTY_IDS.hand };
}

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

/**
 * Clear previously equipped cosmetic meshes and apply a new loadout.
 * Returns { loadout, itemTris, roots }.
 */
export function applyLoadout(monkey, rawLoadout) {
  clearEquipped(monkey);
  const loadout = normalizeLoadout(rawLoadout);
  const roots = [];

  const furItem = ITEMS_BY_ID[loadout.fur] || ITEMS_BY_ID[EMPTY_IDS.fur];
  monkey.applyFur(furItem?.furSpec || getFurSpec(loadout.fur));

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
      parent.add(piece);
      roots.push(piece);
    }
  }

  monkey.root.userData[EQUIPPED] = roots;
  const itemTris = roots.reduce((sum, g) => sum + triangleCount(g), 0);
  return { loadout, itemTris, roots };
}

export function clearEquipped(monkey) {
  const prev = monkey.root.userData[EQUIPPED] || [];
  for (const g of prev) {
    g.parent?.remove(g);
    disposeObject(g);
  }
  monkey.root.userData[EQUIPPED] = [];
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
