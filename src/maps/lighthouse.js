import * as THREE from 'three';
import { MapKit, noise2, lerpColor } from './kit.js';
// DROWNED LIGHTHOUSE (horror / Be the Monster): a storm-battered rock island in a knee-to-hip-deep sea, night.
// Lit by a cold storm hemisphere and ONE moving SpotLight: the lighthouse beam. The beam sweeps once every 14 s; a pair of additive
// cone meshes show it. The sweep is driven by the map.update(t, dt) frame hook (game.js).
// The spot light lives in the map group, so lights:[] is returned (the game adds no static map light).
//   island  : three rock terraces (tops 0.8 / 2.4 / 4.0) joined by 0.27 m-rise stone steps (monsters can walk up), spawn on the lowest
//   tower   : leaning striped lighthouse (10 stacked cylinders, lean +3 m at the gallery, 24 m), spiral catwalk pads every 55 deg
//             (~2-3 m hops), gallery deck at 24 m, lamp room with glowing glass
//   cottage : keeper's cottage with 2 doors (3 m x 3.8 m), window, roof perch and chimney
//   sea     : half-sunk dock with 3 m gaps, wrecked boat, 6 sea stacks (9-12 m) joined by a rope-bridge ring of stepping planks, plus two
//             long bridges from the tower catwalk; wet slick rocks (slip 0.7) only on side boulders, never on required routes
export const LIGHTHOUSE_GEN_SPOTS = [[-17, 0.8, -17], [17, 0.8, -17], [17, 0.8, 17], [-8.5, 4.0, -4], [7, 4.0, -8]];   // [x, y, z] (y = floor height); the server faces each toward the origin (the tower)
const ROCK = 0x4a5258, ROCK2 = 0x39414a, MOSS = 0x3f5a46, WHITE = 0xcfd2cc, RED = 0x8f3a34, WOOD = 0x5a4634, WET = 0x30424e, IRON = 0x4a4c52;
const T1 = 0.8, T2 = 2.4, TP = 4.0, SEABED = -0.9;
export function buildLighthouse() {
  const k = new MapKit(91);
  const GEN = LIGHTHOUSE_GEN_SPOTS;
  const waterCol = (x, z) => { const d = Math.hypot(x, z), n = noise2(x, z, 0.12), m = noise2(x + 7, z - 3, 0.5); let c = lerpColor(0x0b2230, 0x1b4150, n * 0.8 + m * 0.3); const f = Math.max(0, 1 - Math.abs(d - 27.5) / 2.2); c = lerpColor(c, 0x8fb0b8, f * (0.35 + m * 0.4)); return c; };
  k.groundDisc(58, 2.0, 0, waterCol, false);                                        // sea surface (visual only)
  k.collide({ k: 'cyl', x: 0, z: 0, r: 60, y0: -4, y1: SEABED });                   // seabed you wade on
  // ---- island terraces -------------------------------------------------------------------------------------------------------------------------
  k.cyl(0, SEABED - 0.5, 0, 27, T1 - SEABED + 0.5, ROCK, true, 28); k.cyl(0, T1 - 0.5, 0, 21, T2 - T1 + 0.5, ROCK2, true, 26); k.cyl(0, T2 - 0.5, 0, 12, TP - T2 + 0.5, ROCK, true, 22);
  const stairs = (axis, sgn, edge, y0, y1, n, w) => { const d = 0.6, rise = (y1 - y0) / n; for (let k2 = 1; k2 <= n; k2++) { const o0 = edge + sgn * 0.0 + sgn * d * (n - k2), o1 = o0 + sgn * d, lo = Math.min(o0, o1), hi = Math.max(o0, o1), top = y0 + rise * k2; if (axis === 'x') k.slab(lo, y0 - 1.2, -w / 2, hi, top, w / 2, k2 % 2 ? 0x59626a : 0x4f5860); else k.slab(-w / 2, y0 - 1.2, lo, w / 2, top, hi, k2 % 2 ? 0x59626a : 0x4f5860); } };
  stairs('z', 1, 27, SEABED, T1, 6, 3.6); stairs('z', -1, -27, SEABED, T1, 6, 3.6);        // sea -> T1 (north, south)
  stairs('x', 1, 21, T1, T2, 6, 3.6); stairs('z', -1, -21, T1, T2, 6, 3.6);                 // T1 -> T2
  stairs('z', 1, 12, T2, TP, 6, 3.6); stairs('z', -1, -12, T2, TP, 6, 3.6);                // T2 -> plateau
  // ---- leaning lighthouse at (0,0): base TP, 10 sections of 2 m --------------------------------------------------------------------------------------
  const leanAt = (y) => 0.15 * (y - TP), radAt = (y) => 2.6 - 0.07 * (y - TP);
  for (let i = 0; i < 10; i++) { const y = TP + i * 2; k.cyl(leanAt(y + 1), y, 0, radAt(y), 2.0, i % 2 ? RED : WHITE, true, 16, radAt(y + 2)); }
  for (let i = 0; i < 17; i++) {                                                                                              // spiral catwalk pads
    const y = 5.2 + i, a = i * 55 * Math.PI / 180, R = radAt(y) + 1.9, cx = leanAt(y) + Math.cos(a) * R, cz = Math.sin(a) * R;
    k.pad(cx, y, cz, 0.95, 0.3, WOOD, 8); k.beam(leanAt(y), y - 0.3, 0, cx, y - 0.3, cz, 0.1, IRON, 4, false);
    k.post(cx + Math.cos(a) * 0.8, cz + Math.sin(a) * 0.8, y, y + 1.1, 0.05, IRON, 4, false);
  }
  const GX = leanAt(24), GY = 24;
  k.pad(GX, GY, 0, 3.7, 0.4, IRON, 16); for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2; k.post(GX + Math.cos(a) * 3.5, Math.sin(a) * 3.5, GY, GY + 1.1, 0.05, IRON, 4, false); }
  k.cyl(GX, GY, 0, 1.6, 0.4, WHITE, false, 14); k.cyl(GX, GY + 2.6, 0, 1.9, 0.3, IRON, false, 14); k.cone(GX, GY + 2.9, 0, 2.2, 1.7, RED, 14);
  for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; k.post(GX + Math.cos(a) * 1.45, Math.sin(a) * 1.45, GY + 0.4, GY + 2.6, 0.08, IRON, 4, false); }
  k.cyl(GX, GY + 0.4, 0, 1.3, 2.2, 0xffe9a8, false, 14);                                                                       // lamp glass (lit look)
  k.glowBall(GX, GY + 1.5, 0, 0.9, 0xfff3c0);
  // ---- keeper's cottage on T2: x -20..-13, z -3.5..3.5, floor T2 ----------------------------------------------------------------------------------------
  const CY = T2, CH = 4.2, wallS = (axis, c, a0, a1, ops) => { const T = 0.45; const seg = (s0, s1, y0, y1) => { if (s1 - s0 < 0.01 || y1 - y0 < 0.01) return; if (axis === 'x') k.slab(s0, CY + y0, c - T / 2, s1, CY + y1, c + T / 2, 0x6a6258); else k.slab(c - T / 2, CY + y0, s0, c + T / 2, CY + y1, s1, 0x6a6258); }; let cur = a0; for (const [a, b, y0, y1] of [...ops].sort((p, q) => p[0] - q[0])) { seg(cur, a, 0, CH); seg(a, b, 0, y0); seg(a, b, y1, CH); cur = b; } seg(cur, a1, 0, CH); };
  wallS('x', -3.5, -20, -13, [[-17.5, -14.5, 0, 3.8]]); wallS('x', 3.5, -20, -13, [[-19, -16.6, 1.2, 2.6]]);
  wallS('z', -13, -3.5, 3.5, [[-1.5, 1.5, 0, 3.8]]); wallS('z', -20, -3.5, 3.5, []);
  k.slab(-20.5, CY + CH, -4, -12.5, CY + CH + 0.3, 4, 0x3a3a42); k.cyl(-19, CY + CH + 0.3, 2.4, 0.7, 2.6, 0x57524c, true, 8);
  k.slab(-18.8, CY, -1.2, -17.0, CY + 0.9, 0.2, WOOD); k.slab(-16.4, CY, 2.0, -15.2, CY + 1.3, 3.1, WOOD);                    // table, crate
  k.glowBall(-16.5, CY + 2.6, 0, 0.25, 0xffb347);                                                                          // lantern
  // ---- half-sunk dock along +x (z -2..2), gaps of 3 m, and a wrecked boat ----------------------------------------------------------------------------------------
  const dk = [[27, 31.2], [34.2, 38.2], [41.2, 46]]; for (const [a, b] of dk) k.slab(a, 0.05, -2, b, 0.45, 2, WOOD);
  for (const x of [28, 32, 35.5, 39.5, 43, 45.5]) for (const z of [-2.3, 2.3]) k.post(x, z, SEABED, x > 40 ? 1.2 : 2.3, 0.2, 0x35291f, 5);
  k.glowBall(28, 2.5, 2.3, 0.2, 0xffb347);
  k.slab(33, SEABED, -11.5, 42, 1.4, -8.5, 0x4a3a2c); k.slab(36, 1.4, -11, 39, 2.6, -9, 0x3a2e24); k.post(40.2, -10, 0.5, 9.2, 0.2, 0x2f241c, 6); k.slab(38.8, 7.4, -10.2, 41.6, 7.7, -9.8, 0x2f241c);
  k.glowBall(36, 3.0, -9, 0.18, 0xff5a3a);
  // ---- sea stacks + rope-bridge ring ---------------------------------------------------------------------------------------------------------------------------
  const stacks = []; for (let i = 0; i < 6; i++) { const a = (20 + 60 * i) * Math.PI / 180, R = 37, x = Math.cos(a) * R, z = Math.sin(a) * R, top = 9 + (i % 3) * 1.4; stacks.push({ x, z, top }); k.trunk(x, z, SEABED, top, 3.2, 2.2, i % 2 ? ROCK : ROCK2, 9); k.blob(x - 1, top - 0.2, z + 0.8, 1.6, MOSS, false, 0, 0.25, false); k.cyl(x, 0.03, z, 5.2, 0.05, 0x9fbdc4, false, 14); }
  const edgeP = (A, B, r) => { const d = Math.hypot(B.x - A.x, B.z - A.z), ux = (B.x - A.x) / d, uz = (B.z - A.z) / d; return [[A.x + ux * r, 0, A.z + uz * r], [B.x - ux * r, 0, B.z - uz * r]]; };
  stacks.forEach((A, i) => { const B = stacks[(i + 1) % 6]; const [a, b] = edgeP(A, B, 2.6); a[1] = A.top - 0.1; b[1] = B.top - 0.1; const p = k.stepPath(a, b, 3.5, 0.8, WOOD, { dy: 0.3, h: 0.25, seg: 8, wobble: 0.5 }); const pts = [a, ...p, b]; for (let j = 0; j < pts.length - 1; j++) k.beam(pts[j][0], pts[j][1] - 0.15, pts[j][2], pts[j + 1][0], pts[j + 1][1] - 0.15, pts[j + 1][2], 0.04, 0x2f241c, 3, false); });
  for (const si of [0, 3]) {                                                                                                  // two long bridges tower catwalk -> stack
    const S = stacks[si], y0 = 11.5, cx = leanAt(y0), dx = S.x - cx, dz = S.z, d = Math.hypot(dx, dz), ux = dx / d, uz = dz / d, R0 = radAt(y0) + 2.8;
    const a = [cx + ux * R0, y0, uz * R0], b = [S.x - ux * 2.6, S.top - 0.1, S.z - uz * 2.6]; k.pad(a[0], a[1], a[2], 1.0, 0.3, WOOD, 8); k.beam(cx, y0 - 0.3, 0, a[0], y0 - 0.3, a[2], 0.1, IRON, 4, false);
    k.stepPath(a, b, 3.5, 0.8, WOOD, { dy: 0.3, h: 0.25, seg: 8, wobble: 0.4 });
  }
  // ---- rocks, slick boulders (side only), tide pools, props -------------------------------------------------------------------------------------------------------------
  const wet = (x, z, r) => { k.blob(x, T1 + r * 0.45, z, r, WET, true, 1, 0.15, false); k.cols[k.cols.length - 1].slip = 0.7; };
  for (const [x, z, r] of [[-24, 5, 1.4], [23, 12, 1.2], [5, -24, 1.6], [-10, 23, 1.3]]) wet(x, z, r);
  for (const [x, z, r] of [[-6, 17, 1.5], [10, 16, 1.4], [-12, -16, 1.8], [14, -14, 1.6], [3, -17, 1.3], [-9, 9, 1.5], [9, -7, 1.3]]) { const y = Math.hypot(x, z) > 21 ? T1 : Math.hypot(x, z) > 12.6 ? T2 : TP; if (GEN.some(([gx, , gz]) => Math.hypot(gx - x, gz - z) < r + 3.2) || Math.hypot(x, z + 0) < 5 && y === TP) continue; k.blob(x, y + r * 0.45, z, r, ROCK, true, 1, 0.2, false); }
  for (const [x, z, r] of [[-5, 25.5, 1.7], [12, -22, 1.4], [-20, -21, 1.6], [24, 7, 1.3], [-23, 14, 1.5], [8, 22, 1.4]]) k.cyl(x, T1 + 0.02, z, r, 0.04, 0x1d4a55, false, 10);   // tide pools
  for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2 + 0.1, R = 17 + (i % 3) * 4.5; const x = Math.cos(a) * R, z = Math.sin(a) * R; if (Math.abs(x) < 4 && z > 18) continue; if (R < 21 && x < -11 && Math.abs(z) < 5) continue; k.post(x, z, R < 21 ? T2 : T1, (R < 21 ? T2 : T1) + 1.0 + (i % 3) * 0.4, 0.28, i % 2 ? ROCK : ROCK2, 6); }   // stubby rock spires to hold
  const im = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  const barrels = [[28.5, 1.3], [-14.6, -2.6], [30.4, -1.2]].map(([x, z]) => im.clone().compose(v.set(x, x > 20 ? 0.9 : T2 + 0.45, z), q.identity(), sc.set(1, 1, 1))); k.instance(new THREE.CylinderGeometry(0.4, 0.4, 0.9, 8), 0x5a3a2a, barrels);
  const grass = []; for (let i = 0; i < 90; i++) { const a = k.rand() * 6.28, R = 14 + k.rand() * 12, x = Math.cos(a) * R, z = Math.sin(a) * R; const y = R > 21 ? T1 : T2; if (R < 12.5 || GEN.some(([gx, , gz]) => Math.hypot(gx - x, gz - z) < 1.5)) continue; const s = 0.6 + k.rand() * 0.8; grass.push(im.clone().compose(v.set(x, y, z), q.setFromEuler(new THREE.Euler(0, k.rand() * 6, 0)), sc.set(s, s * 1.3, s))); }
  k.instance(new THREE.ConeGeometry(0.16, 0.8, 4), 0x56704a, grass);
  // ---- baked pools: lamp wash on the tower top, cottage, dock lantern, wreck ---------------------------------------------------------------------------------------------------
  k.bakeLight(GX, GY + 1.5, 0, 0xffe9a8, 2.2, 14); k.bakeLight(-12.4, CY + 1.8, 0, 0xffb347, 2.0, 9); k.bakeLight(-16.5, CY + 2.5, 0, 0xff9a3a, 1.2, 7); k.bakeLight(28, 2.5, 2.3, 0xffb347, 1.6, 8); k.bakeLight(36, 3.0, -9, 0xff5a3a, 1.2, 6);
  const { group, cols } = k.finish({ chunk: 30, bake: { groundY: T1, groundAO: 0.35, ao: 0.6, aoRadius: 1.4, grad: [SEABED, 28, 0.85, 1.05], vary: 0.1, ambient: 2.6, under: 0.8 } });
  // ---- the sweeping beam: 2 additive cones + one SpotLight, driven by map.update -----------------------------------------------------------------------------------------------------
  const sweep = new THREE.Group(); sweep.position.set(GX, GY + 1.5, 0); group.add(sweep);
  const cg = new THREE.CylinderGeometry(6, 0.25, 52, 14, 1, true); cg.rotateZ(-Math.PI / 2 - 0.14); cg.translate(26, 0, 0);
  { const P = cg.attributes.position, C = new Float32Array(P.count * 3); for (let i = 0; i < P.count; i++) { const t = Math.max(0, 1 - Math.hypot(P.getX(i) - 26 * 0, P.getZ(i) * 0) / 1e9); const f = Math.pow(Math.max(0, 1 - Math.hypot(P.getX(i), P.getY(i)) / 52), 1.4); C[i * 3] = C[i * 3 + 1] = C[i * 3 + 2] = f * t; } cg.setAttribute('color', new THREE.BufferAttribute(C, 3)); }
  const bm = new THREE.MeshBasicMaterial({ color: 0xffe9a8, vertexColors: true, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const b1 = new THREE.Mesh(cg, bm), b2 = new THREE.Mesh(cg, bm); b2.rotation.y = Math.PI; b1.frustumCulled = b2.frustumCulled = false; b1.renderOrder = b2.renderOrder = 3; sweep.add(b1, b2);
  const spot = new THREE.SpotLight(0xfff0c0, 1100, 90, 0.27, 0.6, 2); spot.position.set(GX, GY + 1.5, 0); const tgt = new THREE.Object3D(); group.add(spot, tgt); spot.target = tgt;
  const aim = (a) => { sweep.rotation.y = a; tgt.position.set(GX + Math.cos(a) * 30, GY - 17, -Math.sin(a) * 30); };
  aim(0);
  const update = (t) => aim((t / 14) * Math.PI * 2);                    // map.update(t, dt) frame hook from game.js: one sweep per 14 s
  return { group, cols, spawn: [0, 0.9, 25], board: { pos: [0, 0, 22.8], ry: 0 }, voidY: -8, radius: 58, sky: 0x070b12, fog: [0x0e1822, 4, 62], hemi: [0x9ab0d8, 0x2a3646, 1.6], sun: null, lights: [], update };
}
