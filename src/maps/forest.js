import * as THREE from 'three';
import { MapKit, noise2, lerpColor } from './kit.js';
// CANOPY FOREST: warm, bright, three tiers of climbing.
//   ground  : Great Stump spawn, stump-stair spokes, boulders, fallen logs, mushroom steps up every big trunk
//   mid     : spiral limbs (a hold every ~2.3 m of height, 4 directions) with leaf-puff grips
//   canopy  : 8 elder-tree crown decks joined by a stepping-pad loop (gaps ~3 m), vines to drop down, and a rim loop on 24 giant
//             trees at R=44 with 4 radial spokes back to the elders, so every chase has a loop and no dead end.
// Colliders match the visuals: tapered trunks are stacked cylinders, limbs are AABBs (axis aligned), pads are cylinders.
const TRUNK = 0x7a5232, BARK2 = 0x6b4426, LIMB = 0x8a6038, LEAF = [0x3f9a3a, 0x58b348, 0x2f8a3d, 0x6bbd4a], MUSH = [0xd9503f, 0xe8a23c, 0xc7609a];
export function buildForest() {
  const k = new MapKit(7);
  const GEN = [[9, 9], [-11, 6], [3, -15], [-7, -19], [17, -3]];
  // ---- ground: painted polar disc, flat collider --------------------------------------------------------------
  k.groundDisc(52, 1.7, 0, (x, z) => {
    const n = noise2(x, z, 0.09), n2 = noise2(x + 40, z - 17, 0.35); const d = Math.hypot(x, z);
    let c = lerpColor(0x3f7a34, 0x6fa043, n * 0.8 + n2 * 0.25); if (d < 9) c = lerpColor(0x9c7a4c, c, (d - 5) / 4);
    if (n2 > 0.74) c = lerpColor(c, 0xd8c46a, 0.35); return c;
  });
  // ---- Great Stump spawn (top is 0.91 so the 0.9 spawn height stands on it) -------------------------------------
  k.cyl(0, 0.01, 0, 3.2, 0.9, 0x9a6a3d, true, 16, 3.0);
  for (const [dx, dz, w, d] of [[4.6, 0, 3, 1], [-4.6, 0, 3, 1], [0, 4.6, 1, 3], [0, -4.6, 1, 3]]) k.box(dx, 0, dz, w, 0.5, d, BARK2);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2 + 0.5 + Math.PI / 6, h = 1.5 + (i % 3) * 0.55; k.post(Math.cos(a) * 7.2, Math.sin(a) * 7.2, 0, h, 0.55, i % 2 ? 0x8f633a : 0x9a6a3d, 8); }
  // ---- elder trees ----------------------------------------------------------------------------------------------
  const E = [[30, 21, 17], [65, 16, 15], [95, 15, 18], [150, 22, 16], [205, 15, 17], [240, 26, 19], [320, 15, 15], [345, 25, 18]].map(([a, R, H], i) => ({ x: Math.cos(a * Math.PI / 180) * R, z: Math.sin(a * Math.PI / 180) * R, H, i, rB: 1.55, rT: 0.95 }));
  const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  for (const t of E) {
    k.group(() => {
      k.trunk(t.x, t.z, 0, t.H, t.rB, t.rT, TRUNK, 11);
      for (const [dx, dz] of dirs) { k.box(t.x + dx * (t.rB + 0.9), 0, t.z + dz * (t.rB + 0.9), dx ? 2.2 : 0.9, 0.8, dz ? 2.2 : 0.9, BARK2); }
      const o = t.i * 1.3; for (let j = 0; j < 3; j++) {                       // mushroom steps spiralling up
        const a = o + j * 1.9, rr = t.rB + 2.8, mx = t.x + Math.cos(a) * rr, mz = t.z + Math.sin(a) * rr, top = 1.5 + j * 1.25;
        k.post(mx, mz, 0, top - 0.3, 0.28, 0xe9e0c8, 6); k.pad(mx, top, mz, 1.25, 0.32, MUSH[(t.i + j) % 3], 10);
      }
      for (let y = 3.2, n = 0; y < t.H - 2.2; y += 2.3, n++) {                    // spiral limbs with a leaf-puff or pad tip
        const [dx, dz] = dirs[(n + t.i) % 4], L = 3.4 + k.rand() * 1.6, r0 = t.rB + (t.rT - t.rB) * (y / t.H) - 0.15;
        k.beam(t.x + dx * r0, y, t.z + dz * r0, t.x + dx * (r0 + L), y, t.z + dz * (r0 + L), 0.28, LIMB, 6);
        const ex = t.x + dx * (r0 + L), ez = t.z + dz * (r0 + L);
        if (n % 2) k.blob(ex, y + 0.55, ez, 1.35, LEAF[n % 4], true, 1); else k.pad(ex, y + 0.3, ez, 1.1, 0.28, LEAF[(n + 1) % 4], 8);
      }
      const dy = t.H - 0.9; k.pad(t.x, dy, t.z, 3.6, 0.5, 0x8a6038, 14);                      // crown deck
      k.cone(t.x, dy - 2.6, t.z, 2.9, 2.2, 0x6b4426, 10);
      k.blob(t.x, t.H + 3.3, t.z, 4.6, LEAF[0], false, 1, 0.2); k.blob(t.x + 3, t.H + 2.4, t.z - 1.5, 3.1, LEAF[1], false, 1); k.blob(t.x - 2.6, t.H + 2.6, t.z + 2, 3.2, LEAF[3], false, 1);
      for (let j = 0; j < 5; j++) { const a = j * 1.25 + t.i, rr = 3.2; k.blob(t.x + Math.cos(a) * rr, t.H - 3.2 - (j % 2) * 1.5, t.z + Math.sin(a) * rr, 1.9, LEAF[(j + 2) % 4], false, 1); }
    });
  }
  // ---- rim: 24 giant trees ---------------------------------------------------------------------------------------
  const RIM = []; for (let i = 0; i < 24; i++) { const a = i / 24 * Math.PI * 2; RIM.push({ a, x: Math.cos(a) * 44, z: Math.sin(a) * 44, H: 21 + (i % 3) * 2.5, i }); }
  for (const t of RIM) {
    k.group(() => {
      k.trunk(t.x, t.z, 0, t.H, 2.0, 1.7, BARK2, 10);
      k.blob(t.x, t.H + 3.2, t.z, 6.2, LEAF[t.i % 4], false, 1, 0.22); k.blob(t.x - 3 * Math.cos(t.a), t.H - 1.5, t.z - 3 * Math.sin(t.a), 4, LEAF[(t.i + 1) % 4], false, 1);
      const ix = -Math.cos(t.a), iz = -Math.sin(t.a); const ax = Math.abs(ix) > Math.abs(iz) ? [Math.sign(ix), 0] : [0, Math.sign(iz)];     // inward axis
      for (const [y, L] of [[3.4, 3.2], [6.4, 3.6], [9.4, 3.2]]) { const r0 = 1.9; k.beam(t.x + ax[0] * r0, y, t.z + ax[1] * r0, t.x + ax[0] * (r0 + L), y, t.z + ax[1] * (r0 + L), 0.3, LIMB, 6); k.pad(t.x + ax[0] * (r0 + L), y + 0.3, t.z + ax[1] * (r0 + L), 1.1, 0.3, LEAF[(t.i + y) % 4 | 0], 8); }
    });
  }
  // ---- loops --------------------------------------------------------------------------------------------------------
  const edge = (A, B, r) => { const d = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / d, uz = (B.z - A.z) / d; return [[A.x + ux * r, 0, A.z + uz * r], [B.x - ux * r, 0, B.z - uz * r]]; };
  const vine = (p) => { const y0 = Math.max(1.2, p[1] - 8); k.post(p[0], p[2], y0, p[1] - 0.25, 0.13, 0x4a7a2a, 5); };
  E.sort((a, b) => Math.atan2(a.z, a.x) - Math.atan2(b.z, b.x));
  E.forEach((A, i) => {                                                        // 1) crown-deck loop
    const B = E[(i + 1) % E.length]; const [a, b] = edge(A, B, 3.4); a[1] = A.H - 0.9; b[1] = B.H - 0.9;
    const pads = k.stepPath(a, b, 4.3, 0.95, LEAF[i % 4], { wobble: 1.0, dy: 0.5, h: 0.32, seg: 9 }); pads.forEach((p, j) => { if (j % 2 === 0) vine(p); });
  });
  for (let i = 0; i < 24; i++) {                                               // 2) rim loop at ~11 m
    const A = RIM[i], B = RIM[(i + 1) % 24]; const [a, b] = edge(A, B, 1.9); a[1] = b[1] = 11 + (i % 2) * 0.6;
    k.stepPath(a, b, 3.3, 0.9, LEAF[(i + 2) % 4], { dy: 0.3, h: 0.3, wobble: 0.5 });
  }
  for (const E0 of E) {                                                        // 3) spokes crown deck -> rim tree at the same angle
    const ang = Math.atan2(E0.z, E0.x); const ri = Math.round(((ang + Math.PI * 2) % (Math.PI * 2)) / (Math.PI / 12)) % 24; const R = RIM[ri];
    if (E0.i % 2 === 1) continue; const [a, b] = edge(E0, R, 3.4); a[1] = E0.H - 0.9; b[1] = 11.3; const [, b2] = edge(E0, R, 1.9); b[0] = b2[0]; b[2] = b2[2];
    k.stepPath(a, b, 4.2, 1.0, LEAF[(E0.i + 1) % 4], { wobble: 0.8, dy: 0.5, h: 0.32 }).forEach((p, j) => { if (j % 3 === 1) vine(p); });
  }
  const stump = { x: 0, z: 0 };                                                // 4) ground spokes: stump staircases rise to the elders' first limbs
  for (const i of [0, 2, 4, 6]) {
    const T = E.find((e) => e.i === i); const d = Math.hypot(T.x, T.z), ux = T.x / d, uz = T.z / d;
    k.stepPath([ux * 5.5, 1.3, uz * 5.5], [T.x - ux * 3.0, 5.2, T.z - uz * 3.0], 3.8, 0.62, 0x9a6a3d, { post: true, seg: 8, wobble: 0.6 });
  }
  // ---- ground clutter you can push off --------------------------------------------------------------------------------
  for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.4, R = 9 + (i % 4) * 3.2, r = 1.2 + (i % 3) * 0.4, x = Math.cos(a) * R, z = Math.sin(a) * R; if (GEN.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < r + 3.2) || Math.hypot(x, z + 6.5) < r + 2.5) continue; k.blob(x, r * 0.55, z, r, i % 2 ? 0x8a9a7d : 0x7d8a73, true, 1, 0.12, false); }
  const logs = [[-24, -2, 8, 0], [24, 12, 0, 9], [-5, 26, 9, 0], [-28, -20, 0, 8], [30, -20, 8, 0], [4, 32, 0, 7]];
  for (const [x, z, lx, lz] of logs) k.beam(x - lx / 2, 0.55, z - lz / 2, x + lx / 2, 0.55, z + lz / 2, 0.55, 0x6f4a2c, 7);
  // instanced props: ferns, grass tufts (no collision) and flowers
  const ferns = [], tufts = [], mat = new THREE.Matrix4(), q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3();
  const spot = () => { for (;;) { const a = k.rand() * 6.283, R = 4 + k.rand() * 46; const x = Math.cos(a) * R, z = Math.sin(a) * R; if (GEN.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 1.8)) continue; return [x, z]; } };
  for (let i = 0; i < 160; i++) { const [x, z] = spot(); const s = 0.7 + k.rand() * 0.9; ferns.push(mat.clone().compose(V.set(x, 0, z), q.setFromEuler(new THREE.Euler(0, k.rand() * 6.28, 0)), S.set(s, s, s))); }
  for (let i = 0; i < 220; i++) { const [x, z] = spot(); const s = 0.6 + k.rand() * 0.8; tufts.push(mat.clone().compose(V.set(x, 0, z), q.identity(), S.set(s, s * (0.8 + k.rand() * 0.6), s))); }
  k.instance(new THREE.ConeGeometry(0.55, 1.3, 5), 0x3d8a35, ferns); k.instance(new THREE.ConeGeometry(0.22, 0.55, 4), 0x78b34a, tufts);
  for (let i = 0; i < 26; i++) { const [x, z] = spot(); k.glowBall(x, 0.22, z, 0.2, i % 2 ? 0xffd34d : 0xff7ad9); }
  const { group, cols } = k.finish({ chunk: 30, bake: { groundY: 0, groundAO: 0.35, ao: 0.6, aoRadius: 1.4, sun: { dir: [30, 30, 12], shadow: 0.42 }, grad: [0, 22, 0.86, 1.08], vary: 0.1 } });
  return { group, cols, spawn: [0, 0.9, 0], board: { pos: [0, 0, -6.5], ry: 0 }, voidY: -25, radius: 60,
    sky: 0xa8d8ff, fog: [0xdcebd0, 26, 118], hemi: [0xfff1d8, 0x55743a, 1.0], sun: [0xffdca0, 1.05, [30, 30, 12]], lights: [] };
}
