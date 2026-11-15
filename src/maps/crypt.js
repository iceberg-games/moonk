import * as THREE from 'three';
import { MapKit, noise2, lerpColor } from './kit.js';
// HAUNTED CRYPT (horror). One 70x70 m vaulted hall, 14 m high, lit by dim moonlit-violet hemisphere + ONE amber lantern point light;
// green braziers, candles, chandeliers and the altar are baked into vertex colours.
//   nave      : colonnade of 14 pillars joined by an arcade rail at 11 m (end-to-end chase route) and 3 cross beams
//   aisles    : sarcophagi to hop between, 4 mausolea with two doors each (loops) and climbable roofs at 4.3 m
//   balconies : both side galleries at 5.6 m, reached by walkable 0.33 m-rise stairs (monsters can climb too) or by climbing
//   chandeliers: chain-hung pads that stair-step from each balcony to the arcade rail (hops of ~3 m, chains are climbable)
//   altar     : two-level dais, reliquary arch at 8 m, candelabras
// Aisles are >= 3 m wide everywhere so the stick-walking monsters (up to 2.6x scale) never wedge.
const S = 0x58545e, D = 0x3b3842, PIL = 0x6c6874, TOMB = 0x74707c, LID = 0x8a8693, GEN = [[-4, -22], [19, 11], [-20, 13], [5, -10], [14, -24]];
export function buildCrypt() {
  const k = new MapKit(11);
  const near = (x, z, r) => GEN.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < r) || Math.hypot(x, z - 6) < 4 || Math.hypot(x, z - 1.5) < 2.5;
  k.groundGrid(-35, -35, 35, 35, 2, 0, (x, z) => {
    const t = (Math.floor(x / 3.5) + Math.floor(z / 3.5)) & 1, n = noise2(x, z, 0.35); let c = lerpColor(t ? 0x4b4752 : 0x55515c, 0x2f2c35, n * 0.5);
    const d = Math.hypot(x, z - 6); if (Math.abs(d - 3.6) < 0.8 || Math.abs(d - 5.4) < 0.4) c = lerpColor(c, 0x3f7a58, 0.55);     // rune ring around the spawn
    const da = Math.hypot(x, z + 31); if (Math.abs(da - 8) < 0.6) c = lerpColor(c, 0x7a3a2a, 0.5); return c;
  });
  const wallP = (x0, y0, z0, x1, y1, z1, c) => k.slab(x0, y0, z0, x1, y1, z1, c);
  wallP(-35, 0, -36, 35, 14, -34, D); wallP(-35, 0, 34, 35, 14, 36, D); wallP(-36, 0, -35, -34, 14, 35, D); wallP(34, 0, -35, 36, 14, 35, D);
  wallP(-36, 14, -36, 36, 16, 36, 0x2b2832);                                                                       // ceiling
  for (let i = -3; i <= 3; i++) { for (const sx of [-1, 1]) wallP(sx > 0 ? 33.2 : -34, 0, i * 9 - 0.7, sx > 0 ? 34 : -33.2, 12, i * 9 + 0.7, 0x4c4854); wallP(i * 9 - 0.7, 0, 33.2, i * 9 + 0.7, 12, 34, 0x4c4854); }   // wall pilasters (grab-able)
  // ---- nave colonnade + arcade rail ------------------------------------------------------------------------------------------
  const PH = 10.4;
  for (let i = -3; i <= 3; i++) for (const sx of [-8, 8]) { k.cyl(sx, 0, i * 8, 0.95, PH, PIL, true, 10); k.cyl(sx, 0, i * 8, 1.25, 0.6, 0x5a5662, true, 10); k.box(sx, PH, i * 8, 2.4, 0.8, 2.4, PIL); }
  for (const sx of [-8, 8]) k.slab(sx - 0.8, PH, -24, sx + 0.8, PH + 0.8, 24, 0x625e6a);                                // arcade rails (top 11.2)
  for (const z of [-16, 0, 16]) k.slab(-8, PH, z - 0.5, 8, PH + 0.8, z + 0.5, 0x625e6a);                               // cross beams
  // ---- altar apse --------------------------------------------------------------------------------------------------------------
  k.slab(-12, 0, -34, 12, 0.9, -27, 0x4e4a58); k.slab(-8, 0.9, -34, 8, 1.8, -29.5, 0x56525f); k.slab(-2.6, 1.8, -32.6, 2.6, 3.0, -30.4, 0x8a8693); k.cone(0, 3.0, -31.5, 0.5, 2.6, 0xcfc9b8, 5);
  for (const sx of [-6.5, 6.5]) { k.cyl(sx, 0, -32.5, 1.3, 9.2, PIL, true, 10); }
  k.slab(-7.8, 9.2, -33.2, 7.8, 10.0, -31.8, 0x625e6a);                                                                 // reliquary arch (top 10)
  const candles = []; for (const [x, z] of [[-4.5, -27.6], [4.5, -27.6], [-9, -27.4], [9, -27.4], [-9.5, -31], [9.5, -31]]) { k.post(x, z, 0.9, 2.6, 0.12, 0x2b2a2e, 5); k.glowBall(x, 2.8, z, 0.22, 0xffb347); candles.push([x, 2.8, z]); }
  // ---- sarcophagi (hop between), keep generators + spawn clear --------------------------------------------------------------------------
  const sarc = []; for (const sx of [-1, 1]) for (let i = 0; i < 7; i++) { const x = sx * (i % 2 ? 13.5 : 18.5), z = -27 + i * 9 + (sx > 0 ? 0 : 4); if (near(x, z, 4.8) || (Math.abs(z) < 3 && false)) continue; sarc.push([x, z]); }
  for (const [x, z] of sarc) { const h = 1.0 + ((x * 3 + z) % 3 + 3) % 3 * 0.35; k.slab(x - 1.1, 0, z - 2.1, x + 1.1, h, z + 2.1, TOMB); k.slab(x - 1.3, h, z - 2.3, x + 1.3, h + 0.3, z + 2.3, LID); }
  const wallZ = (x, z0, z1, ops, H, T = 0.5, c = 0x4a4650) => { let cur = z0; for (const [a, b, y1] of [...ops].sort((p, q) => p[0] - q[0])) { if (a > cur) k.slab(x - T / 2, 0, cur, x + T / 2, H, a, c); k.slab(x - T / 2, y1, a, x + T / 2, H, b, c); cur = b; } if (z1 > cur) k.slab(x - T / 2, 0, cur, x + T / 2, H, z1, c); };
  const wallX = (z, x0, x1, ops, H, T = 0.5, c = 0x4a4650) => { let cur = x0; for (const [a, b, y1] of [...ops].sort((p, q) => p[0] - q[0])) { if (a > cur) k.slab(cur, 0, z - T / 2, a, H, z + T / 2, c); k.slab(a, y1, z - T / 2, b, H, z + T / 2, c); cur = b; } if (x1 > cur) k.slab(cur, 0, z - T / 2, x1, H, z + T / 2, c); };
  // ---- 4 mausolea: 7x7, two doors each, roof top at 4.3 -------------------------------------------------------------------------------------
  for (const [cx, cz, doors] of [[21, -14, 'xz'], [21, 25, 'zx'], [-21, -4, 'xz'], [-21, -26, 'zx']]) {
    const x0 = cx - 3.5, x1 = cx + 3.5, z0 = cz - 3.5, z1 = cz + 3.5, H = 4.0; const dx = doors[0] === 'x', sgn = Math.sign(cx);
    wallX(z0, x0, x1, dx ? [[cx - 1.4, cx + 1.4, 3.2]] : [], H); wallX(z1, x0, x1, dx ? [] : [[cx - 1.4, cx + 1.4, 3.2]], H);
    wallZ(x0, z0, z1, [[cz - 1.4, cz + 1.4, 3.2]], H); wallZ(x1, z0, z1, [], H);
    k.slab(x0 - 0.3, H, z0 - 0.3, x1 + 0.3, H + 0.3, z1 + 0.3, 0x3f3b46); k.slab(cx - 1.0, 0, cz - 1.8, cx + 1.0, 1.0, cz + 1.8, TOMB); k.cone(cx, H + 0.3, cz, 1.6, 2.4, 0x34303b, 4);
    k.glowBall(cx, 1.5, cz, 0.18, 0xffe28a); k.bakeLight(cx, 1.6, cz, 0xffd27a, 2.0, 5); void sgn;
  }
  // ---- side balconies at 5.6 m, stairs (0.33 m rise) at the south end, supports ---------------------------------------------------------------------
  for (const sx of [-1, 1]) {
    const bx0 = sx > 0 ? 26 : -34, bx1 = sx > 0 ? 34 : -26; k.slab(bx0, 5.0, -30, bx1, 5.6, 21.6, 0x4a4650);
    for (let z = -29; z <= 20; z += 7) k.post(sx * 26.6, z, 0, 5.0, 0.4, 0x5d5964, 8);
    for (let z = -29; z <= 21; z += 3.5) k.post(sx * 26.3, z, 5.6, 6.6, 0.1, 0x2b2a2e, 4);                           // balustrade posts: rail to grab
    for (let i = 1; i <= 17; i++) { const zs = 21.6 + (17 - i) * 0.55; k.slab(sx > 0 ? 28 : -32, 0, zs, sx > 0 ? 32 : -28, i * 0.33, zs + 0.55, i % 2 ? 0x56525f : 0x5d5964); }
    k.slab(sx > 0 ? 28 : -32, 0, 31, sx > 0 ? 32 : -28, 0.3, 33.8, 0x56525f);
  }
  // ---- chandeliers: chain-hung pads that climb from each balcony to the arcade rail ------------------------------------------------------------------
  const chand = [];
  for (const sx of [-1, 1]) for (const z of [-14, 12]) {
    const pts = [[sx * 23, 6.3], [sx * 19.6, 7.6], [sx * 16.2, 8.9], [sx * 12.8, 10.1], [sx * 10.0, 10.9]];
    pts.forEach(([x, y], j) => { const zz = z + (j % 2 ? 1.2 : -1.2); k.post(x, zz, y + 0.2, 14, 0.09, 0x2b2a2e, 4); k.pad(x, y, zz, 1.2, 0.35, 0x5a4a3a, 10); k.glowBall(x, y + 0.6, zz, 0.2, 0xffa94d); chand.push([x, y + 0.6, zz]); });
  }
  // ---- spawn braziers + dressings -----------------------------------------------------------------------------------------------------------------
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { k.cyl(x, 0, z, 0.5, 1.3, 0x3b3842, true, 8); k.glowBall(x, 1.7, z, 0.4, 0x6bff9a); k.bakeLight(x, 1.9, z, 0x55ff90, 2.6, 8); }
  const cm = [], cq = new THREE.Quaternion(), cv = new THREE.Vector3(), cs = new THREE.Vector3(), mm = new THREE.Matrix4();   // candle stubs + skulls (instanced)
  for (let i = 0; i < 60; i++) { const a = k.rand() * 6.28, R = 4 + k.rand() * 27, x = Math.cos(a) * R, z = Math.sin(a) * R; if (near(x, z, 1.5) || Math.abs(x) > 33) continue; cm.push(mm.clone().compose(cv.set(x, 0, z), cq.identity(), cs.set(1, 0.6 + k.rand(), 1))); if (i % 3 === 0) k.glowBall(x, 0.55, z, 0.07, 0xffe28a); }
  k.instance(new THREE.CylinderGeometry(0.06, 0.08, 0.5, 5), 0xd8d0b8, cm);
  const sk = []; for (let i = 0; i < 40; i++) { const a = k.rand() * 6.28, R = 6 + k.rand() * 26, x = Math.cos(a) * R, z = Math.sin(a) * R; if (near(x, z, 1.5)) continue; sk.push(mm.clone().compose(cv.set(x, 0.12, z), cq.setFromEuler(new THREE.Euler(0, k.rand() * 6, 0)), cs.set(1, 1, 1))); }
  k.instance(new THREE.IcosahedronGeometry(0.16, 0), 0xcfc9b8, sk);
  for (const [x, y, z] of candles) k.bakeLight(x, y, z, 0xffb060, 3.2, 9); for (const [x, y, z] of chand) k.bakeLight(x, y, z, 0xffa040, 2.2, 9);
  k.bakeLight(0, 3.2, -31, 0xffc890, 3.0, 11);
  const { group, cols } = k.finish({ chunk: 24, bake: { room: { x: [-34, 34], y: [0, 14], z: [-34, 34], ao: 0.4 }, groundY: 0, groundAO: 0.35, ao: 0.55, aoRadius: 1.5, grad: [0, 14, 1.0, 0.6], vary: 0.08, under: 0.7, ambient: 2.4 } });
  return { group, cols, spawn: [0, 0.9, 6], board: { pos: [0, 0, 1.5], ry: Math.PI }, voidY: -20, radius: 40,
    sky: 0x07050d, fog: [0x0b0714, 3, 40], hemi: [0x9aa0d0, 0x3a2a44, 1.0], sun: null,
    lights: [{ c: 0xffa95a, i: 22, d: 38, p: [0, 4.5, -3] }] };
}
