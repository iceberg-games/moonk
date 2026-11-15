import * as THREE from 'three';
import { BUILDERS } from './maps/index.js';
import { buildHub, PORTALS, TERMINAL } from './hub.js';
import { Locomotion, LOCO } from './physics.js';
import { Avatar } from './avatar.js';
import { createGenerators } from './generators.js';
import { createShopStand, SUGGESTED_HUB_PLACEMENT } from './kit/shopStand.js';
import { createMonkey } from './kit/monkey.js';
import { applyLoadout, serializeLoadout } from './kit/loadout.js';
import { createShopSession, buyResMessage, cosRejMessage, unlockMessage, revertSlot } from './kit/shopInventory.js';
import { ITEMS_BY_ID } from './kit/cosmetics/catalog.js';
import { Panel, roundRect } from './panel.js';
import { Net } from './net.js';
import { LocalNet } from './localNet.js';
import { sfx, unlock, buzz } from './audio.js';
import { save, persist } from './save.js';
import { MAPS, MODES, MONSTERS, FORM_TELL, formDef } from '../shared/defs.mjs';

const Q = new URLSearchParams(location.search);
const DEV = Q.get('dev') === '1';          // hidden automation/test hook only. There is no desktop play UI.
const $ = (id) => document.getElementById(id);

// ------------------------------------------------------------------ renderer / scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: DEV });
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); renderer.xr.enabled = true; renderer.xr.setReferenceSpaceType('local-floor');
try { renderer.xr.setFoveation?.(1); } catch { /* */ }
if (DEV) { renderer.domElement.style.cssText = 'position:fixed;inset:0;z-index:5'; } document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene(); const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 250);
const rig = new THREE.Group(); scene.add(rig); rig.add(camera);
const ctrls = [0, 1].map((i) => { const c = renderer.xr.getController(i); const gp = renderer.xr.getControllerGrip(i); rig.add(c, gp); const o = { c, gp, src: null, hand: i === 0 ? 'left' : 'right' }; c.addEventListener('connected', (e) => { o.src = e.data; if (e.data.handedness) o.hand = e.data.handedness; }); return o; });
const lightsGroup = new THREE.Group(); scene.add(lightsGroup);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

// ------------------------------------------------------------------ state
const S = { place: null, cols: [], map: null, room: null, id: null, me: null, players: new Map(), joined: false, status: 'Not connected', offline: false, pref: { mode: 'normal' }, code: '', focus: 'name', name: save.name, region: 'Local', zone: '', lastSnap: 0, left: 0, msg: '' };
// Single-player switch: a production build with no game server (VITE_WS_URL empty) and no ?ws= runs the game in the page
// (LocalNet: AI players, local Moons). ?solo=1 forces it, ?solo=0 forces multiplayer. Set VITE_WS_URL to turn multiplayer back on.
const SOLO = Q.get('solo') === '1' || (Q.get('solo') !== '0' && !Q.get('ws') && !import.meta.env.VITE_WS_URL && import.meta.env.PROD);
const net = SOLO ? new LocalNet({ getMap: (id) => cache[id] ||= (id === 'hub' ? buildHub() : BUILDERS[id]()) }) : new Net(); const remote = new Map();
const cache = {};
const loco = new Locomotion();   // arm (monkey) locomotion + walker (legged monsters); tuning constants: LOCO in src/physics.js
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), headL = new THREE.Vector3(), handsL = [new THREE.Vector3(), new THREE.Vector3()];
const dev = { head: [0, 1.6, 0], q: [0, 0, 0, 1], l: [-0.3, 0.9, 0.2], r: [0.3, 0.9, 0.2], stick: [0, 0, 0, 0], look: null };

// ------------------------------------------------------------------ places
function desiredPlace() { const r = S.room; if (!r) return 'hub'; return (r.phase === 'play' || r.phase === 'over') ? r.map : 'hub'; }
function loadPlace(id, quiet) {
  if (S.map) scene.remove(S.map.group);
  const m = cache[id] ||= (id === 'hub' ? buildHub() : BUILDERS[id]());
  S.map = m; S.place = id; S.cols = m.cols; S.mapT = 0; scene.add(m.group);   // S.mapT = seconds since this map was loaded (for the optional map.update hook)
  scene.background = new THREE.Color(m.sky); scene.fog = new THREE.Fog(m.fog[0], m.fog[1], m.fog[2]);
  lightsGroup.clear(); lightsGroup.add(new THREE.HemisphereLight(m.hemi[0], m.hemi[1], m.hemi[2]));
  if (m.sun) { const d = new THREE.DirectionalLight(m.sun[0], m.sun[1]); d.position.set(...m.sun[2]); lightsGroup.add(d); }
  for (const l of m.lights) { const p = new THREE.PointLight(l.c, l.i, l.d, 2); p.position.set(...l.p); lightsGroup.add(p); }
  rig.rotation.set(0, 0, 0); rig.position.set(m.spawn[0], m.spawn[1], m.spawn[2]); loco.reset();
  if (m.board) placeBoard(m); else if (id === 'hub') placeBoard({ board: { pos: [-5.5, 0, 7], ry: 0.7 } });
  S.zone = ''; if (id === 'hub') buildTerminal();
  if (!quiet) caption(id === 'hub' ? 'MOONK Plaza' : MAPS[id].name);
}
const ZONES = {
  forest: [['Great Stump', (x, z) => Math.hypot(x, z) < 6], ['High Canopy', (x, z, y) => y > 8], ['Canopy Forest', () => true]],
  crypt: [['The Altar', (x, z) => z < -24], ['Upper Balcony', (x, z, y) => y > 4], ['Haunted Crypt', () => true]],
  carnival: [['Ferris Wheel', (x, z) => Math.hypot(x, z) < 12], ['Funhouse', (x, z) => x > 12 && x < 24 && z > -13 && z < -3], ['Ticket Plaza', (x, z) => z > 26], ['Rusted Carnival', () => true]],
  mine: [['The Hollow Shaft', (x, z, y) => Math.abs(x) < 8 && Math.abs(z) < 8], ['The Trestle', (x, z, y) => y > 6], ['Loading Bay', (x, z) => z > 22], ['Abandoned Mine', () => true]],
  lighthouse: [['The Lantern Gallery', (x, z, y) => y > 22], ['The Catwalk', (x, z, y) => y > 6 && Math.hypot(x, z) < 9], ['Keeper\'s Cottage', (x, z) => x < -12.5 && x > -20.5 && Math.abs(z) < 4], ['Sea Stacks', (x, z) => Math.hypot(x, z) > 30], ['Drowned Lighthouse', () => true]],
  trainyard: [['The Signal Gantry', (x, z, y) => y > 6.5 && x < -33], ['The Water Tower', (x, z) => Math.hypot(x, z - 14) < 8], ['The Roundhouse', (x, z) => x > 35 && z > 5 && z < 37], ['Boxcar Rows', (x, z) => z > -30 && z < 4], ['Frozen Yard', () => true]],
  marsh: [['Old Cabin', (x, z) => Math.hypot(x + 14, z + 12) < 8], ['Rotten Dock', (x, z) => x > 12 && z > 7 && z < 13], ['Hollow Marsh', () => true]],
};
function checkZone(head) {
  const zs = S.place === 'hub' ? S.map.zones.map((z) => [z.name, z.test]) : ZONES[S.place]; if (!zs) return;
  const z = zs.find(([, t]) => t(head.x, head.z, head.y)); if (z && z[0] !== S.zone) { if (S.zone) caption(z[0]); S.zone = z[0]; }
}

