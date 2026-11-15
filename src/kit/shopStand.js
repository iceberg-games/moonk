import * as THREE from 'three';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { ITEMS, itemsForSlot } from './cosmetics/catalog.js';
import { applyLoadout, emptyLoadout } from './loadout.js';
import { disposeObject } from './geom.js';
import { createMonkey } from './monkey.js';

/** One accent color used on frames, inlay, and active buttons. Everything else is neutral. */
export const SHOP_ACCENT = 0xb08d4f;
export const SHOP_ACCENT_HEX = '#b08d4f';

/** Matches vrtag src/game.js SHOP_AT. West of the plaza, open face toward the spawn pad.
 *  East [4.9, 0, 6.6] sat ~55° off a 70° spawn→terminal look, so the stand was only a sliver
 *  on the right; wardrobe (local +X) is toward the centerline on this west pose. */
export const SUGGESTED_HUB_PLACEMENT = {
  position: [-2.8, 0, 7.6],
  rotationY: 0.86,
  note: 'West of the plaza, rotationY 0.86 (faces spawn at [0, 0.9, 10]). Right edge stays clear of the terminal stump at (0, 0, 5.2). Matches src/game.js SHOP_AT.',
};

const STONE = 0xb3aea4;
const STONE_DARK = 0x7a756c;
const WOOD = 0x5c4a3a;
const WOOD_DARK = 0x3a2f28;
const BUTTON = 0x2e2e2c;
const INK = '#1c1c1c';
const MUTED = '#5a574f';
const CARD = '#e8e4db';

const DAIS_W = 4.0;
const DAIS_D = 2.6;
const BUTTON_TRAVEL = 0.016;
const PRESS_DEPTH = 0.008;
/** Designed around vrtag physics.js LOCO.handRadius (0.1 m). Button volumes stay this far from loco solids. */
export const HAND_CLEARANCE = 0.1;
/** Loco solid boxes are clipped to this height so hand-height pokes cannot shove the body. */
const LOCO_SOLID_MAX_Y = 0.42;

/**
 * In-world lobby wardrobe stand. Import and parent the returned group at the
 * hub center. Interaction is physical (hand poke + controller ray + optional
 * desktop mouse ray).
 *
 * createShopStand({
 *   scene,          // optional; group is added if provided
 *   cosmetics,      // item array (defaults to the launch catalog)
 *   wallet,         // { balance, owned: string[], equipped: {hat,face,fur,hand} }
 *   onEquip,        // (item, loadout) => void
 *   onBuy,          // (item, wallet) => void | { pending: true }
 *   onPress,        // () => void  — click sound; haptics stay in markHeld
 *   player,         // createMonkey() result; preview/equip target (can also be set later)
 *   renderer,       // used to size the mirror render target
 * })
 *
 * Returns { group, update(dt, inputs), dispose, setWallet, setStatus, setCategory, setPlayer }.
 * onBuy may return { pending: true } so the stand waits for a server {t:'buyres'}/{t:'inv'}
 * instead of deducting Moons locally.
 */
