import * as THREE from 'three';
import { Avatar } from './avatar.js';
// Dev-only: renders the monkey front + three-quarter in one canvas (used for the model screenshot).
const W = 1600, H = 800;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H); document.body.appendChild(r.domElement); r.setScissorTest(true);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x2a2f3a);
scene.add(new THREE.HemisphereLight(0xffffff, 0x556070, 1.2)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 3, 4); scene.add(sun);
const q = new URLSearchParams(location.search);
const a = new Avatar(); if (q.get('loadout')) a.setEquip(JSON.parse(q.get('loadout'))); scene.add(a.root);
a.update({ h: [0, 1.6, 0], q: [0, 0, 0, 1], l: [-0.5, 1.0, -0.35], r: [0.45, 1.45, -0.4] }, { dt: 0.016 });
const cams = [[0, 1.3, -2.4], [-1.7, 1.55, -1.9]].map((p) => { const c = new THREE.PerspectiveCamera(32, (W / 2) / H, 0.1, 50); c.position.set(...p); c.lookAt(0, 1.2, 0); return c; });
cams[0].position.set(0, 1.3, -2.4); cams[0].lookAt(0, 1.2, 0); cams[1].position.set(-1.7, 1.55, -1.9); cams[1].lookAt(0, 1.2, 0);
cams.forEach((c, i) => { r.setViewport(i * W / 2, 0, W / 2, H); r.setScissor(i * W / 2, 0, W / 2, H); r.render(scene, c); });
window.__done = true;