// ------------------------------------------------------------------ in-world UI
const FONT = 'system-ui,-apple-system,"Segoe UI",Roboto,sans-serif';
const C = { bg: '#12161d', edge: '#2a313d', text: '#e6e9ef', mute: '#8b94a3', btn: '#232a36', key: '#1b212b', acc: '#5aa9ff', hot: '#3b82c4', warn: '#e8a0a0' };
const term = new Panel(1024, 768, 1.6, 1.2); let termMesh = null; const pressed = {}; let hoverId = [null, null];
function termDraw() {
  const g = term.g; term.buttons.length = 0; g.clearRect(0, 0, 1024, 768);
  roundRect(g, 4, 4, 1016, 760, 22, C.bg, C.edge);
  g.textBaseline = 'middle'; g.fillStyle = C.text; g.font = `700 40px ${FONT}`; g.textAlign = 'left'; g.fillText('MOONK', 36, 52);
  g.font = `400 24px ${FONT}`; g.fillStyle = C.mute; g.textAlign = 'right'; g.fillText(SOLO ? `Single-player  ·  ${S.joined ? 'In a game' : 'Ready'}` : `${S.region}  ·  ${S.joined ? 'Room ' + (S.room?.code || '') : 'Not in a room'}`, 990, 52);
  const field = (id, label, val, x, w) => { g.textAlign = 'left'; g.font = `500 20px ${FONT}`; g.fillStyle = C.mute; g.fillText(label, x, 112); roundRect(g, x, 126, w, 64, 12, C.btn, S.focus === id ? C.acc : C.edge); g.font = `600 32px ${FONT}`; g.fillStyle = C.text; g.fillText(val + (S.focus === id ? '_' : ''), x + 18, 160); term.btn('f:' + id, x, 126, w, 64); };
  field('name', 'NAME', S.name, 36, 520);
  if (SOLO) { g.textAlign = 'left'; g.font = `500 20px ${FONT}`; g.fillStyle = C.mute; g.fillText('MULTIPLAYER', 580, 112); roundRect(g, 580, 126, 410, 64, 12, C.key, C.edge); g.font = `600 26px ${FONT}`; g.fillText('Room codes: coming soon', 598, 160); }
  else field('code', 'ROOM CODE', S.code, 580, 410);
  const btns = SOLO ? [['quick', 'Quick play'], ['new:normal', 'Classic Tag'], ['new:horror', 'Be the Monster']] : [['quick', 'Quick play'], ['join', 'Join code'], ['new:normal', 'New: Classic'], ['new:horror', 'New: Monster']];
  if (SOLO) { const x = 36 + 3 * 238; roundRect(g, x, 218, 224, 64, 12, C.key, C.edge); g.font = `500 20px ${FONT}`; g.fillStyle = C.mute; g.textAlign = 'center'; g.fillText('Online: coming soon', x + 112, 250); }
  btns.forEach(([id, t], i) => { const x = 36 + i * 238, on = pressed[id] > performance.now(); roundRect(g, x, 218, 224, 64, 12, on ? C.hot : C.btn, C.edge); g.font = `600 24px ${FONT}`; g.fillStyle = C.text; g.textAlign = 'center'; g.fillText(t, x + 112, 250); term.btn(id, x, 218, 224, 64); });
  g.textAlign = 'left'; g.font = `400 24px ${FONT}`; g.fillStyle = /taken|not|cannot|error|wrong|full|banned|offline|unavailable|unreachable|disconnect/i.test(S.status) ? C.warn : C.mute; g.fillText(S.status, 36, 318);
  if (!SOLO && (S.offline || !net.open)) { const on = pressed.retry > performance.now(); roundRect(g, 780, 286, 200, 56, 12, on ? C.hot : C.btn, C.warn); g.font = `600 24px ${FONT}`; g.fillStyle = C.text; g.textAlign = 'center'; g.fillText('Retry', 880, 316); term.btn('retry', 780, 286, 200, 56); }
  const rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  rows.forEach((row, ri) => [...row].forEach((ch, ci) => { const x = 36 + ri * (ri === 2 ? 40 : ri === 3 ? 80 : 0) + (ri === 1 ? 0 : 0) + ci * 96, y = 350 + ri * 84; const id = 'k:' + ch, on = pressed[id] > performance.now(); roundRect(g, x, y, 86, 72, 10, on ? C.hot : C.key, C.edge); g.font = `600 32px ${FONT}`; g.fillStyle = C.text; g.textAlign = 'center'; g.fillText(ch, x + 43, y + 38); term.btn(id, x, y, 86, 72); }));
  [['k:BACK', 'Back', 36 + 80 + 7 * 96, 350 + 3 * 84, 150], ['k:CLEAR', 'Clear', 36 + 80 + 7 * 96 + 160, 350 + 3 * 84, 150], ['k:SPACE', 'Space', 36, 350 + 4 * 84, 500], ['k:-', '-', 560, 350 + 4 * 84, 86]].forEach(([id, t, x, y, w]) => { const on = pressed[id] > performance.now(); roundRect(g, x, y, w, 72, 10, on ? C.hot : C.key, C.edge); g.font = `600 26px ${FONT}`; g.fillStyle = C.text; g.textAlign = 'center'; g.fillText(t, x + w / 2, y + 38); term.btn(id, x, y, w, 72); });
  term.refresh();
}
// ---- wardrobe shop stand (MOONK Cosmetics kit): west of the plaza, visible from spawn, keyboard clear.
// SHOP_AT uses kit SUGGESTED_HUB_PLACEMENT ([-2.8, 0, 7.6], rotationY 0.86, open face toward spawn).
const SHOP_AT = SUGGESTED_HUB_PLACEMENT;
let shop = null, shopMirror = null, shopPreview = null; const shopTrig = [false, false];
const shopSession = createShopSession();
const itemName = (id) => ITEMS_BY_ID[id]?.name || id;
function shopWalletFromSave(equip = save.equip) {
  if (shopSession.active) {
    const inv = shopSession.inv;
    return { balance: inv.moons, owned: inv.owned, unlocks: inv.unlocks, equipped: equip };
  }
  return { balance: save.moons, owned: save.owned, equipped: equip, unlocks: [] };
}
function applyShopInv(msg) {
  const inv = shopSession.applyInv(msg);
  shop?.setWallet({ balance: inv.moons, owned: inv.owned, unlocks: inv.unlocks, equipped: save.equip }, { strict: true });
  return inv;
}
function buildShop() {
  const preview = createMonkey(); applyLoadout(preview, save.equip); preview.root.position.set(-1.15, 0.09, 0.4); preview.root.rotation.y = Math.PI + 0.42;   // mirror subject (the local avatar is first-person, no body)
  shopPreview = preview;
  shop = createShopStand({
    renderer: { capabilities: { maxTextureSize: 512 } },   // small mirror target: Reflector renders once per eye in VR
    player: preview, wallet: { balance: save.moons, owned: save.owned, equipped: save.equip },
    onEquip: (item, loadout) => { const cos = serializeLoadout(loadout); save.equip = cos; persist(); local.setEquip(cos); applyLoadout(shopPreview, cos); if (net.open) net.send({ t: 'cos', cos }); sfx.tick(); },
    onPress: () => { unlock(); sfx.tap(0.45, 1); },
    onBuy: (item, wallet) => {
      if (S.joined && net.open && !net.local) { net.send({ t: 'buy', id: item.id }); return { pending: true }; }   // single-player: the local save is the wallet
      save.moons = Math.max(0, (wallet.balance ?? save.moons) - (item.price || 0));
      const owned = new Set(wallet.owned || save.owned || []);
      if (item.id) owned.add(item.id);
      save.owned = [...owned];
      persist();
      sfx.buy();
    },
  });
  shop.group.add(preview.root); shopMirror = shop.group.getObjectByName('shop_mirror');
  shop.group.position.set(...SHOP_AT.position); shop.group.rotation.y = SHOP_AT.rotationY;
}
const _tip = [new THREE.Vector3(), new THREE.Vector3()], _ro = [new THREE.Vector3(), new THREE.Vector3()], _rd = [new THREE.Vector3(), new THREE.Vector3()];
function shopFrame(dt) {
  if (!shop || S.place !== 'hub') return;
  const dd = Math.hypot(world.head.x - SHOP_AT.position[0], world.head.z - SHOP_AT.position[2]); if (shopMirror) shopMirror.visible = dd < 9;   // mirror pass only when near
  if (dd > 14) return;
  const rays = [], hands = [];
  for (let i = 0; i < 2; i++) {
    const c = ctrls.find((o) => o.hand === (i ? 'right' : 'left')); const src = c?.src; const trig = !!src?.gamepad?.buttons?.[0]?.pressed;
    hands.push({ position: _tip[i].copy(world.hands[i]), radius: 0.05, inputSource: src || null });
    if (c) { c.c.getWorldPosition(_ro[i]); _rd[i].set(0, 0, -1).transformDirection(c.c.matrixWorld); rays.push({ origin: _ro[i], direction: _rd[i], trigger: trig, justPressed: trig && !shopTrig[i], inputSource: src || null }); }
    shopTrig[i] = trig;
  }
  shop.update(dt, { hands, rays });   // raw fingertips: do NOT pre-resolve them, Buy/Equip must be able to travel into their volumes
  for (let i = 0; i < 2; i++) world.hands[i].add(shop.resolveHand(world.hands[i], 0.08));   // posed hands (avatar/sent pose) are pushed out of the shop's solid parts afterwards
}
function buildTerminal() {
  if (!shop) buildShop();
  if (shop.group.parent !== S.map.group) S.map.group.add(shop.group);
  if (!termMesh) { termMesh = term.mesh(); termMesh.position.set(TERMINAL.pos[0], TERMINAL.pos[1], TERMINAL.pos[2]); termMesh.rotation.x = -0.12; }
  S.map.group.add(termMesh); termDraw();
  if (!S.map.portalsReady) {
    S.map.portalsReady = true;
    for (const p of S.map.portals) { const t = labelTex(p.label, p.sub); const sp = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.65), new THREE.MeshBasicMaterial({ map: t, transparent: true, side: THREE.DoubleSide })); sp.position.set(p.pos[0], 3.9, p.pos[2]); sp.rotation.y = Math.PI; S.map.group.add(sp); p.votes = { mesh: null }; }
  }
}
function labelTex(a, b) { const c = document.createElement('canvas'); c.width = 1024; c.height = 256; const g = c.getContext('2d'); roundRect(g, 4, 4, 1016, 248, 28, 'rgba(18,22,29,0.92)', C.edge); g.fillStyle = C.text; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `700 78px ${FONT}`; g.fillText(a, 512, 100); g.font = `400 44px ${FONT}`; g.fillStyle = C.mute; g.fillText(b, 512, 190); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; }
// scoreboard
const board = new Panel(768, 512, 1.5, 1.0); let boardMesh = null;
function placeBoard(m) { if (!boardMesh) boardMesh = board.mesh(); S.map.group.add(boardMesh); boardMesh.position.set(m.board.pos[0], 1.6, m.board.pos[2]); boardMesh.rotation.y = m.board.ry; }
let boardAt = 0;
function boardDraw() {
  const g = board.g; g.clearRect(0, 0, 768, 512); roundRect(g, 4, 4, 760, 504, 20, C.bg, C.edge); g.textBaseline = 'middle'; g.textAlign = 'left';
  const r = S.room; g.fillStyle = C.text; g.font = `700 34px ${FONT}`; g.fillText(r ? (SOLO ? 'Single-player' : `Room ${r.code}`) : 'Scoreboard', 30, 46);
  g.font = `400 24px ${FONT}`; g.fillStyle = C.mute; g.fillText(r ? `${MODES[r.mode].name}  ·  ${phaseText()}` : 'Join a room at the terminal', 30, 86);
  g.font = `600 20px ${FONT}`; g.fillStyle = C.mute; g.fillText('PLAYER', 30, 130); g.textAlign = 'right'; g.fillText('STATUS', 520, 130); g.fillText('TAGS', 620, 130); g.fillText('SURVIVED', 740, 130);
  const ps = [...S.players.values()].sort((a, b) => (b.tg || 0) - (a.tg || 0)).slice(0, 8);
  ps.forEach((p, i) => { const y = 170 + i * 40; g.textAlign = 'left'; g.font = `500 26px ${FONT}`; g.fillStyle = p.id === S.id ? C.acc : C.text; g.fillText(p.n, 30, y); g.textAlign = 'right'; g.fillStyle = C.mute; g.fillText(p.ro === 'monster' ? 'Monster' : p.it ? 'Tagger' : p.cg ? 'Caught' : 'Runner', 520, y); g.fillText(String(p.tg || 0), 620, y); g.fillText(String(p.sv || 0) + 's', 740, y); });
  board.refresh();
}
const phaseText = () => { const r = S.room; if (!r) return ''; const t = S.left > 0 ? ` ${Math.floor(S.left / 60)}:${String(S.left % 60).padStart(2, '0')}` : ''; return ({ lobby: 'Waiting for players', vote: 'Map vote' + t, countdown: 'Starting' + t, play: 'Round' + t, over: 'Round over' })[r.phase] || r.phase; };
// head-locked: white fade, caption, small HUD
const fade = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, depthWrite: false })); fade.position.z = -0.3; fade.renderOrder = 999; fade.frustumCulled = false; camera.add(fade);
const cap = new Panel(1024, 128, 0.9, 0.112); const capMesh = cap.mesh(); capMesh.position.set(0, -0.3, -1); capMesh.renderOrder = 998; capMesh.material = cap.mat.clone(); capMesh.material.depthTest = false; capMesh.material.opacity = 0; camera.add(capMesh);
let capUntil = 0, fadeT = 0;
function caption(text) { const g = cap.g; g.clearRect(0, 0, 1024, 128); g.font = `600 56px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 10; g.strokeStyle = 'rgba(8,10,14,.85)'; g.lineJoin = 'round'; g.strokeText(text.toUpperCase(), 512, 64); g.fillStyle = '#f2f4f8'; g.fillText(text.toUpperCase(), 512, 64); cap.refresh(); capUntil = performance.now() + 3200; }
const hud = new Panel(512, 96, 0.5, 0.094); const hudMesh = hud.mesh(); hudMesh.position.set(0, -0.26, -0.8); hudMesh.material = hud.mat.clone(); hudMesh.material.depthTest = false; hudMesh.renderOrder = 997; camera.add(hudMesh); hudMesh.visible = false; let hudAt = 0;
function hudDraw() { const g = hud.g; g.clearRect(0, 0, 512, 96); roundRect(g, 2, 2, 508, 92, 14, 'rgba(14,17,24,.78)', null); g.textBaseline = 'middle'; g.textAlign = 'left'; g.font = `600 30px ${FONT}`; g.fillStyle = '#f2f4f8'; g.fillText(roleText(), 18, 34); g.font = `400 24px ${FONT}`; g.fillStyle = C.mute; g.fillText(phaseText(), 18, 70); hud.refresh(); }
// transform tell: while the server counts FORM_TELL, the monster visibly swells/shrinks toward its next form and shakes (the Avatar adds the shake)
function tellScale(d, p) { if (!(p.xf > 0) || !p.xt) return d.scale; const to = formDef(S.room.mType, p.xt); if (!to) return d.scale; const k = 1 - Math.min(1, p.xf / (FORM_TELL * 1000)); return d.scale + (to.scale - d.scale) * k * k; }
function roleText() { const m = S.me; if (!m) return ''; if (S.room.mode === 'horror') { if (m.ro !== 'monster') return m.cg ? 'Caught' : 'Runner'; const fd = formDef(S.room.mType, m.fo); const abl = MONSTERS[S.room.mType]?.ability; const sw0 = abl ? (m.dg ? ` · DISGUISED as ${m.dg}` : m.ab === 2 && abl.id === 'burrow' ? ' · UNDERGROUND' : m.ab === 1 ? ` · ${abl.name}...` : m.ab === 2 ? ` · ${abl.name}!` : m.ac > 0 ? ` · ${abl.name} ${m.ac.toFixed(1)}s` : ` · A/B/X/Y: ${abl.name}`) : ''; const sw = fd?.switchTo ? (m.xf > 0 ? ' · changing...' : m.fc > 0 ? ` · switch ${m.fc.toFixed(1)}s` : ' · A/B/X/Y: switch') : sw0; return `${MONSTERS[S.room.mType]?.name || 'Monster'}: ${fd?.label || ''}${sw}`; } return m.it ? 'You are IT' : 'Run!'; }
function transition(fn, name) { fade.material.opacity = 1; fadeT = 1; fn(); if (name) caption(name); }

// ------------------------------------------------------------------ networking
const OFFLINE_MSG = 'Offline — multiplayer server unavailable';
function landingNote(text) { const el = document.getElementById('err'); if (el) el.textContent = text || ''; }
function markOffline(msg) {
  S.offline = true;
  S.status = msg || OFFLINE_MSG;
  termDraw();
  landingNote(S.status + '. Single-player still works. Tap Retry on the lobby computer.');
}
function markOnline() {
  S.offline = false;
  if (!S.joined) S.status = SOLO ? 'Single-player: Quick play, Classic Tag or Be the Monster.' : 'Connected. Quick play, or enter a room code.';
  termDraw();
  landingNote('');
}
function leaveRoomState() {
  S.joined = false; S.room = null; S.id = null; S.me = null; S.players.clear();
  shopSession.clear();
  shop?.setWallet(shopWalletFromSave());
  for (const r of remote.values()) scene.remove(r.av.root);
  remote.clear();
}
function tryConnect() {
  if (net.open) return Promise.resolve();
  if (S._connecting) return S._connecting;
  S.status = 'Connecting...'; termDraw();
  S._connecting = net.connect().then(() => { S._connecting = null; markOnline(); }).catch(() => { S._connecting = null; markOffline(OFFLINE_MSG); return Promise.reject(new Error(OFFLINE_MSG)); });
  return S._connecting;
}
function join(opts) {
  S.status = 'Connecting...'; termDraw();
  const go = () => { net.send({ t: 'join', name: S.name, did: save.did, cos: serializeLoadout(save.equip), ...opts }); S.status = 'Joining...'; termDraw(); };
  if (net.open) go(); else tryConnect().then(go).catch(() => { /* markOffline already ran */ });
}
net.on('welcome', (m) => { S.id = m.id; S.joined = true; S.offline = false; S.room = m.room; save.name = S.name; persist(); S.status = SOLO ? `Single-player: ${MODES[m.room.mode]?.name || 'game'} vs AI` : `Joined ${m.room.public === false ? 'private ' : ''}room ${m.room.code}`; S.code = m.room.code; termDraw(); applyRoom(); });
net.on('inv', (m) => { applyShopInv(m); });
net.on('buyres', (m) => {
  shop?.endBuy?.();
  if (m.ok) { sfx.buy(); return; }   // inv follows and is the wallet truth
  const msg = buyResMessage(m);
  shop?.setStatus([msg]);
  sfx.deny();
});
net.on('cosrej', (m) => {
  const next = revertSlot(save.equip, m.slot);
  save.equip = next; persist(); local.setEquip(next);
  if (shopPreview) applyLoadout(shopPreview, next);
  shop?.setWallet(shopWalletFromSave(next), shopSession.active ? { strict: true } : undefined);
  shop?.setStatus([cosRejMessage(m)]);
  sfx.deny();
});
net.on('unlock', (m) => {
  shop?.setStatus([unlockMessage(m, itemName)]);
  sfx.tick();
});
net.on('error', (m) => { S.status = m.msg || 'Error'; termDraw(); sfx.deny(); });
net.on('room', (m) => { S.room = m.room; if (SOLO && S.joined) S.status = `Single-player: ${MODES[m.room.mode]?.name || 'game'} vs AI`; applyRoom(); });
net.on('fling', (m) => { if (Array.isArray(m.v)) { loco.impulse(m.v); if (m.stun > 0) { loco.stun = m.stun; loco.holding = false; haptic(1, 250); } } });   // Dangler yank: also stuns the hands (no grabbing) for m.stun s
net.on('shr', (m) => { loco.gain = m.gain || 0.5; shrEnd = performance.now() + (m.ms || 2500); caption('SHRIEK! Your pushes are weak'); haptic(1, 600); });   // Wailer shriek: push-off gain x0.5 for a while (client-side loco multiplier)
net.on('tether', (m) => { if (Array.isArray(m.o)) { loco.leash = { o: new THREE.Vector3(...m.o), r: m.r || 2.5, t: (m.ms || 2500) / 1000 }; caption('TETHERED! You cannot go far'); haptic(1, 500); } });   // Stringman: soft leash in LOCO for m.ms
net.on('ping', (m) => { if (Array.isArray(m.ids)) for (const id of m.ids) pings.set(id, performance.now() + (m.ms || 1500)); });   // Wailer only: runners caught in the shriek are marked
net.on('left', (m) => { S.players.delete(m.id); });
net.on('close', () => { const was = S.joined; leaveRoomState(); markOffline(was ? 'Disconnected from server' : OFFLINE_MSG); applyRoom(); });
net.on('snap', (m) => {
  const t = performance.now(); S.left = m.left; S.gp = m.gp; const seen = new Set();
  for (const p of m.ps) {
    seen.add(p.id); S.players.set(p.id, p);
    if (p.id === S.id) {
      S.me = p;
      // Reconcile a rejected loadout (unknown id or unlock-only) with the sanitized ps[i].c. No per-tick rebuild if unchanged.
      if (p.c) {
        const next = serializeLoadout(p.c);
        if (JSON.stringify(next) !== JSON.stringify(serializeLoadout(save.equip))) {
          save.equip = next; persist(); local.setEquip(next);
          if (shopPreview) applyLoadout(shopPreview, next);
          if (shop) shop.setWallet(shopWalletFromSave(next), shopSession.active ? { strict: true } : undefined);
        }
      }
      continue;
    }
    let r = remote.get(p.id); if (r && r.nm !== undefined && r.nm !== p.n) { r.av.root.remove(r.label); r.label = makeLabel(p.n); r.av.root.add(r.label); }   // a disguised Mimic wears another player's name tag
    if (!r) { r = { av: new Avatar(), buf: [], label: makeLabel(p.n) }; r.av.root.add(r.label); scene.add(r.av.root); remote.set(p.id, r); } r.nm = p.n;
    r.buf.push({ t, h: p.h, q: p.q, l: p.l, r: p.r }); if (r.buf.length > 12) r.buf.shift(); r.p = p; if (JSON.stringify(p.c) !== r.cos) { r.cos = JSON.stringify(p.c); r.av.setEquip(p.c); }
  }
  for (const id of [...remote.keys()]) if (!seen.has(id)) { const r = remote.get(id); scene.remove(r.av.root); remote.delete(id); S.players.delete(id); }
});
net.on('ev', (m) => {
  if (m.k === 'start') { sfx.start(); if (m.by === S.id && m.type) sfx.roar(); }
  if (m.k === 'tag') { sfx.tag(); if (m.to === S.id) { sfx.caught(); haptic(1, 300); } if (m.by === S.id) haptic(0.8, 120); }
  if (m.k === 'abstart') { if (m.id === 'blackout') sfx.giggle(); else if (m.id === 'burrow') sfx.rumble(); else if (m.id === 'disguise') { if (m.by === S.id) sfx.tick(); } else if (m.id === 'cling') sfx.scrape(); else if (m.id === 'tether') sfx.creak(); else sfx.chomp(); if (m.by === S.id) haptic(0.8, 400); }
  if (m.k === 'abpost') { if (m.id === 'disguise') { sfx.unmask(); haptic(1, 500); } else { sfx.chomp(); sfx.roar(); } }   // Burrower erupts with a jaw snap; a Mimic's unmask is loud for everyone
  if (m.k === 'abgo' && m.id === 'lunge') sfx.roar();
  if (m.k === 'abstart' && m.id === 'reel') sfx.slurp();
  if (m.k === 'abstart' && m.id === 'shriek') sfx.inhale();
  if (m.k === 'abgo' && m.id === 'reel') { reels.set(m.by, m.len || 9); sfx.thwip(); if (m.hit) setTimeout(() => sfx.snap(), 90); if (m.hit === S.id) haptic(1, 400); }
  if (m.k === 'abgo' && m.id === 'tether') { if (m.hit) { tethers.set(m.hit, { o: m.o, until: performance.now() + (m.ms || 2500) }); sfx.snap(); } else sfx.thwip(); }
  if (m.k === 'abgo' && m.id === 'shriek') { sfx.shriek(); if (m.by === S.id) haptic(1, 500); }
  if (m.k === 'genstep') sfx.tick();
  if (m.k === 'gen') { sfx.clank(); if (m.by === S.id) { if (!shopSession.active) { save.moons += m.coin || 0; persist(); shop?.setWallet({ balance: save.moons }); } haptic(1, 300); caption(`Generator charged! +${m.coin || 0} Moon`); } else caption('A generator is charged'); }
  if (m.k === 'abdenied') sfx.deny();
  if (m.k === 'formstart') { sfx.form(); if (m.by === S.id) haptic(0.8, 380); }
  if (m.k === 'form' && m.by === S.id) haptic(1, 200);
  if (m.k === 'formdenied') sfx.deny();
  if (m.k === 'over') caption(m.msg);
});
function makeLabel(name) { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); g.font = `600 36px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = 'rgba(8,10,14,.85)'; g.strokeText(name, 128, 32); g.fillStyle = '#f2f4f8'; g.fillText(name, 128, 32); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthTest: false })); s.scale.set(0.6, 0.15, 1); s.renderOrder = 5; return s; }
function applyRoom() {
  const want = desiredPlace(); if (want !== S.place) { if (S.place === null) loadPlace(want, true); else transition(() => loadPlace(want, true), want === 'hub' ? 'MOONK Plaza' : MAPS[want].name); }
  for (const p of PORTALS) { /* votes shown on labels via caption only in v1 */ }
  if (S.place === 'hub' && termMesh) termDraw();
}
function haptic(p, ms) { for (const c of ctrls) buzz(c.src, p, ms); }

