import * as THREE from 'three';
import { BUILDERS } from './maps/index.js';
import { buildHub, PORTALS, TERMINAL } from './hub.js';
import { deepest, groundAt } from './physics.js';
import { Avatar } from './avatar.js';
import { Panel, roundRect } from './panel.js';
import { Net } from './net.js';
import { sfx, unlock, buzz } from './audio.js';
import { save, persist } from './save.js';
import { MAPS, MODES, MONSTERS, formDef } from '../shared/defs.mjs';

const Q = new URLSearchParams(location.search);
const DEV = Q.get('dev') === '1';          // hidden automation/test hook only. There is no desktop play UI.
const $ = (id) => document.getElementById(id);
const G = 9.8, MAX_V = 11;

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
const S = { place: null, cols: [], map: null, room: null, id: null, me: null, players: new Map(), joined: false, status: 'Not connected', pref: { mode: 'normal' }, code: '', focus: 'name', name: save.name, region: 'Local', zone: '', lastSnap: 0, left: 0, msg: '' };
const net = new Net(); const remote = new Map();
const cache = {};
const vel = new THREE.Vector3(), prevLocal = [new THREE.Vector3(), new THREE.Vector3()], touch = [false, false], hist = [[], []];
const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), hit = { n: new THREE.Vector3(), d: 0, c: null };
const dev = { head: [0, 1.6, 0], q: [0, 0, 0, 1], l: [-0.3, 0.9, 0.2], r: [0.3, 0.9, 0.2], stick: [0, 0, 0, 0], look: null };