export function createShopStand(options = {}) {
  const catalog = options.cosmetics || ITEMS;
  const onEquip = options.onEquip || (() => {});
  const onBuy = options.onBuy || (() => {});
  const onPress = options.onPress || (() => {});

  const group = new THREE.Group();
  group.name = 'moonk_shop_stand';

  const state = {
    category: 'hat',
    selectedId: null,
    hoverId: null,
    wallet: normalizeWallet(options.wallet),
    player: options.player || null,
    pressed: new Map(), // buttonId -> { depth, fired }
    pedestals: [],
    buttons: [],
    signs: [],
  };

  const mats = makeMaterials();
  const mirror = buildMirror(group, mats, options.renderer);
  const tabRow = buildTabRow(group, mats, state);
  const actionRow = buildActionRow(group, mats, state);
  const header = makeSign(['WARDROBE'], 1.2, 0.18, { pxW: 768, pxH: 128, size: 72, weight: 700, letterSpacing: 0.18 });
  header.mesh.position.set(0.55, 1.44, -DAIS_D / 2 + 0.13);
  group.add(header.mesh);
  state.signs.push(header);

  const balanceSign = makeSign(balanceLines(state.wallet), 0.7, 0.16, { pxW: 512, pxH: 128, size: 36, weight: 600 });
  balanceSign.mesh.position.set(1.48, 1.44, -DAIS_D / 2 + 0.13);
  group.add(balanceSign.mesh);
  state.balanceSign = balanceSign;

  const statusSign = makeSign(['Select an item'], 0.7, 0.14, { pxW: 512, pxH: 112, size: 28, weight: 600, color: MUTED });
  statusSign.mesh.position.set(0.18, 0.74, 1.1);
  statusSign.mesh.rotation.x = -0.2;
  group.add(statusSign.mesh);
  state.statusSign = statusSign;

  const pedestalRoot = new THREE.Group();
  pedestalRoot.name = 'pedestals';
  group.add(pedestalRoot);
  state.pedestalRoot = pedestalRoot;
  state.mats = mats;

  const solids = buildArchitecture(group, mats);
  state.solids = solids;
  rebuildPedestals(state, catalog, mats);
  refreshButtons(state);
  refreshStatus(state);
  rebuildColliderList(state);

  if (options.scene) options.scene.add(group);

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const _hitPoint = new THREE.Vector3();

  function update(dt, inputs = {}) {
    if (state.statusHoldUntil && performance.now() >= state.statusHoldUntil) {
      state.statusHoldUntil = 0;
      refreshStatus(state);
    }
    if (state.buyPending && performance.now() - (state.buyPendingAt || 0) > 3000) {
      state.buyPending = null;
      if (!state.statusHoldUntil) refreshStatus(state);
    }
    // Auto-rotate propeller hats on pedestals / player
    group.traverse((obj) => {
      if (obj.name === 'propeller_spin') obj.rotation.y += (dt || 0.016) * 4;
    });
    if (state.player?.root) {
      state.player.root.traverse((obj) => {
        if (obj.name === 'propeller_spin') obj.rotation.y += (dt || 0.016) * 4;
      });
    }

    const targets = collectTargets(state);
    let hover = null;

    if (inputs.hands?.length) {
      for (const hand of inputs.hands) {
        hover = pokeHands(hand, targets, state, hover) || hover;
      }
    }
    if (inputs.rays?.length) {
      for (const ray of inputs.rays) {
        hover = rayPick(ray, targets, state, raycaster, hover) || hover;
      }
    }
    if (inputs.camera && inputs.pointerNdc) {
      ndc.set(inputs.pointerNdc.x, inputs.pointerNdc.y);
      raycaster.setFromCamera(ndc, inputs.camera);
      hover = rayPick({
        origin: raycaster.ray.origin,
        direction: raycaster.ray.direction,
        trigger: !!inputs.pointerDown,
        justPressed: !!inputs.pointerClicked,
        inputSource: null,
      }, targets, state, raycaster, hover) || hover;
    }

    // Release buttons that are no longer held
    for (const [id, rec] of state.pressed) {
      if (!rec.held) {
        const btn = findButton(state, id);
        if (btn) setButtonDepth(btn, 0);
        state.pressed.delete(id);
      } else {
        rec.held = false;
      }
    }

    if (hover?.id !== state.hoverId) {
      state.hoverId = hover?.id || null;
      refreshButtons(state);
    }

    updateColliderBoxes(state, group);
  }

  function dispose() {
    clearPedestals(state);
    if (mirror?.dispose) {
      mirror.geometry.dispose();
      if (mirror.material) mirror.material.dispose();
      mirror.getRenderTarget?.().dispose?.();
    }
    for (const s of state.signs) {
      s.tex?.dispose();
      s.mesh.geometry?.dispose();
      s.mesh.material?.dispose();
    }
    disposeObject(group);
    group.parent?.remove(group);
    for (const t of mats._textures || []) t.dispose?.();
    for (const m of Object.values(mats)) if (m && m !== mats._textures) m.dispose?.();
  }

  const api = {
    group,
    update,
    dispose,
    setWallet(wallet, opts) {
      state.wallet = normalizeWallet({ ...state.wallet, ...wallet }, opts);
      if (state.buyPending && wallet && Array.isArray(wallet.owned) && wallet.owned.includes(state.buyPending)) {
        state.buyPending = null;
      }
      refreshAll(state, catalog);
    },
    /** Paint the counter status sign. holdMs keeps refreshStatus from overwriting it. */
    setStatus(lines, holdMs = 2800) {
      const list = Array.isArray(lines) ? lines : [String(lines ?? '')];
      state.statusHoldUntil = holdMs > 0 ? performance.now() + holdMs : 0;
      state.statusSign?.draw(list);
    },
    /** Clear a pending buy and start a short cooldown so a burst of pokes cannot trip rate_limited. */
    endBuy() {
      state.buyPending = null;
      state.buyCoolUntil = performance.now() + 400;
    },
    setCategory(slot) {
      if (slot === state.category) return;
      state.category = slot;
      state.selectedId = null;
      rebuildPedestals(state, catalog, mats);
      refreshAll(state, catalog);
    },
    setPlayer(player) {
      state.player = player;
    },
    getSelection() {
      return { category: state.category, selectedId: state.selectedId, wallet: state.wallet };
    },
    /** Live collider list. Boxes are world-space AABBs, refreshed on update() and here. */
    get colliders() {
      return getColliders();
    },
    getColliders,
    /** Push a hand sphere out of solid colliders. Returns the world-space push-out vector (also written to `out`). */
    resolveHand(pos, radius = 0.05, out) {
      updateColliderBoxes(state, group);
      return resolveHandAgainst(state.colliders, pos, radius, out);
    },
    /** Locomotion-shaped boxes for vrtag physics.js: { k:'box', min, max, id, kind, scope }.
     *  'solid' / 'loco' / omitted → walk/body solids only (dais, back wall, pedestal bases below hand height).
     *  Hand-only solids (counter, rail, pedestal tops) are NOT included — feeding them to loco.step
     *  lets a 0.1 m poke shove the player body. Use 'hand' for those, 'button' for poke targets. */
    getLocoColliders(kind) {
      const list = getColliders();
      let src;
      if (!kind || kind === 'loco' || kind === 'solid') {
        src = list.filter((c) => c.kind === 'solid' && c.scope === 'loco');
      } else if (kind === 'hand') {
        src = list.filter((c) => c.kind === 'solid' && c.scope === 'hand');
      } else {
        src = list.filter((c) => c.kind === kind);
      }
      return src.map((c) => ({
        k: 'box',
        min: c.box.min.toArray(),
        max: c.box.max.toArray(),
        id: c.id,
        kind: c.kind,
        scope: c.scope || null,
      }));
    },
    runColliderTest,
    /* called from interaction */
    _state: state,
    _catalog: catalog,
    _onEquip: onEquip,
    _onBuy: onBuy,
    _onPress: onPress,
  };

  function getColliders() {
    updateColliderBoxes(state, group);
    return state.colliders;
  }

  function runColliderTest() {
    return runShopColliderTest(api, state, group);
  }

  state.api = api;
  rebuildColliderList(state);
  return api;
}

function normalizeWallet(raw = {}, opts = {}) {
  const equipped = { ...emptyLoadout(), ...(raw.equipped || {}) };
  const owned = new Set(raw.owned || (!opts.strict ? starterIds() : []));
  if (!opts.strict) {
    for (const slot of ['hat', 'face', 'fur', 'hand']) {
      const id = equipped[slot];
      if (id) owned.add(id);
    }
  }
  owned.add('fur_moonk_gray');
  for (const id of starterIds()) owned.add(id);
  const unlocks = new Set(raw.unlocks || []);
  return {
    balance: Number.isFinite(raw.balance) ? raw.balance : 250,
    owned,
    unlocks,
    equipped,
  };
}

function starterIds() {
  return ITEMS.filter((i) => i.price === 0 && i.unlock === 'starter').map((i) => i.id);
}

function canvasTex(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 2;
  tex.needsUpdate = true;
  return tex;
}

function woodTexture() {
  return canvasTex(256, (g, n) => {
    g.fillStyle = '#5c4a3a';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 28; i++) {
      const y = (i + 0.3 + (Math.sin(i * 1.7) * 0.3)) * (n / 28);
      g.strokeStyle = i % 3 === 0 ? 'rgba(30,20,14,0.28)' : 'rgba(90,70,52,0.35)';
      g.lineWidth = 1 + (i % 2);
      g.beginPath();
      g.moveTo(0, y);
      for (let x = 0; x <= n; x += 8) g.lineTo(x, y + Math.sin(x * 0.04 + i) * 2.2);
      g.stroke();
    }
    for (let k = 0; k < 40; k++) {
      g.fillStyle = 'rgba(20,14,10,0.12)';
      g.fillRect((k * 37) % n, (k * 53) % n, 3, 1);
    }
  });
}

function stoneTexture() {
  return canvasTex(256, (g, n) => {
    g.fillStyle = '#b3aea4';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) {
      const v = 150 + ((i * 17) % 70);
      g.fillStyle = `rgba(${v},${v - 6},${v - 14},0.22)`;
      g.fillRect((i * 47) % n, (i * 89) % n, 2 + (i % 3), 2);
    }
    for (let i = 0; i < 18; i++) {
      g.strokeStyle = 'rgba(90,86,80,0.18)';
      g.beginPath();
      g.moveTo((i * 73) % n, (i * 29) % n);
      g.lineTo((i * 73 + 40) % n, (i * 29 + 18) % n);
      g.stroke();
    }
  });
}

function plasterTexture() {
  return canvasTex(256, (g, n) => {
    g.fillStyle = '#e8e4db';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 500; i++) {
      const v = 210 + ((i * 13) % 30);
      g.fillStyle = `rgba(${v},${v - 3},${v - 8},0.2)`;
      g.fillRect((i * 61) % n, (i * 97) % n, 2, 2);
    }
  });
}

function bevelBox(w, h, d, r = 0.012) {
  const rad = Math.min(r, w * 0.45, h * 0.45, d * 0.45);
  return new RoundedBoxGeometry(w, h, d, 1, Math.max(0.003, rad));
}

