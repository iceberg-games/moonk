import * as THREE from 'three';
import { Avatar } from './avatar.js';
// ?equipN={json loadout} dresses slot N.
// Dev-only turntable/line-up of monster looks. ?looks=locust:1.45,yeti:2.6,gulper:1.3:1,grinner:1.5  (look:scale[:abilityState]); ?dark=1 = crypt-like lighting; ?ry=0.6 yaw.
const Q = new URLSearchParams(location.search); const dark = Q.get('dark') === '1'; const W = Number(Q.get('w') || 1600), H = Number(Q.get('h') || 700);
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(dark ? 0x07080c : 0x1b1f29);
if (dark) { scene.fog = new THREE.Fog(0x07080c, 6, 18); scene.add(new THREE.HemisphereLight(0x6a6f90, 0x120a14, 0.55)); const pl = new THREE.PointLight(0xffa860, 40, 14, 2); pl.position.set(-3, 3.5, 4); scene.add(pl); }
else { scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.1)); const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(2, 4, -5); scene.add(d); }
const list = (Q.get('looks') || 'monkey:1:0,yeti:2.6:0').split(',').map((s) => s.split(':')); const n = list.length; const ry = Number(Q.get('ry') || 0);
const avs = [];
list.forEach(([look, sc, ab], i) => { const a = new Avatar(); scene.add(a.root); if (Q.get('equip' + i)) a.setEquip(JSON.parse(Q.get('equip' + i))); const x = (i - (n - 1) / 2) * (Number(Q.get('gap') || 3.2)); avs.push({ a, look, sc: Number(sc || 1), ab: Number(ab || 0), x }); });
const c = new THREE.PerspectiveCamera(40, W / H, 0.1, 50); c.position.set(0, Number(Q.get('cy') || 2.2), Number(Q.get('cz') || 9)); c.lookAt(0, Number(Q.get('ty') || 2.0), 0);
function draw() { for (const { a, look, sc, ab, x } of avs) { const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI + ry); a.update({ h: [x, 1.6, 0], q: q.toArray(), l: [x + 0.55, 1.0, -0.35], r: [x - 0.55, 1.35, -0.35] }, { look, scale: sc, ab, dt: 0.05, time: Number(Q.get('time') || 1.0), reel: Number(Q.get('reel') || 9) }); } r.render(scene, c); }
for (let i = 0; i < Number(Q.get('n') || 30); i++) draw(); window.__done = true;
