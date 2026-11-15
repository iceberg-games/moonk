import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MapKit, noise2, lerpColor } from './kit.js';
// FROZEN YARD (horror / Be the Monster): a snowed-in night rail yard, 112 x 88 m, ringed by a 6 m snow berm and black pines.
//   rows    : three track rows (z -24, -12, 0) of 11 m boxcars (3.4 m roofs, one hopper, one flatcar with crates) with 3.2 m gaps: you can run the
//             roofs and the gaps are also the monster cross-lanes. Two derailed cars lie across the corridors (roof 6.8 m) bridging the rows.
//   tower   : water tower at (0,14): 4 legs, 9 m catwalk deck, tank to 14 m, roof; a spiral of pads and a pad stair from the row-3 roof reach the deck
//   gantry  : signal gantry along x=-36 (deck at 8 m, 38 m long, over the three rows) with flickering signal lamps (map.update); pad stair from the row-2 roof
//   shed    : roundhouse on the east end: 5 stalls open to the turntable, all with a 3.6 m rear door, flat roof at 5.4 m, crate stair; raised turntable + bridge
//   rest    : frozen pond (slip 0.9, off every route), snow drifts (sphere colliders), lamp posts, sleepers + rails (instanced).
// Lights: hemisphere + 1 point light at the turntable. Lamps flicker from update() by scaling two MeshBasicMaterial colours (no extra lights).
export const TRAINYARD_GEN_SPOTS = [[-22, 0, 22], [-3, 0, -18], [22, 0, -6], [14, 0, 24], [46, 0, -24]];   // [x, y, z]; the server faces each toward the origin
const ROWS = {
  '-24': [[-44, -33], [-29.8, -18.8], [-15.6, -4.6], [-1.4, 9.6], [12.8, 23.8], [27, 38]],
  '-12': [[-40, -29], [-25.8, -14.8], [-11.6, -0.6], [2.6, 13.6], [16.8, 27.8], [31, 42]],
  '0': [[-26, -15], [-11.8, -0.8], [2.4, 13.4], [16.6, 27.6], [30.8, 41.8]],
};
const CAR = [0x7a3b2e, 0x5a4636, 0x3f5446, 0x585e64, 0x6b4a2a, 0x4a3a4a], SNOW = 0xdfe8f2, DARK = 0x1c1a1c, IRON = 0x3c4046, WOOD = 0x6a5238;
export function buildTrainyard() {
  const k = new MapKit(137); const GEN = TRAINYARD_GEN_SPOTS;
  const groundCol = (x, z) => {
    const n = noise2(x, z, 0.09), m = noise2(x + 11, z - 5, 0.35); let c = lerpColor(0xc4d2e2, 0xf0f5fa, n * 0.7 + m * 0.4);
    for (const rz of [-24, -12, 0]) if (Math.abs(z - rz) < 2.0) c = lerpColor(c, 0x5d5a62, 0.55 + 0.2 * m);
    if (Math.hypot(x - 28, z - 21) < 8) c = lerpColor(c, 0x707078, 0.6);
    if (x > 36 && x < 56 && z > 5 && z < 37) c = lerpColor(c, 0x6c6a70, 0.65);
    if (Math.hypot(x + 38, z - 18) < 6.2) c = lerpColor(c, 0xaed6ee, 0.9);
    return c;
  };
  k.groundGrid(-56, -44, 56, 44, 2.5, 0, groundCol, true);
  // ---- perimeter berm -------------------------------------------------------------------------------------------------------------------
  k.slab(-62, -1, -50, -56, 6, 50, 0xc9d6e4); k.slab(56, -1, -50, 62, 6, 50, 0xc9d6e4); k.slab(-56, -1, -50, 56, 6, -44, 0xc9d6e4); k.slab(-56, -1, 44, 56, 6, 50, 0xc9d6e4);
  // ---- cars ----------------------------------------------------------------------------------------------------------------------------
  const shell = (x0, x1, z0, z1, y0, y1, color, doors = true) => {                                  // visual boxcar body + collider box
    const w = z1 - z0; k.slab(x0 + 0.1, y0 + 0.55, z0 + 0.05, x1 - 0.1, y1 - 0.15, z1 - 0.05, color, false); k.slab(x0, y0, z0 + 0.4, x1, y0 + 0.6, z1 - 0.4, DARK, false); k.slab(x0, y1 - 0.15, z0, x1, y1, z1, SNOW, false);
    if (doors) for (const s of [z0 - 0.05, z1 - 0.01]) k.slab((x0 + x1) / 2 - 1.4, y0 + 0.7, s, (x0 + x1) / 2 + 1.4, y0 + 0.7 + Math.min(2.5, y1 - y0 - 1.1), s + 0.06, 0x2c2420, false);
    k.collide({ k: 'box', min: [x0, y0, z0], max: [x1, y1, z1] }); void w;
  };
  let ci = 0;
  for (const [zs, list] of Object.entries(ROWS)) for (const [x0, x1] of list) {
    const z = +zs, kind = ci % 7 === 3 ? 'hopper' : ci % 7 === 5 ? 'flat' : 'box', color = CAR[ci % CAR.length]; ci++;
    if (kind === 'box') shell(x0, x1, z - 1.5, z + 1.5, 0, 3.4, color);
    else if (kind === 'hopper') shell(x0, x1, z - 1.5, z + 1.5, 0, 4.2, color, false);
    else { k.slab(x0, 0, z - 1.5, x1, 1.2, z + 1.5, IRON); for (const cx of [x0 + 1.0, x0 + 3.8, x0 + 6.6, x0 + 10.0]) { const h = 2.2 + Math.abs(Math.round(cx * 7) % 3) * 0.3; k.slab(cx - 1, 1.2, z - 1.0, cx + 1, 1.2 + h, z + 1.0, WOOD); } }
  }
  shell(-12, -9, -24, -13, 3.4, 6.8, 0x5a4a3a); shell(8, 11, -12, -1, 3.4, 6.8, 0x4a5a4a);       // derailed cars lying across corridors 1 and 2
  // ---- water tower at (0,14) ------------------------------------------------------------------------------------------------------------
  const TX = 0, TZ = 14;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { k.post(TX + sx * 2.8, TZ + sz * 2.8, 0, 9.0, 0.35, 0x5a4a3a, 6); k.beam(TX + sx * 2.8, 1.5, TZ + sz * 2.8, TX - sx * 2.8, 6.5, TZ + sz * 2.8, 0.07, IRON, 4, false); k.beam(TX + sx * 2.8, 1.5, TZ + sz * 2.8, TX + sx * 2.8, 6.5, TZ - sz * 2.8, 0.07, IRON, 4, false); }
  k.cyl(TX, 9.0, TZ, 4.4, 0.35, WOOD, true, 20); k.cyl(TX, 9.35, TZ, 3.4, 4.6, 0x5a3e2c, true, 20); k.cone(TX, 13.95, TZ, 3.8, 2.2, 0x3a3238, 20); k.cyl(TX, 13.95, TZ, 3.4, 0.35, SNOW, false, 20);
  for (let i = 0; i < 8; i++) { const a = i * 45 * Math.PI / 180 + 0.4, R = 5.7; k.pad(TX + Math.cos(a) * R, 1.4 + i * 1.07, TZ + Math.sin(a) * R, 0.85, 0.3, WOOD, 8); }
  for (let i = 0; i < 4; i++) k.pad(-3, 4.9 + 1.3 * i, 4.0 + 1.25 * i, 0.8, 0.3, WOOD, 8);                       // pad stair from the row-3 roof to the deck
  // ---- signal gantry along x=-36 --------------------------------------------------------------------------------------------------------
  const GXc = -36; k.slab(GXc - 1, 7.6, -31, GXc + 1, 8.0, 7, IRON);
  for (const z of [-30, -18, -6, 6]) k.post(GXc, z, 0, 7.6, 0.45, IRON, 8);
  for (const z of [-24, -12, 0]) { k.slab(GXc - 0.4, 5.3, z - 0.4, GXc + 0.4, 7.6, z + 0.4, 0x23262a, false); }
  for (let i = 0; i < 3; i++) k.pad(-31.2 - 1.2 * i, 4.8 + 1.35 * i, -12, 0.8, 0.3, WOOD, 8);
  // ---- roundhouse: x 36..48, z 6..36, five stalls, turntable at (28,21) ------------------------------------------------------------------
  for (let i = 0; i <= 5; i++) k.slab(36, 0, 6 + 6 * i - 0.25, 48, 5.0, 6 + 6 * i + 0.25, 0x6a5a52);
  for (let i = 0; i < 5; i++) { const zc = 9 + 6 * i; k.slab(47.6, 0, zc - 3 + 0.25, 48, 5, zc - 1.8, 0x5a4c46); k.slab(47.6, 0, zc + 1.8, 48, 5, zc + 3 - 0.25, 0x5a4c46); k.slab(47.6, 3.8, zc - 1.8, 48, 5, zc + 1.8, 0x5a4c46); }
  k.slab(35.8, 5.0, 5.7, 48.2, 5.4, 36.3, 0x3a3238); k.slab(35.8, 5.4, 5.7, 48.2, 5.55, 36.3, SNOW, false);
  for (const zc of [15, 27]) { k.slab(36.8, 0.5, zc - 1.2, 41.5, 3.3, zc + 1.2, 0x3a3030); k.cyl(39.2, 0.5, zc, 1.1, 3.0, 0x2a2428, false, 8); }
  k.cyl(28, 0, 21, 7, 0.5, 0x6a6a72, true, 24); k.cyl(28, 0.5, 21, 0.9, 0.9, IRON, false, 10); k.slab(21, 0.5, 20.2, 35, 1.3, 21.8, 0x454a52);
  for (const [x, z, h] of [[30.4, 7.0, 1.4], [32.6, 7.0, 2.8], [34.6, 7.2, 4.2]]) k.slab(x, 0, z, x + 1.8, h, z + 1.8, WOOD);
  k.pad(39, 4.6, 3.6, 0.8, 0.3, WOOD, 8);                                                                   // row-3 roof -> roundhouse roof
  // ---- frozen pond (slip) -------------------------------------------------------------------------------------------------------------------
  k.cyl(-38, 0.0, 18, 6, 0.04, 0xaed6ee, false, 18); k.collide({ k: 'cyl', x: -38, z: 18, r: 6, y0: -0.5, y1: 0.06 }, { slip: 0.9 });
  // ---- lamp posts, drifts, instances -----------------------------------------------------------------------------------------------------
  const LAMPS = [[5, -18], [-10, -6], [22, 18], [-30, 26], [30, 8]];
  for (const [x, z] of LAMPS) { k.post(x, z, 0, 5.2, 0.14, IRON, 6); k.slab(x - 0.5, 5.2, z - 0.15, x + 0.5, 5.35, z + 0.15, IRON, false); }
  const free = (x, z, r) => !GEN.some(([gx, , gz]) => Math.hypot(gx - x, gz - z) < r + 3.5) && Math.hypot(x, z - 34) > r + 5 && Math.hypot(x, z - 28.5) > r + 4 && Math.hypot(x, z - 14) > r + 7.5 && Math.hypot(x - 28, z - 21) > r + 9 && Math.hypot(x + 38, z - 18) > r + 7 && !(x > 33 && z > 3 && z < 40) && !LAMPS.some(([lx, lz]) => Math.hypot(lx - x, lz - z) < r + 1.5);
  let nd = 0; for (let t = 0; t < 400 && nd < 15; t++) { const x = k.range(-52, 32), z = k.range(8, 42), r = k.range(1.4, 2.8); if (!free(x, z, r) || z - r < 5) continue; k.blob(x, r * 0.28, z, r, 0xe4edf6, true, 1, 0.12, false); nd++; }
  for (const [x, z, r] of [[-52, -38, 3], [-53, 30, 3.2], [53, -38, 3], [52, 40, 2.8], [-24, -40, 2.6], [20, -40, 2.8], [44, 40, 2.4], [-46, 6, 2.2]]) k.blob(x, r * 0.3, z, r, 0xe4edf6, true, 1, 0.12, false);
  const im = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3(1, 1, 1);
  const sleepers = []; for (const rz of [-24, -12, 0]) for (let x = -54; x <= 54; x += 2) sleepers.push(im.clone().compose(v.set(x, 0.08, rz), q.identity(), sc.set(1, 1, 1)));
  k.instance(new THREE.BoxGeometry(0.35, 0.16, 2.6), 0x3a302a, sleepers);
  for (const rz of [-24, -12, 0]) for (const dz of [-0.72, 0.72]) k.slab(-54, 0.14, rz + dz - 0.05, 54, 0.26, rz + dz + 0.05, 0x4a4e56, false);
  const pines = []; for (let i = 0; i < 64; i++) { const t = i / 64 * Math.PI * 2, ex = Math.cos(t) * 74, ez = Math.sin(t) * 60, s = 0.8 + k.rand() * 0.7; pines.push(im.clone().compose(v.set(ex * (1 + k.rand() * 0.08), 4.5 * s, ez * (1 + k.rand() * 0.08)), q.identity(), sc.set(s, s * 1.25, s))); }
  k.instance(new THREE.ConeGeometry(3, 11, 6), 0x1a2a28, pines);
  // ---- baked pools ----------------------------------------------------------------------------------------------------------------------
  for (const [x, z] of LAMPS) k.bakeLight(x, 5.0, z, 0xffc070, 1.6, 10);
  k.bakeLight(GXc, 6.2, -24, 0xff3a2a, 1.2, 7); k.bakeLight(GXc, 6.2, -12, 0x4aff7a, 1.2, 7); k.bakeLight(GXc, 6.2, 0, 0xff3a2a, 1.2, 7); k.bakeLight(28, 3, 21, 0xffb066, 1.4, 12);
  const { group, cols } = k.finish({ chunk: 40, bake: { groundY: 0, groundAO: 0.3, ao: 0.55, aoRadius: 1.3, grad: [0, 14, 1.0, 1.05], vary: 0.08, ambient: 2.0, under: 0.75 } });
  // ---- flickering lamps (map.update) --------------------------------------------------------------------------------------------------
  const lampGeo = (list, r) => mergeGeometries(list.map(([x, y, z]) => new THREE.IcosahedronGeometry(r, 0).translate(x, y, z)));
  const redMat = new THREE.MeshBasicMaterial({ color: 0xff3020 }), grnMat = new THREE.MeshBasicMaterial({ color: 0x40ff70 }), ambMat = new THREE.MeshBasicMaterial({ color: 0xffc070 });
  const heads = [[GXc, 6.0, -24], [GXc, 6.0, -12], [GXc, 6.0, 0]];
  group.add(new THREE.Mesh(lampGeo([[GXc - 0.45, 6.9, -24], [GXc - 0.45, 6.9, 0], [GXc - 0.45, 5.7, -12]], 0.22), redMat), new THREE.Mesh(lampGeo([[GXc - 0.45, 5.7, -24], [GXc - 0.45, 5.7, 0], [GXc - 0.45, 6.9, -12]], 0.22), grnMat), new THREE.Mesh(lampGeo(LAMPS.map(([x, z]) => [x, 5.0, z]), 0.3), ambMat)); void heads;
  const fl = (t, s) => { const a = Math.sin(t * 13 + s) * Math.sin(t * 7.3 + s * 2); return a > 0.55 ? 0.12 : a > 0.3 ? 0.55 : 1; };
  const update = (t) => { const f = fl(t, 0), g = Math.sin(t * 0.8) > 0.2 ? 1 : 0.2; redMat.color.setRGB(1 * f, 0.19 * f, 0.12 * f); grnMat.color.setRGB(0.25 * g, 1 * g, 0.44 * g); const a = fl(t, 3.1); ambMat.color.setRGB(a, 0.75 * a, 0.44 * a); };
  update(0);
  return { group, cols, spawn: [0, 0.9, 34], board: { pos: [0, 0, 28.5], ry: 0 }, voidY: -12, radius: 66, sky: 0x0a111c, fog: [0x1a2736, 6, 78], hemi: [0xa8c0e8, 0x4a5868, 1.45], sun: null, lights: [{ c: 0xffb066, i: 24, d: 38, p: [28, 4, 21] }], update };
}