function mergeByMaterial(parent, meshes, name) {
  if (!meshes.length) return [];
  const by = new Map();
  parent.updateWorldMatrix(true, true);
  const inv = parent.matrixWorld.clone().invert();
  for (const m of meshes) {
    if (!m?.geometry) continue;
    const g = m.geometry.clone();
    m.updateWorldMatrix(true, false);
    g.applyMatrix4(inv.clone().multiply(m.matrixWorld));
    const list = by.get(m.material) || [];
    list.push(g);
    by.set(m.material, list);
    m.parent?.remove(m);
    m.geometry.dispose();
  }
  const out = [];
  let i = 0;
  for (const [mat, geos] of by) {
    const merged = mergeGeometries(geos, false);
    geos.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.name = name ? `${name}:${i++}` : 'merged';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    out.push(mesh);
  }
  return out;
}

function makeMaterials() {
  const woodMap = woodTexture();
  const stoneMap = stoneTexture();
  const plasterMap = plasterTexture();
  const std = (color, extra = {}) => new THREE.MeshStandardMaterial({
    color,
    roughness: extra.roughness ?? 0.88,
    metalness: extra.metalness ?? 0.04,
    flatShading: false,
    ...extra,
  });
  const mats = {
    stone: std(0xffffff, { roughness: 0.94, map: stoneMap }),
    stoneDark: std(STONE_DARK, { roughness: 0.92, map: stoneMap }),
    wood: std(0xffffff, { roughness: 0.86, map: woodMap }),
    woodDark: std(0x7a6554, { roughness: 0.84, map: woodMap }),
    accent: std(SHOP_ACCENT, { roughness: 0.48, metalness: 0.32 }),
    button: std(BUTTON, { roughness: 0.72 }),
    buttonAccent: std(SHOP_ACCENT, { roughness: 0.5, metalness: 0.3 }),
    plaster: std(0xffffff, { roughness: 0.9, map: plasterMap }),
    _textures: [woodMap, stoneMap, plasterMap],
  };
  return mats;
}

function buildArchitecture(group, mats) {
  const dais = new THREE.Mesh(bevelBox(DAIS_W, 0.07, DAIS_D, 0.016), mats.stone);
  dais.name = 'solid:dais';
  dais.position.y = 0.035;
  dais.receiveShadow = true;
  dais.castShadow = true;
  group.add(dais);

  const decor = [];
  const inlay = new THREE.Mesh(new THREE.BoxGeometry(DAIS_W - 0.18, 0.008, 0.018), mats.accent);
  inlay.position.set(0, 0.072, DAIS_D / 2 - 0.11);
  group.add(inlay); decor.push(inlay);
  const inlayB = inlay.clone();
  inlayB.position.z = -DAIS_D / 2 + 0.11;
  group.add(inlayB); decor.push(inlayB);
  const inlayS = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.008, DAIS_D - 0.18), mats.accent);
  inlayS.position.set(DAIS_W / 2 - 0.11, 0.072, 0);
  group.add(inlayS); decor.push(inlayS);
  const inlayS2 = inlayS.clone();
  inlayS2.position.x = -DAIS_W / 2 + 0.11;
  group.add(inlayS2); decor.push(inlayS2);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(DAIS_W - 0.12, 1.32, 0.07), mats.plaster);
  wall.name = 'solid:back_wall';
  wall.position.set(0, 0.72, -DAIS_D / 2 + 0.07);
  wall.castShadow = true;
  wall.receiveShadow = true;
  group.add(wall);

  const pad = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, 0.03, 24), mats.wood);
  pad.position.set(-1.2, 0.08, 0.38);
  pad.receiveShadow = true;
  group.add(pad);
  const padRing = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.012, 8, 20), mats.accent);
  padRing.rotation.x = Math.PI / 2;
  padRing.position.set(-1.2, 0.096, 0.38);
  group.add(padRing); decor.push(padRing);

  const shelf = new THREE.Mesh(bevelBox(1.1, 0.07, 0.4, 0.014), mats.wood);
  shelf.name = 'solid:counter';
  shelf.position.set(0.85, 0.5, 1.08);
  shelf.castShadow = true;
  group.add(shelf);
  const shelfLeg = new THREE.Mesh(bevelBox(0.08, 0.46, 0.08, 0.01), mats.woodDark);
  shelfLeg.name = 'solid:counter_leg_l';
  shelfLeg.position.set(0.46, 0.26, 1.08);
  group.add(shelfLeg);
  const shelfLeg2 = shelfLeg.clone();
  shelfLeg2.name = 'solid:counter_leg_r';
  shelfLeg2.position.x = 1.24;
  group.add(shelfLeg2);

  const rail = new THREE.Mesh(bevelBox(2.1, 0.05, 0.14, 0.01), mats.wood);
  rail.name = 'solid:rail';
  rail.position.set(0.7, 1.20, -DAIS_D / 2 + 0.24);
  rail.castShadow = true;
  group.add(rail);

  mergeByMaterial(group, decor, 'decor');
  return [dais, wall, shelf, shelfLeg, shelfLeg2, rail];
}

function buildMirror(group, mats, renderer) {
  // 384 px is enough to read a monkey on a ~1 m Quest mirror without a 1k reflection pass.
  const size = Math.min(384, renderer?.capabilities?.maxTextureSize || 384);
  const unit = new THREE.Group();
  unit.name = 'shop_mirror_unit';
  unit.position.set(-1.35, 0, -0.85);
  unit.rotation.y = 0.42;

  const reflector = new Reflector(new THREE.PlaneGeometry(0.95, 1.42), {
    textureWidth: size,
    textureHeight: Math.round(size * 1.4),
    color: 0xb8b3aa,
    clipBias: 0.003,
  });
  reflector.name = 'shop_mirror';
  reflector.position.set(0, 0.95, 0);
  unit.add(reflector);

  const fw = 1.12;
  const ft = 0.07;
  const frameMat = mats.woodDark;
  const top = new THREE.Mesh(bevelBox(fw, ft, 0.07, 0.012), frameMat);
  top.position.set(0, 0.95 + 1.42 / 2 + ft / 2, -0.005);
  const bot = new THREE.Mesh(bevelBox(fw, ft, 0.07, 0.012), frameMat);
  bot.position.set(0, 0.95 - 1.42 / 2 - ft / 2, -0.005);
  const left = new THREE.Mesh(bevelBox(ft, 1.42, 0.07, 0.012), frameMat);
  left.position.set(-0.95 / 2 - ft / 2, 0.95, -0.005);
  const right = new THREE.Mesh(bevelBox(ft, 1.42, 0.07, 0.012), frameMat);
  right.position.set(0.95 / 2 + ft / 2, 0.95, -0.005);
  unit.add(top, bot, left, right);
  mergeByMaterial(unit, [top, bot, left, right], 'mirror_frame');

  const lip = new THREE.Mesh(new THREE.BoxGeometry(fw, 0.01, 0.016), mats.accent);
  lip.position.set(0, 0.95 + 1.42 / 2 + ft, 0.02);
  unit.add(lip);

  group.add(unit);
  return reflector;
}

