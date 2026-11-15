import * as THREE from 'three';
import { MapKit, noise2, lerpColor } from './kit.js';
// HOLLOW MARSH (horror-ish, misty). Lit by a dim moon hemisphere plus ONE warm lantern point light at the cabin door; everything
// else (wisps, dock lanterns, the cabin lamp) is baked into vertex colours.
//   centre : Hollow Henge, 7 standing stones joined by lintels at ~4.5 m (a 64 m chase loop), open gate toward the spawn
//   NW     : the Old Cabin on the ground (two 2.6 m doors, windows, interior props), climbable walls, flat roof + belfry
//   N/W    : dead-tree "log road" at 4-5.5 m: cabin <-> north tree <-> henge, and a west spine that returns to the henge
//   E      : Rotten Dock (raised planks with 2 m gaps), mooring posts, a crane gantry at 6 m, stump-post stairs to the henge
//   rim    : 24 giant dead trunks. Every elevated route is a loop; hops between perches are 2-4 m.
const BARK = 0x3b3128, BARK2 = 0x4a3d30, STONE = 0x77817b, WOOD = 0x4a3a2c, DARKW = 0x2f2620;
export function buildMarsh() {
  const k = new MapKit(23);
  const GEN = [[8, -8], [-5, 14], [20, -4], [-22, 2], [9, 23]];
  k.groundDisc(55, 1.8, 0, (x, z) => {
    const n = noise2(x, z, 0.07), m = noise2(x - 30, z + 12, 0.16), d = Math.hypot(x, z);
    let c = lerpColor(0x2a3626, 0x3f4a30, n); if (m > 0.6) c = lerpColor(c, 0x1d4646, (m - 0.6) * 4);   // black-water pools
    if (m > 0.68) c = lerpColor(0x1d4646, 0x2b6a62, (m - 0.68) * 5); if (d < 7) c = lerpColor(0x4a3f2c, c, Math.max(0, (d - 3) / 4)); return c;
  });
  const wall = (axis, c, a0, a1, T, H, ops, color = WOOD) => {                     // wall along x (axis 'x', z=c) or z, with openings [a,b,y0,y1]
    const seg = (s0, s1, y0, y1) => { if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return; if (axis === 'x') k.slab(s0, y0, c - T / 2, s1, y1, c + T / 2, color); else k.slab(c - T / 2, y0, s0, c + T / 2, y1, s1, color); };
    let cur = a0; for (const [a, b, y0, y1] of [...ops].sort((p, q) => p[0] - q[0])) { seg(cur, a, 0, H); seg(a, b, 0, y0); seg(a, b, y1, H); cur = b; } seg(cur, a1, 0, H);
  };
  // ---- Hollow Henge ------------------------------------------------------------------------------------------------
  const HX = [-5.5, 0, 5.5], HZ = [-15, -8, -1], PH = 4.4; const hp = [];
  for (const x of HX) for (const z of HZ) { if (x === 0 && (z === -8 || z === -1)) continue; hp.push([x, z]); k.post(x, z, 0, PH, 0.65, STONE, 9); k.cone(x, PH, z, 0.85, 0.6, 0x5b6560, 7); }
  const lint = (x0, z0, x1, z1) => { const w = 1.3; k.slab(Math.min(x0, x1) - (x0 === x1 ? w / 2 : 0.65), PH, Math.min(z0, z1) - (z0 === z1 ? w / 2 : 0.65), Math.max(x0, x1) + (x0 === x1 ? w / 2 : 0.65), PH + 0.7, Math.max(z0, z1) + (z0 === z1 ? w / 2 : 0.65), 0x6d7771); };
  lint(-5.5, -15, 0, -15); lint(0, -15, 5.5, -15); lint(-5.5, -15, -5.5, -8); lint(-5.5, -8, -5.5, -1); lint(5.5, -15, 5.5, -8); lint(5.5, -8, 5.5, -1);
  // ---- Old Cabin (-14,-12): footprint x -19..-9, z -16..-8 ------------------------------------------------------------
  const CX0 = -19, CX1 = -9, CZ0 = -16, CZ1 = -8, CH = 3.8;
  k.slab(CX0, 0, CZ0, CX1, 0.12, CZ1, 0x3a2e24);
  wall('x', CZ1, CX0 - 0.2, CX1 + 0.2, 0.4, CH, [[-15.3, -12.7, 0, 3.0], [-18.2, -16.9, 1.2, 2.6]]);          // south: door + window
  wall('x', CZ0, CX0 - 0.2, CX1 + 0.2, 0.4, CH, [[-16.5, -11.5, 1.2, 2.6]]);                                  // north: wide window
  wall('z', CX0, CZ0, CZ1, 0.4, CH, [[-13.5, -10.5, 1.2, 2.6]]);                                              // west
  wall('z', CX1, CZ0, CZ1, 0.4, CH, [[-13.3, -10.7, 0, 3.0]]);                                                // east: door
  k.slab(CX0 - 0.4, CH, CZ0 - 0.4, CX1 + 0.4, CH + 0.4, CZ1 + 0.4, DARKW);                                   // roof deck (top 4.2)
  for (const [x0, z0, x1, z1] of [[CX0 - 0.4, CZ1 + 0.4 - 0.4, CX1 + 0.4, CZ1 + 0.4], [CX0 - 0.4, CZ0 - 0.4, CX1 + 0.4, CZ0]]) k.slab(x0, CH + 0.4, z0, x1, CH + 0.8, z1, 0x3a2e24);   // low parapets (N, S)
  k.slab(-14.4, 0, -12.6, -12.8, 0.9, -11.4, 0x5a4634); k.slab(-18.6, 0, -15.6, -17.4, 1.2, -14.4, 0x5a4634); k.slab(-18.6, 0, -14.4, -17.8, 0.8, -13.6, 0x6a5440);   // table, crates
  k.cyl(-10.4, 0, -14.8, 0.9, 6.0, 0x5d5a52, true, 8);                                                       // chimney: perch above the roof
  for (const [x, z] of [[-16, -14], [-12, -14], [-16, -10], [-12, -10]]) k.post(x, z, CH + 0.4, 7.2, 0.22, WOOD, 6);   // belfry posts
  k.slab(-16.6, 7.2, -14.6, -11.4, 7.5, -9.4, DARKW); k.cone(-14, 7.5, -12, 2.6, 1.2, 0x2a211c, 4);
  k.glowBall(-14, 5.6, -12, 0.35, 0xffb347);
  for (let i = 0; i < 3; i++) k.slab(-12.2, 0, -7.8 + i, -9.4, 3.1 - i, -6.8 + i, 0x5a4634);                  // porch steps (3.1 / 2.1 / 1.1) up to the roof edge
  k.glowBox(-14, 1.0, -7.75, 2.2, 1.9, 0.05, 0xffb347);                                                     // lit doorway
  // ---- dead trees and the log road --------------------------------------------------------------------------------------
  const trees = new Map(); const dead = (x, z, H, key) => {
    const rB = 0.95, rT = 0.42; k.group(() => {
      k.trunk(x, z, 0, H, rB, rT, BARK, 7);
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1]]) { const cx = x + dx * (rB + 0.5), cz = z + dz * (rB + 0.5), hx = dx ? 0.8 : 0.4, hz = dz ? 0.8 : 0.4; k.slab(cx - hx, 0, cz - hz, cx + hx, 0.7, cz + hz, BARK2); }
      const o = Math.floor(k.rand() * 4); const dirs = [[1, 0], [0, 1], [-1, 0], [0, -1]];
      for (let y = 3.4, n = 0; y < H - 1.5; y += 2.7, n++) { const [dx, dz] = dirs[(n + o) % 4], r0 = rB + (rT - rB) * y / H - 0.1, L = 2.6 + k.rand() * 1.4; k.beam(x + dx * r0, y, z + dz * r0, x + dx * (r0 + L), y, z + dz * (r0 + L), 0.23, BARK2, 5); k.post(x + dx * (r0 + L), z + dz * (r0 + L), y, y + 1.5, 0.12, BARK2, 4); }
      if (x * 7 + z * 3 > 0 || key) { const [dx, dz] = dirs[o]; k.beam(x, H * 0.62, z, x + dx * 3 + dz * 0, H * 0.62 + 2.4, z + dz * 3, 0.2, BARK2, 5, true, 0.12); }   // leaning limb (sphere chain collider) on about half the trees
      k.cone(x, H, z, 0.42, 1.4, BARK, 5);
    }); if (key) trees.set(key, { x, z, H, rB, rT }); };
  const T = { W1: [-27, -12, 12], W2: [-27, 0, 11], W3: [-27, 12, 12], S1: [-15, 12, 11], N1: [-14, -25, 12], N2: [0, -25, 12], E1: [14, -8, 10] };
  for (const [key, [x, z, H]] of Object.entries(T)) dead(x, z, H, key);
  const log = (x0, z0, x1, z1, y, r = 0.34, c = 0x5a4634) => k.beam(x0, y, z0, x1, y, z1, r, c, 7);
  const rr = (key, y) => { const t = trees.get(key); return t.rB + (t.rT - t.rB) * y / t.H - 0.05; };
  log(-27 + rr('W1', 4.0), -12, CX0 - 0.4, -12, 4.0);                                       // W1 -> cabin roof (west)
  log(-14, -25 + rr('N1', 4.0), -14, CZ0 - 0.4, 4.0);                                                                      // N1 -> cabin roof (north)
  log(-14 + rr('N1', 5.2), -25, 0 - rr('N2', 5.2), -25, 5.2);                                                 // N1 -> N2 along z=-25
  k.slab(-0.6, 4.4, -24.6, 0.6, 5.1, -15.6, 0x6d7771);                                                       // N2 -> henge north cap (same level as lintels)
  log(-27, -12 + rr('W1', 5.5), -27, 0 - rr('W2', 5.5), 5.5); log(-27, 0 + rr('W2', 5.5), -27, 12 - rr('W3', 5.5), 5.5);   // west spine
  log(-27 + rr('W3', 5.5), 12, -15 - rr('S1', 5.5), 12, 5.5);                                                // W3 -> S1
  k.stepPath([-15, 5.5, 12], [-5.5, 4.3, -1], 3.9, 0.6, 0x5d5a52, { post: true, seg: 8, wobble: 0.5 });      // S1 -> henge SW pillar
  k.slab(5.9, 4.4, -8.65, 13.4, 5.1, -7.35, 0x6d7771);                                                       // henge east lintel -> E1 (passes over generator 8,-8)
  // ---- Rotten Dock ----------------------------------------------------------------------------------------------------------
  const DK = [[12, 17.2], [19.0, 23.7], [25.7, 31]]; const DZ0 = 8, DZ1 = 12;
  for (const [a, b] of DK) { k.slab(a, 0.7, DZ0, b, 1.0, DZ1, 0x5b4630); for (let x = a; x < b - 0.2; x += 1.1) k.slab(x + 0.95, 0.99, DZ0, x + 1.0, 1.01, DZ1, 0x2a211c, false); }
  for (let x = 12.6; x < 31; x += 4.6) for (const z of [DZ0 - 0.2, DZ1 + 0.2]) { const tall = Math.round(x) % 2 === 0; k.post(x, z, 0, tall ? 3.4 : 2.1, 0.24, 0x3a2e24, 6); if (tall) k.glowBall(x, 3.6, z, 0.2, 0xffb347); }
  for (const z of [7.2, 12.8]) k.post(22, z, 0, 6.2, 0.3, 0x3a2e24, 6);                                       // crane gantry
  k.slab(21.7, 6.2, 6.9, 22.3, 6.8, 13.1, 0x2f2620); k.beam(22, 6.5, 7.2, 29, 6.5, 7.2, 0.28, 0x2f2620, 6);
  k.post(29, 7.2, 3.6, 6.3, 0.1, 0x1c1814, 4);
  k.stepPath([14, 3.8, -8], [22, 1.6, 7], 4.0, 0.6, 0x3a3128, { post: true, seg: 7, wobble: 0.3 });           // E1 -> dock stairs (posts)
  k.slab(33, 0, 8.5, 36, 1.4, 11.5, 0x3a2e24); k.slab(34.2, 1.4, 8.8, 35, 2.8, 11.2, 0x2f2620);           // wreck
  // ---- drowned chapel ruin (south) and two stump circles -----------------------------------------------------------------------------------
  const brk = (axis, c, a0, a1, T, hs, color) => { let a = a0, i = 0; while (a < a1 - 0.01) { const w = Math.min(a1 - a, 2.4 + (i % 3)), h = hs[i % hs.length]; if (h > 0) { if (axis === 'x') k.slab(a, 0, c - T / 2, a + w, h, c + T / 2, color); else k.slab(c - T / 2, 0, a, c + T / 2, h, a + w, color); } a += w; i++; } };
  brk('x', 22, -9, 5, 0.6, [3.2, 5.0, 2.4, 4.2, 0, 3.6], 0x646d68); brk('x', 32, -9, 5, 0.6, [4.4, 2.6, 5.2, 3.4, 4.0], 0x646d68); brk('z', -9, 22, 32, 0.6, [3.8, 5.2, 2.8, 4.6], 0x646d68); brk('z', 5, 22, 32, 0.6, [2.6, 0, 4.6, 3.2], 0x646d68);
  k.slab(-9.8, 0, 21.2, -6.2, 8.2, 24.8, 0x59625d); k.slab(-9.2, 8.2, 21.6, -6.8, 8.6, 24.2, 0x3b4440);                        // broken bell tower
  k.slab(-1, 0, 25, 2, 1.0, 27, 0x59625d); k.slab(-3.2, 0, 28.5, -1.8, 1.8, 30, 0x59625d);                                      // altar, fallen masonry
  for (const [x, z, h] of [[-4.5, 27, 3.8], [0.5, 29.5, 5.2]]) k.post(x, z, 0, h, 0.5, 0x6d7771, 8);                              // free-standing columns
  k.stepPath([-9, 8.4, 22], [-15, 5.5, 12], 3.8, 0.6, 0x5d5a52, { post: true, seg: 8, wobble: 0.4 });                           // tower -> S1 tree
  for (const [cx, cz] of [[28, -22], [-30, 24]]) {
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, h = 1.8 + (i % 3) * 0.8 + (i === 0 ? 0.6 : 0); k.cyl(cx + Math.cos(a) * 4.8, 0, cz + Math.sin(a) * 4.8, 1.15, h, 0x4a3a2c, true, 8); }
    k.post(cx, cz, 0, 5.4, 0.7, 0x3a2e24, 8); k.glowBall(cx, 5.8, cz, 0.28, 0xffb347); k.bakeLight(cx, 5.8, cz, 0xffa040, 0.9, 7);
  }
  // ---- scattered dead trees (vertical routes), keep generators / spawn / henge / cabin / dock clear -------------------------------------
  const keep = [[0, 2, 6.5], [-14, -12, 9], [0, -8, 11], [24, 10, 12], ...GEN.map(([x, z]) => [x, z, 4.2]), ...Object.values(T).map(([x, z]) => [x, z, 6]), [-17, -4, 4], [14, -8, 6], [-2, 27, 13], [28, -22, 9], [-30, 24, 9]];
  let placed = 0, tries = 0; const extra = [];
  const anchors = [...Object.values(T).map(([x, z]) => [x, z]), ...[[-14, -25]].slice(0, 0)];
  while (placed < 14 && tries++ < 900) {                                          // grow groves off the log road so limbs of neighbours are ~2-4 m apart
    const [ax, az] = anchors[Math.floor(k.rand() * anchors.length)] , a = k.rand() * 6.283, d = 6 + k.rand() * 1.5, x = ax + Math.cos(a) * d, z = az + Math.sin(a) * d;
    if (Math.hypot(x, z) > 42 || keep.some(([kx, kz, dd]) => Math.hypot(kx - x, kz - z) < dd) || extra.some(([ex, ez]) => Math.hypot(ex - x, ez - z) < 5.5)) continue;
    extra.push([x, z]); anchors.push([x, z]); dead(x, z, 9 + Math.floor(k.rand() * 5), null); placed++;
  }
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; k.trunk(Math.cos(a) * 50, Math.sin(a) * 50, 0, 24, 2.5, 2.0, 0x2a231e, 8); }
  // ---- standing stones / boulders / stumps near the spawn (low starter holds), props -------------------------------------------------------
  for (let i = 0; i < 9; i++) { const a = i * 0.75 + 0.3, R = 9 + (i * 3.1 % 8); const x = Math.cos(a) * R, z = Math.sin(a) * R - 6; if (keep.some(([kx, kz, d]) => Math.hypot(kx - x, kz - z) < d + 1.5) || Math.hypot(x, z + 3.5) < 4) continue; k.blob(x, 0.45, z, 0.9 + (i % 3) * 0.35, 0x6f7774, true, 1, 0.12, false); }
  for (const [x, z, l, d] of [[-9, 6, 6, 0], [22, -14, 0, 7], [-28, 26, 7, 0], [28, 24, 0, 6], [6, -34, 8, 0]]) k.beam(x - l / 2, 0.5, z - d / 2, x + l / 2, 0.5, z + d / 2, 0.5, 0x3a2e24, 7);
  for (const [x, z, r, h] of [[-3, 6.5, 0.7, 1.2], [4.5, 6, 0.55, 0.8], [-8.5, 3, 0.8, 1.6], [8, 3.5, 0.65, 1.0], [-16.5, 0, 0.8, 1.4], [15, -16, 0.9, 1.8]]) k.post(x, z, 0, h, r, 0x4a3a2c, 7);   // rotten stumps
  const reeds = [], tm = new THREE.Matrix4(), tq = new THREE.Quaternion(), tv = new THREE.Vector3(), ts = new THREE.Vector3();
  for (let i = 0; i < 260; i++) { const a = k.rand() * 6.283, R = 4 + k.rand() * 48, x = Math.cos(a) * R, z = Math.sin(a) * R; if (GEN.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 1.8) || (x > 11 && x < 32 && z > 7 && z < 13)) continue; const s = 0.8 + k.rand() * 0.9; reeds.push(tm.clone().compose(tv.set(x, 0, z), tq.setFromEuler(new THREE.Euler((k.rand() - 0.5) * 0.25, k.rand() * 6, (k.rand() - 0.5) * 0.25)), ts.set(s, s * (0.8 + k.rand() * 1.0), s))); }
  k.instance(new THREE.ConeGeometry(0.1, 1.8, 3), 0x6a7a45, reeds);
  const wisps = []; for (let i = 0; i < 18; i++) { const a = i * 1.37, R = 5 + (i * 3.3 % 40), x = Math.cos(a) * R, z = Math.sin(a) * R, y = 1.2 + (i % 4) * 0.8; wisps.push([x, y, z]); k.glowBall(x, y, z, 0.22, i % 3 ? 0x8cffd0 : 0xb0ff60); }
  // baked light pools
  k.bakeLight(-14, 1.6, -6.8, 0xffa040, 1.6, 9); k.bakeLight(-14, 2.4, -12, 0xff9a3a, 1.3, 8); k.bakeLight(-14, 5.6, -12, 0xffa040, 1.0, 6);
  for (let x = 12.6; x < 31; x += 4.6) if (Math.round(x) % 2 === 0) k.bakeLight(x, 3.4, 10, 0xffa040, 0.9, 6);
  for (const [x, y, z] of wisps) k.bakeLight(x, y, z, 0x66ffc0, 0.55, 3.5);
  const { group, cols } = k.finish({ chunk: 30, bake: { groundY: 0, groundAO: 0.55, ao: 0.6, aoRadius: 1.4, grad: [0, 22, 1.0, 0.8], vary: 0.12 } });
  return { group, cols, spawn: [0, 0.9, 2], board: { pos: [0, 0, -3.5], ry: 0 }, voidY: -25, radius: 58,
    sky: 0x0d1714, fog: [0x24382f, 2.5, 48], hemi: [0xb4d4cf, 0x34463a, 1.15], sun: null,
    lights: [{ c: 0xffb347, i: 9, d: 20, p: [-14, 2.4, -7] }] };
}