// ------------------------------------------------------------------ input + locomotion
const world = { head: new THREE.Vector3(), hq: new THREE.Quaternion(), hands: [new THREE.Vector3(), new THREE.Vector3()], stick: [0, 0, 0, 0], btn: [false, false], grip: [false, false] };
function readInput() {
  if (DEV) {
    world.head.set(...dev.head).add(rig.position); camera.position.set(...dev.head);
    if (dev.look) { camera.lookAt(new THREE.Vector3(...dev.look).sub(rig.position)); } else camera.quaternion.set(...dev.q);
    camera.updateMatrixWorld(true); camera.getWorldQuaternion(world.hq); world.hands[0].set(...dev.l).add(rig.position); world.hands[1].set(...dev.r).add(rig.position); world.stick = dev.stick; return;
  }
  rig.updateMatrixWorld(true); camera.getWorldPosition(world.head); camera.getWorldQuaternion(world.hq); world.stick = [0, 0, 0, 0];
  for (const c of ctrls) { const hi = c.hand === 'left' ? 0 : 1; c.gp.getWorldPosition(world.hands[hi]); const ax = c.src?.gamepad?.axes; if (ax) { const x = ax.length > 3 ? ax[2] : ax[0], y = ax.length > 3 ? ax[3] : ax[1]; world.stick[hi * 2] = x || 0; world.stick[hi * 2 + 1] = y || 0; } const bt = c.src?.gamepad?.buttons; world.btn[hi] = !!(bt && (bt[4]?.pressed || bt[5]?.pressed)); world.grip[hi] = !!(bt && bt[1]?.pressed); }
}
let turnAt = 0, formCool = 0, armMode = true, dashYaw = null;
function step(dt) {
  if (!S.map) return; dt = Math.min(dt, LOCO.maxDt); const rp = rig.position;
  // shop solids (counter, pedestals, wall, dais) join the collision list per frame. Never push onto S.cols / m.cols: that array would grow every tick.
  const cols = (S.place === 'hub' && shop) ? S.cols.concat(shop.getLocoColliders('solid')) : S.cols;
  const me = S.me, monster = S.room?.phase === 'play' && S.room.mode === 'horror' && me?.ro === 'monster';
  const mdef = monster ? formDef(S.room.mType, me.fo) : null;
  if (monster && mdef) formSwitchInput();
  const walker = !!mdef && mdef.move.type === 'stick';
  if (walker) {
    if (armMode) { loco.reset(); armMode = false; }
    const [, , rx] = world.stick; let ang = 0;     // snap (default) or smooth turn about the head with the right stick
    if (save.smoothTurn) ang = -rx * LOCO.walk.turnSmooth * dt; else if (Math.abs(rx) > 0.7 && performance.now() > turnAt) { ang = -Math.sign(rx) * LOCO.walk.snapAngle; turnAt = performance.now() + LOCO.walk.snapCooldown * 1000; }
    if (ang) { tmp.copy(world.head).sub(rp).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ang); tmp2.copy(world.head).sub(tmp); rig.rotation.y += ang; rp.x = tmp2.x; rp.z = tmp2.z; }
    const yaw = new THREE.Euler().setFromQuaternion(world.hq, 'YXZ').y + ang;
    headL.copy(world.head).sub(rp);
    const abd = MONSTERS[S.room.mType]?.ability;
    if (abd?.id === 'cling' && me.ab === 2) loco.cling(dt, cols, rp, headL, [world.stick[0], world.stick[1]], yaw, abd.speed);   // Lurker: stuck to walls/ceilings, gravity off, surface-following crawl
    else if (abd?.id === 'lunge' && me.ab === 2) { if (dashYaw === null) dashYaw = yaw; loco.walk(dt, cols, rp, headL, [0, -1], dashYaw, abd.speed); }   // Gulper lunge: committed dash, direction locked when it starts
    else { if (me.ab !== 2) dashYaw = null; loco.walk(dt, cols, rp, headL, [world.stick[0], world.stick[1]], yaw, (me.xf > 0 || me.ab === 1 || (me.ab === 3 && abd?.id === 'burrow')) ? 0 : (me.ab === 2 && (abd?.id === 'burrow' || abd?.id === 'disguise')) ? abd.speed : mdef.move.speed); }   // frozen while transforming / during an ability tell
  } else {
    // arm locomotion works in an un-rotated rig: undo any monster-turn rotation, keeping the head where it is
    const th = rig.rotation.y; headL.copy(world.head).sub(rp); handsL[0].copy(world.hands[0]).sub(rp); handsL[1].copy(world.hands[1]).sub(rp);
    if (th !== 0) { for (const v of [headL, handsL[0], handsL[1]]) v.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -th); rp.copy(world.head).sub(headL); rig.rotation.y = 0; }
    if (!armMode) { loco.reset(); armMode = true; }
    loco.step(dt, cols, rp, headL, handsL);
    for (let i = 0; i < 2; i++) if (loco.impact[i] > 0) {      // touch tick, scaled by how hard the hand hit
      const k = Math.min(1, loco.impact[i] / 5); sfx.tap(k, loco.touchC[i]?.k === 'box' ? 1 : 0);
      buzz(ctrls.find((c) => c.hand === (i ? 'right' : 'left'))?.src, 0.2 + 0.8 * k, 25 + 35 * k);
    }
  }
  if (rp.y + 1.5 < S.map.voidY || Math.hypot(rp.x, rp.z) > S.map.radius + 20) { rp.set(S.map.spawn[0], S.map.spawn[1], S.map.spawn[2]); loco.reset(); }
}
function formSwitchInput() {
  if (!(world.btn[0] || world.btn[1]) || performance.now() < formCool) return;
  if (formDef(S.room.mType, S.me.fo)?.switchTo) { net.send({ t: 'form' }); formCool = performance.now() + 700; }
  else if (MONSTERS[S.room.mType]?.ability?.release && S.me.ab === 2) { net.send({ t: 'ab' }); formCool = performance.now() + 700; }   // Lurker: the button drops you out of the cling into the pounce
  else if (MONSTERS[S.room.mType]?.ability && !(S.me.ab > 0) && !(S.me.ac > 0)) { net.send({ t: 'ab' }); formCool = performance.now() + 700; }   // Gulper lunge / Grinner blackout (server enforces cooldown + tell)
}

