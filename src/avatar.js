import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { createMonkey } from './kit/monkey.js';
import { applyLoadout } from './kit/loadout.js';
const M = {};
const mat = (hex, o = {}) => { const k = hex + JSON.stringify(o); return M[k] ||= new THREE.MeshLambertMaterial({ color: hex, flatShading: true, ...o }); };
const glowMat = (hex) => { const k = 'g' + hex; return M[k] ||= new THREE.MeshBasicMaterial({ color: hex }); };
const sph = (r, m, sx = 1, sy = 1, sz = 1, seg = 14) => { const g = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(8, seg - 4)), m); g.scale.set(sx, sy, sz); return g; };
const place = (o, x, y, z) => { o.position.set(x, y, z); return o; };
const _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();
/** Stretch a unit cylinder (height 1, along Y) from a to b. */
export function stretch(mesh, a, b, radiusScale = 1) {
  _v.subVectors(b, a); const len = _v.length() || 1e-4; mesh.position.copy(a).addScaledVector(_v, 0.5);
  mesh.quaternion.setFromUnitVectors(_up, _v.multiplyScalar(1 / len)); mesh.scale.set(radiusScale, len, radiusScale);
}
const cm = (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });
const cone = (r, h, m, seg = 8) => new THREE.Mesh(new THREE.ConeGeometry(r, h, seg), m);
const cyl = (r, h, m, seg = 12, rt = r) => new THREE.Mesh(new THREE.CylinderGeometry(rt, r, h, seg), m);
const torus = (R, t, m, arc = Math.PI * 2) => new THREE.Mesh(new THREE.TorusGeometry(R, t, 6, 16, arc), m);
const box = (w, h, d, m) => new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
const _h = new THREE.Vector3(), _l = new THREE.Vector3(), _r = new THREE.Vector3(), _sh = new THREE.Vector3(), _e = new THREE.Euler();