function buildTabRow(group, mats, state) {
  const labels = [
    ['hat', 'HAT'],
    ['face', 'FACE'],
    ['fur', 'FUR'],
    ['hand', 'HAND'],
  ];
  const startX = 0.1;
  const y = 1.30;
  const z = -DAIS_D / 2 + 0.26;
  const gap = 0.46;
  for (let i = 0; i < labels.length; i++) {
    const [id, label] = labels[i];
    const btn = makePhysicalButton({
      id: `tab:${id}`,
      kind: 'tab',
      slot: id,
      label,
      w: 0.4,
      h: 0.11,
      d: 0.06,
      mats,
    });
    btn.group.position.set(startX + i * gap, y, z);
    group.add(btn.group);
    state.buttons.push(btn);
  }
  return state.buttons;
}

function buildActionRow(group, mats, state) {
  const specs = [
    { id: 'action:equip', kind: 'equip', label: 'EQUIP', x: 0.55 },
    { id: 'action:buy', kind: 'buy', label: 'BUY', x: 1.05 },
  ];
  for (const s of specs) {
    const btn = makePhysicalButton({
      id: s.id,
      kind: s.kind,
      label: s.label,
      w: 0.4,
      h: 0.11,
      d: 0.07,
      mats,
    });
    btn.group.position.set(s.x, 0.62, 1.08);
    btn.group.rotation.x = -0.18;
    group.add(btn.group);
    state.buttons.push(btn);
  }
}

function makePhysicalButton({ id, kind, label, w, h, d, mats, slot = null }) {
  const g = new THREE.Group();
  g.name = id;
  const base = new THREE.Mesh(bevelBox(w + 0.03, h + 0.03, d * 0.5, 0.008), mats.woodDark);
  base.position.z = -d * 0.12;
  base.castShadow = true;
  g.add(base);

  const face = new THREE.Mesh(bevelBox(w, h, d * 0.62, 0.008), mats.plaster.clone());
  face.position.z = d * 0.16;
  face.castShadow = true;
  face.userData.shopTarget = true;
  g.add(face);

  const sign = makeSign([label], w * 0.95, h * 0.75, {
    pxW: 256,
    pxH: 64,
    size: 36,
    weight: 700,
    letterSpacing: 0.12,
    bg: 'transparent',
    color: INK,
  });
  sign.mesh.position.z = d * 0.16 + d * 0.31 + 0.01;
  g.add(sign.mesh);

  const rec = {
    id,
    kind,
    slot,
    group: g,
    face,
    base,
    sign,
    restZ: d * 0.16,
    w, h, d,
    enabled: true,
    selected: false,
  };
  g.userData.button = rec;
  face.userData.button = rec;
  return rec;
}

function setButtonDepth(btn, depth) {
  // Travel with press depth, hard-clamped at the bottom of the travel.
  const z = btn.restZ - Math.min(BUTTON_TRAVEL, Math.max(0, depth));
  btn.face.position.z = z;
  if (btn.sign?.mesh) btn.sign.mesh.position.z = z + btn.d * 0.31 + 0.01;
}

function rebuildPedestals(state, catalog, mats) {
  clearPedestals(state);
  const items = (catalog === ITEMS ? itemsForSlot(state.category) : catalog.filter((i) => i.slot === state.category));
  const cols = Math.min(4, items.length);
  const rows = Math.ceil(items.length / cols);
  const gapX = 0.66;
  const gapZ = 0.8;
  const originX = 0.22 + ((4 - cols) * gapX) / 2;
  const originZ = -0.55;

  items.forEach((item, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = originX + col * gapX;
    const z = originZ + row * gapZ;
    const ped = buildPedestal(item, mats, state, { tall: row === 0 && rows > 1 });
    ped.group.position.set(x, 0, z);
    state.pedestalRoot.add(ped.group);
    state.pedestals.push(ped);
    state.buttons.push(ped.button);
  });
  if (!state.selectedId && items[0]) state.selectedId = items[0].id;
  if (state.solids) rebuildColliderList(state);
}

function buildPedestal(item, mats, state, { tall = false } = {}) {
  const g = new THREE.Group();
  g.name = `pedestal:${item.id}`;

  const colH = tall ? 0.84 : 0.66;
  const topY = tall ? 0.92 : 0.74;

  const col = new THREE.Mesh(new THREE.BoxGeometry(0.28, colH, 0.28), mats.stone);
  col.name = `solid:pedestal:${item.id}`;
  col.position.y = 0.06 + colH / 2;
  col.castShadow = true;
  col.receiveShadow = true;
  g.add(col);
  const top = new THREE.Mesh(bevelBox(0.36, 0.05, 0.36, 0.012), mats.wood);
  top.name = `solid:pedestal_top:${item.id}`;
  top.position.y = topY;
  top.castShadow = true;
  g.add(top);

  const ring = new THREE.Mesh(bevelBox(0.38, 0.012, 0.38, 0.004), mats.accent.clone());
  ring.position.y = topY + 0.026;
  ring.visible = false;
  ring.material = mats.accent;
  g.add(ring);

  const mannequin = createMonkey();
  mannequin.root.scale.setScalar(0.32);
  mannequin.root.position.set(0, topY + 0.02, 0);
  const loadout = emptyLoadout();
  loadout[item.slot] = item.id;
  if (item.slot === 'fur') loadout.fur = item.id;
  applyLoadout(mannequin, loadout);
  g.add(mannequin.root);

  const price = priceLabel(item);
  const sign = makeSign([item.name, price], 0.36, 0.11, {
    pxW: 256,
    pxH: 96,
    size: 32,
    subSize: 22,
    weight: 700,
    align: 'center',
  });
  // Nameplate sits on the front lip of the pedestal, not mid-column
  sign.mesh.position.set(0, topY + 0.04, 0.2);
  sign.mesh.rotation.x = -0.22;
  g.add(sign.mesh);

  // Invisible poke volume covering the column + sign
  const hit = new THREE.Mesh(
    new THREE.BoxGeometry(0.36, colH + 0.28, 0.4),
    new THREE.MeshBasicMaterial({ visible: false }),
  );
  hit.position.y = (colH + 0.28) / 2;
  hit.userData.shopTarget = true;
  g.add(hit);

  const button = {
    id: `item:${item.id}`,
    kind: 'item',
    item,
    group: g,
    face: hit,
    sign,
    ring,
    mannequin,
    restZ: 0,
    d: 0.1,
    w: 0.36,
    h: 0.95,
    enabled: true,
    selected: false,
  };
  hit.userData.button = button;
  g.userData.button = button;
  void state;
  return { group: g, button, item, sign, ring, mannequin, col, top };
}

function clearPedestals(state) {
  for (const ped of state.pedestals) {
    disposeObject(ped.group);
    ped.group.parent?.remove(ped.group);
  }
  state.buttons = state.buttons.filter((b) => b.kind !== 'item');
  state.pedestals = [];
}