// ------------------------------------------------------------------ terminal + portals interaction
function interact(now) {
  if (S.place !== 'hub') return;
  for (let i = 0; i < 2; i++) {
    const id = term.hit(world.hands[i]);
    if (id && id !== hoverId[i]) { termPress(id, i); }
    hoverId[i] = id;
  }
  if (now - portalAt > 1500) for (const p of S.map.portals) {
    if (Math.hypot(world.head.x - p.pos[0], world.head.z - p.pos[2]) < 1.2 && Math.abs(world.head.y - 1.8) < 1.7) { portalAt = now; usePortal(p); break; }
  }
}
let portalAt = 0;
function termPress(id, hand) {
  pressed[id] = performance.now() + 180; sfx.tick(); buzz(ctrls.find((c) => c.hand === (hand ? 'right' : 'left'))?.src, 0.4, 25);
  if (id.startsWith('f:')) S.focus = id.slice(2);
  else if (id.startsWith('k:')) { const k = id.slice(2); const f = S.focus; let v = f === 'name' ? S.name : S.code; const max = f === 'name' ? 14 : 4;
    if (k === 'BACK') v = v.slice(0, -1); else if (k === 'CLEAR') v = ''; else if (k === 'SPACE') { if (f === 'name' && v.length < max) v += ' '; } else if (v.length < max) v += f === 'code' ? k.replace('-', '') : k;
    if (f === 'name') S.name = v; else S.code = v.toUpperCase(); }
  else if (id === 'retry') tryConnect().catch(() => {});
  else if (id === 'quick') join({ quick: true, mode: S.pref.mode });
  else if (id === 'join') { if (S.code.length < 4) { S.status = 'Enter the 4 letter room code first'; sfx.deny(); } else join({ room: S.code }); }
  else if (id.startsWith('new:')) join({ mode: id.slice(4) });
  termDraw();
}
function usePortal(p) {
  sfx.vote(); haptic(0.6, 120);
  const r = S.room;
  if (p.id === 'play') { transition(() => {}, 'Quick Play'); if (!S.joined) join({ quick: true, mode: S.pref.mode }); }
  else if (p.id === 'normal' || p.id === 'horror') { S.pref.mode = p.id; transition(() => {}, MODES[p.id].name); if (SOLO && !S.joined) join({ quick: true, mode: p.id }); else if (r && r.host === S.id && (!SOLO || r.mode !== p.id)) net.send({ t: 'set', mode: p.id }); }   // single-player: the mode portals start a game vs AI
  else { if (r && r.phase === 'vote') { net.send({ t: 'vote', map: p.map }); transition(() => {}, `Voted: ${MAPS[p.map].name}`); } else { caption(r ? 'Voting opens before each round' : 'Join a room first'); sfx.deny(); } }
}

