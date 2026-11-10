import * as THREE from 'three';
import { MapKit } from './kit.js';
export function buildForest() {
  const k = new MapKit(7);
  k.cyl(0, -3, 0, 52, 3, 0x4f7d3a, true, 24);
  k.cyl(0, 0.01, 0, 3.2, 0.9, 0x8a5a33, true, 14, 3.0);
  const trees = [];
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + 0.2, R = i % 2 ? 15 : 22; trees.push([Math.cos(a) * R, Math.sin(a) * R, 1.1 + (i % 3) * 0.25, 12 + (i % 4) * 2]); }
  for (const [x, z, r, h] of trees) {
    k.cyl(x, 0, z, r + 0.5, h, 0x6b4426, true, 9, r);
    k.cyl(x, h - 1.2, z, 4.2, 0.5, 0x7a5232, true, 12);
    k.ball(x, h + 2.2, z, 4.4, 0x2f8f3d, true, 1);
    k.ball(x + 2.5, h + 0.2, z - 2, 2.4, 0x3aa84a, true, 1);
    for (let j = 0; j < 4; j++) { const a = j * 1.6 + x; k.cyl(x + Math.cos(a) * 3, h * 0.45 + j * 1.8, z + Math.sin(a) * 3, 0.45, 0.3, 0x866038, true, 6); }
  }
  for (let i = 0; i < trees.length; i++) {
    const A = trees[i], B = trees[(i + 1) % trees.length]; const hh = Math.min(A[3], B[3]) - 1.0;
    const mx = (A[0] + B[0]) / 2, mz = (A[1] + B[1]) / 2, len = Math.hypot(A[0] - B[0], A[1] - B[1]);
    const n = Math.max(2, Math.round(len / 2.4));
    for (let s = 1; s < n; s++) { const t = s / n; k.box(A[0] + (B[0] - A[0]) * t, hh, A[1] + (B[1] - A[1]) * t, 2.6, 0.5, 2.6, 0x7a5232); }
    k.tilt(new THREE.BoxGeometry(0.7, 0.5, len), 0x6b4426, mx, hh + 0.25, mz, 0, Math.atan2(B[0] - A[0], B[1] - A[1]), 0);
  }
  for (let i = 0; i < 8; i++) { const a = i * 0.85, R = 8 + (i % 3) * 3; k.ball(Math.cos(a) * R, 1 + (i % 4) * 1.6, Math.sin(a) * R, 1.4 + (i % 2) * 0.5, 0x7d8a73, true, 1); }
  for (let i = 0; i < 14; i++) { const a = i * 0.9 + 0.3, R = 6 + (i * 3.1 % 30); k.cone(Math.cos(a) * R, 0, Math.sin(a) * R, 0.6 + (i % 3) * 0.3, 1.2 + (i % 4) * 0.5, 0x2d6a31, 6); }
  for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2; k.cyl(Math.cos(a) * 44, 0, Math.sin(a) * 44, 2.2, 18 + (i % 3) * 3, 0x4e3320, true, 8); k.ball(Math.cos(a) * 44, 20, Math.sin(a) * 44, 5, 0x24703a, true, 1); }
  for (let i = 0; i < 20; i++) { const a = i * 1.7, R = 5 + (i * 2.3 % 34); k.glowBall(Math.cos(a) * R, 0.25, Math.sin(a) * R, 0.22, i % 2 ? 0xffd34d : 0xff7ad9); }
  const { group, cols } = k.finish();
  return { group, cols, spawn: [0, 0.9, 0], board: { pos: [0, 0, -6.5], ry: 0 }, voidY: -25, radius: 60,
    sky: 0x9fd4ff, fog: [0xbfe3ff, 30, 110], hemi: [0xdfefff, 0x4a6b3a, 1.05], sun: [0xfff2d6, 1.0, [20, 40, 10]], lights: [] };
}
