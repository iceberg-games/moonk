// Be the Monster generators: a valve wheel you grab (squeeze) and turn with a hand. The SERVER owns the fill level
// (shared/defs.mjs GEN_TURNS full clockwise turns = full, anticlockwise drains) and pays 1 Moon once when it fills.
// The client only reads the valve angle from the hand, sends the signed delta ({t:'valve', id, d}, + = clockwise) and
// draws the server's level. Geometry: the generator group faces +z toward the map centre (server sets ry).
import * as THREE from 'three';
import { GEN_TURNS, GEN_GRAB_RANGE } from '../shared/defs.mjs';

const VALVE_Y = 1.15, VALVE_Z = 0.42, GRIP_R = 0.32;   // valve centre in generator-local space, and how close a hand must be to grab it
const mat = (c, e = 0, em = 0x000000) => new THREE.MeshLambertMaterial({ color: c, emissive: em, emissiveIntensity: e });
const M = { body: mat(0x4a4f52), dark: mat(0x23272a), rust: mat(0x8a4b2a), wheel: mat(0xd7b13a, 0.5, 0x6a4a00), knob: mat(0xff4d4d, 0.8, 0x7a0000) };
const _v = new THREE.Vector3(), _l = new THREE.Vector3();

export function createGenerators(scene) {
  const root = new THREE.Group(); root.name = 'generators'; scene.add(root);
  let key = '', gens = [];
  const track = [{ gen: -1, ang: 0 }, { gen: -1, ang: 0 }];   // per hand: which valve it holds + last angle
  let acc = 0, accGen = -1, sendAt = 0;

  function build(list) {
    root.clear(); gens = [];
    for (const g of list) {
      const o = new THREE.Group(); o.position.set(g.x, g.y, g.z); o.rotation.y = g.ry;
      const box = (w, h, d, x, y, z, m) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z); o.add(b); return b; };
      box(1.0, 1.5, 0.7, 0, 0.75, 0, M.body); box(1.1, 0.12, 0.8, 0, 0.06, 0, M.dark); box(0.9, 0.1, 0.6, 0, 1.55, 0, M.rust);
      // fill gauge: a glowing column that grows with the server's level
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1, 10), new THREE.MeshBasicMaterial({ color: 0xff4040 })); tube.position.set(-0.3, 0.2, 0.42); tube.scale.y = 0.001; o.add(tube);
      const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.1, 10), M.dark); rail.position.set(-0.3, 0.75, 0.3); o.add(rail); o.remove(tube); o.add(tube);   // tube drawn after the rail so it shows inside
      // valve wheel (turns about the local z axis)
      const wheel = new THREE.Group(); wheel.position.set(0.12, VALVE_Y, VALVE_Z);
      wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.03, 8, 20), M.wheel));
      for (let i = 0; i < 3; i++) { const s = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.04, 0.04), M.wheel); s.rotation.z = i * Math.PI / 3; wheel.add(s); }
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), M.knob); knob.position.set(0.22, 0, 0.04); wheel.add(knob);
      o.add(wheel); o.updateMatrixWorld(true);
      root.add(o);
      gens.push({ g, o, tube, wheel, p: 0, shown: 0, done: false });
    }
  }
  const valveWorld = (e, out) => out.set(0.12, VALVE_Y, VALVE_Z).applyMatrix4(e.o.matrixWorld);

  return {
    /** call every frame. room: S.room; gp: latest per-generator progress array; hands: world hand vectors; grip: [bool,bool]; send(msg) */
    update(dt, { active, room, gp, hands, grip, send, now }) {
      const k = active && room?.gens?.length ? `${room.code}:${room.round}:${room.gens.map((g) => g.id).join()}` : '';
      if (k !== key) { key = k; build(k ? room.gens : []); }
      if (!k) return;
      for (let i = 0; i < gens.length; i++) { const e = gens[i]; const p = gp?.[i] ?? room.gens[i].p ?? 0; e.p = p; if (p >= 0.999 && !e.done) e.done = true; }
      for (let h = 0; h < 2; h++) {
        const t = track[h]; let hit = -1;
        if (grip[h]) for (let i = 0; i < gens.length; i++) { const e = gens[i]; if (e.done) continue; valveWorld(e, _v); if (_v.distanceTo(hands[h]) < GRIP_R) { hit = i; break; } }
        if (hit < 0) { t.gen = -1; continue; }
        const e = gens[hit]; _l.copy(hands[h]); e.o.worldToLocal(_l);
        const ang = Math.atan2(_l.y - VALVE_Y, _l.x - 0.12);
        if (t.gen === hit) { let da = ang - t.ang; if (da > Math.PI) da -= 2 * Math.PI; if (da < -Math.PI) da += 2 * Math.PI; if (accGen !== hit) { acc = 0; accGen = hit; } acc += -da; }   // visual anticlockwise = +angle, so clockwise delta is -da
        t.gen = hit; t.ang = ang;
      }
      if (accGen >= 0 && now - sendAt > 100) { if (Math.abs(acc) > 0.002) send({ t: 'valve', id: gens[accGen].g.id, d: +acc.toFixed(4) }); acc = 0; accGen = -1; sendAt = now; }
      for (const e of gens) {
        e.shown += (e.p - e.shown) * Math.min(1, dt * 10);
        e.wheel.rotation.z = -e.shown * GEN_TURNS * Math.PI * 2;
        e.tube.scale.y = Math.max(0.001, e.shown * 1.0); e.tube.position.y = 0.2 + e.shown * 0.5 - 0.0;
        e.tube.material.color.setHSL(e.done ? 0.33 : 0.02 + e.shown * 0.25, 1, e.done ? 0.55 : 0.5);
      }
    },
    holding() { return track[0].gen >= 0 || track[1].gen >= 0; },
    gens() { return gens; },
    GRAB: GEN_GRAB_RANGE,
  };
}