// ------------------------------------------------------------------ main loop
const local = new Avatar(); local.setEquip(save.equip); scene.add(local.root); let lastSend = 0, last = performance.now(), regs = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; regs++;
  if (!S.map) loadPlace('hub', true);
  S.mapT += dt; S.map.update?.(S.mapT, dt);   // optional per-frame map hook: map.update(t seconds since load, dt seconds); the hub is built the same way, so it gets it too
  readInput(); step(dt);
  rig.updateMatrixWorld(true); if (!DEV) { camera.getWorldPosition(world.head); for (const c of ctrls) c.gp.getWorldPosition(world.hands[c.hand === 'left' ? 0 : 1]); } else { world.head.set(...dev.head).add(rig.position); world.hands[0].set(...dev.l).add(rig.position); world.hands[1].set(...dev.r).add(rig.position); }
  if (armMode) { world.hands[0].copy(loco.vis[0]); world.hands[1].copy(loco.vis[1]); }   // hands clamped to surfaces / arm length
  checkZone(world.head); interact(now); shopFrame(dt);
  const me = S.me, inMon = me?.ro === 'monster' && S.room?.phase === 'play'; const def = inMon ? formDef(S.room.mType, me.fo) : null;
  const pose = { h: world.head.toArray(), q: world.hq.toArray(), l: world.hands[0].toArray(), r: world.hands[1].toArray() };
  if (def?.armGain) for (const k of ['l', 'r']) {      // long-arm form (Yeti): hand offset from the head is multiplied, capped at armLength. Server re-checks the cap.
    tmp.fromArray(pose[k]).sub(world.head); const len = tmp.length(); if (len > 1e-4) { tmp.multiplyScalar(Math.min(def.armLength, len * def.armGain) / len).add(world.head); pose[k] = tmp.toArray(); }
  }
  local.update(pose, { local: true, look: def && !me.dg ? def.look : 'monkey', scale: def ? tellScale(def, me) : undefined, tell: me?.xf > 0, ab: me?.ab, reel: reels.get(S.id), dt, ghost: false, it: !!me?.it });
  if (S.joined && now - lastSend > 50) { lastSend = now; net.send({ t: 'pose', h: pose.h.map(r3), q: pose.q.map(r3), l: pose.l.map(r3), r: pose.r.map(r3) }); }
  // remote avatars: render 100 ms in the past, interpolating between the two surrounding snapshots
  const rt = now - 100;
  for (const r of remote.values()) {
    const b = r.buf; if (!b.length) continue; let i = b.length - 1; while (i > 0 && b[i - 1].t > rt) i--; const a = b[Math.max(0, i - 1)], c = b[i]; const k = a === c ? 1 : Math.min(1, Math.max(0, (rt - a.t) / (c.t - a.t)));
    const L = (x, y) => x.map((v, j) => v + (y[j] - v) * k); const qa = new THREE.Quaternion(...a.q), qc = new THREE.Quaternion(...c.q);
    const pp = { h: L(a.h, c.h), l: L(a.l, c.l), r: L(a.r, c.r), q: qa.slerp(qc, k).toArray() }; const p = r.p;
    const mon = p.ro === 'monster' && S.room?.phase === 'play'; const d = mon ? formDef(S.room.mType, p.fo) : null;
    r.av.update(pp, { look: d ? d.look : 'monkey', scale: d ? tellScale(d, p) : undefined, tell: p.xf > 0, ab: p.ab, reel: reels.get(p.id), armLen: d?.armLength, dt, ghost: !!p.cg, it: !!p.it }); r.label.position.set(pp.h[0], pp.h[1] + (d ? 0.5 * d.scale : 0.42), pp.h[2]); r.label.visible = true;
  }
  if (now - boardAt > 500) { boardAt = now; if (boardMesh) boardDraw(); }
  if (now - hudAt > 400) { hudAt = now; const show = S.joined && S.room && S.room.phase !== 'lobby' && S.place !== 'hub' || (S.joined && S.place === 'hub' && S.room?.phase === 'vote'); hudMesh.visible = !!show; if (show) hudDraw(); }
  // fade back to colour slowly after a portal flash; caption fades out
  if (fadeT > 0) { fadeT = Math.max(0, fadeT - dt / 2.4); fade.material.opacity = fadeT * fadeT; }
  capMesh.material.opacity = Math.max(0, Math.min(1, (capUntil - now) / 600));
  // portal swirl
  if (S.place === 'hub') for (const p of S.map.portals) p.disc.rotation.z += dt * 0.6;
  blackoutFrame(dt); pingFrame(now); tetherFrame(now);
  gens.update(dt, { active: (S.joined && S.room?.phase === 'play' && S.room.mode === 'horror' && S.place === S.room.map), room: S.room, gp: S.gp, hands: world.hands, grip: (DEV ? [true, true] : world.grip), send: (o) => { if (S.me?.ro === 'monkey' && !S.me.cg) net.send(o); }, now });
  renderer.render(scene, camera);
}
// Grinner Blackout: while a Grinner's ability is active, monkeys within its radius get fog closing in and the lights dimmed (client-side only; the server just times it).
const gens = createGenerators(scene);
let blackK = 0, shrK = 0, shrEnd = 0; const pings = new Map(), reels = new Map(); const SHR = new THREE.Color(0x3a0a2a);
// Dangler tongue lengths (by monster id, from the abgo event); Wailer ping markers (a ring + beam that shows through walls, only the Wailer ever receives the ping)
const pingMat = new THREE.MeshBasicMaterial({ color: 0xff3a6a, depthTest: false, transparent: true, opacity: 0.9 }), pingMarks = new Map();
const tethers = new Map(), stringMats = new THREE.MeshBasicMaterial({ color: 0xe8d8b0 }), tetherMeshes = new Map(), _ty = new THREE.Vector3(0, 1, 0), _tv = new THREE.Vector3(), _tw = new THREE.Vector3();
function tetherFrame(now) {   // the Stringman's string: a thin line from the anchor to the tied runner's head, visible to everyone
  for (const [id, t] of tethers) {
    let g = tetherMeshes.get(id); const p = id === S.id ? null : S.players.get(id); const hp = id === S.id ? world.head : p?.h ? _tw.fromArray(p.h) : null;
    if (now > t.until || !hp) { if (g) { scene.remove(g); tetherMeshes.delete(id); } tethers.delete(id); continue; }
    if (!g) { g = new THREE.Group(); const line = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 1, 4), stringMats), knot = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), stringMats); g.add(line, knot); g.userData.line = line; scene.add(g); tetherMeshes.set(id, g); }
    _tv.fromArray(t.o); const len = _tv.distanceTo(hp) || 0.01; const line = g.userData.line;
    line.position.copy(_tv).lerp(hp, 0.5).sub(g.position); line.scale.set(1, len, 1); line.quaternion.setFromUnitVectors(_ty, _tw.copy(hp).sub(_tv).normalize()); g.children[1].position.copy(_tv).sub(g.position);
  }
}
function pingFrame(now) {
  if (loco.gain !== 1 && now > shrEnd) loco.gain = 1;
  for (const [id, until] of pings) {
    const p = S.players.get(id); let mk = pingMarks.get(id);
    if (now > until || !p?.h) { if (mk) { scene.remove(mk); pingMarks.delete(id); } pings.delete(id); continue; }
    if (!mk) { mk = new THREE.Group(); const ring = new THREE.Mesh(new THREE.TorusGeometry(0.35, 0.03, 5, 20), pingMat), beam = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 3, 5), pingMat); ring.rotation.x = Math.PI / 2; beam.position.y = 1.5; mk.add(ring, beam); mk.children.forEach((c) => { c.renderOrder = 999; }); scene.add(mk); pingMarks.set(id, mk); }
    mk.position.set(p.h[0], p.h[1] - 0.9, p.h[2]); mk.scale.setScalar(1 + 0.25 * Math.sin(now / 90));
  }
}
function blackoutFrame(dt) {
  let want = 0;
  if (S.room?.phase === 'play' && S.me && S.me.ro !== 'monster' && S.room.mType === 'grinner') {
    const ab = MONSTERS.grinner.ability;
    for (const p of S.players.values()) if (p.ro === 'monster' && p.ab === 2 && p.h && Math.hypot(p.h[0] - world.head.x, p.h[1] - world.head.y, p.h[2] - world.head.z) < ab.radius) want = 1;
  }
  blackK += (want - blackK) * Math.min(1, dt * (want ? 6 : 1.5));
  shrK += ((loco.gain < 1 ? 1 : 0) - shrK) * Math.min(1, dt * (loco.gain < 1 ? 10 : 2));   // Wailer shriek veil: the world goes murky purple while your pushes are weak
  const vk = Math.max(blackK, shrK * 0.5), tint = blackK >= shrK * 0.5 ? BLACK : SHR;
  if (!S.map || (vk < 0.003 && !blackOn)) return;
  const f = scene.fog, m = S.map; blackOn = vk >= 0.003;
  f.near = m.fog[1] + (0.3 - m.fog[1]) * vk; f.far = m.fog[2] + (3.2 - m.fog[2]) * vk;
  f.color.setHex(m.fog[0]).lerp(tint, vk); scene.background.setHex(m.sky).lerp(tint, vk);
  for (const l of lightsGroup.children) { l.userData.i0 ??= l.intensity; l.intensity = l.userData.i0 * (1 - 0.9 * vk); }
}
let blackOn = false; const BLACK = new THREE.Color(0x000000);
const r3 = (v) => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------------ Enter VR
const btn = $('enter'), note = $('note'), err = $('err');
async function enter() {
  unlock(); err.textContent = '';
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor'] });   // shows the browser's VR permission prompt
    await renderer.xr.setSession(session); renderer.setAnimationLoop(frame); session.addEventListener('end', () => { renderer.setAnimationLoop(null); });
    if (!net.open) tryConnect().catch(() => {});
  } catch (e) { err.textContent = 'Could not start VR: ' + (e.message || e); }
}
btn.addEventListener('click', enter);
(async () => {
  if (!window.isSecureContext) { note.textContent = 'VR needs a secure (https) connection.'; return; }
  let ok = false; try { ok = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'); } catch { /* */ }
  if (ok) { btn.disabled = false; note.textContent = 'Play MOONK in your headset browser.'; } else note.textContent = 'Open this page in the Meta Quest Browser to play in VR.';
  if (SOLO) note.textContent += ' Single-player vs AI for now. Multiplayer is coming soon.';
  window.__xrSupported = ok;
})();

// ------------------------------------------------------------------ hidden dev/test hook (no desktop play UI)
if (DEV) {
  document.querySelector('main').style.display = 'none';
  window.__tt = { SOLO, loco, LOCO, get shop() { return shop; }, S, dev, rig, net, camera, scene, remote, local, loadPlace, join, termPress, term, usePortal, world, step, frame, get place() { return S.place; }, shopSession, applyShopInv };
  renderer.setAnimationLoop(frame);
  const n = Q.get('name'); if (n) S.name = n;
  if (Q.get('place')) loadPlace(Q.get('place'), true);
  if (Q.get('auto')) net.connect().then(() => join({ room: Q.get('room') || undefined, mode: Q.get('mode') || 'normal', quick: !Q.get('room') && Q.get('quick') === '1' })).catch(() => {});
  if (Q.get('fx')) { /* reserved */ }
}
if (!Q.get('auto')) tryConnect().catch(() => {});