function priceLabel(item) {
  if (item.price === 0) return 'Free';
  if (item.price == null) return item.unlockLabel || 'Unlock';
  return `${item.price} Moons`;
}

function refreshAll(state, catalog) {
  refreshButtons(state);
  refreshStatus(state);
  state.balanceSign?.draw(balanceLines(state.wallet));
  void catalog;
}

function refreshButtons(state) {
  const { wallet, category, selectedId, hoverId } = state;
  for (const btn of state.buttons) {
    if (btn.kind === 'tab') {
      btn.selected = btn.slot === category;
      paintButtonFace(btn, btn.selected || btn.id === hoverId);
    } else if (btn.kind === 'item') {
      btn.selected = btn.item.id === selectedId;
      if (btn.ring) btn.ring.visible = btn.selected;
    } else if (btn.kind === 'buy') {
      const item = selectedItem(state);
      const owned = item && wallet.owned.has(item.id);
      const can = item && !owned && canAcquire(item, wallet);
      btn.enabled = !!can;
      paintButtonFace(btn, btn.id === hoverId && btn.enabled, btn.enabled);
    } else if (btn.kind === 'equip') {
      const item = selectedItem(state);
      const owned = item && wallet.owned.has(item.id);
      const already = item && wallet.equipped[item.slot] === item.id;
      btn.enabled = !!owned && !already;
      paintButtonFace(btn, btn.id === hoverId && btn.enabled, btn.enabled);
    }
  }
}

function paintButtonFace(btn, highlight, enabled = true) {
  const mat = btn.face.material;
  if (!mat?.color) return;
  if (btn.kind === 'item') return;
  const active = !!(btn.selected || highlight);
  if (!enabled) mat.color.set(0xc8c2b8);
  else if (active) { mat.color.set(SHOP_ACCENT); if (mat.roughness != null) mat.roughness = 0.45; }
  else { mat.color.set(0xe8e4db); if (mat.roughness != null) mat.roughness = 0.88; }
  if (btn.sign) paintSignInk(btn, enabled, active);
}

function labelOf(btn) {
  if (btn.kind === 'tab') return (btn.slot || '').toUpperCase();
  if (btn.kind === 'buy') return 'BUY';
  if (btn.kind === 'equip') return 'EQUIP';
  return '';
}

function paintSignInk(btn, enabled, active) {
  const color = !enabled ? '#5a574f' : (active ? '#fff8ee' : INK);
  btn.sign.draw = btn.sign.draw;
  // Re-render the existing sign with the appropriate ink
  const lines = [labelOf(btn)];
  const canvas = btn.sign.canvas;
  const ctx = btn.sign.ctx;
  const pxW = canvas.width;
  const pxH = canvas.height;
  ctx.clearRect(0, 0, pxW, pxH);
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '700 44px "Helvetica Neue", Helvetica, Arial, sans-serif';
  ctx.fillText(lines[0], pxW / 2, pxH / 2);
  btn.sign.tex.needsUpdate = true;
}

function selectedItem(state) {
  if (!state.selectedId) return null;
  return ITEMS.find((i) => i.id === state.selectedId) || null;
}

function canAcquire(item, wallet) {
  if (!item) return false;
  if (wallet.owned.has(item.id)) return false;
  if (item.price == null) return false; // unlock-only; server grants later
  return wallet.balance >= item.price;
}

function balanceLines(wallet) {
  return ['MOONS', String(wallet.balance)];
}

function refreshStatus(state) {
  if (state.statusHoldUntil && performance.now() < state.statusHoldUntil) return;
  const item = selectedItem(state);
  if (!item) {
    state.statusSign?.draw(['Select an item']);
    return;
  }
  const owned = state.wallet.owned.has(item.id);
  const equipped = state.wallet.equipped[item.slot] === item.id;
  let line2 = priceLabel(item);
  if (equipped) line2 = 'Equipped';
  else if (owned) line2 = 'Owned';
  else if (item.price == null) line2 = item.unlockLabel || 'Locked';
  else if (state.wallet.balance < item.price) line2 = 'Not enough Moons';
  state.statusSign?.draw([item.name, line2]);
}

function previewOnPlayer(state, item) {
  if (!state.player || !item) return;
  const next = { ...state.wallet.equipped };
  next[item.slot] = item.id;
  applyLoadout(state.player, next);
}

function commitEquip(state, item, api) {
  if (!item || !state.wallet.owned.has(item.id)) return;
  state.wallet.equipped[item.slot] = item.id;
  if (state.player) applyLoadout(state.player, state.wallet.equipped);
  api._onEquip(item, { ...state.wallet.equipped });
  refreshAll(state, api._catalog);
}

function commitBuy(state, item, api) {
  if (!canAcquire(item, state.wallet)) return;
  if (state.buyPending || performance.now() < (state.buyCoolUntil || 0)) return;
  const result = api._onBuy(item, {
    balance: state.wallet.balance,
    owned: [...state.wallet.owned],
    equipped: { ...state.wallet.equipped },
  });
  if (result && result.pending) {
    state.buyPending = item.id;
    state.buyPendingAt = performance.now();
    state.statusSign?.draw([item.name, 'One moment...']);
    return;
  }
  state.wallet.balance -= item.price;
  state.wallet.owned.add(item.id);
  refreshAll(state, api._catalog);
}

function handleActivate(state, btn) {
  const api = state.api;
  if (!btn || !btn.enabled && (btn.kind === 'buy' || btn.kind === 'equip')) return;
  if (btn.kind === 'tab') {
    if (btn.slot !== state.category) {
      state.category = btn.slot;
      state.selectedId = null;
      rebuildPedestals(state, api._catalog, state.mats);
    }
    refreshAll(state, api._catalog);
    const first = state.pedestals[0]?.item;
    if (first) {
      state.selectedId = first.id;
      previewOnPlayer(state, first);
      refreshAll(state, api._catalog);
    }
    return;
  }
  if (btn.kind === 'item') {
    state.selectedId = btn.item.id;
    previewOnPlayer(state, btn.item);
    refreshAll(state, api._catalog);
    return;
  }
  if (btn.kind === 'equip') commitEquip(state, selectedItem(state), api);
  if (btn.kind === 'buy') commitBuy(state, selectedItem(state), api);
}


function solidScope(id) {
  // Walk/body blockers only. Counter, rail, and pedestal tops are hand-height
  // and would shove the GT-style body if they were fed to loco.step.
  if (id === 'solid:dais' || id === 'solid:back_wall') return 'loco';
  if (id && id.startsWith('solid:pedestal:') && !id.startsWith('solid:pedestal_top:')) return 'loco';
  return 'hand';
}

