// Node unit test for src/physics.js locomotion (no browser): frame-rate independence, sticking, tunnelling, climbing, sliding.
import * as THREE from 'three';
import { Locomotion, LOCO } from '../src/physics.js';
let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x ? '  ' + x : '')); if (!c) fails++; };
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const floor = { k: 'box', min: [-50, -5, -50], max: [50, 0, 50] };
const wall = { k: 'box', min: [-50, 0, -3.04], max: [50, 20, -3] };              // 4 cm thin wall at z=-3 (tunnel test)
const slab = { k: 'box', min: [-2, 0, -6], max: [2, 12, -5] };                  // thick climbable wall facing +z
function run(hz, cols, tEnd, hands, opt = {}) {
  const L = new Locomotion(), rp = opt.rp || V(0, -0.95, 0), dt = 1 / hz; let t = 0; const head = V(0, 1.6, 0); const log = [];
  for (let i = 0; t < tEnd - 1e-9; i++, t += dt) { const h = hands(t); L.step(dt, cols, rp, opt.head ? opt.head(t) : head, h); log.push({ t, y: rp.y, z: rp.z, v: L.vel.clone(), touch: [...L.touch] }); }
  return { L, rp, log };
}
const hang = (t) => [V(-0.25, 1.0, -0.1), V(0.25, 1.0, -0.1)];   // arms hanging, hands resting on the floor
const up = () => [V(-0.25, 1.5, -0.1), V(0.25, 1.5, -0.1)];       // hands held away from everything
// 1. rest on floor
for (const hz of [72, 90, 120]) { const r = run(hz, [floor], 3, hang); ok(Math.abs(r.rp.y + 1.6 - 0.65) < 0.03, `rests with head ${(r.rp.y + 1.6).toFixed(3)} m above floor @${hz}Hz`); }
// 2. push-off stroke: hands lift then swing down onto the floor then release upward; compare launch speed across rates
const stroke = (t) => { const y = t < 0.5 ? 0.9 : t < 0.7 ? 0.9 + 0.45 * Math.min(1, (t - 0.5) / 0.1) : t < 0.8 ? 1.35 - 0.7 * (t - 0.7) / 0.1 : 0.65 + 2 * (t - 0.8); const yy = t >= 0.8 ? Math.min(2, y) : y; return [V(-0.25, yy, -0.3), V(0.25, yy, -0.3)]; };
const apex = {}; for (const hz of [72, 90, 120]) { const r = run(hz, [floor], 2.5, stroke); apex[hz] = Math.max(...r.log.map((l) => l.y)); const vmax = Math.max(...r.log.map((l) => l.v.y)); apex['v' + hz] = vmax; }
console.log('  apex rig y @72/90/120:', apex[72].toFixed(3), apex[90].toFixed(3), apex[120].toFixed(3), ' peak vy:', apex.v72.toFixed(2), apex.v90.toFixed(2), apex.v120.toFixed(2));
ok(Math.max(apex[72], apex[90], apex[120]) - Math.min(apex[72], apex[90], apex[120]) < 0.12, 'push-off height matches across 72/90/120 Hz (<12 cm spread)');
ok(Math.max(apex.v72, apex.v90, apex.v120) <= LOCO.maxJumpSpeed + 0.05, 'jump speed capped at maxJumpSpeed ' + LOCO.maxJumpSpeed);
ok(apex[90] > -0.95 + 0.3, 'push-off actually lifts the body');
// 3. tunnelling: a hand swings 0.8 m through a 4 cm wall in 0.04 s (20 m/s)
for (const hz of [72, 90, 120]) {
  const swing = (t) => [V(-0.25, 1.5, -0.1 - 1.0 * Math.min(1, t / 0.04)), V(0.25, 1.5, -0.1)];
  const rp = V(0, -0.95, -1.9); const r = run(hz, [floor, wall], 0.12, swing, { rp }); const hw = rp.z + (-1.1);   // unclamped hand world z at the end
  ok(hw > -3 + 0.05, `fast hand does not tunnel through a 4 cm wall @${hz}Hz`, `hand z=${hw.toFixed(3)} (wall at -3), body pushed back to z=${rp.z.toFixed(2)}`);
}
// 4. wall climb: alternate hands. The pulling hand sits on the wall and drops 0.5 m, the other hand is off the wall while it reaches back up.
{
  const hands = (t) => { const ph = (t * 1.4) % 1; const u = (ph % 0.5) / 0.5; const first = ph < 0.5;
    const pull = V(0, 1.55 - 0.5 * u, -0.78), reach = V(0, 1.05 + 0.5 * u, -0.5);    // reach moves up (off the wall) while pull moves down (on the wall)
    return first ? [pull.clone().setX(-0.25), reach.clone().setX(0.25)] : [reach.clone().setX(-0.25), pull.clone().setX(0.25)]; };
  for (const hz of [72, 90, 120]) { const r = run(hz, [slab], 4, hands, { rp: V(0, 0.5, -4.2) }); const dy = r.rp.y - 0.5; ok(dy > 1.2, `wall climb rises ${dy.toFixed(2)} m in 4 s @${hz}Hz`); }
}
// 5. slope sliding: steep 70 deg wedge approximated by a tilted... use a sphere (normals vary): body resting on top of a ball should roll off sideways
{ const ball = { k: 'sph', x: 0, y: -2, z: 0, r: 2.65 }; const L = new Locomotion(); const rp = V(0.9, 0.2, 0); for (let i = 0; i < 360; i++) L.step(1 / 90, [ball], rp, V(0, 1.6, 0), up());
  ok(Math.hypot(rp.x, rp.z) > 1.4 || rp.y < -0.5, 'body slides off a steep curved surface', `x=${rp.x.toFixed(2)} y=${rp.y.toFixed(2)}`);
  const ice = { k: 'box', min: [-50, -5, -50], max: [50, 0, 50], slip: 1 }; const L2 = new Locomotion(); const rp2 = V(0, -0.95, 0); L2.vel.set(3, 0, 0); for (let i = 0; i < 90; i++) L2.step(1 / 90, [ice], rp2, V(0, 1.6, 0), up());
  const L3 = new Locomotion(); const rp3 = V(0, -0.95, 0); L3.vel.set(3, 0, 0); for (let i = 0; i < 90; i++) L3.step(1 / 90, [floor], rp3, V(0, 1.6, 0), up());
  ok(rp2.x > rp3.x * 2, `slippery floor slides farther than grippy floor (${rp2.x.toFixed(2)} m vs ${rp3.x.toFixed(2)} m)`); }
