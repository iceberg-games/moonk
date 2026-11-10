import * as THREE from 'three';
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
  const G = cm(0x86c63a), DG = cm(0x3f7418), cfg = { armR: 0.025, legR: 0.03, footR: 0.07, limbM: DG, legM: DG, footM: DG, eye: 1.6, hip: 0.8, torsoDrop: 0.45, shoulderW: 0.24, shoulderDrop: 0.3, stride: 0.3 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  head.add(sph(0.23, G, 1.3, 0.95, 1.15)); head.add(place(sph(0.13, cm(0xff6a1f)), -0.15, 0.1, 0.12)); head.add(place(sph(0.07, cm(0xffe14d)), 0.15, 0.13, 0.15));
  head.add(place(sph(0.05, cm(0x120a0a), 0.4, 1.6, 0.5), -0.15, 0.1, 0.235)); head.add(place(sph(0.03, cm(0x120a0a), 0.5, 1.5, 0.5), 0.15, 0.13, 0.22));
  head.add(place(sph(0.19, cm(0x1a0710), 1.35, 0.55, 0.7), 0, -0.1, 0.13));
  head.add(place(teeth(7, 0.34, 0.07, 0.15, false, -0.03, 0.2, 1), 0, 0, 0)); head.add(place(teeth(6, 0.3, 0.06, 0.12, true, -0.17, 0.2, 2), 0, 0, 0));
  for (const [s, tilt, len] of [[-1, 0.7, 0.4], [1, -0.35, 0.28]]) { const a = cyl(0.008, len, DG, 4); a.position.set(s * 0.1, 0.32, 0.02); a.rotation.z = tilt * -1; head.add(a); head.add(place(sph(0.03, cm(0xffe14d), 1, 1, 1, 6), s * 0.1 + Math.sin(tilt) * len * 0.5 * -1, 0.32 + Math.cos(tilt) * len * 0.5, 0.02)); }
  torso.add(sph(0.2, G, 1, 1.3, 0.85)); torso.add(place(sph(0.26, DG, 0.9, 0.9, 1.1), 0, -0.34, -0.22)); torso.add(place(sph(0.17, G, 0.9, 0.9, 1), 0, -0.6, -0.4));
  for (const s of [-1, 1]) torso.add(place(box(0.02, 0.5, 0.2, new THREE.MeshLambertMaterial({ color: 0xcfe6a0, transparent: true, opacity: 0.55 })), s * 0.18, 0.05, -0.2));
  for (const h of hands) { h.add(sph(0.055, DG)); for (let i = -1; i <= 1; i++) { const c = cone(0.014, 0.12, cm(TOOTH), 5); c.position.set(i * 0.035, 0, 0.1); c.rotation.x = Math.PI / 2; h.add(c); } }
  return p;
}
function buildYeti() {
  const W = cm(0xeaf2ff), B = cm(0x4ea7ff), cfg = { noLegs: true, armR: 0.07, legR: 0.09, footR: 0.13, limbM: W, legM: W, footM: W, eye: 1.6, hip: 0.75, torsoDrop: 0.5, shoulderW: 0.36, shoulderDrop: 0.28, stride: 0.2 };
  const p = bipedBase(cfg); const { head, torso, hands } = p;
  head.add(sph(0.24, W, 1.1, 1, 1)); head.add(place(sph(0.17, B, 1.1, 0.9, 0.5), 0, -0.02, 0.15));
  head.add(place(sph(0.045, cm(0xfff04d)), -0.09, 0.06, 0.24)); head.add(place(sph(0.06, cm(0xfff04d)), 0.09, 0.08, 0.24));
  head.add(place(sph(0.02, cm(0x111)), -0.09, 0.06, 0.285)); head.add(place(sph(0.025, cm(0x111)), 0.1, 0.08, 0.295));
  head.add(place(sph(0.2, cm(0x14040a), 1.25, 0.75, 0.7), 0, -0.1, 0.17));   // huge mouth
  head.add(teeth(6, 0.42, 0.16, 0.3, false, -0.03, 0.335, 3)); head.add(teeth(5, 0.36, 0.12, 0.24, true, -0.2, 0.335, 4));   // big sharp teeth
  torso.add(place(sph(0.34, W, 1.1, 1.3, 0.95), 0, -0.45, 0));   // fur mound instead of legs
  for (const m of [p.thighs, p.shins, p.feet, p.knees]) m.forEach((o) => { o.visible = false; });
  for (const s of [-1, 1]) head.add(place(cone(0.04, 0.16, cm(0xd9d2b8), 5), s * 0.18, 0.25, 0));
  torso.add(sph(0.3, W, 1.2, 1.15, 1)); torso.add(place(sph(0.2, B, 0.9, 0.7, 0.4), 0, -0.05, 0.22));
  for (const h of hands) { h.add(sph(0.12, W, 1, 0.9, 1)); for (let i = -1; i <= 1; i++) { const c = cone(0.02, 0.14, cm(TOOTH), 5); c.position.set(i * 0.07, 0, 0.14); c.rotation.x = Math.PI / 2; h.add(c); } }
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
export const LOOK_BUILDERS = { locust: buildLocust, yeti: buildYeti, human: buildHuman };

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
    if (look === 'monkey') { poseMonkey(p, pose); for (const c of p.root.children) if (!c.name.startsWith('arm_')) c.visible = !o.local; }   // first person: only your arms and hands
    else {
      poseBiped(p, pose, this.speed, dt, o.armLen); p.head.visible = !o.local;
      const sc = o.scale || 1; p.root.scale.setScalar(sc);
      p.root.position.set(pose.h[0] * (1 - sc), (pose.h[1] - 1.6) * (1 - sc), pose.h[2] * (1 - sc));
      if (o.local) { p.root.scale.setScalar(1); p.root.position.set(0, 0, 0); p.hands.forEach((h) => h.scale.setScalar(Math.min(sc, 1.8))); } else p.hands.forEach((h) => h.scale.setScalar(1));
    }
    this.setGhost(!!o.ghost); if (look === 'monkey') this.setIt(!!o.it);
  }
  setGhost(g) { if (g === this.ghost) return; this.ghost = g; this.root.traverse((c) => { if (c.isMesh && c.material && !Array.isArray(c.material)) { c.material.transparent = g; c.material.opacity = g ? 0.3 : 1; c.material.needsUpdate = true; } }); }
  setIt(on) { const f = this.looks.monkey.furMat; if (on === this.it) return; this.it = on; f.emissive.setHex(on ? 0xff1a1a : 0); f.emissiveIntensity = on ? 0.6 : 0; }
}