function rebuildColliderList(state) {
  const list = [];
  for (const mesh of state.solids || []) {
    const scope = solidScope(mesh.name);
    list.push({
      kind: 'solid',
      scope,
      id: mesh.name,
      box: new THREE.Box3(),
      raw: new THREE.Box3(),
      mesh,
      clipY: scope === 'loco' && mesh.name.startsWith('solid:pedestal:') ? LOCO_SOLID_MAX_Y : null,
    });
  }
  for (const ped of state.pedestals || []) {
    if (ped.col) {
      list.push({
        kind: 'solid',
        scope: 'loco',
        id: ped.col.name,
        box: new THREE.Box3(),
        raw: new THREE.Box3(),
        mesh: ped.col,
        clipY: LOCO_SOLID_MAX_Y,
      });
    }
    if (ped.top) {
      list.push({
        kind: 'solid',
        scope: 'hand',
        id: ped.top.name,
        box: new THREE.Box3(),
        raw: new THREE.Box3(),
        mesh: ped.top,
      });
    }
  }
  for (const btn of state.buttons || []) {
    if (!btn.face) continue;
    list.push({ kind: 'button', id: btn.id, box: new THREE.Box3(), mesh: btn.face });
  }
  state.colliders = list;
}

function updateColliderBoxes(state, group) {
  if (group) group.updateMatrixWorld(true);
  const list = state.colliders || [];
  for (const c of list) {
    c.box.setFromObject(c.mesh);
    if (c.raw) c.raw.copy(c.box);
    if (c.clipY != null && c.box.max.y > c.clipY) c.box.max.y = c.clipY;
  }
  const keepOuts = list
    .filter((c) => c.kind === 'button' && !c.box.isEmpty())
    .map((c) => c.box.clone().expandByScalar(HAND_CLEARANCE + BUTTON_TRAVEL));
  for (const c of list) {
    if (c.kind !== 'solid' || c.box.isEmpty()) continue;
    // Do not carve the dais (floor). Carve hand solids and the back wall around buttons
    // so a 0.1 m fingertip can finish a press without touching them.
    if (c.id === 'solid:dais') continue;
    if (c.scope === 'loco' && c.clipY != null) continue; // already height-clipped bases
    for (const keep of keepOuts) carveBoxAway(c.box, keep);
  }
}

/** Shrink `box` on the cheapest face so it no longer overlaps `keep`. */
function carveBoxAway(box, keep) {
  const x0 = Math.max(box.min.x, keep.min.x);
  const y0 = Math.max(box.min.y, keep.min.y);
  const z0 = Math.max(box.min.z, keep.min.z);
  const x1 = Math.min(box.max.x, keep.max.x);
  const y1 = Math.min(box.max.y, keep.max.y);
  const z1 = Math.min(box.max.z, keep.max.z);
  if (x1 <= x0 || y1 <= y0 || z1 <= z0) return;
  const faces = [
    { axis: 'x', side: 'max', cut: keep.min.x, shrink: box.max.x - keep.min.x },
    { axis: 'x', side: 'min', cut: keep.max.x, shrink: keep.max.x - box.min.x },
    { axis: 'y', side: 'max', cut: keep.min.y, shrink: box.max.y - keep.min.y },
    { axis: 'y', side: 'min', cut: keep.max.y, shrink: keep.max.y - box.min.y },
    { axis: 'z', side: 'max', cut: keep.min.z, shrink: box.max.z - keep.min.z },
    { axis: 'z', side: 'min', cut: keep.max.z, shrink: keep.max.z - box.min.z },
  ].filter((f) => f.shrink > 1e-8 && f.shrink < 1e6);
  if (!faces.length) return;
  faces.sort((a, b) => a.shrink - b.shrink);
  const f = faces[0];
  if (f.side === 'max') box.max[f.axis] = Math.min(box.max[f.axis], f.cut);
  else box.min[f.axis] = Math.max(box.min[f.axis], f.cut);
  if (box.min.x > box.max.x || box.min.y > box.max.y || box.min.z > box.max.z) {
    // Collapsed — empty it so it no longer blocks.
    box.makeEmpty();
  }
}

const _resolved = new THREE.Vector3();
const _closest = new THREE.Vector3();
const _push = new THREE.Vector3();
const _deltaOut = new THREE.Vector3();

/**
 * Push a sphere at `pos` with `radius` out of every solid collider.
 * Returns the cumulative world-space push-out vector (reused; copy it if you keep it).
 */
export function resolveHandAgainst(colliders, pos, radius = 0.05, out = _deltaOut) {
  _resolved.copy(pos);
  for (let iter = 0; iter < 4; iter++) {
    let moved = false;
    for (const c of colliders) {
      if (c.kind !== 'solid') continue;
      const box = c.box;
      if (box.isEmpty()) continue;
      _closest.copy(_resolved);
      _closest.clamp(box.min, box.max);
      _push.copy(_resolved).sub(_closest);
      const d2 = _push.lengthSq();
      if (d2 > 1e-12) {
        const d = Math.sqrt(d2);
        if (d >= radius) continue;
        _resolved.addScaledVector(_push, (radius - d) / d);
        moved = true;
      } else {
        // Centre is inside the box: push along the shortest axis.
        const ex = [
          _resolved.x - box.min.x,
          box.max.x - _resolved.x,
          _resolved.y - box.min.y,
          box.max.y - _resolved.y,
          _resolved.z - box.min.z,
          box.max.z - _resolved.z,
        ];
        let bi = 0;
        for (let i = 1; i < 6; i++) if (ex[i] < ex[bi]) bi = i;
        const axis = bi >> 1;
        const sign = bi & 1 ? 1 : -1;
        const comp = axis === 0 ? 'x' : axis === 1 ? 'y' : 'z';
        _resolved[comp] += sign * (ex[bi] + radius);
        moved = true;
      }
    }
    if (!moved) break;
  }
  out.copy(_resolved).sub(pos);
  return out;
}


function sphereBoxPenetration(pos, radius, box) {
  if (!box || box.isEmpty()) return 0;
  const closest = pos.clone().clamp(box.min, box.max);
  const d = pos.distanceTo(closest);
  if (d > 1e-12) return Math.max(0, radius - d);
  const ex = [
    pos.x - box.min.x,
    box.max.x - pos.x,
    pos.y - box.min.y,
    box.max.y - pos.y,
    pos.z - box.min.z,
    box.max.z - pos.z,
  ];
  return Math.min(...ex) + radius;
}

function maxPenetrationAgainst(pos, radius, boxes) {
  let m = 0;
  for (const box of boxes) m = Math.max(m, sphereBoxPenetration(pos, radius, box));
  return m;
}

/**
 * Headless approach of a hand sphere along the button's local +Z into a full press.
 * bodyDisp is the accumulated increase in loco-solid penetration (GT loco would
 * move the body by that amount).
 */
function approachButton(api, state, group, btn, radius, locoBoxes) {
  const face = btn.face;
  const z0 = 0.45;
  const z1 = 0;
  const steps = 24;
  const tip = new THREE.Vector3();
  let maxPen = 0;
  let bodyDisp = 0;
  let prevPen = 0;
  let fired = false;
  const before = { category: state.category, selectedId: state.selectedId, moons: state.wallet?.balance };
  for (let i = 0; i < steps; i++) {
    face.updateMatrixWorld(true);
    const z = z0 + (z1 - z0) * (i / (steps - 1));
    tip.set(0, 0, z);
    face.localToWorld(tip);
    const cat0 = state.category;
    const sel0 = state.selectedId;
    const bal0 = state.wallet?.balance;
    api.update(0.016, { hands: [{ position: tip.clone(), radius }] });
    updateColliderBoxes(state, group);
    const boxes = typeof locoBoxes === 'function' ? locoBoxes() : locoBoxes;
    const pen = maxPenetrationAgainst(tip, radius, boxes);
    maxPen = Math.max(maxPen, pen);
    if (pen > prevPen) bodyDisp += pen - prevPen;
    prevPen = pen;
    if (state.category !== cat0 || state.selectedId !== sel0 || state.wallet?.balance !== bal0) fired = true;
  }
  api.update(0.016, { hands: [] });
  void before;
  return { id: btn.id, radius, maxPen, bodyDisp, fired };
}