// ---------------------------------------------------------------- MOONK monkey (model from MOONK Cosmetics) driven by VR
// Head follows the headset; the body hangs below it; each arm is a 2-bone IK chain (shoulder, elbow, wrist joints)
// that reaches the controller. No legs. Cosmetics attach through the kit's attach points (head_top, face, hand_L/R, ...).
export const MONKEY_SCALE = 1.3, HEAD_Y = 0.68, HEAD_Z = 0.02, UPPER = 0.28, FORE = 0.27 + 0.05;
const _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _qy = new THREE.Quaternion().setFromAxisAngle(_up, Math.PI), _S = new THREE.Vector3(), _T = new THREE.Vector3(), _E = new THREE.Vector3(), _d = new THREE.Vector3(), _p = new THREE.Vector3(), _n = new THREE.Vector3(), _down = new THREE.Vector3(0, -1, 0);
export function poseMonkey(m, pose) {
  const root = m.root; _h.fromArray(pose.h);
  const cq = _q.set(...pose.q); _e.setFromQuaternion(cq, 'YXZ'); const yaw = _e.y;
  root.quaternion.setFromAxisAngle(_up, yaw + Math.PI); root.scale.setScalar(MONKEY_SCALE);
  _d.set(Math.sin(yaw), 0, -Math.cos(yaw)).multiplyScalar(-1);                    // camera forward is -Z; skull sits a little behind the eyes
  const fwd = _d.set(-Math.sin(yaw), 0, -Math.cos(yaw));
  _p.set(0, HEAD_Y * MONKEY_SCALE, HEAD_Z * MONKEY_SCALE).applyQuaternion(root.quaternion);
  root.position.copy(_h).addScaledVector(fwd, -0.07).sub(_p);
  // head: world = camera * Ry(pi); local to root
  _q2.copy(root.quaternion).invert().multiply(cq).multiply(_qy); m.head.quaternion.copy(_q2);
  root.updateMatrixWorld(true);
  [_l.fromArray(pose.l), _r.fromArray(pose.r)].forEach((hand, i) => {
    const arm = m.arms[i]; const sign = i === 0 ? 1 : -1;      // arm 0 = character's left = +X; left controller
    const tgt = i === 0 ? _l : _r; _T.copy(tgt); root.worldToLocal(_T);
    _S.set(sign * 0.23, 0.48, 0.02);
    let d = _d.subVectors(_T, _S); let dist = d.length(); const reach = UPPER + FORE; let stretchK = 1;
    if (dist > reach * 0.999) { stretchK = dist / (reach * 0.999); dist = reach * 0.999; }
    d.normalize();
    // elbow: law of cosines, bent toward back/out/down
    const a = (UPPER * UPPER - FORE * FORE + dist * dist) / (2 * dist); const hgt = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
    _n.set(sign * 0.6, -0.7, -0.45); _n.addScaledVector(d, -_n.dot(d)).normalize();
    _E.copy(_S).addScaledVector(d, a).addScaledVector(_n, hgt);
    const sh = arm.shoulder, el = arm.elbow;
    _d.subVectors(_E, _S).normalize(); sh.quaternion.setFromUnitVectors(_down, _d); sh.rotation.order = 'XYZ';
    _d.subVectors(_T, _E).normalize(); _q2.setFromUnitVectors(_down, _d); el.quaternion.copy(sh.quaternion).invert().multiply(_q2);
    arm.wrist.rotation.set(0, 0, 0);
    sh.scale.set(1, stretchK, 1); el.scale.set(1, 1, 1);
  });
}
// ---------------------------------------------------------------- goofy monsters (original designs, big sharp teeth)
const TOOTH = 0xfffbe6;
function teeth(n, width, hMin, hMax, up, y, z, seed = 1) {
  const g = new THREE.Group(); const m = cm(TOOTH);
  for (let i = 0; i < n; i++) { const t = n === 1 ? 0.5 : i / (n - 1); const h = hMin + ((i * 7 + seed * 3) % 5) / 4 * (hMax - hMin); const c = cone(0.017 + h * 0.12, h, m, 5); c.position.set((t - 0.5) * width, y + (up ? h / 2 : -h / 2), z - Math.abs(t - 0.5) * 0.06); if (up) c.rotation.z = Math.PI; c.rotation.z += ((i % 3) - 1) * 0.12; g.add(c); }
  return g;
}
function bipedBase(cfg) {
  const root = new THREE.Group(); const head = new THREE.Group(), torso = new THREE.Group(); root.add(head, torso);
  const limb = (r0, r1, m) => { const a = new THREE.Mesh(new THREE.CylinderGeometry(r0, r1, 1, 7), m); root.add(a); return a; };
  const arms = [limb(cfg.armR, cfg.armR * 1.15, cfg.limbM), limb(cfg.armR, cfg.armR * 1.15, cfg.limbM)];
  const hands = [new THREE.Group(), new THREE.Group()]; hands.forEach((h) => root.add(h));
  const thighs = [limb(cfg.legR, cfg.legR, cfg.legM), limb(cfg.legR, cfg.legR, cfg.legM)], shins = [limb(cfg.legR * 0.85, cfg.legR, cfg.legM), limb(cfg.legR * 0.85, cfg.legR, cfg.legM)];
  const feet = [0, 1].map(() => { const f = sph(cfg.footR, cfg.footM, 1, 0.6, 1.5); root.add(f); return f; });
  const knees = [0, 1].map(() => { const k = sph(cfg.legR * 1.5, cfg.legM); root.add(k); return k; });
  return { root, head, torso, arms, hands, thighs, shins, feet, knees, cfg, phase: 0 };
}
function buildLocust() {
  // Hour-2 redesign: no longer a grasshopper. A hunched, armoured brute on two thick legs: wide flat skull with a huge underbite of long fangs,
  // one broken horn and one long crooked horn, two mismatched amber eyes, plated back with a row of spikes, heavy clawed hands. Rust carapace, bone teeth.
  const R = em(0xb8561f, 0x4a1c08), DR = em(0x4a2418, 0x2a1008), T = em(0xfff3d6, 0x8a8062), MOUTH = em(0x4a0612, 0x8a0a1c);
  const cfg = { armR: 0.045, legR: 0.055, footR: 0.1, limbM: DR, legM: DR, footM: DR, eye: 1.6, hip: 0.8, torsoDrop: 0.45, shoulderW: 0.28, shoulderDrop: 0.3, stride: 0.3 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  head.add(place(sph(0.27, R, 1.25, 0.8, 1.05), 0, 0.04, 0));                                          // wide flat skull
  head.add(place(sph(0.11, DR, 1, 0.6, 1), -0.17, 0.17, 0.08));                                       // heavy brow lump
  const jaw = new THREE.Group(); jaw.position.set(0, -0.08, 0.02); head.add(jaw);
  jaw.add(place(sph(0.25, R, 1.2, 0.35, 1.1), 0, -0.07, 0.1)); jaw.add(place(sph(0.2, MOUTH, 1.2, 0.25, 0.9), 0, -0.01, 0.1));
  const up = [], lo = [];
  for (let i = 0; i < 9; i++) { const t = i / 8, x = (t - 0.5) * 0.46, h = 0.08 + ((i * 5) % 4) * 0.045; up.push([x, -0.03 - h / 2 + 0.02, 0.24 - Math.abs(t - 0.5) * 0.1, 0.022 + h * 0.15, h, Math.PI + (i % 3 - 1) * 0.1, 0, (i % 2 ? 0.1 : -0.1)]); }
  for (let i = 0; i < 8; i++) { const t = i / 7, x = (t - 0.5) * 0.44, h = 0.1 + ((i * 3) % 4) * 0.05; lo.push([x, 0.0 + h / 2, 0.3 - Math.abs(t - 0.5) * 0.14, 0.024 + h * 0.15, h, 0, 0, (i % 3 - 1) * 0.12]); }
  lo.push([-0.2, 0.1, 0.3, 0.035, 0.26, 0.15, 0, -0.12]);                                                // underbite tusk
  head.add(coneCluster(up, T, 5)); jaw.add(coneCluster(lo, T, 5));
  head.add(place(sph(0.065, glow(0xffb81a), 1, 1, 0.6), -0.13, 0.1, 0.25)); head.add(place(sph(0.04, glow(0xff3a10), 1, 1, 0.6), 0.14, 0.08, 0.25));
  head.add(coneCluster([[-0.17, 0.3, 0.0, 0.045, 0.34, 0.1, 0, 0.35], [0.17, 0.26, 0.0, 0.04, 0.12, 0, 0, -0.2]], DR, 5));   // one long crooked horn, one broken stub
  torso.add(place(sph(0.26, R, 1.15, 1.2, 0.95), 0, 0.02, -0.04)); torso.add(place(sph(0.3, DR, 1.0, 0.8, 1.0), 0, -0.14, -0.2)); torso.add(place(sph(0.22, R, 1, 0.7, 1), 0, -0.3, -0.32));   // plated, hunched back
  const sp = []; for (let i = 0; i < 7; i++) sp.push([((i % 2) - 0.5) * 0.06, 0.18 - i * 0.1, -0.24 - i * 0.04, 0.045 - i * 0.003, 0.2 - i * 0.012, -0.9, 0, 0]);
  torso.add(coneCluster(sp, DR, 5));
  p.jaw = jaw; p.open = 0.2;
  for (const h of hands) { h.add(sph(0.08, DR, 1, 0.9, 1.2)); h.add(coneCluster([[-0.05, 0.03, 0.12, 0.022, 0.16, 1.4, 0, 0], [0, 0.05, 0.14, 0.025, 0.19, 1.4, 0, 0], [0.05, 0.03, 0.12, 0.022, 0.16, 1.4, 0, 0]], T, 5)); }
  p.anim = (a) => { p.open += ((0.28 + 0.12 * Math.sin(a.t * 4)) - p.open) * Math.min(1, a.dt * 8); jaw.rotation.x = p.open; };
  return p;
}
/** Shaggy fur: n short cones pushed out of an ellipsoid (centre c, radii r) along its normal, swept downward, merged into ONE mesh. keep(dir) can restrict where they grow. */
const _fz = new THREE.Vector3(), _fn = new THREE.Vector3(), _fy = new THREE.Vector3(0, 1, 0);
function furTufts(c, r, n, len, rad, mat, keep = null, seed = 1, droop = 0.7) {
  const gs = [];
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n, phi = Math.acos(1 - 2 * t), th = i * 2.399963 + seed;
    const dx = Math.sin(phi) * Math.cos(th), dy = Math.cos(phi), dz = Math.sin(phi) * Math.sin(th);
    if (keep && !keep(dx, dy, dz)) continue;
    const j = ((i * 37 + seed * 11) % 7) / 6, h = len * (0.65 + 0.7 * j);
    _fn.set(dx / r[0], dy / r[1], dz / r[2]).normalize(); _fz.copy(_fn).addScaledVector(_fy, -droop * (0.6 + 0.4 * j)).normalize();
    const g = new THREE.ConeGeometry(rad * (0.8 + 0.5 * j), h, 4, 1);
    g.applyMatrix4(_m4.compose(_p4.set(c[0] + dx * r[0] + _fz.x * h * 0.3, c[1] + dy * r[1] + _fz.y * h * 0.3, c[2] + dz * r[2] + _fz.z * h * 0.3), _q4.setFromUnitVectors(_fy, _fz), _s4.set(1, 1, 1)));
    gs.push(g);
  }
  const m = new THREE.Mesh(mergeGeometries(gs), mat); gs.forEach((g) => g.dispose()); return m;
}
function buildYeti() {
  // Hour-3 pass: a hunched, shaggy ice brute instead of a snowman. Deep-set dark face under a heavy brow shelf, two uneven glowing slit eyes, a wide hinged jaw with
  // two long lower tusks and ragged rows of teeth, ram horns (one cracked), a mane of fur spikes, frost-matted chest fur, huge long-clawed hands. Same cfg/stats/attach points as before.
  const FUR = em(0xb4c6e0, 0x3c5078), FUR2 = em(0x7a8ca8, 0x24344e), MAT = em(0xe8f2ff, 0x5a7aa8), FACE = em(0x2a3040, 0x12182a), HORN = em(0xd6cfae, 0x4a4430), T = em(0xfff6dc, 0x8a8668), MOUTH = em(0x3a0612, 0x8a0a1c), CLAW = em(0x22222c, 0x0c0c12);
  const cfg = { noLegs: true, armR: 0.07, legR: 0.09, footR: 0.13, limbM: FUR2, legM: FUR, footM: FUR, eye: 1.6, hip: 0.75, torsoDrop: 0.5, shoulderW: 0.36, shoulderDrop: 0.28, stride: 0.2 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  for (const m of [p.thighs, p.shins, p.feet, p.knees]) m.forEach((o) => { o.visible = false; });
  head.add(place(sph(0.26, FUR2, 1.2, 0.9, 1.05), 0, 0.03, -0.02));                                      // wide hunched skull, low between the shoulders
  head.add(place(sph(0.19, FUR, 1.35, 0.3, 0.7), 0, 0.115, 0.15));                                       // heavy brow shelf
  head.add(place(sph(0.18, FACE, 1.25, 0.95, 0.6), 0, -0.04, 0.17));                                    // deep-set dark face
  head.add(place(sph(0.1, FACE, 1.3, 0.45, 0.7), 0, -0.01, 0.28));                                     // muzzle
  const eL = place(sph(0.05, glow(0xc8f4ff), 1.7, 0.45, 0.5), -0.1, 0.03, 0.27), eR = place(sph(0.034, glow(0xffe08a), 1.7, 0.45, 0.5), 0.1, 0.04, 0.27); eL.rotation.z = -0.35; eR.rotation.z = 0.25; head.add(eL, eR);   // uneven slit eyes
  const jaw = new THREE.Group(); jaw.position.set(0, -0.1, 0.06); head.add(jaw);
  jaw.add(place(sph(0.22, FUR2, 1.15, 0.5, 1.05), 0, -0.05, 0.1)); jaw.add(place(sph(0.18, MOUTH, 1.2, 0.3, 0.95), 0, 0.0, 0.11));
  const up = [], lo = [];
  for (let i = 0; i < 9; i++) { const t = i / 8, x = (t - 0.5) * 0.4, h = 0.1 + ((i * 5) % 4) * 0.05; up.push([x, -0.08 - h / 2 + 0.03, 0.3 - Math.abs(t - 0.5) * 0.12, 0.02 + h * 0.13, h, Math.PI + (i % 3 - 1) * 0.1, 0, (i % 2 ? 0.1 : -0.12)]); }
  for (let i = 0; i < 8; i++) { const t = i / 7, x = (t - 0.5) * 0.38, h = 0.09 + ((i * 3) % 4) * 0.045; lo.push([x, 0.02 + h / 2, 0.27 - Math.abs(t - 0.5) * 0.12, 0.02 + h * 0.13, h, 0, 0, (i % 3 - 1) * 0.12]); }
  lo.push([-0.17, 0.13, 0.3, 0.035, 0.38, 0.25, 0, -0.05], [0.16, 0.1, 0.3, 0.03, 0.3, 0.25, 0, 0.1]);   // two long lower tusks (one shorter)
  head.add(coneCluster(up, T, 5)); jaw.add(coneCluster(lo, T, 5));
  const horn = [[-0.26, 0.277, -0.02, 0.06, 0.22, 0, 0, 0.8], [-0.43, 0.378, -0.02, 0.035, 0.18, 0, 0, 1.3], [0.25, 0.265, -0.02, 0.055, 0.2, 0, 0, -0.9]];   // ram horns, the right one broken
  head.add(coneCluster(horn, HORN, 5));
  const mane = []; for (let i = 0; i < 9; i++) { const x = (i - 4) * 0.07; mane.push([x, 0.25 - Math.abs(x) * 0.5, -0.14 - (i % 2) * 0.04, 0.05, 0.2 + (i % 3) * 0.06, -0.8, 0, -x * 2.6]); }
  head.add(coneCluster(mane, FUR, 4));                                                                   // shaggy mane of spikes swept back
  torso.add(place(sph(0.38, FUR2, 1.2, 1.15, 0.95), 0, 0.0, -0.02)); torso.add(place(sph(0.22, FUR2, 1, 0.9, 1), -0.33, 0.2, -0.02)); torso.add(place(sph(0.22, FUR2, 1, 0.9, 1), 0.33, 0.2, -0.02));   // shoulder humps
  torso.add(place(sph(0.33, FUR2, 1.05, 1.2, 0.9), 0.02, -0.5, -0.03)); torso.add(place(sph(0.28, FUR2, 1.1, 0.9, 1), 0, 0.28, -0.26));   // fur mound instead of legs + hunched back
  torso.add(furTufts([0, 0, -0.02], [0.4, 0.4, 0.34], 150, 0.15, 0.065, FUR, null, 1, 0.8));                     // shaggy breakup over the whole chest and shoulders
  torso.add(furTufts([0.02, -0.5, -0.03], [0.35, 0.4, 0.31], 110, 0.17, 0.065, FUR, null, 4, 0.9));             // ...and over the lower mound
  torso.add(furTufts([0, 0.0, 0.0], [0.38, 0.38, 0.34], 60, 0.2, 0.07, MAT, (x, y, z) => z > 0.35 && y > -0.55 && y < 0.55 && Math.abs(x) < 0.7, 2, 1.0));   // frost-matted clump of pale fur down the chest (replaces the old blue patch)
  for (const sx of [-1, 1]) torso.add(furTufts([sx * 0.33, 0.2, -0.02], [0.22, 0.2, 0.22], 30, 0.12, 0.055, FUR, null, 5 + sx, 0.6));   // shoulder fur
  head.add(furTufts([0, 0.03, -0.02], [0.3, 0.24, 0.27], 36, 0.11, 0.05, FUR, (x, y, z) => z < 0.2 && y > -0.3, 3, 0.5));   // scruffy fur on the back of the skull and cheeks
  const sp = []; for (let i = 0; i < 11; i++) sp.push([((i % 3) - 1) * 0.16, 0.3 - Math.floor(i / 3) * 0.2, -0.3 - (i % 2) * 0.03, 0.05, 0.22 + (i % 4) * 0.04, -1.1, 0, ((i % 3) - 1) * 0.35]);
  torso.add(coneCluster(sp, FUR2, 4));                                                                   // back spikes
  const skirt = []; for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, h = 0.22 + (i % 3) * 0.08; skirt.push([Math.cos(a) * 0.38, -0.85 - h / 2 + 0.1, Math.sin(a) * 0.32, 0.06, h, Math.PI, 0, Math.cos(a) * 0.25]); }
  torso.add(coneCluster(skirt, FUR2, 4));                                                                // ragged fur skirt
  for (const h of hands) { h.add(place(sph(0.12, FUR2, 1, 0.9, 1.1), 0, 0, 0)); h.add(coneCluster([[-0.07, 0.03, 0.14, 0.022, 0.24, 1.35, 0, 0.1], [-0.025, 0.05, 0.16, 0.024, 0.28, 1.35, 0, 0], [0.025, 0.05, 0.16, 0.024, 0.28, 1.35, 0, 0], [0.07, 0.03, 0.14, 0.022, 0.24, 1.35, 0, -0.1]], CLAW, 5)); h.add(coneCluster([[0, 0.1, -0.06, 0.06, 0.2, -2.0, 0, 0]], FUR, 4)); }
  p.jaw = jaw; p.open = 0.15;
  p.anim = (a) => { const tgt = 0.3 + 0.1 * Math.sin(a.t * 2.4); p.open += (tgt - p.open) * Math.min(1, a.dt * 6); jaw.rotation.x = p.open; torso.rotation.x = 0.06 + 0.02 * Math.sin(a.t * 1.8); };
  return p;
}
function buildHuman() {
  const S = cm(0xf2c9a0), V = cm(0xff8a1f), J = cm(0x2b4ea0), cfg = { armR: 0.04, legR: 0.055, footR: 0.07, limbM: S, legM: J, footM: cm(0x222), eye: 1.6, hip: 0.85, torsoDrop: 0.5, shoulderW: 0.2, shoulderDrop: 0.28, stride: 0.35 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  head.add(sph(0.14, S, 1, 1.1, 1)); head.add(place(sph(0.14, cm(0x3b2a1c), 1.02, 0.6, 1.0), 0, 0.07, -0.02));
  for (const s of [-1, 1]) { head.add(place(sph(0.035, cm(0xffffff), 1, 1.2, 0.5), s * 0.055, 0.02, 0.125)); head.add(place(sph(0.015, cm(0x111), 1, 1, 0.5), s * 0.055, 0.02, 0.15)); }
  const sm = torus(0.06, 0.008, cm(0x6b1d1d), Math.PI); sm.position.set(0, -0.05, 0.13); sm.rotation.z = Math.PI; head.add(sm);
  torso.add(sph(0.17, V, 1, 1.5, 0.75)); for (const h of hands) h.add(sph(0.05, S));
  return p;
}

// ---------------------------------------------------------------- overnight killers: Gulper + Grinner (hand-built from primitives)
// Draw-call budget: every static group of teeth/spikes is merged into ONE mesh (merged geometry), so each killer is ~15 meshes.
const _m4 = new THREE.Matrix4(), _q4 = new THREE.Quaternion(), _e4 = new THREE.Euler(), _p4 = new THREE.Vector3(), _s4 = new THREE.Vector3();
/** One merged mesh of cones. specs: [x, y, z, radius, height, rotX, rotY, rotZ] (cone points +Y before rotation). */
function coneCluster(specs, mat, seg = 5) {
  const gs = specs.map(([x, y, z, r, h, rx = 0, ry = 0, rz = 0]) => { const g = new THREE.ConeGeometry(r, h, seg, 1); g.applyMatrix4(_m4.compose(_p4.set(x, y, z), _q4.setFromEuler(_e4.set(rx, ry, rz)), _s4.set(1, 1, 1))); return g; });
  const m = new THREE.Mesh(mergeGeometries(gs), mat); gs.forEach((g) => g.dispose()); return m;
}
const em = (c, e, o = {}) => new THREE.MeshLambertMaterial({ color: c, emissive: e, flatShading: true, ...o });
const glow = (c) => new THREE.MeshBasicMaterial({ color: c });
const wet = (c, e) => new THREE.MeshPhongMaterial({ color: c, emissive: e, flatShading: true, shininess: 35, specular: 0x665566 });   // glossy, wet-looking flesh
/** One merged mesh of ellipsoid blobs. list: [x, y, z, r, sx, sy, sz] */
function blobs(list, mat, seg = 6) {
  const gs = list.map(([x, y, z, r, sx = 1, sy = 1, sz = 1]) => { const g = new THREE.SphereGeometry(r, seg, Math.max(4, seg - 2)); g.applyMatrix4(_m4.compose(_p4.set(x, y, z), _q4.identity(), _s4.set(sx, sy, sz))); return g; });
  const m = new THREE.Mesh(mergeGeometries(gs), mat); gs.forEach((g) => g.dispose()); return m;
}
/** Several tapered, jointed finger chains merged into one mesh. chains: [[x,y,z], ...][]; r = base radius. */
function chainsMesh(chains, r, mat) {
  const gs = [];
  for (const pts of chains) for (let i = 0; i < pts.length - 1; i++) {
    _sa.set(...pts[i]); _sb.set(...pts[i + 1]); const len = _sa.distanceTo(_sb), k = 1 - i / pts.length * 0.6;
    const g = new THREE.CylinderGeometry(r * k * 0.8, r * k, len, 4, 1); g.applyMatrix4(_m4.compose(_sc.copy(_sa).lerp(_sb, 0.5), _q4.setFromUnitVectors(_sy, _sb.sub(_sa).normalize()), _s4.set(1, 1, 1))); gs.push(g);
    const j = new THREE.SphereGeometry(r * k * 1.25, 5, 4); j.translate(...pts[i + 1]); gs.push(j);
  }
  const m = new THREE.Mesh(mergeGeometries(gs), mat); gs.forEach((g) => g.dispose()); return m;
}
function buildGulper() {
  // Hour-4 pass: lopsided wet-skinned brute. Swollen cheek on one side, sunken brow on the other, a glossy jaw with pink gum ridges and staggered teeth of every size (some broken),
  // a dangling string of drool, warty/bristly skin and patchy fur on the hunch, knuckle-walking arms with real knuckles. Same cfg, anim hook and attach points as before.
  const SK = em(0x6b4258, 0x421a33), SK2 = em(0x7a5266, 0x4a2038), DK = em(0x3a2434, 0x2a1226), T = em(0xfffbe6, 0x8a8668), TD = em(0xc9bf98, 0x5a5238), MOUTH = wet(0x5a0c1c, 0x8a0a1c), GUM = wet(0xc84a68, 0x6a1830), WET = wet(0x6b4258, 0x421a33), FURG = em(0x4a3340, 0x2a1828);
  const cfg = { noLegs: true, armR: 0.085, legR: 0.09, footR: 0.1, limbM: DK, legM: DK, footM: DK, eye: 1.6, hip: 0.7, torsoDrop: 0.32, shoulderW: 0.34, shoulderDrop: 0.2, stride: 0.2 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  for (const m of [p.thighs, p.shins, p.feet, p.knees]) m.forEach((o) => { o.visible = false; });
  head.add(place(sph(0.27, SK, 1.25, 0.85, 1.1), 0.02, 0.02, 0.02));                                   // squashed skull
  head.add(blobs([[0.22, -0.05, 0.1, 0.16, 1, 1.1, 1], [-0.2, 0.2, 0.02, 0.1, 1, 0.7, 1], [0.1, 0.22, 0.06, 0.07, 1, 0.8, 1], [-0.28, -0.04, 0.0, 0.08, 1, 1, 1]], SK2));   // swollen right cheek, heavy left brow, lumps (lopsided)
  const bump = []; for (let i = 0; i < 16; i++) { const a = i * 2.39, y = 0.18 - (i % 6) * 0.07; bump.push([Math.cos(a) * 0.3, y, Math.sin(a) * 0.2 - 0.02, 0.022 + (i % 3) * 0.01, 1, 1, 1]); }
  head.add(blobs(bump, DK, 5));                                                                         // warts
  head.add(coneCluster(Array.from({ length: 12 }, (_, i) => { const a = i / 11 * 2.4 - 1.2; return [Math.sin(a) * 0.3, 0.26 - Math.abs(a) * 0.05, -0.12, 0.016, 0.1 + (i % 3) * 0.04, -0.8, 0, -Math.sin(a) * 0.6]; }), FURG, 3));   // bristles over the skull
  head.add(place(sph(0.085, glow(0xffc61a), 1, 1, 0.6), 0.14, 0.1, 0.27)); head.add(place(sph(0.035, glow(0xff2a10), 1, 1, 0.6), -0.16, 0.06, 0.27));   // one big yellow eye, one small red one
  head.add(place(sph(0.03, DK, 1, 1, 0.5), 0.14, 0.1, 0.32));
  const upper = place(sph(0.3, GUM, 1.25, 0.16, 0.9), 0, -0.085, 0.19); head.add(upper);                  // upper gum ridge
  const up = []; for (let i = 0; i < 11; i++) { const t = i / 10, x = (t - 0.5) * 0.52, h = 0.05 + ((i * 7) % 5) * 0.04 + (i === 3 ? 0.05 : 0); up.push([x + ((i % 3) - 1) * 0.008, -0.1 - h / 2, 0.27 - Math.abs(t - 0.5) * 0.13, 0.018 + h * 0.15, h * (i === 6 ? 0.45 : 1), (i % 3 - 1) * 0.15, 0, (i % 2 ? 0.14 : -0.16)]); }
  up.push([0.22, -0.2, 0.26, 0.04, 0.28, 0, 0, 0.08], [-0.05, -0.12, 0.28, 0.02, 0.07, 0, 0, 0.6]);       // one giant fang and a broken stub
  head.add(coneCluster(up, T));
  const jaw = new THREE.Group(); jaw.position.set(0, -0.06, 0.0); head.add(jaw);                        // hinge at the back of the mouth
  jaw.add(place(sph(0.36, WET, 1.45, 0.34, 1.2), 0.03, -0.14, 0.26));                                   // oversized glossy lower jaw (pushed to one side)
  jaw.add(place(sph(0.27, MOUTH, 1.3, 0.2, 1.0), 0, -0.04, 0.24));                                      // tongue / mouth floor
  jaw.add(place(sph(0.3, GUM, 1.3, 0.09, 0.95), 0, -0.01, 0.31));                                       // lower gum ridge
  jaw.add(place(sph(0.1, em(0xb04060, 0x5a1428), 1.3, 0.5, 1.5), -0.05, -0.04, 0.3));                  // fat tongue
  const lo = []; for (let i = 0; i < 9; i++) { const t = i / 8, x = (t - 0.5) * 0.6, h = 0.05 + ((i * 3) % 5) * 0.04; lo.push([x, 0.02 + h / 2, 0.44 - Math.abs(t - 0.5) * 0.24, 0.02 + h * 0.16, h, ((i * 5) % 3 - 1) * 0.2, 0, (i % 3 - 1) * 0.14]); }
  lo.push([-0.22, 0.14, 0.34, 0.035, 0.28, 0.2, 0, -0.1], [0.12, 0.05, 0.43, 0.012, 0.05, 0, 0, 0.4]);   // lower tusk and a chipped tooth
  jaw.add(coneCluster(lo, TD));
  const drool = []; for (let i = 0; i < 3; i++) drool.push([-0.12 + i * 0.13, -0.24 - i * 0.03, 0.45 - i * 0.04, 0.007, 0.22 + i * 0.08, 0, 0, 0]);
  const dr = coneCluster(drool, new THREE.MeshBasicMaterial({ color: 0xc8e8e0 }), 3); dr.rotation.x = Math.PI; dr.position.set(0, -0.5, 0.9); jaw.add(dr);   // strings of drool off the lower lip (swing in anim)
  torso.add(place(sph(0.5, SK, 1.1, 0.95, 1.15), 0, 0.12, -0.28));                                      // the hunch
  torso.add(place(sph(0.3, SK2, 1, 0.8, 1), -0.25, 0.3, -0.08));                                        // lopsided shoulder lump
  torso.add(furTufts([0, 0.12, -0.28], [0.52, 0.48, 0.58], 60, 0.14, 0.05, FURG, (x, y, z) => z < 0.2 && y > -0.3, 3, 0.7));   // patchy matted fur over the back
  const sp = []; for (let i = 0; i < 9; i++) { const a = i / 8 * 2.4 - 1.2; sp.push([Math.sin(a) * 0.42, 0.5 + Math.cos(a) * 0.1 - ((i % 3) * 0.04), -0.5 + Math.cos(a) * 0.08, 0.05, 0.2 + (i % 4) * 0.05, -0.5, 0, -Math.sin(a) * 0.6]); }
  torso.add(coneCluster(sp, DK, 5));
  for (const h of hands) {                                                                              // knuckle-walker fists: palm, four proper knuckles, thick short claws, wrist tuft
    h.add(blobs([[0, 0, 0, 0.12, 1, 0.9, 1.1], [-0.08, 0.04, 0.1, 0.05], [-0.027, 0.05, 0.12, 0.052], [0.027, 0.05, 0.12, 0.052], [0.08, 0.04, 0.1, 0.05], [0.0, 0.1, -0.02, 0.06, 1.6, 0.7, 1]], DK, 7));
    h.add(coneCluster([[-0.08, 0.02, 0.17, 0.028, 0.12, 1.3, 0, 0.1], [-0.027, 0.03, 0.19, 0.03, 0.14, 1.3, 0, 0], [0.027, 0.03, 0.19, 0.03, 0.14, 1.3, 0, 0], [0.08, 0.02, 0.17, 0.028, 0.12, 1.3, 0, -0.1]], T));
    h.add(coneCluster([[0.0, 0.1, -0.08, 0.05, 0.16, -1.9, 0, 0], [-0.06, 0.08, -0.06, 0.04, 0.12, -1.7, 0, 0.3]], FURG, 4));
  }
  p.jaw = jaw; p.open = 0.1; p.dr = dr;
  p.anim = (a) => { const target = a.ab === 1 ? 1.0 : a.ab === 2 ? 0.75 : 0.3 + 0.1 * Math.sin(a.t * 3); p.open += (target - p.open) * Math.min(1, a.dt * (a.ab === 1 ? 14 : 8)); jaw.rotation.x = p.open; torso.rotation.x = a.ab === 2 ? 0.35 : 0.1 + 0.03 * Math.sin(a.t * 2); dr.rotation.z = Math.sin(a.t * 2.6) * 0.12; };
  return p;
}
function buildGrinner() {
  // Hour-4 pass: cracked pale skin, a too-wide grin with real depth (dark cavity, wet pink gums, two rows of needle teeth, stretched lip line), a swivel neck with vertebra ridges,
  // long spindly jointed fingers. Same cfg, anim hook (head swivel, grin widening) and attach points as before.
  const SK = em(0xd9d2e6, 0x5a5478), SK2 = em(0xc4bbd4, 0x4a4468), DK = em(0x3a3350, 0x2a2450), CRK = em(0x2a2440, 0x120e22), T = em(0xfffff0, 0xb0b090), MOUTH = em(0x1a0612, 0x4a0c30), GUM = wet(0xc87890, 0x5a2038), LIP = em(0x8a5a78, 0x3a1a34);
  const cfg = { armR: 0.028, legR: 0.034, footR: 0.06, limbM: SK, legM: SK, footM: DK, eye: 1.6, hip: 0.95, torsoDrop: 0.6, shoulderW: 0.13, shoulderDrop: 0.32, stride: 0.5 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  const skull = place(sph(0.2, SK, 0.85, 1.3, 0.85), 0, 0.03, 0); head.add(skull);
  head.add(place(sph(0.07, SK2, 1, 0.8, 0.8), -0.12, 0.2, 0.08));                                       // lumpy forehead
  const crack = []; for (let i = 0; i < 9; i++) { const a = i * 1.7, y = -0.1 + (i % 5) * 0.08; crack.push([Math.cos(a) * 0.17, y, 0.09 + Math.sin(a) * 0.06, 0.006, 0.12 + (i % 3) * 0.06, 0, a, 0.3 + i * 0.7]); }
  head.add(coneCluster(crack, CRK, 3));                                                                  // hairline cracks across the pale skin
  head.add(place(cyl(0.035, 0.45, SK2, 6), 0, -0.4, -0.02));                                            // long neck down to the torso
  { const gs = []; for (let i = 0; i < 6; i++) { const g = new THREE.TorusGeometry(0.042, 0.011, 4, 8); g.rotateX(Math.PI / 2); g.translate(0, -0.2 - i * 0.065, -0.02); gs.push(g); const sp = new THREE.ConeGeometry(0.012, 0.05, 4); sp.rotateX(-Math.PI / 2 - 0.4); sp.translate(0, -0.2 - i * 0.065, -0.07); gs.push(sp); }
    head.add(new THREE.Mesh(mergeGeometries(gs), DK)); gs.forEach((g) => g.dispose()); }                 // vertebra ridges and bone spurs down the swivel neck
  const mouth = place(sph(0.3, MOUTH, 1.0, 0.16, 0.34), 0, -0.08, 0.12); head.add(mouth);              // the dark cavity: wider (0.56) than the 0.27 wide head
  head.add(coneCluster([[-0.3, -0.04, 0.12, 0.006, 0.2, 0, 0, 1.2], [0.3, -0.04, 0.12, 0.006, 0.2, 0, 0, -1.2], [-0.29, -0.14, 0.12, 0.006, 0.14, 0, 0, 1.9], [0.29, -0.14, 0.12, 0.006, 0.14, 0, 0, -1.9]], CRK, 3));   // the skin splits at the corners of the grin
  head.add(place(sph(0.27, GUM, 1.0, 0.06, 0.3), 0, -0.045, 0.17)); head.add(place(sph(0.25, GUM, 1.0, 0.04, 0.3), 0, -0.145, 0.17));   // wet pink upper and lower gums
  const top = [], bot = [], back = []; for (let i = 0; i < 19; i++) { const t = i / 18, x = (t - 0.5) * 0.52, curve = Math.pow(Math.abs(t - 0.5) * 2, 2) * 0.08; const h = 0.09 + ((i * 7) % 4) * 0.03 + (i % 6 === 2 ? 0.05 : 0);
    top.push([x, -0.05 + curve - h / 2, 0.19 - Math.abs(t - 0.5) * 0.1, 0.014, h, Math.PI + (i % 3 - 1) * 0.06, 0, (i % 2 ? 0.05 : -0.05)]); bot.push([x, -0.14 + curve + h / 2, 0.19 - Math.abs(t - 0.5) * 0.1, 0.014, h * 0.9, ((i % 3) - 1) * 0.06, 0, (i % 2 ? -0.05 : 0.05)]);
    if (i % 2) back.push([x * 0.9, -0.06 + curve - 0.05, 0.14 - Math.abs(t - 0.5) * 0.1, 0.011, 0.08, Math.PI, 0, 0.1], [x * 0.9, -0.13 + curve + 0.05, 0.14 - Math.abs(t - 0.5) * 0.1, 0.011, 0.07, 0, 0, -0.1]); }
  head.add(coneCluster(top, T, 4)); head.add(coneCluster(bot, T, 4)); head.add(coneCluster(back, T, 4));   // front row + a second, shorter back row for depth
  for (const sx of [-1, 1]) { const e = place(sph(0.035, glow(0xb9ffe0), 0.4, 1.7, 0.4), sx * 0.07, 0.1, 0.12); e.rotation.z = -sx * 0.35; head.add(e); }   // slanted glowing slit eyes
  head.rotation.z = 0.0; skull.rotation.z = 0.18;
  torso.add(place(sph(0.1, SK, 1, 2.6, 0.7), 0, -0.05, 0)); torso.add(place(sph(0.06, DK, 1.1, 1.3, 0.8), 0, 0.12, 0.05));
  torso.add(coneCluster(Array.from({ length: 7 }, (_, i) => [0, 0.2 - i * 0.09, -0.07, 0.014, 0.06, -Math.PI / 2 - 0.3, 0, 0]), DK, 4));   // spine knobs
  for (const h of hands) { const fx = [-0.036, -0.018, 0, 0.018, 0.036]; h.add(blobs([[0, 0, 0.02, 0.04, 1, 0.7, 1.4]], SK, 5));   // long spindly jointed fingers, merged into one mesh per hand
    h.add(chainsMesh(fx.map((x, i) => { const L = 0.36 + (i === 2 ? 0.08 : i === 0 ? -0.08 : 0); return [[x, 0, 0.05], [x * 1.4, 0.005, 0.05 + L * 0.35], [x * 1.9, -0.01 - i * 0.002, 0.05 + L * 0.7], [x * 2.2, -0.04, 0.05 + L]]; }), 0.0085, SK));
    h.add(coneCluster(fx.map((x, i) => [x * 2.2, -0.05, 0.05 + (0.36 + (i === 2 ? 0.08 : i === 0 ? -0.08 : 0)) + 0.03, 0.007, 0.06, 1.4, 0, 0]), T, 3)); }
  p.anim = (a) => { const sw = a.ab === 1 ? Math.sin(a.t * 40) * 0.35 : Math.sin(a.t * 0.9) * 1.1 + Math.sin(a.t * 2.3) * 0.25; head.rotation.y += sw; head.rotation.z = 0.18 + (a.ab ? 0.3 : 0); mouth.scale.set(1 + (a.ab === 1 ? 0.25 : 0), 0.16 * (1 + (a.ab === 1 ? 2.2 : 0)), 0.34); };
  return p;
}


// ---- hour 2 killers: Burrower (segmented ring-mouth worm, burrows) + Mimic (a monkey whose face splits open)
function buildBurrower() {
  const PINK = em(0xeab8c0, 0x6a4a52), GRAY = em(0xa6a2b2, 0x4a485a), DK = em(0x4a3038, 0x2a1820), T = em(0xfff6dc, 0x8a8668), MOUTH = em(0x4a0612, 0x9a0a1c);
  const cfg = { noLegs: true, armR: 0.04, legR: 0.05, footR: 0.06, limbM: PINK, legM: PINK, footM: PINK, eye: 1.6, hip: 0.7, torsoDrop: 0.45, shoulderW: 0.26, shoulderDrop: 0.25, stride: 0.2 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  for (const m of [p.thighs, p.shins, p.feet, p.knees]) m.forEach((o) => { o.visible = false; });
  head.add(place(sph(0.31, PINK, 1.0, 1.05, 1.05), 0, 0.0, -0.02));                                   // bulbous worm head
  head.add(place(sph(0.12, GRAY, 1, 0.8, 1), -0.17, 0.2, -0.05)); head.add(place(sph(0.08, GRAY, 1, 0.7, 1), 0.2, 0.17, -0.02));   // lumps (lopsided)
  // the ring mouth: a rim torus, a dark throat, and three staggered rings of big teeth, all pointing inward (and a little forward)
  const ring = new THREE.Group(); ring.position.set(0.0, -0.01, 0.27); ring.rotation.z = 0.0; head.add(ring);
  const rim = torus(0.22, 0.05, DK); ring.add(rim); ring.add(place(sph(0.22, MOUTH, 1, 1, 0.3), 0, 0, -0.04));
  const specs = [];
  for (const [R, n, h0, seed] of [[0.2, 15, 0.13, 1], [0.15, 11, 0.11, 2], [0.1, 8, 0.09, 3]]) for (let i = 0; i < n; i++) {
    const th = i / n * Math.PI * 2 + seed * 0.4, h = h0 * (0.7 + ((i * 7 + seed) % 5) / 5 * 0.8), rr = R - h * 0.45;
    specs.push([Math.cos(th) * rr, Math.sin(th) * rr, 0.02 - seed * 0.025, 0.02 + h * 0.12, h, 0, 0, th + Math.PI / 2]);
  }
  specs.push([0.05, 0.12, 0.05, 0.03, 0.2, 0, 0, Math.PI * 1.1]);   // one big crooked fang
  ring.add(coneCluster(specs, T, 5));
  for (const [x, y, z, r] of [[-0.12, 0.22, 0.15, 0.04], [0.06, 0.27, 0.12, 0.03], [0.2, 0.15, 0.15, 0.025]]) head.add(place(sph(r, glow(0xffe14d), 1, 1, 0.6), x, y, z));   // three mismatched eyes
  // segmented body: stacked flattened rings curling down and back to the ground, alternating pink and gray
  for (let i = 0; i < 7; i++) {
    const seg = place(sph(0.27 - i * 0.02, i % 2 ? GRAY : PINK, 1.0, 0.62, 1.0), Math.sin(i * 1.3) * 0.04, -0.08 - i * 0.19, -0.04 - i * 0.045 - i * i * 0.006); torso.add(seg);
  }
  const bands = []; for (let i = 0; i < 7; i++) bands.push([0, -0.18 - i * 0.19, -0.04 - i * 0.045 - i * i * 0.006 + 0.16, 0.03, 0.09, Math.PI / 2, 0, 0]);   // bristle spikes down the front of the body
  torso.add(coneCluster(bands, DK, 4));
  for (const h of hands) { h.add(sph(0.075, PINK, 1, 0.9, 1.2)); h.add(coneCluster([[-0.04, 0.04, 0.09, 0.02, 0.1, 1.3, 0, 0], [0.04, 0.04, 0.09, 0.02, 0.1, 1.3, 0, 0], [0, 0.06, 0.1, 0.025, 0.12, 1.3, 0, 0]], T, 4)); }
  const bodyParts = p.root.children.filter((c) => ![...p.thighs, ...p.shins, ...p.feet, ...p.knees].includes(c));   // legs stay hidden
  // surface ripple: visible during the dive tell and while underground
  const rip = new THREE.Group(); rip.visible = false; p.root.add(rip);
  const dirt = new THREE.MeshBasicMaterial({ color: 0x6b4a2a, transparent: true, opacity: 0.85 });
  const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.05, 5, 18), dirt), r2 = new THREE.Mesh(new THREE.TorusGeometry(0.85, 0.035, 5, 22), dirt); r1.rotation.x = r2.rotation.x = Math.PI / 2; rip.add(r1, r2);
  const clods = []; for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; clods.push([Math.cos(a) * (0.45 + (i % 3) * 0.08), 0.06, Math.sin(a) * (0.45 + (i % 3) * 0.08), 0.07, 0.18 + (i % 4) * 0.05, 0, 0, 0]); }
  const mound = coneCluster(clods, em(0x7a5a38, 0x2a1a0a), 5); rip.add(mound);
  p.rip = rip; p.st = 0; p.lastAb = 0; p.hid = false;
  p.anim = (a) => {
    if (a.ab !== p.lastAb) { p.lastAb = a.ab; p.st = 0; } p.st += a.dt;
    const sc = p.root.scale.x || 1, under = a.ab === 2, sink = a.ab === 1 ? Math.min(1, p.st / 0.45) * 0.7 : a.ab === 3 ? Math.max(0, 1 - p.st / 0.2) * 0.5 : 0;
    ring.rotation.z = a.t * 0.5; head.rotation.z = Math.sin(a.t * 1.3) * 0.12; head.position.y -= sink; torso.position.y -= sink;
    if (a.ab === 1) { head.position.x += Math.sin(a.t * 60) * 0.03; }
    const snap = a.ab === 3 ? 0.5 + 0.5 * Math.abs(Math.cos(p.st * 16)) : 1; ring.scale.setScalar(snap);
    for (const c of bodyParts) c.visible = !under;
    if (!under && p.hid) head.visible = !a.local; p.hid = under;
    if (a.local) head.visible = false;
    rip.visible = a.ab === 1 || under;
    if (rip.visible) { rip.position.set(head.position.x, (head.position.y + sink - 1.6) + 0.02 / sc, head.position.z); const k = under ? 1 : Math.min(1, p.st / 0.45); const pulse = 1 + 0.12 * Math.sin(a.t * 14); rip.scale.set(k * pulse, 1, k * pulse); r2.scale.setScalar(1 + 0.25 * Math.sin(a.t * 9 + 1)); mound.rotation.y = a.t * 2; dirt.opacity = 0.6 + 0.3 * Math.sin(a.t * 12); }
  };
  return p;
}
function buildMimic() {
  // A normal gray monkey (the kit model) whose face splits open: vertical seam, red throat, teeth along both lips, glowing eyes.
  const m = createMonkey(); m.isMonkey = true; const head = m.head;
  const T = em(0xfff6dc, 0x8a8668), MOUTH = em(0x5a0612, 0xa80a1c);
  const maw = new THREE.Group(); maw.position.set(0, -0.05, 0.262); head.add(maw);   // sits on the muzzle/jaw so the eyes and brow stay readable
  const LIP = em(0x8a3030, 0x3a1010), DEEP = em(0x2a0510, 0x5a0a18);
  const ring = torus(0.07, 0.026, MOUTH); ring.scale.set(0.95, 1.2, 0.75); ring.position.set(0, 0, 0.0); maw.add(ring);   // raised red flesh rim of the split...
  maw.add(place(sph(0.07, DEEP, 0.85, 1.2, 0.2), 0, 0, -0.018));                                       // ...a deep dark red well inside it...
  maw.add(place(sph(0.044, em(0x050105, 0x100208), 0.7, 1.2, 0.2), 0, 0, -0.012));                     // ...and a black throat in the middle: depth, not a flat oval
  maw.add(place(sph(0.02, em(0xc04a64, 0x601428), 0.55, 3.0, 0.7), 0, -0.01, -0.012));                 // a wet tongue ridge down the middle
  for (const sx of [-1, 1]) { maw.add(place(sph(0.022, LIP, 0.55, 4.6, 1.0), sx * 0.085, 0.0, 0.012)); }   // raised, torn lip ridges along the seam
  maw.add(place(sph(0.012, em(0x1a0808, 0x0c0204), 0.5, 7, 0.5), 0, 0.17, 0.0)); maw.add(place(sph(0.012, em(0x1a0808, 0x0c0204), 0.5, 5, 0.5), 0, -0.15, 0.0));   // the seam runs on over the brow and the chin
  const sp = [];
  for (let i = 0; i < 7; i++) { const y = -0.085 + i * 0.028, h = 0.05 + ((i * 5) % 3) * 0.028; sp.push([-0.075, y, 0.03, 0.013, h, 0, 0, -Math.PI / 2 + 0.15], [0.075, y + 0.012, 0.03, 0.013, h * 0.95, 0, 0, Math.PI / 2 - 0.15]); }   // outer lip teeth
  for (let i = 0; i < 5; i++) { const y = -0.06 + i * 0.03, h = 0.035 + ((i * 7) % 3) * 0.015; sp.push([-0.05, y + 0.012, 0.0, 0.01, h, 0, 0, -Math.PI / 2 + 0.5], [0.05, y, 0.0, 0.01, h, 0, 0, Math.PI / 2 - 0.5]); }       // a second, deeper staggered row
  sp.push([0, 0.098, 0.03, 0.014, 0.075, Math.PI, 0, 0], [0.03, -0.098, 0.03, 0.014, 0.075, 0, 0, 0], [-0.03, -0.098, 0.03, 0.014, 0.06, 0, 0, 0], [0, -0.098, 0.03, 0.012, 0.045, 0, 0, 0]);
  maw.add(coneCluster(sp, T, 4));
  for (const sx of [-1, 1]) head.add(place(sph(0.03, glow(0xff6a1a), 1.3, 0.8, 0.6), sx * 0.1, 0.07, 0.21));   // unmasked eyes glow over the monkey eyes
  maw.scale.set(0.3, 0.9, 1);
  m.anim = (a) => { const open = a.ab === 3 ? 1 + 0.15 * Math.sin(a.t * 30) : 0.55 + 0.1 * Math.sin(a.t * 3); maw.scale.set(0.35 + 1.0 * open, 0.7 + 0.8 * open, 1); if (a.ab === 3) maw.rotation.z = Math.sin(a.t * 40) * 0.08; else maw.rotation.z = 0; };
  return m;
}

// ---- hour 3 killers: Dangler (hangs from a rig it carries, shoots a barbed tongue) + Wailer (ragged shroud, a vertical maw splits the whole body)
function buildDangler() {
  const NECK = em(0xb9b270, 0x4a4620), SK = em(0x9a8a62, 0x403820), DK = em(0x4a3a30, 0x201410), IRON = em(0x8a8896, 0x3a3844), RUST = em(0x8a4a22, 0x3a1a08), T = em(0xfff3d0, 0x8a8260), MOUTH = em(0x5a0818, 0xa80a22), TONG = em(0xd04060, 0x70102a);
  const cfg = { noLegs: true, armR: 0.022, legR: 0.05, footR: 0.06, limbM: NECK, legM: DK, footM: DK, eye: 1.6, hip: 0.7, torsoDrop: 0.9, shoulderW: 0.16, shoulderDrop: 0.78, stride: 0.2 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  for (const m of [p.thighs, p.shins, p.feet, p.knees]) m.forEach((o) => { o.visible = false; });
  // the head: a long drooping blind ovoid (no eyes, just two sewn-shut seams), pitched forward as if hanging
  const hd = new THREE.Group(); hd.rotation.x = 0.28; head.add(hd);
  hd.add(place(sph(0.23, SK, 0.9, 1.4, 0.95), 0, -0.05, 0)); hd.add(place(sph(0.08, DK, 1, 1.2, 0.8), -0.15, 0.05, 0.02)); hd.add(place(sph(0.05, DK, 1, 1.2, 0.8), 0.17, -0.02, 0.0));   // warty lumps
  for (const s of [-1, 1]) { const sm = place(sph(0.05, DK, 1, 0.12, 0.4), s * 0.075, 0.05, 0.155); sm.rotation.z = -s * 0.35; hd.add(sm); }
  hd.add(place(sph(0.06, DK, 1.6, 0.5, 0.6), 0, 0.12, 0.17));                                        // heavy brow fold
  const jaw = new THREE.Group(); jaw.position.set(0, -0.24, 0.05); hd.add(jaw);                      // hinged lower jaw of big hooked fangs
  jaw.add(place(sph(0.15, SK, 1.1, 0.32, 1.15), 0, -0.04, 0.07)); jaw.add(place(sph(0.12, MOUTH, 1.1, 0.2, 0.95), 0, 0.0, 0.07));
  const lo = [], up = [];
  for (let i = 0; i < 7; i++) { const t = i / 6, x = (t - 0.5) * 0.3, h = 0.15 + ((i * 3) % 4) * 0.05; lo.push([x, 0.02 + h / 2, 0.16 - Math.abs(t - 0.5) * 0.12, 0.016 + h * 0.12, h, -0.25, 0, (i % 3 - 1) * 0.12]); }
  lo.push([-0.11, 0.14, 0.2, 0.035, 0.42, -0.5, 0, 0.1], [0.11, 0.12, 0.2, 0.032, 0.36, -0.5, 0, -0.1]);    // two big hooked tusks
  for (let i = 0; i < 6; i++) { const t = i / 5, x = (t - 0.5) * 0.26, h = 0.1 + ((i * 5) % 3) * 0.04; up.push([x, -0.2 - h / 2 + 0.03, 0.13 - Math.abs(t - 0.5) * 0.1, 0.014 + h * 0.12, h, Math.PI, 0, (i % 3 - 1) * 0.1]); }
  jaw.add(coneCluster(lo, T, 5)); hd.add(coneCluster(up, T, 5));
  // the long rubbery neck: up and back to a hook on the tall rig it carries
  const neck = place(cyl(0.05, 0.83, NECK, 7), 0, 0.58, -0.16); neck.rotation.x = -0.27; head.add(neck);
  const swell = place(sph(0.07, NECK, 1, 1.2, 1), 0, 0.5, -0.12); swell.visible = false; head.add(swell);   // throat bulge that travels down the neck during the tell
  const hook = place(torus(0.09, 0.022, RUST), 0, 0.96, -0.26); hook.rotation.y = Math.PI / 2; head.add(hook);
  torso.add(place(cyl(0.03, 1.95, IRON, 6), 0, 0.88, -0.36));                                       // the rig pole (rises past the head)
  torso.add(place(cyl(0.022, 0.36, IRON, 5), 0, 1.84, -0.3)); torso.children[torso.children.length - 1].rotation.x = Math.PI / 2;
  torso.add(place(sph(0.26, DK, 1.0, 1.15, 0.9), 0, 0, 0)); torso.add(coneCluster([[0, 0.2, -0.22, 0.04, 0.2, -0.9, 0, 0], [0.1, 0.1, -0.24, 0.035, 0.18, -1.0, 0, -0.2], [-0.1, 0.05, -0.24, 0.035, 0.2, -1.0, 0, 0.2], [0, -0.05, -0.27, 0.04, 0.22, -1.1, 0, 0]], IRON, 4)); torso.add(place(sph(0.17, SK, 1.0, 0.9, 0.8), 0, -0.2, 0.06));   // saggy body
  const rag = []; for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; rag.push([Math.cos(a) * 0.17, -0.38 - (i % 3) * 0.04, Math.sin(a) * 0.14, 0.045, 0.2 + (i % 4) * 0.07, 0, 0, Math.cos(a) * 0.25]); rag[i][4] *= 1; }
  torso.add(coneCluster(rag.map((r) => [r[0], r[1] - r[4] / 2, r[2], r[3], r[4], Math.PI, 0, r[7]]), DK, 4));
  for (const h of hands) { h.add(sph(0.05, NECK, 1, 0.8, 1.3)); h.add(coneCluster([[-0.025, 0, 0.1, 0.01, 0.15, 1.45, 0, 0], [0, 0, 0.11, 0.01, 0.17, 1.45, 0, 0], [0.025, 0, 0.1, 0.01, 0.15, 1.45, 0, 0]], T, 4)); }
  // the tongue (visible to everyone): a shaft that scales along +Z with a barbed tip. Lives on the root so it follows the real aim direction, not just the yaw.
  const tg = new THREE.Group(); tg.visible = false; p.root.add(tg);
  const sg = new THREE.CylinderGeometry(0.035, 0.05, 1, 6); sg.rotateX(Math.PI / 2); sg.translate(0, 0, 0.5);
  const shaft = new THREE.Mesh(sg, TONG); tg.add(shaft);
  const tip = new THREE.Group(); tg.add(tip);
  tip.add(coneCluster([[0, 0, 0.12, 0.055, 0.26, Math.PI / 2, 0, 0], [0.06, 0, -0.04, 0.02, 0.14, Math.PI / 2, 0, -0.9], [-0.06, 0, -0.04, 0.02, 0.14, Math.PI / 2, 0, 0.9], [0, 0.06, -0.04, 0.02, 0.14, Math.PI / 2 + 0.9, 0, 0], [0, -0.06, -0.04, 0.02, 0.14, Math.PI / 2 - 0.9, 0, 0]], T, 4));   // barbs
  const _fd = new THREE.Vector3(), _zz = new THREE.Vector3(0, 0, 1), _ko = new THREE.Quaternion();
  p.jaw = jaw; p.st = 0; p.lastAb = 0; p.open = 0.25;
  p.anim = (a) => {
    if (a.ab !== p.lastAb) { p.lastAb = a.ab; p.st = 0; } p.st += a.dt;
    const tell = a.ab === 1, go = a.ab === 2, k = tell ? Math.min(1, p.st / 0.5) : 0;
    p.open += ((tell ? 0.5 + 0.5 * k : go ? 1.0 : 0.25 + 0.08 * Math.sin(a.t * 2.2)) - p.open) * Math.min(1, a.dt * 12); jaw.rotation.x = p.open;
    neck.rotation.z = Math.sin(a.t * 1.4) * 0.05; hd.rotation.z = Math.sin(a.t * 1.4 + 0.5) * 0.07 + (tell ? Math.sin(a.t * 50) * 0.05 * k : 0);
    swell.visible = tell; if (tell) { swell.position.set(0, 0.88 - 0.62 * k, -0.15 + 0.1 * k); swell.scale.setScalar(0.7 + 0.9 * k); }
    torso.rotation.x = tell ? -0.15 * k : 0;
    tg.visible = go && !!a.q;
    if (tg.visible) {
      const [x, y, z, w] = a.q; _fd.set(-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y)));
      tg.quaternion.setFromUnitVectors(_zz, _fd); tg.position.copy(head.position); tg.position.y -= 0.14; tg.position.addScaledVector(_fd, 0.12);
      const L = (a.reel || 9) / (a.sc || 1), e = p.st < 0.1 ? p.st / 0.1 : p.st < 0.22 ? 1 : Math.max(0, 1 - (p.st - 0.22) / 0.13);
      shaft.scale.set(1, 1, Math.max(0.01, L * e)); tip.position.z = L * e; tip.scale.setScalar(1 / Math.max(a.sc || 1, 0.5));
    }
  };
  return p;
}
function buildWailer() {
  const SH = em(0x6a6a84, 0x24243a), DK = em(0x2c2a3c, 0x120e1c), T = em(0xf4f6ff, 0x9a9cb4), MOUTH = em(0x24061a, 0x80102e);
  const cfg = { noLegs: true, armR: 0.02, legR: 0.05, footR: 0.06, limbM: SH, legM: SH, footM: SH, eye: 1.6, hip: 0.7, torsoDrop: 0.55, shoulderW: 0.24, shoulderDrop: 0.3, stride: 0.2 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  for (const m of [p.thighs, p.shins, p.feet, p.knees]) m.forEach((o) => { o.visible = false; });
  head.add(place(sph(0.21, SH, 0.85, 1.35, 0.85), 0, 0.06, 0));                                      // narrow hooded skull
  for (const sx of [-1, 1]) head.add(place(sph(0.03, glow(0xd8ecff), 0.6, 2.4, 0.5), sx * 0.06, 0.13, 0.16));   // pale hollow eyes
  torso.add(place(sph(0.3, SH, 1.0, 1.6, 0.85), 0, 0.05, 0)); torso.add(place(sph(0.24, DK, 1.1, 1.1, 0.7), 0, -0.2, -0.1));
  const maw = new THREE.Group(); maw.position.set(0, 0.1, 0); torso.add(maw);                         // the vertical mouth, from the skull down to the hem
  maw.add(place(sph(0.5, MOUTH, 0.2, 1.0, 0.35), 0, 0, 0.1));
  const tl = []; const n = 15;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1), y = -0.46 + t * 0.92, w = 0.095 * Math.sqrt(Math.max(0.05, 1 - (y / 0.5) ** 2)), zs = Math.max(0.03, 0.25 * Math.sqrt(Math.max(0, 1 - ((y + 0.05) / 0.48) ** 2))) - 0.02, h = 0.08 + ((i * 5) % 4) * 0.055;
    tl.push([-w, y, zs + 0.07, 0.014, h, 0, 0, -Math.PI / 2 + ((i % 3) - 1) * 0.15], [w, y + 0.015, zs + 0.07, 0.014, h * 0.95, 0, 0, Math.PI / 2 + ((i % 3) - 1) * 0.15]);
  }
  maw.add(coneCluster(tl, T, 4));
  const rag = []; for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2, h = 0.22 + ((i * 7) % 4) * 0.1; rag.push([Math.cos(a) * 0.22, -0.52 - h / 2 + 0.05, Math.sin(a) * 0.17, 0.05, h, Math.PI, 0, Math.cos(a) * 0.2]); }
  torso.add(coneCluster(rag, DK, 4));                                                                  // ragged hem
  torso.add(coneCluster([[-0.3, 0.1, 0, 0.04, 0.34, 0, 0, 1.9], [0.3, 0.0, 0, 0.04, 0.4, 0, 0, -1.9], [-0.27, -0.2, 0.0, 0.05, 0.5, Math.PI, 0, -0.2], [0.26, -0.15, 0.05, 0.04, 0.42, Math.PI, 0, 0.25], [0, 0.78, -0.12, 0.05, 0.3, -2.2, 0, 0], [-0.1, 0.75, -0.1, 0.035, 0.34, Math.PI - 0.5, 0.0, 0.5], [0.12, 0.72, -0.1, 0.035, 0.3, Math.PI - 0.5, 0, -0.6]], DK, 4));   // torn rags, trailing hood strips   // torn side rags
  for (const h of hands) { h.add(sph(0.04, SH, 1, 0.8, 1.4)); h.add(coneCluster([[-0.02, 0, 0.1, 0.008, 0.18, 1.5, 0, 0], [0, 0, 0.11, 0.008, 0.2, 1.5, 0, 0], [0.02, 0, 0.1, 0.008, 0.18, 1.5, 0, 0]], T, 4)); }
  // shriek shockwave: two flat rings that expand to the 10 m radius
  const wm = new THREE.MeshBasicMaterial({ color: 0xcfd8ff, transparent: true, opacity: 0.6, depthWrite: false });
  const rings = new THREE.Group(); rings.visible = false; p.root.add(rings);
  const rA = new THREE.Mesh(new THREE.TorusGeometry(1, 0.004, 4, 48), wm), rB = new THREE.Mesh(new THREE.TorusGeometry(1, 0.003, 4, 48), wm); rA.rotation.x = rB.rotation.x = Math.PI / 2; rings.add(rA, rB);
  p.st = 0; p.lastAb = 0; p.mw = 0.2;
  p.anim = (a) => {
    if (a.ab !== p.lastAb) { p.lastAb = a.ab; p.st = 0; } p.st += a.dt;
    const inh = a.ab === 1, sh = a.ab === 2, k = inh ? Math.min(1, p.st / 0.6) : 0;
    const bob = Math.sin(a.t * 1.7) * 0.04; head.position.y += bob; torso.position.y += bob;
    const target = inh ? 0.4 + 0.5 * k : sh ? 2.4 : 0.2 + 0.03 * Math.sin(a.t * 3); p.mw += (target - p.mw) * Math.min(1, a.dt * (sh ? 25 : 8));
    maw.scale.set(0.75 + p.mw / 0.2 * 0.25, sh ? 1.08 : 1, 1);
    torso.scale.set(1 + 0.15 * k + (sh ? 0.1 : 0), 1 + 0.08 * k, 1 + 0.15 * k);
    const sk = sh ? 0.03 : inh ? 0.015 * k : 0; torso.position.x += Math.sin(a.t * 71) * sk; head.position.x += Math.sin(a.t * 63) * sk;
    head.rotation.x = 0; if (!a.local) head.children[0].rotation.x = sh ? -0.5 : inh ? -0.3 * k : 0;
    torso.visible = !a.local;   // first person: your own teeth and rags stay out of your face
    rings.visible = sh && p.st < 1.0 && !a.local;
    if (rings.visible) { const R = 10 / (a.sc || 1), f = 1 - Math.pow(1 - Math.min(1, p.st / 0.6), 2); rings.position.set(head.position.x, head.position.y - 0.7, head.position.z); rA.scale.setScalar(Math.max(0.05, R * f)); rB.scale.setScalar(Math.max(0.05, R * f * 0.7)); wm.opacity = 0.6 * (1 - p.st); }
  };
  return p;
}