// 6. head cannot pass through a wall
{ const L = new Locomotion(); const rp = V(0, -0.95, -1); for (let i = 0; i < 90; i++) L.step(1 / 90, [floor, wall], rp, V(0, 1.6, -3 * (i / 90)), hang());   // player physically walks 3 m into the wall
  ok(rp.z - 3 * 89 / 90 > -3 + 0.19, `head stopped by wall (head z=${(rp.z - 3 * 89 / 90).toFixed(2)})`); }
// 7. snappy tuning (hour-1 retune): skid, low drag, wall-kick bonus, hard swing counts at its peak
{ const L = new Locomotion(); const rp = V(0, -0.95, 0); L.vel.set(6, 0, 0); for (let i = 0; i < 360; i++) L.step(1 / 90, [floor], rp, V(0, 1.6, 0), up());
  ok(rp.x > 2 && rp.x < 4.5, `6 m/s skids ${rp.x.toFixed(2)} m on the floor instead of stopping dead`);
  const L2 = new Locomotion(); const rp2 = V(0, 10, 0); L2.vel.set(6, 0, 0); for (let i = 0; i < 90; i++) L2.step(1 / 90, [floor], rp2, V(0, 1.6, 0), up());
  ok(L2.vel.x > 5.8, `air drag is tiny: 6 m/s -> ${L2.vel.x.toFixed(2)} m/s after 1 s`);
  // wall kick vs floor push with the same hand stroke (hand moves 0.55 m into the surface in 0.1 s, then lets go)
  const kick = (cols, rp0, wall, setup) => { const L = new Locomotion(); setup?.(L); const rp = rp0.clone(); const dt = 1 / 90; const H = (d) => (wall ? [V(-0.25, 1.4, -0.4 - 0.55 * d), V(0.25, 1.4, -0.4 - 0.55 * d)] : [V(-0.25, 1.5 - 0.6 * d, -0.1), V(0.25, 1.5 - 0.6 * d, -0.1)]);
    for (let i = 0; i < 270; i++) { const t = i * dt; const d = t < 0.3 ? 0 : t < 0.4 ? (t - 0.3) / 0.1 : t < 0.45 ? 1 : -1; const hh = d < 0 ? [V(-0.25, 1.9, -0.2), V(0.25, 1.9, -0.2)] : H(d); L.step(dt, cols, rp, V(0, 1.6, 0), hh); if (t > 0.5) break; }
    return L.vel.length(); };
  const wk = kick([slab], V(0, 5, -4.2), true), fk = kick([floor], V(0, -0.95, 0), false); console.log('  release speed  wall push', wk.toFixed(2), ' floor push', fk.toFixed(2));
  ok(wk > 3 && fk > 3, 'both strokes launch the body'); const b0 = LOCO.wallPushBonus; LOCO.wallPushBonus = 1; const wk1 = kick([slab], V(0, 5, -4.2), true); LOCO.wallPushBonus = b0; ok(wk > wk1 * 1.1, `wall-kick bonus applies (${wk1.toFixed(2)} -> ${wk.toFixed(2)} m/s)`);
  // hour 3: Wailer Shriek halves the release speed (loco.gain 0.5); Dangler Reel stun blocks grabbing for its duration
  { const full = kick([floor], V(0, -0.95, 0), false), half = kick([floor], V(0, -0.95, 0), false, (L) => { L.gain = 0.5; }), stunned = kick([floor], V(0, -0.95, 0), false, (L) => { L.stun = 0.5; });
    ok(Math.abs(half / full - 0.5) < 0.08, `shriek: gain 0.5 halves the push-off (${full.toFixed(2)} -> ${half.toFixed(2)} m/s)`);
    ok(stunned < full * 0.3, `reel stun: a stroke made during the 0.5 s stun launches nothing (${stunned.toFixed(2)} vs ${full.toFixed(2)} m/s)`); } }