function rawSolidBoxes(state) {
  // Legacy: every solid mesh, unclipped — what getLocoColliders('solid') used to feed loco.step.
  return (state.colliders || []).filter((c) => c.kind === 'solid' && c.raw).map((c) => c.raw);
}

function locoSolidBoxes(state) {
  return (state.colliders || []).filter((c) => c.kind === 'solid' && c.scope === 'loco' && !c.box.isEmpty()).map((c) => c.box);
}

function runShopColliderTest(api, state, group) {
  const results = { ok: true, steps: [] };
  const fail = (name, detail) => {
    results.ok = false;
    results.steps.push({ name, ok: false, detail });
  };
  const pass = (name, detail) => results.steps.push({ name, ok: true, detail });

  group.updateMatrixWorld(true);
  rebuildColliderList(state);
  updateColliderBoxes(state, group);

  const ids = state.colliders.map((c) => c.id);
  const needSolid = ['solid:dais', 'solid:back_wall', 'solid:counter'];
  const missingSolid = needSolid.filter((id) => !ids.includes(id));
  const buttons = state.colliders.filter((c) => c.kind === 'button');
  const hasTabs = ['tab:hat', 'tab:face', 'tab:fur', 'tab:hand'].every((id) => ids.includes(id));
  const hasActions = ids.includes('action:buy') && ids.includes('action:equip');
  const hasPedestalBtns = buttons.some((c) => c.id.startsWith('item:'));
  const hasPedestalSolids = ids.some((id) => id.startsWith('solid:pedestal:'));
  if (missingSolid.length || !hasTabs || !hasActions || !hasPedestalBtns || !hasPedestalSolids) {
    fail('catalog', { missingSolid, hasTabs, hasActions, hasPedestalBtns, hasPedestalSolids, ids });
  } else {
    pass('catalog', { solids: state.colliders.filter((c) => c.kind === 'solid').length, buttons: buttons.length });
  }

  // --- Button press: FACE tab travels, clamps, fires once ---
  const tab = state.buttons.find((b) => b.id === 'tab:face');
  const face = tab.face;
  face.updateMatrixWorld(true);
  const tip = new THREE.Vector3();
  let fireCount = 0;
  // Count activations by watching category flips around 'face'
  const startCat = state.category;
  const travels = [];
  // Stay inside the poke volume so a through-press does not release and re-fire.
  // local z: front of the face (+d/2) down to roughly the mid-plane (0).
  const z0 = (tab.d || 0.06) * 0.5 + 0.06;
  const z1 = 0.0;
  const steps = 12;
  for (let i = 0; i < steps; i++) {
    face.updateMatrixWorld(true);
    const z = z0 + (z1 - z0) * (i / (steps - 1));
    tip.set(0, 0, z);
    face.localToWorld(tip);
    const before = state.category;
    api.update(0.016, { hands: [{ position: tip.clone(), radius: 0.04 }] });
    const travel = tab.restZ - tab.face.position.z;
    travels.push(Number(travel.toFixed(5)));
    if (before !== state.category) fireCount += 1;
  }
  const maxTravel = Math.max(...travels);
  const clamped = maxTravel <= BUTTON_TRAVEL + 1e-5;
  const atBottom = travels.slice(-3).every((t) => Math.abs(t - BUTTON_TRAVEL) < 1e-4 || t >= BUTTON_TRAVEL - 1e-4);
  if (state.category !== 'face' || fireCount !== 1 || !clamped) {
    fail('press', { category: state.category, fireCount, travels, maxTravel, clamped, startCat });
  } else {
    pass('press', { fireCount, maxTravel, clamped, atBottom, travels });
  }
  // Keep holding: must not fire again
  const catHold = state.category;
  for (let i = 0; i < 6; i++) api.update(0.016, { hands: [{ position: tip.clone(), radius: 0.04 }] });
  if (state.category !== catHold) fail('once', { category: state.category });
  else pass('once', { category: state.category });

  // Release: button returns to rest
  api.update(0.016, { hands: [] });
  const back = Math.abs(tab.face.position.z - tab.restZ) < 1e-4;
  if (!back) fail('release', { z: tab.face.position.z, rest: tab.restZ });
  else pass('release', { z: tab.face.position.z });

  // --- Solid: a fingertip inside the back wall is pushed out and does not stay inside ---
  updateColliderBoxes(state, group);
  const wall = state.colliders.find((c) => c.id === 'solid:back_wall');
  const inside = wall.box.getCenter(new THREE.Vector3());
  const delta = api.resolveHand(inside, 0.05, new THREE.Vector3());
  const after = inside.clone().add(delta);
  // Sphere of radius 0.05 must sit on or outside the box
  const closest = after.clone().clamp(wall.box.min, wall.box.max);
  const gap = after.distanceTo(closest);
  const escaped = delta.length() > 1e-4 && gap >= 0.05 - 1e-4;
  if (!escaped) fail('wall', { delta: delta.toArray(), gap, box: { min: wall.box.min.toArray(), max: wall.box.max.toArray() } });
  else pass('wall', { delta: delta.toArray(), gap });

  // --- 0.1 m hand-sphere presses: tabs, Buy, Equip, one pedestal plate ---
  const radius = HAND_CLEARANCE;
  // Restore a known category and pick targets
  api.setCategory('hat');
  const tabIds = ['tab:hat', 'tab:face', 'tab:fur', 'tab:hand'];
  const targets = [];
  for (const id of tabIds) {
    const b = state.buttons.find((x) => x.id === id);
    if (b) targets.push(b);
  }
  const plate = state.buttons.find((b) => b.kind === 'item');
  if (plate) targets.push(plate);

  // Equip: needs an owned selection (starter banana cap)
  const ownedPed = state.buttons.find((b) => b.kind === 'item' && state.wallet.owned.has(b.item.id));
  if (ownedPed) {
    state.selectedId = ownedPed.item.id;
    refreshAll(state, api._catalog);
  }
  const equipBtn = state.buttons.find((b) => b.id === 'action:equip');
  if (equipBtn) targets.push(equipBtn);

  // Buy: needs a for-sale item the wallet does not own
  const salePed = state.buttons.find((b) => b.kind === 'item' && b.item.price > 0 && !state.wallet.owned.has(b.item.id));
  if (salePed) {
    state.selectedId = salePed.item.id;
    refreshAll(state, api._catalog);
  }
  const buyBtn = state.buttons.find((b) => b.id === 'action:buy');
  if (buyBtn) targets.push(buyBtn);

  const legacyRuns = [];
  const locoRuns = [];
  for (const btn of targets) {
    // Measure "before" against the unclipped full solid list (old loco feed)
    const legacy = approachButton(api, state, group, btn, radius, () => rawSolidBoxes(state));
    legacyRuns.push(legacy);
    if (salePed && btn.id === 'action:buy') {
      state.selectedId = salePed.item.id;
      refreshAll(state, api._catalog);
    }
    if (ownedPed && btn.id === 'action:equip') {
      state.selectedId = ownedPed.item.id;
      refreshAll(state, api._catalog);
    }
    const now = approachButton(api, state, group, btn, radius, () => locoSolidBoxes(state));
    locoRuns.push(now);
  }
  const maxBefore = Math.max(0, ...legacyRuns.map((r) => r.bodyDisp));
  const maxAfter = Math.max(0, ...locoRuns.map((r) => r.bodyDisp));
  results.displacement = { before: maxBefore, after: maxAfter, radius, legacy: legacyRuns, loco: locoRuns };
  // Target: no body shove from a 0.1 m press against loco solids
  if (maxAfter > 0.005) fail('clearance', { maxBefore, maxAfter, after: locoRuns });
  else pass('clearance', { maxBefore, maxAfter, after: locoRuns.map((r) => ({ id: r.id, bodyDisp: r.bodyDisp, maxPen: r.maxPen, fired: r.fired })) });

  results.fireCount = fireCount;
  results.maxTravel = maxTravel;
  results.BUTTON_TRAVEL = BUTTON_TRAVEL;
  return results;
}