// ------------------------------------------------------------------ places
function desiredPlace() { const r = S.room; if (!r) return 'hub'; return (r.phase === 'play' || r.phase === 'over') ? r.map : 'hub'; }
function loadPlace(id, quiet) {
  if (S.map) scene.remove(S.map.group);
  const m = cache[id] ||= (id === 'hub' ? buildHub() : BUILDERS[id]());
  S.map = m; S.place = id; S.cols = m.cols; scene.add(m.group);
  scene.background = new THREE.Color(m.sky); scene.fog = new THREE.Fog(m.fog[0], m.fog[1], m.fog[2]);
  lightsGroup.clear(); lightsGroup.add(new THREE.HemisphereLight(m.hemi[0], m.hemi[1], m.hemi[2]));
  if (m.sun) { const d = new THREE.DirectionalLight(m.sun[0], m.sun[1]); d.position.set(...m.sun[2]); lightsGroup.add(d); }
  for (const l of m.lights) { const p = new THREE.PointLight(l.c, l.i, l.d, 2); p.position.set(...l.p); lightsGroup.add(p); }
  rig.rotation.set(0, 0, 0); rig.position.set(m.spawn[0], m.spawn[1], m.spawn[2]); vel.set(0, 0, 0); touch[0] = touch[1] = false;
  if (m.board) placeBoard(m); else if (id === 'hub') placeBoard({ board: { pos: [-5.5, 0, 7], ry: 0.7 } });
  S.zone = ''; if (id === 'hub') buildTerminal();
  if (!quiet) caption(id === 'hub' ? 'MOONK Plaza' : MAPS[id].name);
}
const ZONES = {
  forest: [['Great Stump', (x, z) => Math.hypot(x, z) < 6], ['High Canopy', (x, z, y) => y > 8], ['Canopy Forest', () => true]],
  crypt: [['The Altar', (x, z) => z < -24], ['Upper Balcony', (x, z, y) => y > 4], ['Haunted Crypt', () => true]],
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
  g.font = `400 24px ${FONT}`; g.fillStyle = C.mute; g.textAlign = 'right'; g.fillText(`${S.region}  ·  ${S.joined ? 'Room ' + (S.room?.code || '') : 'Not in a room'}`, 990, 52);
  const field = (id, label, val, x, w) => { g.textAlign = 'left'; g.font = `500 20px ${FONT}`; g.fillStyle = C.mute; g.fillText(label, x, 112); roundRect(g, x, 126, w, 64, 12, C.btn, S.focus === id ? C.acc : C.edge); g.font = `600 32px ${FONT}`; g.fillStyle = C.text; g.fillText(val + (S.focus === id ? '_' : ''), x + 18, 160); term.btn('f:' + id, x, 126, w, 64); };
  field('name', 'NAME', S.name, 36, 520); field('code', 'ROOM CODE', S.code, 580, 410);
  const btns = [['quick', 'Quick play'], ['join', 'Join code'], ['new:normal', 'New: Normal'], ['new:horror', 'New: Monster']];
  btns.forEach(([id, t], i) => { const x = 36 + i * 238, on = pressed[id] > performance.now(); roundRect(g, x, 218, 224, 64, 12, on ? C.hot : C.btn, C.edge); g.font = `600 24px ${FONT}`; g.fillStyle = C.text; g.textAlign = 'center'; g.fillText(t, x + 112, 250); term.btn(id, x, 218, 224, 64); });
  g.textAlign = 'left'; g.font = `400 24px ${FONT}`; g.fillStyle = /taken|not|cannot|error|wrong|full|banned/i.test(S.status) ? C.warn : C.mute; g.fillText(S.status, 36, 318);
  const rows = ['1234567890', 'QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
  rows.forEach((row, ri) => [...row].forEach((ch, ci) => { const x = 36 + ri * (ri === 2 ? 40 : ri === 3 ? 80 : 0) + (ri === 1 ? 0 : 0) + ci * 96, y = 350 + ri * 84; const id = 'k:' + ch, on = pressed[id] > performance.now(); roundRect(g, x, y, 86, 72, 10, on ? C.hot : C.key, C.edge); g.font = `600 32px ${FONT}`; g.fillStyle = C.text; g.textAlign = 'center'; g.fillText(ch, x + 43, y + 38); term.btn(id, x, y, 86, 72); }));
  [['k:BACK', 'Back', 36 + 80 + 7 * 96, 350 + 3 * 84, 150], ['k:CLEAR', 'Clear', 36 + 80 + 7 * 96 + 160, 350 + 3 * 84, 150], ['k:SPACE', 'Space', 36, 350 + 4 * 84, 500], ['k:-', '-', 560, 350 + 4 * 84, 86]].forEach(([id, t, x, y, w]) => { const on = pressed[id] > performance.now(); roundRect(g, x, y, w, 72, 10, on ? C.hot : C.key, C.edge); g.font = `600 26px ${FONT}`; g.fillStyle = C.text; g.textAlign = 'center'; g.fillText(t, x + w / 2, y + 38); term.btn(id, x, y, w, 72); });
  term.refresh();
}
function buildTerminal() {
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
  const r = S.room; g.fillStyle = C.text; g.font = `700 34px ${FONT}`; g.fillText(r ? `Room ${r.code}` : 'Scoreboard', 30, 46);
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
function roleText() { const m = S.me; if (!m) return ''; if (S.room.mode === 'horror') return m.ro === 'monster' ? `${MONSTERS[S.room.mType]?.name || 'Monster'}: ${formDef(S.room.mType, m.fo)?.label || ''}` : m.cg ? 'Caught' : 'Runner'; return m.it ? 'You are IT' : 'Run!'; }
function transition(fn, name) { fade.material.opacity = 1; fadeT = 1; fn(); if (name) caption(name); }

// ------------------------------------------------------------------ networking
function join(opts) {
  S.status = 'Connecting...'; termDraw();
  const go = () => { net.send({ t: 'join', name: S.name, did: save.did, cos: save.equip, ...opts }); S.status = 'Joining...'; termDraw(); };
  if (net.open) go(); else net.connect().then(go).catch((e) => { S.status = e.message; termDraw(); });
}
net.on('welcome', (m) => { S.id = m.id; S.joined = true; S.room = m.room; save.name = S.name; persist(); S.status = `Joined room ${m.room.code}`; S.code = m.room.code; termDraw(); applyRoom(); });
net.on('error', (m) => { S.status = m.msg || 'Error'; termDraw(); sfx.deny(); });
net.on('room', (m) => { S.room = m.room; applyRoom(); });
net.on('left', (m) => { S.players.delete(m.id); });
net.on('close', () => { if (S.joined) { S.joined = false; S.room = null; S.status = 'Disconnected from server'; S.players.clear(); applyRoom(); } });
net.on('snap', (m) => {
  const t = performance.now(); S.left = m.left; const seen = new Set();
  for (const p of m.ps) {
    seen.add(p.id); S.players.set(p.id, p);
    if (p.id === S.id) { S.me = p; continue; }
    let r = remote.get(p.id); if (!r) { r = { av: new Avatar(), buf: [], label: makeLabel(p.n) }; r.av.root.add(r.label); scene.add(r.av.root); remote.set(p.id, r); }
    r.buf.push({ t, h: p.h, q: p.q, l: p.l, r: p.r }); if (r.buf.length > 12) r.buf.shift(); r.p = p; if (JSON.stringify(p.c) !== r.cos) { r.cos = JSON.stringify(p.c); r.av.setEquip(p.c); }
  }
  for (const id of [...remote.keys()]) if (!seen.has(id)) { const r = remote.get(id); scene.remove(r.av.root); remote.delete(id); S.players.delete(id); }
});
net.on('ev', (m) => {
  if (m.k === 'start') { sfx.start(); if (m.by === S.id && m.type) sfx.roar(); }
  if (m.k === 'tag') { sfx.tag(); if (m.to === S.id) { sfx.caught(); haptic(1, 300); } if (m.by === S.id) haptic(0.8, 120); }
  if (m.k === 'form') { sfx.form(); if (m.by === S.id) haptic(1, 200); }
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
const world = { head: new THREE.Vector3(), hq: new THREE.Quaternion(), hands: [new THREE.Vector3(), new THREE.Vector3()], stick: [0, 0, 0, 0], btn: [false, false] };
function readInput() {
  if (DEV) {
    world.head.set(...dev.head).add(rig.position); camera.position.set(...dev.head);
    if (dev.look) { camera.lookAt(new THREE.Vector3(...dev.look).sub(rig.position)); } else camera.quaternion.set(...dev.q);
    camera.updateMatrixWorld(true); camera.getWorldQuaternion(world.hq); world.hands[0].set(...dev.l).add(rig.position); world.hands[1].set(...dev.r).add(rig.position); world.stick = dev.stick; return;
  }
  rig.updateMatrixWorld(true); camera.getWorldPosition(world.head); camera.getWorldQuaternion(world.hq); world.stick = [0, 0, 0, 0];
  for (const c of ctrls) { const hi = c.hand === 'left' ? 0 : 1; c.gp.getWorldPosition(world.hands[hi]); const ax = c.src?.gamepad?.axes; if (ax) { const x = ax.length > 3 ? ax[2] : ax[0], y = ax.length > 3 ? ax[3] : ax[1]; world.stick[hi * 2] = x || 0; world.stick[hi * 2 + 1] = y || 0; } const bt = c.src?.gamepad?.buttons; world.btn[hi] = !!(bt && (bt[4]?.pressed || bt[5]?.pressed)); }
}
let turnCool = 0, formCool = 0;
function step(dt) {
  if (!S.map) return; dt = Math.min(dt, 0.05); const rp = rig.position;
  const me = S.me, monster = S.room?.phase === 'play' && S.room.mode === 'horror' && me?.ro === 'monster';
  const mdef = monster ? formDef(S.room.mType, me.fo) : null;
  if (monster && mdef) formSwitchInput();
  if (mdef && mdef.move.type === 'stick') stickMove(mdef, dt);
  else {
    if (rig.rotation.y !== 0) { tmp.copy(world.head).sub(rp).applyAxisAngle(THREE.Object3D.DEFAULT_UP, -rig.rotation.y); tmp2.copy(world.head).sub(tmp); rp.x = tmp2.x; rp.z = tmp2.z; rig.rotation.y = 0; vel.set(0, 0, 0); }
    let any = false; const lv = [];
    for (let i = 0; i < 2; i++) {
      const hw = world.hands[i]; tmp.copy(hw).sub(rp); const h = deepest(S.cols, hw, 0.09, hit);
      if (h) {
        const d = Math.min(h.d, 0.3); const delta = tmp2.copy(tmp).sub(prevLocal[i]);
        if (!touch[i]) { const sp = Math.min(1, delta.length() / dt / 4); sfx.tap(sp, h.c?.k === 'box' ? 1 : 0); buzz(ctrls.find((c) => c.hand === (i ? 'right' : 'left'))?.src, 0.3 + sp * 0.6, 40); delta.set(0, 0, 0); }
        rp.sub(delta).addScaledVector(h.n, d); touch[i] = true; any = true;
        const v = delta.multiplyScalar(-1 / dt); hist[i].push(v.clone()); if (hist[i].length > 5) hist[i].shift();
        lv.push(avg(hist[i]));
      } else { if (touch[i]) { /* release */ } touch[i] = false; hist[i].length = 0; }
      prevLocal[i].copy(tmp);
    }
    if (any) { vel.set(0, 0, 0); for (const v of lv) vel.add(v); vel.multiplyScalar(1.12 / lv.length); }
    else { vel.y -= G * dt; vel.multiplyScalar(1 - 0.12 * dt); }
    if (vel.length() > MAX_V) vel.setLength(MAX_V);
    if (!any) rp.addScaledVector(vel, dt);
    const hh = deepest(S.cols, world.head, 0.26, hit);   // head body collision
    if (hh) { rp.addScaledVector(hh.n, hh.d); const into = vel.dot(hh.n); if (into < 0) vel.addScaledVector(hh.n, -into); }
  }
  if (rp.y + 1.5 < S.map.voidY || Math.hypot(rp.x, rp.z) > S.map.radius + 20) { rp.set(S.map.spawn[0], S.map.spawn[1], S.map.spawn[2]); vel.set(0, 0, 0); }
}
const avg = (a) => { const o = new THREE.Vector3(); for (const v of a) o.add(v); return o.multiplyScalar(1 / Math.max(1, a.length)); };
let vy = 0;
function stickMove(def, dt) {
  const rp = rig.position, mv = def.move; const [lx, ly, rx] = world.stick;
  // turn (snap or smooth) about the head
  let ang = 0; if (save.smoothTurn) ang = -rx * 1.9 * dt; else if (Math.abs(rx) > 0.7 && performance.now() > turnCool) { ang = -Math.sign(rx) * Math.PI / 6; turnCool = performance.now() + 280; }
  if (ang) { tmp.copy(world.head).sub(rp).applyAxisAngle(THREE.Object3D.DEFAULT_UP, ang); tmp2.copy(world.head).sub(tmp); rig.rotation.y += ang; rp.x = tmp2.x; rp.z = tmp2.z; }
  const e = new THREE.Euler().setFromQuaternion(world.hq, 'YXZ'); const yaw = e.y; const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  const mag = Math.min(1, Math.hypot(lx, ly)); if (mag > 0.12 && mv.speed > 0) { const sp = mv.speed * mag * dt; const dx = (lx * fz * -1 + -ly * fx) , dz = (lx * fx + -ly * fz); const l = Math.hypot(dx, dz) || 1; rp.x += (dx / l) * sp; rp.z += (dz / l) * sp; }
  // gravity + ground
  vy -= G * dt; rp.y += vy * dt; const gnd = groundAt(S.cols, world.head.x, world.head.z, rp.y + 0.4); if (rp.y <= gnd) { rp.y = gnd; vy = 0; }
  for (const h of [0.5, 1.0, 1.5]) { const p = tmp.set(world.head.x, rp.y + h, world.head.z); const c = deepest(S.cols, p, 0.3, hit); if (c) { rp.x += c.n.x * c.d; rp.z += c.n.z * c.d; } }
}
function formSwitchInput() { if (formDef(S.room.mType, S.me.fo)?.switchTo && (world.btn[0] || world.btn[1]) && performance.now() > formCool) { net.send({ t: 'form' }); formCool = performance.now() + 700; vel.set(0, 0, 0); vy = 0; } }

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
  else if (id === 'quick') join({ quick: true, mode: S.pref.mode });
  else if (id === 'join') { if (S.code.length < 4) { S.status = 'Enter the 4 letter room code first'; sfx.deny(); } else join({ room: S.code }); }
  else if (id.startsWith('new:')) join({ mode: id.slice(4) });
  termDraw();
}
function usePortal(p) {
  sfx.vote(); haptic(0.6, 120);
  const r = S.room;
  if (p.id === 'play') { transition(() => {}, 'Quick Play'); if (!S.joined) join({ quick: true, mode: S.pref.mode }); }
  else if (p.id === 'normal' || p.id === 'horror') { S.pref.mode = p.id; transition(() => {}, MODES[p.id].name); if (r && r.host === S.id) net.send({ t: 'set', mode: p.id }); }
  else { if (r && r.phase === 'vote') { net.send({ t: 'vote', map: p.map }); transition(() => {}, `Voted: ${MAPS[p.map].name}`); } else { caption(r ? 'Voting opens before each round' : 'Join a room first'); sfx.deny(); } }
}

// ------------------------------------------------------------------ main loop
const local = new Avatar(); local.setEquip(save.equip); scene.add(local.root); let lastSend = 0, last = performance.now(), regs = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now; regs++;
  if (!S.map) loadPlace('hub', true);
  readInput(); step(dt);
  rig.updateMatrixWorld(true); if (!DEV) { camera.getWorldPosition(world.head); for (const c of ctrls) c.gp.getWorldPosition(world.hands[c.hand === 'left' ? 0 : 1]); } else { world.head.set(...dev.head).add(rig.position); world.hands[0].set(...dev.l).add(rig.position); world.hands[1].set(...dev.r).add(rig.position); }
  checkZone(world.head); interact(now);
  const pose = { h: world.head.toArray(), q: world.hq.toArray(), l: world.hands[0].toArray(), r: world.hands[1].toArray() };
  const me = S.me, inMon = me?.ro === 'monster' && S.room?.phase === 'play'; const def = inMon ? formDef(S.room.mType, me.fo) : null;
  local.update(pose, { local: true, look: def ? def.look : 'monkey', scale: def?.scale, dt, ghost: false, it: !!me?.it });
  if (S.joined && now - lastSend > 50) { lastSend = now; net.send({ t: 'pose', h: pose.h.map(r3), q: pose.q.map(r3), l: pose.l.map(r3), r: pose.r.map(r3) }); }
  // remote avatars: render 100 ms in the past, interpolating between the two surrounding snapshots
  const rt = now - 100;
  for (const r of remote.values()) {
    const b = r.buf; if (!b.length) continue; let i = b.length - 1; while (i > 0 && b[i - 1].t > rt) i--; const a = b[Math.max(0, i - 1)], c = b[i]; const k = a === c ? 1 : Math.min(1, Math.max(0, (rt - a.t) / (c.t - a.t)));
    const L = (x, y) => x.map((v, j) => v + (y[j] - v) * k); const qa = new THREE.Quaternion(...a.q), qc = new THREE.Quaternion(...c.q);
    const pp = { h: L(a.h, c.h), l: L(a.l, c.l), r: L(a.r, c.r), q: qa.slerp(qc, k).toArray() }; const p = r.p;
    const mon = p.ro === 'monster' && S.room?.phase === 'play'; const d = mon ? formDef(S.room.mType, p.fo) : null;
    r.av.update(pp, { look: d ? d.look : 'monkey', scale: d?.scale, armLen: d?.armLength, dt, ghost: !!p.cg, it: !!p.it }); r.label.position.set(pp.h[0], pp.h[1] + (d ? 0.5 * d.scale : 0.42), pp.h[2]); r.label.visible = true;
  }
  if (now - boardAt > 500) { boardAt = now; if (boardMesh) boardDraw(); }
  if (now - hudAt > 400) { hudAt = now; const show = S.joined && S.room && S.room.phase !== 'lobby' && S.place !== 'hub' || (S.joined && S.place === 'hub' && S.room?.phase === 'vote'); hudMesh.visible = !!show; if (show) hudDraw(); }
  // fade back to colour slowly after a portal flash; caption fades out
  if (fadeT > 0) { fadeT = Math.max(0, fadeT - dt / 2.4); fade.material.opacity = fadeT * fadeT; }
  capMesh.material.opacity = Math.max(0, Math.min(1, (capUntil - now) / 600));
  // portal swirl
  if (S.place === 'hub') for (const p of S.map.portals) p.disc.rotation.z += dt * 0.6;
  renderer.render(scene, camera);
}
const r3 = (v) => Math.round(v * 1000) / 1000;

// ------------------------------------------------------------------ Enter VR
const btn = $('enter'), note = $('note'), err = $('err');
async function enter() {
  unlock(); err.textContent = '';
  try {
    const session = await navigator.xr.requestSession('immersive-vr', { requiredFeatures: ['local-floor'], optionalFeatures: ['bounded-floor'] });   // shows the browser's VR permission prompt
    await renderer.xr.setSession(session); renderer.setAnimationLoop(frame); session.addEventListener('end', () => { renderer.setAnimationLoop(null); });
    if (!net.open) net.connect().then(() => { S.status = 'Connected. Quick play, or enter a room code.'; S.region = 'Local'; termDraw(); }).catch(() => { S.status = 'Server unreachable. Check your connection.'; termDraw(); });
  } catch (e) { err.textContent = 'Could not start VR: ' + (e.message || e); }
}
btn.addEventListener('click', enter);
(async () => {
  if (!window.isSecureContext) { note.textContent = 'VR needs a secure (https) connection.'; return; }
  let ok = false; try { ok = !!navigator.xr && await navigator.xr.isSessionSupported('immersive-vr'); } catch { /* */ }
  if (ok) { btn.disabled = false; note.textContent = 'Play MOONK in your headset browser.'; } else note.textContent = 'Open this page in the Meta Quest Browser to play in VR.';
  window.__xrSupported = ok;
})();

// ------------------------------------------------------------------ hidden dev/test hook (no desktop play UI)
if (DEV) {
  document.querySelector('main').style.display = 'none';
  window.__tt = { S, dev, rig, net, camera, scene, remote, local, loadPlace, join, termPress, usePortal, world, step, frame, get place() { return S.place; } };
  renderer.setAnimationLoop(frame);
  const n = Q.get('name'); if (n) S.name = n;
  if (Q.get('place')) loadPlace(Q.get('place'), true);
  if (Q.get('auto')) net.connect().then(() => join({ room: Q.get('room') || undefined, mode: Q.get('mode') || 'normal', quick: !Q.get('room') && Q.get('quick') === '1' })).catch(() => {});
  if (Q.get('fx')) { /* reserved */ }
}
