import * as THREE from 'three';
import { MapKit, noise2, lerpColor } from './kit.js';
// RUSTED CARNIVAL ("Dead Fair") - horror / Be the Monster. Night, teal fog, ONE amber lantern light at the ticket plaza; every bulb
// is baked into vertex colours.
//   centre   : static Ferris wheel (R 11, hub 14 m): 24 gondola pads on the rim (~2.9 m apart), a horizontal spoke beam, a central
//              mast, two support posts. Bottom gondola is 3 m up, so monsters walk underneath.
//   inner    : 8 tent poles on a R=30 ring (top 7.5 m) joined by a stepping-pad "bulb cable" loop (~3.4 m gaps), with feeder
//              links from the wheel rim, the funhouse roof and the carousel canopy
//   funhouse : 12x10 zig-zag maze, two doors (3 m wide, 3.8 m high), roof at 5.8 m, front pillars, and a SLIDE (slip 0.9, steeper
//              than the body-slide threshold) from the roof down the south face
//   carousel : drum, canopy ring platform at 5.3 m, 8 horse poles
//   ground   : 6 stalls with awnings, drained-lake pier, bumper-car rink, ticket plaza with an arch, 16 perimeter lamp poles
// Ground corridors are >= 3 m wide; doorways >= 2.8 m wide and >= 3.6 m high, so the walking monsters never wedge.
export const CARNIVAL_GEN_SPOTS = [[-13, 0, 13], [14, 0, 17], [-10, 0, -14], [3, 0, -16], [28, 0, 4]];   // [x, y, z]; the server faces each toward the origin (the wheel hub)
const RED = 0xa83a3a, CREAM = 0xd8caa0, TEAL = 0x3a7a78, MUST = 0xc89a3a, RUST = 0x6a4a3a, IRON = 0x4a4650, WOODC = 0x5a4634;
export function buildCarnival() {
  const k = new MapKit(41);
  const GEN = CARNIVAL_GEN_SPOTS;
  k.groundDisc(48, 1.7, 0, (x, z) => {
    const n = noise2(x, z, 0.08), m = noise2(x + 20, z - 9, 0.2), d = Math.hypot(x, z); let c = lerpColor(0x3b3530, 0x514638, n);
    if (m > 0.62) c = lerpColor(c, 0x2f3a2a, (m - 0.62) * 3);                                                                            // dead grass
    if (Math.hypot(x + 26, z - 26) < 9.5) c = lerpColor(0x1c3a3c, 0x2b5a52, noise2(x, z, 0.5));                                             // drained lake
    if (Math.hypot(x - 25, z - 24) < 8) c = lerpColor(0x3a3a46, 0x50505c, ((Math.floor(x / 2) + Math.floor(z / 2)) & 1) * 0.6);          // bumper rink
    if (Math.hypot(x, z - 29) < 7) c = lerpColor(0x5a4a3a, c, Math.max(0, (Math.hypot(x, z - 29) - 4) / 3));                               // plaza
    if (d < 13 && d > 11 && noise2(x, z, 1) > 0.3) c = lerpColor(c, 0x6a5a48, 0.4); return c;
  });
  // ---- ticket plaza (spawn 0,30; board 0,24) ---------------------------------------------------------------------------------------------
  for (const sx of [-4, 4]) k.post(sx, 34, 0, 5.5, 0.5, RED, 8);
  k.slab(-4.6, 5.5, 33.5, 4.6, 6.3, 34.5, CREAM); k.glowBox(0, 6.0, 33.3, 3, 0.35, 0.1, 0xffb347);
  for (const sx of [-1, 1]) { const x = sx * 9; k.slab(x - 2, 0, 33, x + 2, 3, 37, TEAL); k.slab(x - 2.5, 3, 32.6, x + 2.5, 3.3, 37.4, RED); k.glowBox(x, 1.7, 32.9, 1.4, 0.8, 0.06, 0xffd27a); }
  // ---- Ferris wheel: centre (0,0), plane z=0, hub y=14, R=11 -----------------------------------------------------------------------------------
  const HY = 14, WR = 11, rim = [];
  for (const z of [-3, 3]) k.post(0, z, 0, HY + 0.4, 0.6, RUST, 8);
  k.slab(-0.4, HY - 0.4, -3.2, 0.4, HY + 0.4, 3.2, IRON);                                                                  // axle
  k.beam(-WR, HY, 0, WR, HY, 0, 0.22, RUST, 6);                                                                           // horizontal spoke (box collider)
  k.post(0, 0, HY - WR, HY + WR, 0.2, RUST, 6);                                                                           // central mast (vertical spokes)
  for (let i = 0; i < 24; i++) {
    const a = i / 24 * Math.PI * 2, x = Math.cos(a) * WR, y = HY + Math.sin(a) * WR; rim.push([x, y]);
    k.pad(x, y, 0, 0.95, 0.35, i % 2 ? MUST : RED, 9);
    k.box(x, y - 1.55, 0, 1.5, 1.2, 1.4, i % 2 ? 0x7a3a3a : 0x6a6a50, false);                                                  // cabin (visual)
    k.glowBall(x, y + 0.5, 0, 0.16, 0xffe28a);
  }
  for (let i = 0; i < 24; i++) { const [x0, y0] = rim[i], [x1, y1] = rim[(i + 1) % 24]; k.beam(x0, y0 - 0.2, 0, x1, y1 - 0.2, 0, 0.1, RUST, 4, false); }
  for (const a of [Math.PI / 4, 3 * Math.PI / 4, 5 * Math.PI / 4, 7 * Math.PI / 4]) k.beam(0, HY, 0, Math.cos(a) * WR, HY + Math.sin(a) * WR, 0, 0.08, RUST, 4, false);
  // ---- stalls (box + awning), keep generator spots clear -------------------------------------------------------------------------------------------
  [[20, 8], [9, 22], [-9, 22], [-20, 9], [-12, -21], [12, -21]].forEach(([x, z], i) => {
    k.slab(x - 2, 0, z - 1.5, x + 2, 2.4, z + 1.5, i % 2 ? TEAL : 0x7a4a3a);
    k.slab(x - 2.6, 2.8, z - 2.0, x + 2.6, 3.1, z + 2.0, i % 2 ? RED : CREAM); k.glowBall(x, 2.5, z + 2.1, 0.16, 0xffb347);
    k.post(x - 2.4, z + 1.9, 0, 2.8, 0.1, IRON, 4, false);
  });
  // ---- funhouse: x 12..24, z -13..-3 ------------------------------------------------------------------------------------------------------------------
  const FX0 = 12, FX1 = 24, FZ0 = -13, FZ1 = -3, FH = 5.5, T = 0.5;
  const wx = (z, a0, a1, ops, c = 0x6a4a58) => { let cur = a0; for (const [a, b, y1] of [...ops].sort((p, q) => p[0] - q[0])) { if (a > cur) k.slab(cur, 0, z - T / 2, a, FH, z + T / 2, c); k.slab(a, y1, z - T / 2, b, FH, z + T / 2, c); cur = b; } if (a1 > cur) k.slab(cur, 0, z - T / 2, a1, FH, z + T / 2, c); };
  wx(FZ1, FX0, FX1, [[13.2, 16.2, 3.8]]); wx(FZ0, FX0, FX1, [[19, 22, 3.8]]);                                              // south / north doors
  k.slab(FX0 - T / 2, 0, FZ0, FX0 + T / 2, FH, FZ1, 0x6a4a58); k.slab(FX1 - T / 2, 0, FZ0, FX1 + T / 2, FH, FZ1, 0x6a4a58);
  k.slab(FX0, 0, -6.5 - 0.25, 20.5, FH, -6.5 + 0.25, 0x58424e); k.slab(15, 0, -9.5 - 0.25, FX1, FH, -9.5 + 0.25, 0x58424e);   // baffles: 3.25 m / 3 m gaps
  k.slab(FX0 - 0.4, FH, FZ0 - 0.4, FX1 + 0.4, FH + 0.3, FZ1 + 0.4, 0x3a2a34);                                                // roof (top 5.8)
  k.glowBall(18, 4.6, -4.8, 0.2, 0xff4d4d); k.glowBall(22, 4.6, -8, 0.2, 0xff4d4d); k.glowBall(15.5, 4.6, -11.2, 0.2, 0xff4d4d);
  for (const x of [12.5, 23.5]) k.post(x, -2.3, 0, 8.2, 0.55, CREAM, 8);                                                    // facade pillars
  k.slab(11.8, 7.4, -2.7, 24.2, 8.2, -1.9, RED);                                                                          // sign beam (top 8.2)
  k.glowBox(18, 7.6, -1.8, 5, 0.5, 0.06, 0xffb347);
  // slide: surface from (z -2.75, y 5.8) down to (z 0.95, y 0.3) over x 19.4..22.6, slip 0.9, steeper than normal.y 0.6
  { const z0 = -2.75, y0 = 5.8, z1 = 0.95, y1 = 0.3, L = Math.hypot(z1 - z0, y1 - y0), tz = (z1 - z0) / L, ty = (y1 - y0) / L, nz = -ty, ny = tz > 0 ? tz : -tz, r = 0.8;
    void ny; const n = [-ty, tz]; // surface normal (z, y) pointing up/outwards
    const nn = Math.hypot(n[0], n[1]); const nzv = n[0] / nn, nyv = Math.abs(n[1] / nn);
    for (let s = 0; s <= L; s += 0.7) for (const x of [19.9, 21, 22.1]) k.collide({ k: 'sph', x, y: y0 + ty * s - nyv * r, z: z0 + tz * s - nzv * r, r }, { slip: 0.9 }); void nz;
    k.tilt(new THREE.BoxGeometry(3.4, 0.25, L), 0xc23a4a, 21, (y0 + y1) / 2, (z0 + z1) / 2, Math.atan2(-(y1 - y0), z1 - z0) * -1 * -1, 0, 0);
  }
  // ---- carousel (-18,-4) ----------------------------------------------------------------------------------------------------------------------------------
  const CC = [-18, -4]; k.cyl(CC[0], 0, CC[1], 5.5, 0.6, 0x5a4a3a, true, 16); k.post(CC[0], CC[1], 0.6, 5, 0.8, RED, 10); k.pad(CC[0], 5.3, CC[1], 6.2, 0.5, MUST, 16);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, x = CC[0] + Math.cos(a) * 4.2, z = CC[1] + Math.sin(a) * 4.2; k.post(x, z, 0.6, 5.0, 0.13, CREAM, 5); k.blob(x, 1.7 + (i % 2) * 0.6, z, 0.55, i % 2 ? 0xd8caa0 : 0x8a4a4a, false, 0, 0.2, false); k.glowBall(x, 5.2, z, 0.14, 0xffe28a); }
  // ---- tent-pole ring (R=30) and the bulb-cable loop ------------------------------------------------------------------------------------------------------
  const poles = []; for (let i = 0; i < 8; i++) { const a = (22.5 + 45 * i) * Math.PI / 180, x = Math.cos(a) * 30, z = Math.sin(a) * 30; poles.push([x, z]); k.post(x, z, 0, 7.4, 0.45, i % 2 ? RED : TEAL, 8); k.pad(x, 7.6, z, 0.9, 0.3, IRON, 8); k.glowBall(x, 8.1, z, 0.22, 0xffb347); }
  const cab = [];
  for (let i = 0; i < 8; i++) {
    const A = poles[i], B = poles[(i + 1) % 8], d = Math.hypot(B[0] - A[0], B[1] - A[1]), ux = (B[0] - A[0]) / d, uz = (B[1] - A[1]) / d;
    const pads = k.stepPath([A[0] + ux * 1.4, 7.1, A[1] + uz * 1.4], [B[0] - ux * 1.4, 7.1, B[1] - uz * 1.4], 3.5, 0.7, WOODC, { dy: 0.5, h: 0.28, seg: 8 });
    pads.forEach((p, j) => { k.glowBall(p[0], p[1] + 0.5, p[2], 0.16, 0xffe28a); if (j % 2 === 0) cab.push(p); k.post(p[0], p[2], p[1] - 4, p[1] - 0.2, 0.07, IRON, 4, false); });
    k.beam(A[0], 7.9, A[1], B[0], 7.9, B[1], 0.03, 0x1c1814, 3, false);
  }
  // feeder hops: wheel rim -> pole, funhouse roof -> pole, carousel canopy -> pole, wheel to wheel-side pole
  k.stepPath([WR - 0.5, 14, 0], [poles[0][0] - 1.0, 7.4, poles[0][1] - 1.5], 3.4, 0.75, WOODC, { h: 0.28, seg: 8 });         // (11,14) -> pole 0 (27.7,11.5)
  k.stepPath([-WR + 0.5, 14, 0], [poles[4][0] + 1.0, 7.4, poles[4][1] + 1.5], 3.4, 0.75, WOODC, { h: 0.28, seg: 8 });
  k.pad(25.8, 6.6, -12.6, 0.85, 0.28, WOODC, 8); k.pad(-24, 6.2, -9, 0.85, 0.28, WOODC, 8);
  // ---- lake pier, bumper cars, perimeter lamp poles ----------------------------------------------------------------------------------------------------------
  k.slab(-31, 0.4, 25, -17, 0.7, 28, 0x4a3a2c); for (let x = -30; x <= -18; x += 4) for (const z of [24.8, 28.2]) k.post(x, z, 0, 1.4, 0.16, 0x3a2e24, 5);
  k.slab(-33, 0.4, 24, -31, 0.9, 29, 0x4a3a2c); k.post(-34, 26.5, 0, 4.5, 0.2, 0x3a2e24, 6); k.glowBall(-34, 4.8, 26.5, 0.22, 0xffb347);
  [[22, 21], [27, 22], [24, 26.5], [28, 27], [21, 27.5], [25.5, 18]].forEach(([x, z], i) => { k.cyl(x, 0, z, 0.9, 0.8, i % 2 ? RED : TEAL, true, 8); k.cyl(x, 0.8, z, 0.15, 1.4, IRON, true, 4); k.glowBall(x, 2.3, z, 0.12, 0xffe28a); });
  for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.post(25 + Math.cos(a) * 8.3, 24 + Math.sin(a) * 8.3, 0, 1.1, 0.18, IRON, 5); }
  const lamps = []; for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2, x = Math.cos(a) * 44, z = Math.sin(a) * 44, h = 8 + (i % 3); k.post(x, z, 0, h, 0.35, IRON, 6); k.post(x - Math.cos(a) * 1.8, z - Math.sin(a) * 1.8, h - 0.4, h - 0.1, 0.12, IRON, 4, false); k.glowBall(x - Math.cos(a) * 1.8, h - 0.7, z - Math.sin(a) * 1.8, 0.28, 0xffb347); lamps.push([x, h, z]);
    if (i % 2 === 1) { const j = (i - 1) / 2, P = poles[j], ca = Math.cos(a), sa = Math.sin(a); k.stepPath([ca * 42.3, 7.2, sa * 42.3], [P[0] + ca * 1.4, 7.2, P[1] + sa * 1.4], 3.4, 0.75, WOODC, { dy: 0.4, h: 0.28, seg: 8 }); }   // outer lamp -> cable ring
  }
  // ---- clutter you can push off + instanced props ----------------------------------------------------------------------------------------------------------------------
  for (const [x, z, w, d, h] of [[-2, -8, 1.6, 1.6, 1.0], [6, 8, 1.4, 1.4, 1.2], [-6, 3, 2.2, 1.2, 0.9], [-2, 14, 1.2, 1.2, 1.4], [8, -9, 1.6, 1.6, 0.9], [-24, -22, 2.4, 1.6, 1.1], [31, -24, 1.6, 2.4, 1.0]]) { if (GEN.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 3.2)) continue; k.slab(x - w / 2, 0, z - d / 2, x + w / 2, h, z + d / 2, i2c(x + z)); }
  function i2c(v) { return [RED, TEAL, MUST, 0x7a4a3a][Math.abs(Math.round(v)) % 4]; }
  const tk = [], im = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < 140; i++) { const a = k.rand() * 6.28, R = 3 + k.rand() * 42, x = Math.cos(a) * R, z = Math.sin(a) * R; if (GEN.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 1.5)) continue; tk.push(im.clone().compose(v.set(x, 0.02, z), q.setFromEuler(new THREE.Euler(0, k.rand() * 6, 0)), sc.set(1, 1, 1))); }
  k.instance(new THREE.BoxGeometry(0.22, 0.02, 0.1), 0xd8caa0, tk);
  const weeds = []; for (let i = 0; i < 160; i++) { const a = k.rand() * 6.28, R = 4 + k.rand() * 42, x = Math.cos(a) * R, z = Math.sin(a) * R; if (GEN.some(([gx, gz]) => Math.hypot(gx - x, gz - z) < 1.5)) continue; const s = 0.7 + k.rand(); weeds.push(im.clone().compose(v.set(x, 0, z), q.identity(), sc.set(s, s * 1.2, s))); }
  k.instance(new THREE.ConeGeometry(0.2, 0.9, 4), 0x4a5a35, weeds);
  // ---- baked light pools ---------------------------------------------------------------------------------------------------------------------------------------------------
  k.bakeLight(0, 3.2, 31, 0xffa95a, 2.2, 12); k.bakeLight(0, 4.8, 33, 0xffb347, 1.8, 8);
  for (let i = 0; i < 24; i += 3) k.bakeLight(rim[i][0], rim[i][1] + 0.5, 0, 0xffe28a, 1.6, 7);
  cab.forEach(([x, y, z], i) => { if (i % 2 === 0) k.bakeLight(x, y + 0.5, z, 0xffd27a, 1.2, 6); });
  poles.forEach(([x, z]) => k.bakeLight(x, 8.1, z, 0xffb347, 1.4, 8)); lamps.forEach(([x, h, z], i) => { if (i % 2 === 0) k.bakeLight(x * 0.96, h - 0.7, z * 0.96, 0xffb347, 1.4, 8); });
  k.bakeLight(18, 4.6, -8, 0xff3a3a, 2.0, 9); k.bakeLight(21, 3.5, -1, 0xffb347, 1.4, 6); k.bakeLight(-18, 5.2, -4, 0xffe28a, 1.5, 9); k.bakeLight(25, 2.3, 24, 0xffe28a, 1.3, 8); k.bakeLight(-34, 4.8, 26.5, 0xffb347, 1.4, 8);
  const { group, cols } = k.finish({ chunk: 26, bake: { groundY: 0, groundAO: 0.4, ao: 0.6, aoRadius: 1.4, grad: [0, 26, 1.0, 0.75], vary: 0.1, ambient: 2.0, under: 0.7 } });
  return { group, cols, spawn: [0, 0.9, 30], board: { pos: [0, 0, 24], ry: 0 }, voidY: -25, radius: 54, sky: 0x0a0710, fog: [0x14222c, 3, 48], hemi: [0x9aa8d0, 0x3a2a44, 1.0], sun: null,
    lights: [{ c: 0xffa95a, i: 20, d: 34, p: [0, 4.2, 26] }] };
}
