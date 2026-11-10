import * as THREE from 'three';
import { Avatar } from './avatar.js';
// Dev-only: Locust, Yeti (yeti form + human form) side by side.
const W = 1600, H = 700; const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true }); r.setSize(W, H); document.body.appendChild(r.domElement);
const scene = new THREE.Scene(); scene.background = new THREE.Color(0x1b1f29); scene.add(new THREE.HemisphereLight(0xffffff, 0x445066, 1.1)); const d = new THREE.DirectionalLight(0xffffff, 1.5); d.position.set(2, 4, -5); scene.add(d);
const defs = [['locust', 1.45, -3], ['human', 1, 0], ['yeti', 2.6, 3.4]];
for (const [look, sc, x] of defs) { const a = new Avatar(); scene.add(a.root); a.update({ h: [x, 1.6, 0], q: [0, 0, 0, 1], l: [x - 0.5, 1.0, 0.1], r: [x + 0.5, 1.3, 0.1] }, { look, scale: sc, dt: 0.016 }); }
const c = new THREE.PerspectiveCamera(40, W / H, 0.1, 50); c.position.set(0, 3, 14); c.lookAt(0, 2.6, 0); r.render(scene, c); window.__done = true;