// hour 4: Lurker cling (surface crawl, gravity off) and Stringman tether (soft leash)
{ const L = new Locomotion(), rp = V(0, 0, -4.3), hl = V(0, 1.6, 0); for (let i = 0; i < 90; i++) L.cling(1 / 90, [floor, slab], rp, hl, [0, -1], 0, 3);
  const hy = rp.y + 1.6, dz = rp.z + 0; ok(L.clinging && hy > 4.2 && hy < 5.0, `cling: stick-forward climbs a wall at ~3 m/s (head y ${hy.toFixed(2)} after 1 s)`);
  ok(Math.abs((rp.z) - -4.3) < 0.5 && rp.z > -5 + 0.2, `cling: stays off the wall surface (head z ${rp.z.toFixed(2)})`);
  const L2 = new Locomotion(), rp2 = V(0, 0, -4.3); for (let i = 0; i < 90; i++) L2.cling(1 / 90, [floor, slab], rp2, hl, [0, 0], 0, 3); ok(Math.abs(rp2.y) < 0.05, 'cling: holds still on the wall with no stick (no sliding down)');
  const ceil = { k: 'box', min: [-50, 4, -50], max: [50, 5, 50] }; const L3 = new Locomotion(), rp3 = V(0, 2.2, 0), hl3 = V(0, 1.6, 0); for (let i = 0; i < 90; i++) L3.cling(1 / 90, [ceil], rp3, hl3, [0, -1], 0, 3);
  ok(Math.abs(rp3.z - -3) < 0.4 && rp3.y + 1.6 > 3.5 && rp3.y + 1.6 < 3.9, `cling: crawls along a ceiling (moved ${(-rp3.z).toFixed(2)} m, head y ${(rp3.y + 1.6).toFixed(2)} under a y=4 ceiling)`);
  const L4 = new Locomotion(), rp4 = V(0, 20, 0); for (let i = 0; i < 45; i++) L4.cling(1 / 90, [floor], rp4, hl, [0, 0], 0, 3); ok(!L4.clinging && rp4.y < 20, 'cling: nothing within reach -> falls normally');
  const T = new Locomotion(), rpT = V(0, 0, 0); T.leash = { o: V(0, 1.6, 0), r: 2.5, t: 2.5 }; let mx = 0; for (let i = 0; i < 180; i++) { T.vel.set(6, 0, 0); T.step(1 / 90, [floor], rpT, hl, [V(-0.3, 1, -0.3), V(0.3, 1, -0.3)]); mx = Math.max(mx, rpT.x); }
  ok(mx < 3.2 && mx > 2.3, `tether: soft leash holds the head within ~2.5 m of the anchor while running away (max ${mx.toFixed(2)} m)`);
  const U = new Locomotion(), rpU = V(0, 0, 0); U.leash = { o: V(0, 1.6, 0), r: 2.5, t: 0.3 }; for (let i = 0; i < 90; i++) { U.vel.set(6, 0, 0); U.step(1 / 90, [floor], rpU, hl, [V(-0.3, 1, -0.3), V(0.3, 1, -0.3)]); } ok(U.leash === null && rpU.x > 4, `tether: the leash expires (free again, x ${rpU.x.toFixed(2)})`); }
console.log(fails ? `${fails} FAILED` : 'LOCO ALL PASSED'); process.exit(fails ? 1 : 0);
