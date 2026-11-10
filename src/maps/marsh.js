import * as THREE from 'three';
import { MapKit } from './kit.js';
export function buildMarsh() {
  const k = new MapKit(23);
  k.cyl(0, -3, 0, 55, 3, 0x2e3a2a, true, 24);
  for (let i = 0; i < 10; i++) { const a = i * 0.9; k.cyl(Math.cos(a) * (14 + (i % 3) * 8), 0.01, Math.sin(a) * (14 + (i % 3) * 8), 5 + (i % 2) * 2, 0.05, 0x1d3b3a, false, 12); }
  k.box(-14, 0, -12, 10, 4, 8, 0x4a3a2c); k.box(-14, 4, -12, 11, 0.5, 9, 0x2f2620);
  k.tilt(new THREE.ConeGeometry(7.2, 3, 4), 0x2a211c, -14, 5.9, -12, 0, Math.PI / 4, 0);
  k.box(-14, 4.5, -12, 4, 2.4, 3, 0x2a211c);
  k.glowBox(-14, 1.6, -7.9, 1.4, 1.1, 0.1, 0xffb347);
  k.box(-20, 0, -6, 3, 1, 3, 0x4a3a2c); k.box(-11, 0, -6, 4, 0.5, 2, 0x3a2e24);
  for (let i = 0; i < 8; i++) k.box(14 + i * 2.2, 0.8, 10, 2, 0.3, 3, 0x5b4630);
  for (let i = 0; i < 8; i += 2) for (const dz of [-1.4, 1.4]) k.cyl(14 + i * 2.2, 0, 10 + dz, 0.2, 0.9, 0x3a2e24, true, 5);
  for (let i = 0; i < 16; i++) {
    const a = i * 0.62 + 0.4, R = 8 + (i * 5.3 % 34); const x = Math.cos(a) * R, z = Math.sin(a) * R; if (Math.hypot(x + 14, z + 12) < 9 || Math.hypot(x - 22, z - 10) < 8) continue;
    const h = 9 + (i % 5) * 2; k.cyl(x, 0, z, 0.9, h, 0x3b3128, true, 7, 0.45);
    for (let j = 0; j < 3; j++) { const b = i + j * 2.1, bh = 3.5 + j * 2.6; if (bh < h) k.box(x + Math.cos(b) * 2, bh, z + Math.sin(b) * 2, 3.4, 0.35, 0.6, 0x3b3128); }
    k.ball(x, h + 0.5, z, 1.7, 0x25392d, true, 0);
  }
  for (let i = 0; i < 12; i++) { const x = 6 + (i % 4) * 2.2, z = 14 + Math.floor(i / 4) * 2.4; k.box(x, 0, z, 1, 1.2 + (i % 3) * 0.3, 0.3, 0x6f7774); }
  for (let i = 0; i < 10; i++) { const a = i * 0.628; k.cyl(Math.cos(a) * 6.5, 0, Math.sin(a) * 6.5 - 3, 0.5, 2.5 + (i % 3), 0x77817b, true, 5); }
  for (let i = 0; i < 18; i++) { const a = i * 1.37, R = 5 + (i * 3.3 % 38); k.glowBall(Math.cos(a) * R, 1.5 + (i % 4) * 0.9, Math.sin(a) * R, 0.22, i % 3 ? 0x8cffd0 : 0xb0ff60); }
  for (const [x, z] of [[-3, -5], [4, 5]]) { k.cyl(x, 0, z, 0.15, 3, 0x2b241f, true, 5); k.glowBall(x, 3.2, z, 0.3, 0xffb347); }
  for (let i = 0; i < 26; i++) { const a = i / 26 * Math.PI * 2; k.cyl(Math.cos(a) * 50, 0, Math.sin(a) * 50, 2.4, 24, 0x2a231e, true, 7); }
  const { group, cols } = k.finish();
  return { group, cols, spawn: [0, 0.9, 2], board: { pos: [0, 0, -3.5], ry: 0 }, voidY: -25, radius: 58,
    sky: 0x0a1210, fog: [0x13201c, 3, 44], hemi: [0x9fbdb8, 0x2c3a2f, 0.95], sun: [0x8fb0ff, 0.35, [-10, 30, 10]],
    lights: [{ c: 0xffb347, i: 8, d: 16, p: [-14, 2, -7] }, { c: 0x8cffd0, i: 6, d: 22, p: [4, 3, 8] }] };
}
