import * as THREE from 'three';
import { MapKit, noise2, lerpColor } from './kit.js';
// HOLLOW SHAFT (horror / Be the Monster): an abandoned mine, one big cavern (ring of rock pillars + ceiling at 24 m).
// Lit by a dim cold hemisphere + ONE amber lantern point light at the loading bay; hanging lanterns, glowing ore and the pit glow are
// baked into vertex colours.
//   centre   : the 14x14 m, 10 m deep Hollow Shaft (pit) with a 4-post timber headframe up to 17 m and four spiral wall ledges
//              (2.5 m steps) so you can climb out; the pit floor has ore carts and a green ore glow
//   trestle  : a square timber trestle (deck at 8 m, 1.6 m wide, bent every 5 m) with 4 collapsed stretches (3.3 m jumpable gaps)
//              and 4 bridges from the headframe ring, so there are loops at 8 m
//   ground   : cart-rail ring (visual) with 4 ore carts, 12 timber gate frames, rubble piles (collapsed shafts), crates that step up
//              to the trestle, stalactites, glowing crystals
// Generators (MINE_GEN_SPOTS) sit on the diagonals between the rail ring and the trestle, facing the pit. Passages are >= 3.5 m.
export const MINE_GEN_SPOTS = [[12, 0, 12], [-12, 0, 13], [-13, 0, -12], [12, 0, -13], [0, 0, -31]];   // [x, y, z]; the server faces each toward the origin (the pit)
const ROCK = 0x4d463f, ROCK2 = 0x3b352f, TIM = 0x6b5036, TIM2 = 0x4a3826, IRON = 0x6a4a3a, RAIL = 0x7a6a5a;
export function buildMine() {
  const k = new MapKit(77);
  const GEN = MINE_GEN_SPOTS;
  const floorCol = (x, z) => { const n = noise2(x, z, 0.1), m = noise2(x + 9, z - 4, 0.3); let c = lerpColor(0x3a342e, 0x57504a, n); if (m > 0.7) c = lerpColor(c, 0x2c4a3c, (m - 0.7) * 3); if (Math.hypot(x, z) < 24 && Math.hypot(x, z) > 20) c = lerpColor(c, 0x2c2824, 0.3); return c; };
  // ---- floor with the pit cut out (4 strips + pit bottom) ------------------------------------------------------------------------------
  k.groundGrid(-48, -48, 48, -7, 2, 0, floorCol); k.groundGrid(-48, 7, 48, 48, 2, 0, floorCol); k.groundGrid(-48, -7, -7, 7, 2, 0, floorCol); k.groundGrid(7, -7, 48, 7, 2, 0, floorCol);
  k.groundGrid(-7, -7, 7, 7, 2, -10, (x, z) => lerpColor(0x2a2622, 0x2f5a46, Math.max(0, 1 - Math.hypot(x, z) / 7) * 0.7 * noise2(x, z, 0.5) + 0.1));
  for (const [x0, z0, x1, z1] of [[-9, -9, -7, 9], [7, -9, 9, 9], [-7, -9, 7, -7], [-7, 7, 7, 9]]) k.slab(x0, -10, z0, x1, -0.03, z1, ROCK2);   // pit walls
  // ---- cavern wall: 28 overlapping rock pillars + ceiling ----------------------------------------------------------------------------
  for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2, r = 5.6 + (i % 3) * 0.3; k.cyl(Math.cos(a) * 46, -2, Math.sin(a) * 46, r, 26, i % 2 ? ROCK : ROCK2, true, 9); }
  k.slab(-56, 24, -56, 56, 27, 56, 0x2a2622);
  // ---- headframe over the pit -----------------------------------------------------------------------------------------------------------------
  for (const [x, z] of [[-5, -5], [5, -5], [-5, 5], [5, 5]]) k.post(x, z, -10, 17, 0.4, TIM, 8);
  for (const y of [-4.5, 2.5, 8, 14]) { const w = y === 8 ? 1.2 : 0.6; for (const s of [-5, 5]) { k.slab(-5, y - 0.4, s - w / 2, 5, y, s + w / 2, TIM2); k.slab(s - w / 2, y - 0.4, -5, s + w / 2, y, 5, TIM2); } }
  k.slab(-5.8, 16.7, -5.8, 5.8, 17.1, 5.8, TIM2);
  k.tilt(new THREE.TorusGeometry(2.6, 0.18, 6, 16), IRON, 0, 15.2, 0, 0, 0, 0);                                                      // hoist wheel (visual)
  for (const [x, z] of [[-5, -5], [5, 5]]) { k.beam(x, -10, z, -x, 17, -z, 0.07, TIM, 4, false); }
  // pit ledges: spiral up the walls (west -8, south -5.5, east -3, north -0.5), 1.6 wide, 6 m long
  k.slab(-7, -8.2, -6.5, -5.4, -7.8, 0.5, TIM); k.slab(-6.5, -5.7, 5.4, 0.5, -5.3, 7, TIM); k.slab(5.4, -3.2, -0.5, 7, -2.8, 6.5, TIM); k.slab(-0.5, -0.7, -7, 6.5, -0.3, -5.4, TIM);
  k.slab(-1, -10, -1, 1.2, -9, 1.2, IRON, true);                                                                                       // pit-floor ore chute block
  k.glowBall(0, -8.5, 0, 0.4, 0x55ff99); k.glowBall(-3, -9.4, 3, 0.25, 0x55ff99); k.glowBall(4, -9.4, -2, 0.25, 0x55ff99);
  // pit-floor carts + rubble
  k.slab(-6.2, -10, 2.5, -3.2, -8.5, 4.3, IRON); k.slab(2.8, -10, -6.2, 5.8, -8.6, -4.4, IRON); k.blob(3.5, -9.2, 4.5, 1.6, ROCK, true, 1, 0.2, false);
  // ---- trestle: square ring at |x|,|z| = 20, deck top 8 m ----------------------------------------------------------------------------------
  const bents = []; for (let i = -4; i <= 4; i++) bents.push(i * 5);
  const gapAt = { N: 1, S: -2, E: 2, W: -1 };   // collapsed interval starts (3.3 m gap)
  const seg = (axis, c, a0, a1) => { if (a1 - a0 < 0.05) return; if (axis === 'x') k.slab(a0, 7.6, c - 0.8, a1, 8.0, c + 0.8, TIM); else k.slab(c - 0.8, 7.6, a0, c + 0.8, 8.0, a1, TIM); };
  for (const [edge, axis, c] of [['N', 'x', -20], ['S', 'x', 20], ['W', 'z', -20], ['E', 'z', 20]]) {
    for (let j = 0; j < 8; j++) {
      const a = j * 5 - 20, b = a + 5; const broken = gapAt[edge] === (j - 4);
      if (broken) { seg(axis, c, a - 0.2, a + 0.85); seg(axis, c, b - 0.85, b + 0.2); } else seg(axis, c, a - 0.2, b + 0.2);
    }
    for (const t of bents) { const x = axis === 'x' ? t : c, z = axis === 'x' ? c : t; k.post(x, z, 0, 7.6, 0.42, TIM2, 7); if (Math.abs(t) % 10 === 0) k.beam(axis === 'x' ? t : c - 1.4, 7.0, axis === 'x' ? c - 1.4 : t, axis === 'x' ? t : c + 1.4, 7.0, axis === 'x' ? c + 1.4 : t, 0.15, TIM, 5, false); }
  }
  for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {                                                                           // 4 bridges headframe -> trestle
    const x0 = dx * 5, z0 = dz * 5, x1 = dx * 20, z1 = dz * 20;
    k.slab(Math.min(x0, x1) - (dx ? 0 : 0.8), 7.6, Math.min(z0, z1) - (dz ? 0 : 0.8), Math.max(x0, x1) + (dx ? 0 : 0.8), 8.0, Math.max(z0, z1) + (dz ? 0 : 0.8), TIM);
    for (const t of [9.5, 16]) k.post(dx * t, dz * t, 0, 7.6, 0.4, TIM2, 7);
  }
  // crates stepping up to the trestle at four bents
  for (const [x, z, sx, sz] of [[-26, -20, 1, 0], [26, 20, -1, 0], [-20, 26, 0, -1], [20, -26, 0, 1]]) { for (let i = 0; i < 3; i++) { const cx = x + sx * i * 1.9 * -1 + (sx ? 0 : 0), cz = z + sz * i * 1.9 * -1; void cx; void cz; } }
  for (const [x, z] of [[-24.5, -20], [24.5, 20], [-20, 24.5], [20, -24.5]]) { const horiz = Math.abs(x) > 21; for (let i = 0; i < 3; i++) { const off = i * 1.9; const cx = horiz ? x + Math.sign(x) * off * 1 : x, cz = horiz ? z : z + Math.sign(z) * off; k.slab(cx - 0.9, 0, cz - 0.9, cx + 0.9, 2.6 - i * 0.9, cz + 0.9, i % 2 ? TIM : 0x5a4634); } }
  // ---- rail ring (visual) + sleepers, ore carts -------------------------------------------------------------------------------------------------
  const sl = [], im = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  for (let i = 0; i < 72; i++) { const a = i / 72 * Math.PI * 2; sl.push(im.clone().compose(v.set(Math.cos(a) * 13, 0.05, Math.sin(a) * 13), q.setFromEuler(new THREE.Euler(0, -a, 0)), sc)); }
  for (let z = 14; z < 40; z += 1.2) sl.push(im.clone().compose(v.set(0, 0.05, z), q.identity(), sc));
  k.instance(new THREE.BoxGeometry(0.2, 0.1, 2.0), 0x4a3826, sl);
  for (let i = 0; i < 48; i++) for (const rr of [12.4, 13.6]) { const a0 = i / 48 * Math.PI * 2, a1 = (i + 1) / 48 * Math.PI * 2; k.beam(Math.cos(a0) * rr, 0.14, Math.sin(a0) * rr, Math.cos(a1) * rr, 0.14, Math.sin(a1) * rr, 0.06, RAIL, 4, false); }
  for (const z of [14, 38]) for (const x of [-0.7, 0.7]) k.beam(x, 0.14, z, x, 0.14, z === 14 ? 38 : 14, 0.06, RAIL, 4, false);
  for (const [x, z, w, d] of [[13, 0, 1.8, 3], [-13, 0, 1.8, 3], [0, 13, 3, 1.8], [0, -13, 3, 1.8]]) { k.slab(x - w / 2, 0.25, z - d / 2, x + w / 2, 1.55, z + d / 2, 0x5a4a40); k.slab(x - w / 2 - 0.1, 1.45, z - d / 2 - 0.1, x + w / 2 + 0.1, 1.6, z + d / 2 + 0.1, IRON); }
  for (const [x, z] of [[-10, 24], [30, -12]]) { k.slab(x - 0.9, 0, z - 1.5, x + 0.9, 1.4, z + 1.5, 0x5a4a40); k.blob(x, 1.5, z, 0.9, 0x6a5a3a, false, 0, 0.3, false); }   // loaded carts
  // ---- timber gate frames, rubble piles (collapsed shafts), props ----------------------------------------------------------------------------------
  const frames = [[-34, 0, 'z'], [34, 0, 'z'], [0, -34, 'x'], [-34, 14, 'z'], [34, -14, 'z'], [14, -34, 'x'], [-14, -34, 'x'], [-30, -26, 'z'], [30, 26, 'z'], [26, 34, 'x'], [-26, 34, 'x'], [34, 28, 'z']];
  frames.forEach(([x, z, ax], i) => { const h = 5.6; for (const s of [-2.6, 2.6]) k.post(ax === 'z' ? x : x + s, ax === 'z' ? z + s : z, 0, h, 0.3, TIM, 6); if (ax === 'z') k.slab(x - 0.35, h, z - 3.2, x + 0.35, h + 0.5, z + 3.2, TIM2); else k.slab(x - 3.2, h, z - 0.35, x + 3.2, h + 0.5, z + 0.35, TIM2); k.glowBall(ax === 'z' ? x + 0.8 : x, h - 0.6, ax === 'z' ? z : z + 0.8, 0.2, 0xffb347); k.bakeLight(x, h - 0.6, z, 0xffa040, 1.6, 8); });
  [[-30, 8, 3.2], [28, 8, 3], [-6, 32, 2.6], [4, -26, 2.8], [-26, -10, 3.4], [24, -26, 3], [-34, -34, 3.4], [10, 38, 3]].forEach(([x, z, r]) => { if (GEN.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < r + 3.2)) return; k.blob(x, r * 0.55, z, r, ROCK, true, 1, 0.22, false); k.blob(x + r * 0.7, r * 0.3, z + r * 0.5, r * 0.55, ROCK2, true, 1, 0.25, false); });
  for (const [x, z, h] of [[-4, 26, 0.9], [5, 29, 1.2], [-8, 18, 0.8], [8, -20, 1.1], [-20, 14, 1.0]]) k.slab(x - 0.7, 0, z - 0.7, x + 0.7, h, z + 0.7, 0x5a4634);   // crates
  // stalactites + crystals (instanced / glow)
  const st = [], s2 = new THREE.Vector3(); for (let i = 0; i < 140; i++) { const a = k.rand() * 6.283, R = k.rand() * 44, h = 1.5 + k.rand() * 4; st.push(im.clone().compose(v.set(Math.cos(a) * R, 24, Math.sin(a) * R), q.setFromEuler(new THREE.Euler(Math.PI, 0, 0)), s2.set(1, h, 1))); }
  k.instance(new THREE.ConeGeometry(0.5, 1, 5), 0x4a443e, st);
  const crystals = []; for (let i = 0; i < 9; i++) { const a = i * 0.7 + 0.3, R = 28 + (i % 3) * 5, x = Math.cos(a) * R, z = Math.sin(a) * R; crystals.push([x, z]); for (let j = 0; j < 4; j++) k.tilt(new THREE.ConeGeometry(0.22, 1.2 + j * 0.4, 5), 0x55ff99, x + Math.cos(j * 1.6) * 0.5, 0.6 + j * 0.2, z + Math.sin(j * 1.6) * 0.5, (j - 1.5) * 0.18, 0, (j - 2) * 0.2, true); }
  // lanterns on the trestle + spawn lamp post
  for (const t of [-20, -10, 0, 10, 20]) for (const [x, z] of [[t, -20], [t, 20], [-20, t], [20, t]]) if (Math.abs(t) % 20 === 0 || Math.abs(t) === 10) { if ((Math.abs(x) + Math.abs(z)) % 20 !== 0 && false) continue; k.glowBall(x, 8.9, z, 0.2, 0xffb347); k.bakeLight(x, 8.9, z, 0xffa040, 1.3, 7); }
  k.post(0, 36, 0, 3.4, 0.14, IRON, 5); k.glowBall(0, 3.6, 36, 0.3, 0xffb347); k.bakeLight(0, 3.6, 36, 0xffa95a, 2.0, 12);
  k.bakeLight(0, -8, 0, 0x55ff99, 2.8, 14); k.bakeLight(0, 3, 0, 0x55ff99, 1.0, 9); crystals.forEach(([x, z]) => k.bakeLight(x, 0.8, z, 0x55ff99, 2.0, 8)); k.bakeLight(0, 17.5, 0, 0xffa040, 1.5, 10);
  const { group, cols } = k.finish({ chunk: 26, bake: { groundY: 0, groundAO: 0.4, ao: 0.6, aoRadius: 1.4, grad: [0, 24, 1.0, 0.55], vary: 0.1, ambient: 2.2, under: 0.65 } });
  return { group, cols, spawn: [0, 0.9, 32], board: { pos: [0, 0, 26], ry: 0 }, voidY: -30, radius: 56, sky: 0x060504, fog: [0x0e0c0a, 3, 46], hemi: [0xa0a8c8, 0x3a3028, 1.0], sun: null,
    lights: [{ c: 0xffa95a, i: 20, d: 34, p: [0, 4.2, 30] }] };
}
