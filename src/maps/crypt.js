import * as THREE from 'three';
import { MapKit } from './kit.js';
export function buildCrypt() {
  const k = new MapKit(11);
  const S = 0x58545e, D = 0x3b3842;
  k.box(0, -3, 0, 70, 3, 70, S); k.box(0, 14, 0, 70, 2, 70, D);
  k.box(0, 0, -35, 70, 14, 2, D); k.box(0, 0, 35, 70, 14, 2, D); k.box(-35, 0, 0, 2, 14, 70, D); k.box(35, 0, 0, 2, 14, 70, D);
  for (let i = -3; i <= 3; i++) for (const sx of [-8, 8]) { k.cyl(sx, 0, i * 8, 0.9, 14, 0x6c6874, true, 8); k.box(sx, 11, i * 8, 2.4, 0.8, 2.4, 0x6c6874); }
  for (const sx of [-30, 30]) { k.box(sx, 5, 0, 8, 0.6, 50, 0x4a4650); for (let z = -22; z <= 22; z += 11) k.box(sx + (sx > 0 ? -3.5 : 3.5), 0, z, 1, 5, 1, 0x5d5964); }
  for (let i = 0; i < 8; i++) k.box(-14 + (i % 2) * 2, i * 1.1, -26 + i * 2.5, 3, 0.7, 2.2, 0x69656f);
  k.box(0, 0, -29, 12, 3, 5, 0x504c58); k.cone(0, 3, -29, 0.6, 3, 0xcfc9b8, 5);
  for (let i = 0; i < 14; i++) { const a = i * 0.9, R = 9 + (i * 3.7 % 18); const x = Math.cos(a) * R, z = Math.sin(a) * R; if (Math.hypot(x, z) < 5) continue; k.box(x, 0, z, 1.6, 0.9 + (i % 3) * 0.4, 3, 0x74707c); k.box(x, 0.9 + (i % 3) * 0.4, z, 1.8, 0.25, 3.2, 0x8a8693); }
  for (let i = 0; i < 12; i++) { const a = i * 0.55, R = 12 + (i % 3) * 5; k.box(Math.cos(a) * R, 3 + (i % 5) * 1.8, Math.sin(a) * R, 3, 0.5, 3, 0x6a6672); }
  for (let i = 0; i < 16; i++) { const a = i * 1.1, R = 4 + (i * 2.9 % 24); const x = Math.cos(a) * R, z = Math.sin(a) * R; k.tilt(new THREE.CylinderGeometry(0.05, 0.05, 6, 4), 0x2b2a2e, x, 11, z); k.glowBall(x, 7.8, z, 0.25, 0xffa94d); }
  for (let i = 0; i < 24; i++) { const a = i * 0.75, R = 3 + (i * 1.7 % 28); k.glowBox(Math.cos(a) * R, 1.1, Math.sin(a) * R, 0.08, 0.3, 0.08, 0xffe28a); }
  for (const [x, z] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) { k.cyl(x, 0, z, 0.5, 1.3, 0x3b3842, true, 6); k.glowBall(x, 1.7, z, 0.5, 0x6bff9a); }
  const { group, cols } = k.finish();
  return { group, cols, spawn: [0, 0.9, 6], board: { pos: [0, 0, 1.5], ry: Math.PI }, voidY: -20, radius: 40,
    sky: 0x07050d, fog: [0x0b0714, 4, 38], hemi: [0x8a90c0, 0x2a1a30, 1.0], sun: null,
    lights: [{ c: 0x6bff9a, i: 14, d: 28, p: [0, 3, 0] }, { c: 0xff9a4d, i: 10, d: 24, p: [0, 8, -20] }] };
}