// ---- hour 4 killers: Lurker (flat manta slab with a lid-mouth, four bony arms, clings to surfaces) + Stringman (cracked ventriloquist doll on strings under a floating cross-bar)
const _sa = new THREE.Vector3(), _sb = new THREE.Vector3(), _sc = new THREE.Vector3(), _sy = new THREE.Vector3(0, 1, 0);
/** Merge a chain of capsule-like limb segments through the points pts (one mesh): thin cylinders + joint knobs. */
function boneChain(pts, radii, mat, knob = 1.5) {
  const gs = [];
  for (let i = 0; i < pts.length - 1; i++) {
    _sa.set(...pts[i]); _sb.set(...pts[i + 1]); const len = _sa.distanceTo(_sb), r = radii[i];
    const g = new THREE.CylinderGeometry(r * 0.8, r, len, 5, 1); g.applyMatrix4(_m4.compose(_sc.copy(_sa).lerp(_sb, 0.5), _q4.setFromUnitVectors(_sy, _sb.sub(_sa).normalize()), _s4.set(1, 1, 1))); gs.push(g);
    const k = new THREE.SphereGeometry(r * knob, 6, 4); k.translate(...pts[i + 1]); gs.push(k);
  }
  const m = new THREE.Mesh(mergeGeometries(gs), mat); gs.forEach((g) => g.dispose()); return m;
}
function buildLurker() {
  const PALE = em(0xd9d4c8, 0x5a5860), UNDER = em(0xa89aa0, 0x3a3038), DK = em(0x6a5c62, 0x2a2228), BONE = em(0xd2cab0, 0x4e4a3a), T = em(0xfffbe6, 0x8a8668), MOUTH = em(0x4a0818, 0x9a0c22);
  const cfg = { noLegs: true, armR: 0.035, legR: 0.05, footR: 0.06, limbM: BONE, legM: BONE, footM: BONE, eye: 1.6, hip: 0.7, torsoDrop: 0.62, shoulderW: 0.42, shoulderDrop: 0.55, stride: 0.2 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  for (const m of [p.thighs, p.shins, p.feet, p.knees]) m.forEach((o) => { o.visible = false; });
  // the slab: a wide flat pale body; the lid-like upper half hinges open along the whole front edge, lined with long needle teeth
  torso.add(place(sph(0.5, UNDER, 1.7, 0.14, 1.0), 0, -0.08, 0));
  const lid = new THREE.Group(); lid.position.set(0, 0.0, -0.05); torso.add(lid);
  lid.add(place(sph(0.5, PALE, 1.7, 0.2, 1.0), 0, 0.1, 0.05));
  const hole = place(sph(0.5, MOUTH, 1.55, 0.1, 0.9), 0, 0.0, 0.1); torso.add(hole);                                 // red cavity visible when the lid lifts
  const up = [], lo = [];
  for (let i = 0; i < 27; i++) { const a = (i / 26 - 0.5) * 2.5, x = Math.sin(a) * 0.84, z = 0.1 + Math.cos(a) * 0.5 - 0.0, h = 0.1 + ((i * 7) % 5) * 0.05 + (i % 9 === 4 ? 0.1 : 0); up.push([x, -h / 2 + 0.02, z - 0.05 + 0.02, 0.014 + h * 0.1, h, Math.PI + (i % 3 - 1) * 0.08, 0, Math.sin(a) * 0.3 + (i % 2 ? 0.06 : -0.06)]); }
  for (let i = 0; i < 22; i++) { const a = (i / 21 - 0.5) * 2.2, x = Math.sin(a) * 0.8, z = 0.1 + Math.cos(a) * 0.46, h = 0.07 + ((i * 5) % 4) * 0.045; lo.push([x, h / 2 - 0.01, z, 0.014 + h * 0.1, h, 0.1, 0, -Math.sin(a) * 0.3 + (i % 3 - 1) * 0.07]); }
  lid.add(coneCluster(up, T, 4)); torso.add(coneCluster(lo, T, 4));
  const warts = []; for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 0.2 + (i % 5) * 0.12; warts.push([Math.cos(a) * r * 1.4, 0.26 - (r * 0.1), Math.sin(a) * r * 0.6 - 0.1, 0.04 + (i % 3) * 0.015, 0.06 + (i % 4) * 0.02, 0, 0, 0]); }
  lid.add(coneCluster(warts, DK, 5));                                                                                  // warts and mottling
  lid.add(coneCluster([[0, 0.28, -0.45, 0.05, 0.28, -1.3, 0, 0], [-0.25, 0.26, -0.4, 0.04, 0.22, -1.2, 0, 0.2], [0.25, 0.26, -0.4, 0.04, 0.2, -1.2, 0, -0.2], [-0.5, 0.2, -0.3, 0.035, 0.18, -1.1, 0, 0.5], [0.5, 0.2, -0.3, 0.035, 0.18, -1.1, 0, -0.5]], BONE, 5));   // spines along the back
  // eyes: a lumpy cluster of small mismatched glowing eyes on a short stalk above the slab
  head.add(place(cyl(0.05, 0.55, UNDER, 6), 0, -0.3, -0.04)); head.add(place(sph(0.14, PALE, 1.1, 0.8, 1.0), 0, 0.0, 0.02));
  const eyes = [[-0.08, 0.06, 0.12, 0.05, 0xffb81a], [0.07, 0.07, 0.13, 0.035, 0xff3a2a], [0.0, 0.1, 0.1, 0.03, 0xd8ff7a], [-0.14, 0.0, 0.08, 0.025, 0xffe14d], [0.14, 0.01, 0.09, 0.04, 0xff7a1a], [0.02, 0.0, 0.15, 0.022, 0xffffff]];
  for (const [x, y, z, r, c] of eyes) head.add(place(sph(r, glow(c), 1, 1, 0.7), x, y, z));
  // four long bony multi-jointed arms: the two real ones follow the controllers, the other two are posed bone chains that drag it along
  const bones = []; for (const sx of [-1, 1]) { const g = new THREE.Group(); g.position.set(sx * 0.4, 0.0, -0.1); torso.add(g); g.add(boneChain([[0, 0, 0], [sx * 0.35, 0.28, -0.1], [sx * 0.75, 0.0, 0.15], [sx * 0.95, -0.55, 0.35], [sx * 1.0, -0.78, 0.5]], [0.04, 0.032, 0.026, 0.02], BONE)); g.add(coneCluster([[sx * 1.0, -0.83, 0.6, 0.02, 0.14, 1.2, 0, 0], [sx * 1.06, -0.82, 0.55, 0.016, 0.12, 1.1, 0, -sx * 0.3], [sx * 0.94, -0.82, 0.55, 0.016, 0.12, 1.1, 0, sx * 0.3]], T, 4)); bones.push(g); }
  for (const h of hands) { h.add(sph(0.05, BONE, 1, 0.8, 1.3)); h.add(coneCluster([[-0.03, 0, 0.12, 0.012, 0.22, 1.4, 0, 0], [0, 0, 0.14, 0.012, 0.26, 1.4, 0, 0], [0.03, 0, 0.12, 0.012, 0.22, 1.4, 0, 0], [-0.05, 0, 0.08, 0.01, 0.16, 1.2, 0, 0.3]], T, 4)); }
  const grit = coneCluster(Array.from({ length: 16 }, (_, i) => [Math.cos(i * 2.4) * (0.2 + (i % 4) * 0.15), -0.05 - (i % 5) * 0.12, Math.sin(i * 2.4) * (0.2 + (i % 3) * 0.12), 0.012, 0.04, 0, 0, 0]), em(0x8a7a62, 0x2a2418), 4); grit.visible = false; torso.add(grit);   // grit falling off it during the tell
  p.st = 0; p.lastAb = 0; p.open = 0.1; p.lid = lid;
  p.anim = (a) => {
    if (a.ab !== p.lastAb) { p.lastAb = a.ab; p.st = 0; } p.st += a.dt;
    const tgt = a.ab === 3 ? 1.15 : a.ab === 1 ? 0.35 + 0.1 * Math.sin(a.t * 40) : a.ab === 2 ? 0.1 : 0.3 + 0.12 * Math.sin(a.t * 2.2); p.open += (tgt - p.open) * Math.min(1, a.dt * (a.ab === 3 ? 30 : 9)); lid.rotation.x = -p.open;
    hole.scale.set(1.55, 0.1 + p.open * 0.1, 0.9);
    bones[0].rotation.z = Math.sin(a.t * 1.3) * 0.08 + (a.ab === 2 ? 0.25 : 0); bones[1].rotation.z = -Math.sin(a.t * 1.3 + 1) * 0.08 - (a.ab === 2 ? 0.25 : 0); bones[0].rotation.x = bones[1].rotation.x = a.ab === 3 ? 0.5 : Math.sin(a.t * 1.7) * 0.05;
    torso.position.y += Math.sin(a.t * 1.5) * 0.03; torso.rotation.x = a.ab === 3 ? 0.3 : 0; if (a.ab === 1) torso.position.x += Math.sin(a.t * 70) * 0.012;
    grit.visible = (a.ab === 1 || a.ab === 2) && !a.local; if (grit.visible) { grit.position.y = -((a.t * 0.9) % 0.7); grit.rotation.y = a.t; }
  };
  return p;
}
function buildStringman() {
  const WOOD = em(0xcfae78, 0x4a3a20), PAINT = em(0xe8dcc0, 0x58503c), DKW = em(0x4a3020, 0x1c1008), SUIT = em(0x4a1a22, 0x20080e), CHEEK = em(0xc83a3a, 0x501010), T = em(0xf6efd8, 0x8a8468), BLK = em(0x08060a, 0x050405), MOUTHI = em(0x2a0610, 0x600a18);
  const cfg = { noLegs: true, armR: 0.025, legR: 0.05, footR: 0.06, limbM: DKW, legM: DKW, footM: DKW, eye: 1.6, hip: 0.7, torsoDrop: 0.52, shoulderW: 0.2, shoulderDrop: 0.3, stride: 0.2 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  for (const m of [p.thighs, p.shins, p.feet, p.knees]) m.forEach((o) => { o.visible = false; });
  const hd = new THREE.Group(); head.add(hd);
  hd.add(place(sph(0.22, PAINT, 1.0, 1.1, 0.95), 0, 0.03, 0)); hd.add(place(sph(0.225, BLK, 1.0, 0.6, 0.98), 0, 0.14, -0.02));   // painted dome head + black painted hair cap
  for (const sx of [-1, 1]) {
    hd.add(place(sph(0.085, glow(0xfffff0), 1, 1, 0.3), sx * 0.095, 0.06, 0.19));                                      // painted eyes, far too wide
    hd.add(place(sph(0.04, BLK, 1, 1, 0.3), sx * 0.095 + sx * -0.01, 0.055, 0.205)); hd.add(place(sph(0.035, CHEEK, 1, 1, 0.25), sx * 0.15, -0.07, 0.17));   // huge pupils, rosy circle cheeks
  }
  hd.add(coneCluster([[0.02, 0.1, 0.2, 0.012, 0.3, 0, 0, 1.2], [-0.12, -0.02, 0.2, 0.01, 0.2, 0, 0, -0.5], [0.15, 0.0, 0.19, 0.01, 0.16, 0, 0, 2.2]], DKW, 3));   // cracks across the face
  const jaw = new THREE.Group(); jaw.position.set(0, -0.12, 0.02); hd.add(jaw);                                         // hinged dummy jaw, packed with jagged teeth
  jaw.add(place(box(0.34, 0.1, 0.3, WOOD), 0, -0.06, 0.1)); jaw.add(place(box(0.28, 0.05, 0.24, MOUTHI), 0, 0.0, 0.1));
  const up = [], lo = [];
  for (let i = 0; i < 12; i++) { const x = (i / 11 - 0.5) * 0.3, h = 0.06 + ((i * 7) % 5) * 0.025; up.push([x, -0.085 - h / 2, 0.2, 0.014 + h * 0.1, h, Math.PI + (i % 3 - 1) * 0.12, 0, (i % 2 ? 0.1 : -0.1)]); lo.push([x + 0.012, 0.03 + h * 0.45, 0.2, 0.013 + h * 0.1, h * 0.9, ((i % 3) - 1) * 0.12, 0, (i % 2 ? -0.1 : 0.1)]); }
  hd.add(coneCluster(up, T, 4)); jaw.add(coneCluster(lo, T, 4));
  hd.add(place(box(0.34, 0.03, 0.1, MOUTHI), 0, -0.1, 0.19));                                                           // dark lip line under the nose
  hd.add(place(cone(0.03, 0.12, WOOD, 5), 0, 0.0, 0.24)); hd.children[hd.children.length - 1].rotation.x = Math.PI / 2;   // long wooden nose
  // cracked wooden torso in a tattered dark suit, bow tie, splintered chest hole, knob shoulders
  torso.add(place(box(0.34, 0.44, 0.2, SUIT), 0, 0.0, 0)); torso.add(place(box(0.38, 0.14, 0.24, DKW), 0, -0.26, 0));
  torso.add(place(sph(0.07, BLK, 1, 1.4, 0.4), 0.06, 0.02, 0.1)); torso.add(coneCluster([[0.06, 0.12, 0.11, 0.015, 0.1, 0, 0, 0.3], [0.13, 0.04, 0.11, 0.015, 0.1, 0, 0, -1.4], [-0.01, 0.0, 0.11, 0.015, 0.1, 0, 0, 1.5], [0.07, -0.08, 0.11, 0.015, 0.1, 0, 0, Math.PI - 0.2]], WOOD, 3));   // splintered hole
  torso.add(coneCluster([[-0.05, 0.2, 0.11, 0.045, 0.1, 0, 0, Math.PI / 2], [0.05, 0.2, 0.11, 0.045, 0.1, 0, 0, -Math.PI / 2]], CHEEK, 4));   // bow tie
  torso.add(coneCluster([[-0.14, -0.4, 0.0, 0.05, 0.22, Math.PI, 0, 0.1], [-0.05, -0.42, 0.08, 0.05, 0.28, Math.PI, 0, 0], [0.06, -0.4, -0.02, 0.05, 0.2, Math.PI, 0, -0.1], [0.15, -0.4, 0.06, 0.05, 0.25, Math.PI, 0, -0.15]], SUIT, 4));   // ragged coat tails where the legs should be
  for (const sx of [-1, 1]) torso.add(place(sph(0.05, WOOD, 1, 1, 1), sx * 0.2, 0.18, 0));
  for (const h of hands) { h.add(place(sph(0.045, WOOD, 1, 0.8, 1.3), 0, 0, 0.02)); h.add(coneCluster([[-0.025, 0, 0.1, 0.01, 0.14, 1.4, 0, 0], [0, 0, 0.11, 0.01, 0.16, 1.4, 0, 0], [0.025, 0, 0.1, 0.01, 0.14, 1.4, 0, 0]], T, 4)); }
  // the floating wooden control bar above it and the strings down to head and shoulders (merged into one mesh); the whole rig lives in head space
  const rig = new THREE.Group(); head.add(rig);
  rig.add(place(box(0.7, 0.04, 0.07, WOOD), 0, 0.95, 0)); rig.add(place(box(0.05, 0.04, 0.5, WOOD), 0, 0.95, 0)); rig.add(place(box(0.03, 0.2, 0.03, DKW), 0, 1.07, 0));
  const strMat = new THREE.MeshBasicMaterial({ color: 0xb8a888 });
  const sg = []; const addString = (x0, y0, z0, x1, y1, z1) => { _sa.set(x0, y0, z0); _sb.set(x1, y1, z1); const len = _sa.distanceTo(_sb); const g = new THREE.CylinderGeometry(0.006, 0.006, len, 3, 1); g.applyMatrix4(_m4.compose(_sc.copy(_sa).lerp(_sb, 0.5), _q4.setFromUnitVectors(_sy, _sb.sub(_sa).normalize()), _s4.set(1, 1, 1))); sg.push(g); };
  addString(-0.3, 0.95, 0, -0.1, 0.22, 0.02); addString(0.3, 0.95, 0, 0.1, 0.22, 0.02); addString(0, 0.95, 0.22, 0, 0.1, 0.18); addString(0, 0.95, -0.22, 0, 0.1, -0.15); addString(-0.3, 0.95, 0, -0.2, -0.3, 0); addString(0.3, 0.95, 0, 0.2, -0.3, 0);
  const strings = new THREE.Mesh(mergeGeometries(sg), strMat); sg.forEach((g) => g.dispose()); rig.add(strings);
  p.st = 0; p.lastAb = 0; p.open = 0.1;
  p.anim = (a) => {
    if (a.ab !== p.lastAb) { p.lastAb = a.ab; p.st = 0; } p.st += a.dt;
    const chatter = a.ab === 1 ? 0.6 + 0.4 * Math.abs(Math.sin(a.t * 30)) : a.ab === 2 ? 0.9 : 0.25 + 0.2 * Math.max(0, Math.sin(a.t * 6.1) * Math.sin(a.t * 2.3));
    p.open += (chatter - p.open) * Math.min(1, a.dt * 16); jaw.rotation.x = p.open;
    const glowing = a.ab === 1 || a.ab === 2; strMat.color.setHex(glowing ? (0xb8a888 + (Math.sin(a.t * 40) > 0 ? 0x403810 : 0x101000)) : 0xb8a888); strMat.color.lerp(glowing ? new THREE.Color(0xfff0a0) : new THREE.Color(0xb8a888), glowing ? 0.5 + 0.4 * Math.sin(a.t * 30) : 0);
    rig.rotation.z = a.ab === 1 ? Math.sin(a.t * 45) * 0.16 : Math.sin(a.t * 0.9) * 0.05; rig.rotation.x = a.ab === 2 ? 0.25 : Math.sin(a.t * 0.7) * 0.03;
    hd.rotation.z = Math.sin(a.t * 1.1) * 0.06 + (a.ab === 1 ? Math.sin(a.t * 38) * 0.05 : 0); torso.position.y += Math.sin(a.t * 1.6) * 0.02;
    rig.visible = !a.local || true; torso.rotation.z = Math.sin(a.t * 1.3) * 0.04;
  };
  return p;
}
export const LOOK_BUILDERS = { locust: buildLocust, yeti: buildYeti, human: buildHuman, gulper: buildGulper, grinner: buildGrinner, burrower: buildBurrower, mimic: buildMimic, dangler: buildDangler, wailer: buildWailer, lurker: buildLurker, stringman: buildStringman };

const _f = new THREE.Vector3(), _hip = new THREE.Vector3(), _ft = new THREE.Vector3(), _kn = new THREE.Vector3(), _sd = new THREE.Vector3();
export function poseBiped(p, pose, speed, dt, armLen = 0) {
  const c = p.cfg; _h.fromArray(pose.h); _l.fromArray(pose.l); _r.fromArray(pose.r);
  p.head.position.copy(_h); p.head.quaternion.set(...pose.q); _e.setFromQuaternion(p.head.quaternion, 'YXZ'); const yaw = _e.y;
  p.head.rotation.set(0, yaw + Math.PI, 0); p.head.position.copy(_h);   // models face +Z; the headset looks down -Z
  p.torso.position.set(_h.x, _h.y - c.torsoDrop, _h.z); p.torso.rotation.set(0, yaw + Math.PI, 0);
  _f.set(-Math.sin(yaw), 0, -Math.cos(yaw)); _sd.set(Math.cos(yaw), 0, -Math.sin(yaw));
  [_l, _r].forEach((hand, i) => {
    const s = i ? 1 : -1; _sh.copy(_sd).multiplyScalar(c.shoulderW * s).add(_h); _sh.y = _h.y - c.shoulderDrop;
    if (armLen) { _v.subVectors(hand, _sh); const d = _v.length(); if (d < armLen * 0.5 && d > 0) { /* arms visually stretch to the real controller */ } }
    stretch(p.arms[i], _sh, hand); p.hands[i].position.copy(hand); p.hands[i].lookAt(hand.x * 2 - _sh.x, hand.y * 2 - _sh.y, hand.z * 2 - _sh.z);
  });
  if (c.noLegs) return;
  p.phase += speed * dt * 4.2; const amp = Math.min(1, speed / 1.5);
  const feetY = _h.y - c.eye;
  for (let i = 0; i < 2; i++) {
    const s = i ? 1 : -1, ph = p.phase + (i ? Math.PI : 0);
    _hip.copy(_sd).multiplyScalar(0.11 * s).add(_h); _hip.y = _h.y - c.hip;
    _ft.copy(_sd).multiplyScalar(0.13 * s).add(_h).addScaledVector(_f, Math.sin(ph) * c.stride * amp); _ft.y = feetY + Math.max(0, Math.cos(ph)) * 0.16 * amp;
    _kn.addVectors(_hip, _ft).multiplyScalar(0.5).addScaledVector(_f, 0.14 + 0.1 * amp).addScaledVector(_sd, 0.05 * s);
    stretch(p.thighs[i], _hip, _kn); stretch(p.shins[i], _kn, _ft); p.knees[i].position.copy(_kn); p.feet[i].position.set(_ft.x, _ft.y + 0.02, _ft.z); p.feet[i].rotation.y = yaw;
  }
}


/** One player's visual. Looks are built lazily (monkey first) to keep mesh counts low. */
export class Avatar {
  constructor() {
    this.root = new THREE.Group(); this.looks = {}; this.cur = 'monkey'; this.last = new THREE.Vector3(); this.speed = 0; this.equipKey = null;
    this.looks.monkey = createMonkey(); this.root.add(this.looks.monkey.root);
  }
  look(name) { if (!this.looks[name]) { const p = LOOK_BUILDERS[name](); this.looks[name] = p; this.root.add(p.root); p.root.visible = false; } return this.looks[name]; }
  setEquip(e) { const k = JSON.stringify(e || {}); if (k === this.equipKey) return; this.equipKey = k; applyLoadout(this.looks.monkey, e || {}); this.ghost = undefined; }
  /** pose: world pose {h,q,l,r}; o: {look, scale, local, ghost, it, dt} */
  update(pose, o = {}) {
    const dt = o.dt || 0.016, look = o.look || 'monkey';
    if (look !== this.cur) { const prev = this.looks[this.cur]; prev.root.visible = false; this.cur = look; if (look === 'monkey') this.looks.monkey.root.visible = true; else this.look(look).root.visible = true; }
    const p = this.looks[look]; _v.fromArray(pose.h); const sp = Math.hypot(_v.x - this.last.x, _v.z - this.last.z) / Math.max(dt, 0.001); this.speed += (Math.min(sp, 12) - this.speed) * 0.2; this.last.copy(_v);
    if (look === 'monkey' || p.isMonkey) { poseMonkey(p, pose); for (const c of p.root.children) if (!c.name.startsWith('arm_')) c.visible = !o.local; if (p.anim) p.anim({ ab: o.ab || 0, t: o.time ?? performance.now() / 1000, dt }); }   // first person: only your arms and hands
    else {
      poseBiped(p, pose, this.speed, dt, o.armLen); p.head.visible = !o.local; if (p.anim) p.anim({ ab: o.ab || 0, t: o.time ?? performance.now() / 1000, dt, local: !!o.local, q: pose.q, reel: o.reel, sc: o.local ? 1 : (o.scale || 1) });
      const sc = o.scale || 1; const shake = o.tell ? 0.05 : 0; p.root.scale.setScalar(sc * (1 + (o.tell ? 0.06 * Math.sin(performance.now() / 22) : 0)));
      p.root.position.set(pose.h[0] * (1 - sc) + shake * Math.sin(performance.now() / 17), (pose.h[1] - 1.6) * (1 - sc), pose.h[2] * (1 - sc) + shake * Math.cos(performance.now() / 19));
      if (o.local) { p.root.scale.setScalar(1); p.root.position.set(0, 0, 0); p.hands.forEach((h) => h.scale.setScalar(Math.min(sc, 1.8))); } else p.hands.forEach((h) => h.scale.setScalar(1));
    }
    this.setGhost(!!o.ghost); if (look === 'monkey') this.setIt(!!o.it);
  }
  setGhost(g) { if (g === this.ghost) return; this.ghost = g; this.root.traverse((c) => { if (c.isMesh && c.material && !Array.isArray(c.material)) { c.material.transparent = g; c.material.opacity = g ? 0.3 : 1; c.material.needsUpdate = true; } }); }
  setIt(on) { const f = this.looks.monkey.furMat; if (on === this.it) return; this.it = on; f.emissive.setHex(on ? 0xff1a1a : 0); f.emissiveIntensity = on ? 0.6 : 0; }
}
