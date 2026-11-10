import * as THREE from 'three';
import { MapKit } from './maps/kit.js';
// The lobby hub: spawn plaza facing a computer terminal; walk-through portals behind the spawn.
export const HUB_SPAWN = [0, 0.9, 10];
export const TERMINAL = { pos: [0, 1.55, 5.2] };
export const PORTALS = [
  { id: 'play',   label: 'PLAY',            sub: 'Quick play', color: 0x6bff9a, x: -10 },
  { id: 'normal', label: 'NORMAL',          sub: 'Infection tag', color: 0x4fb3ff, x: -6 },
  { id: 'horror', label: 'BE THE MONSTER',  sub: 'Horror mode', color: 0xff4d4d, x: -2 },
  { id: 'forest', label: 'CANOPY FOREST',   sub: 'Vote map', color: 0x59d65f, x: 2, map: 'forest' },
  { id: 'crypt',  label: 'HAUNTED CRYPT',   sub: 'Vote map', color: 0xb06bff, x: 6, map: 'crypt' },
  { id: 'marsh',  label: 'HOLLOW MARSH',    sub: 'Vote map', color: 0x7fe0c0, x: 10, map: 'marsh' },
].map((p) => ({ ...p, pos: [p.x, 0, 17 - Math.abs(p.x) * 0.15] }));
export function buildHub() {
  const k = new MapKit(5);
  k.cyl(0, -3, 8, 34, 3, 0x5f8f48, true, 28);                       // ground
  k.cyl(0, 0.01, 10, 4.5, 0.12, 0xc9b28a, true, 20);                // spawn pad
  k.cyl(0, 0.01, 5.2, 1.2, 0.4, 0x8a5a33, true, 14);               // terminal stump base
  k.box(0, 0, 5.2, 2.6, 0.5, 0.5, 0x6b4426);
  for (let i = 0; i < 20; i++) { const a = i / 20 * Math.PI * 2, R = 30; k.cyl(Math.cos(a) * R, 0, 8 + Math.sin(a) * R, 1.3, 10 + (i % 3) * 3, 0x6b4426, true, 8); k.ball(Math.cos(a) * R, 12 + (i % 3) * 3, 8 + Math.sin(a) * R, 4, 0x2f8f3d, true, 1); }
  for (let i = 0; i < 9; i++) { const a = i * 0.9, R = 7 + (i % 3) * 2.5; k.ball(Math.cos(a) * R * 1.4, 0.8 + (i % 3) * 1.1, 6 + Math.sin(a) * R, 1.1 + (i % 2) * 0.4, 0x7d8a73, true, 1); }
  for (let i = 0; i < 14; i++) { const a = i * 1.9, R = 4 + (i * 2.7 % 22); k.glowBall(Math.cos(a) * R, 0.25, 8 + Math.sin(a) * R * 0.9, 0.2, i % 2 ? 0xffd34d : 0xff7ad9); }
  for (const p of PORTALS) { k.cyl(p.pos[0] - 1.6, 0, p.pos[2], 0.25, 3.6, 0x555b66, true, 6); k.cyl(p.pos[0] + 1.6, 0, p.pos[2], 0.25, 3.6, 0x555b66, true, 6); }
  const { group, cols } = k.finish();
  const portals = [];
  for (const p of PORTALS) {
    const g = new THREE.Group(); g.position.set(p.pos[0], 1.8, p.pos[2]); g.rotation.y = Math.PI;       // face the spawn
    g.add(new THREE.Mesh(new THREE.TorusGeometry(1.55, 0.09, 8, 36), new THREE.MeshBasicMaterial({ color: p.color })));
    const disc = new THREE.Mesh(new THREE.CircleGeometry(1.5, 28), new THREE.MeshBasicMaterial({ color: p.color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false })); g.add(disc);
    group.add(g); portals.push({ ...p, group: g, disc });
  }
  return { group, cols, spawn: HUB_SPAWN, voidY: -20, radius: 60, portals, sky: 0xffc98a, fog: [0xffd9a8, 40, 120], hemi: [0xfff1dd, 0x4a6b3a, 1.05], sun: [0xffe2b0, 0.9, [-20, 30, 20]], lights: [],
    zones: [{ name: 'Portal Arc', test: (x, z) => z > 13 }, { name: 'Terminal Plaza', test: (x, z) => z > 3.5 }, { name: 'Moonk Forest Edge', test: () => true }] };
}