function collectTargets(state) {
  return state.buttons.map((b) => b.face).filter(Boolean);
}

function findButton(state, id) {
  return state.buttons.find((b) => b.id === id);
}

function pokeHands(hand, targets, state, hover) {
  const radius = hand.radius ?? 0.04;
  const pos = hand.position;
  if (!pos) return hover;
  let best = hover;
  let bestDist = Infinity;
  for (const mesh of targets) {
    const btn = mesh.userData.button;
    if (!btn) continue;
    const local = mesh.worldToLocal(pos.clone());
    // Approximate the hit volume as a box in the face's local space
    const hw = (btn.w ?? 0.3) / 2;
    const hh = (btn.h ?? 0.1) / 2;
    const hd = (btn.d ?? 0.06) / 2 + radius;
    if (Math.abs(local.x) > hw + radius || Math.abs(local.y) > hh + radius) continue;
    const depth = hd - local.z;
    if (depth < 0 || depth > hd + radius) continue;
    const dist = local.length();
    if (dist < bestDist) {
      bestDist = dist;
      best = btn;
      markHeld(state, btn, Math.max(0, depth), hand);
    }
  }
  return best;
}

function rayPick(ray, targets, state, raycaster, hover) {
  if (!ray?.origin || !ray?.direction) return hover;
  raycaster.ray.origin.copy(ray.origin);
  raycaster.ray.direction.copy(ray.direction).normalize();
  const hits = raycaster.intersectObjects(targets, false);
  if (!hits.length) return hover;
  const btn = hits[0].object.userData.button;
  if (!btn) return hover;
  if (ray.trigger) markHeld(state, btn, PRESS_DEPTH + 0.004, ray, ray.justPressed);
  return btn;
}

function markHeld(state, btn, depth, source, forcePress) {
  let rec = state.pressed.get(btn.id);
  if (!rec) {
    rec = { depth: 0, fired: false, held: true };
    state.pressed.set(btn.id, rec);
  }
  rec.held = true;
  rec.depth = depth;
  if (btn.kind !== 'item') setButtonDepth(btn, depth);
  const shouldFire = forcePress || (depth >= PRESS_DEPTH && !rec.fired);
  if (shouldFire) {
    rec.fired = true;
    handleActivate(state, btn);
    state.api?._onPress?.(btn);
    pulseHaptic(source, btn.kind === 'buy' || btn.kind === 'equip' ? 0.55 : 0.35, 36);
  }
}

function pulseHaptic(source, strength = 0.4, duration = 40) {
  const inputSource = source?.inputSource || source?.source || source;
  const gamepad = inputSource?.gamepad || source?.gamepad;
  const actuator = gamepad?.hapticActuators?.[0] || gamepad?.vibrationActuator;
  if (actuator?.pulse) {
    try { actuator.pulse(strength, duration); } catch (_) { /* ignore */ }
  }
  // Some XR browsers expose pulse on the XRInputSource itself
  if (typeof inputSource?.pulse === 'function') {
    try { inputSource.pulse(strength, duration); } catch (_) { /* ignore */ }
  }
}

/**
 * CanvasTexture sign. Transparent or plaster card, dark ink, optional second line.
 * No emoji, no decorative gradients.
 */
export function makeSign(lines, w, h, opt = {}) {
  const reqW = opt.pxW || 256;
  const reqH = opt.pxH || 128;
  const pxW = Math.min(256, reqW);
  const pxH = Math.min(256, reqH);
  const sx = pxW / reqW;
  const canvas = document.createElement('canvas');
  canvas.width = pxW;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d');
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);

  function draw(nextLines = lines) {
    const list = Array.isArray(nextLines) ? nextLines : [String(nextLines)];
    ctx.clearRect(0, 0, pxW, pxH);
    if (opt.bg !== 'transparent') {
      ctx.fillStyle = opt.bg || CARD;
      const pad = Math.max(3, Math.round(8 * sx));
      roundRectPath(ctx, pad, pad, pxW - pad * 2, pxH - pad * 2, Math.max(3, Math.round(10 * sx)));
      ctx.fill();
      if (opt.accentBar !== false && opt.bg !== 'transparent') {
        ctx.fillStyle = SHOP_ACCENT_HEX;
        ctx.fillRect(pad, pad, Math.max(3, Math.round(8 * sx)), pxH - pad * 2);
      }
    }
    ctx.fillStyle = opt.color || INK;
    ctx.textAlign = opt.align || 'center';
    ctx.textBaseline = 'middle';
    const x = (opt.align === 'left') ? Math.round(36 * sx) : pxW / 2;
    const size = Math.max(8, Math.round((opt.size || 36) * sx));
    const sub = Math.max(7, Math.round((opt.subSize || Math.round((opt.size || 36) * 0.72)) * sx));
    if (list.length === 1) {
      ctx.font = `${opt.weight || 600} ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      if (opt.letterSpacing) ctx.letterSpacing = `${opt.letterSpacing}em`;
      ctx.fillText(list[0], x, pxH / 2);
    } else {
      ctx.font = `${opt.weight || 700} ${size}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      ctx.fillText(list[0], x, pxH * 0.38);
      ctx.font = `500 ${sub}px "Helvetica Neue", Helvetica, Arial, sans-serif`;
      ctx.fillStyle = opt.subColor || MUTED;
      ctx.fillText(list[1], x, pxH * 0.7);
    }
    tex.needsUpdate = true;
  }
  draw(lines);
  return { mesh, canvas, ctx, tex, draw };
}

function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
