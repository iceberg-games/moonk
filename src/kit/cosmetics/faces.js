import * as THREE from 'three';
import { box, cyl, glowMat, sphere, starMesh, stdMat, torus } from '../geom.js';

export function buildMustache() {
  const root = new THREE.Group();
  root.name = 'face_mustache';
  const hair = stdMat(0x2a1c14);
  // Handlebar: two mirrored arcs of boxes under the snout
  for (const sx of [-1, 1]) {
    const segs = 5;
    for (let i = 0; i < segs; i++) {
      const t = i / (segs - 1);
      const x = sx * (0.025 + t * 0.09);
      const y = -0.055 - Math.sin(t * Math.PI) * 0.02 - (t > 0.7 ? (t - 0.7) * 0.08 : 0);
      const z = 0.02 + Math.sin(t * 1.2) * 0.01;
      const w = 0.03 - t * 0.008;
      const m = box(hair, w, 0.018, 0.022, x, y, z, 0, 0, sx * -t * 0.6);
      root.add(m);
    }
  }
  return root;
}

export function buildBandit() {
  const root = new THREE.Group();
  root.name = 'face_bandit';
  const cloth = stdMat(0x1a1f2e);
  const stitch = stdMat(0xc9b89a);
  // Wraparound eye mask
  const mask = box(cloth, 0.28, 0.09, 0.1, 0, 0.01, 0.0);
  mask.scale.set(1, 1, 0.7);
  root.add(mask);
  // Side ties
  root.add(box(cloth, 0.06, 0.04, 0.06, 0.16, 0.01, -0.04, 0, 0.4, 0));
  root.add(box(cloth, 0.06, 0.04, 0.06, -0.16, 0.01, -0.04, 0, -0.4, 0));
  // Eye slits
  for (const sx of [-1, 1]) {
    root.add(box(stdMat(0x0a0c12), 0.07, 0.03, 0.04, sx * 0.055, 0.012, 0.045));
  }
  root.add(box(stitch, 0.02, 0.012, 0.012, 0, -0.03, 0.05));
  return root;
}

export function buildStarShades() {
  const root = new THREE.Group();
  root.name = 'face_star_shades';
  const frame = stdMat(0xe6c35c, { metalness: 0.45, roughness: 0.4 });
  const lens = stdMat(0x1a1030, { metalness: 0.2, roughness: 0.3, side: THREE.DoubleSide });
  for (const sx of [-1, 1]) {
    const star = starMesh(lens, 0.07, 0.03, 0.018);
    star.position.set(sx * 0.075, 0.015, 0.02);
    root.add(star);
    const rim = starMesh(frame, 0.078, 0.036, 0.01);
    rim.position.set(sx * 0.075, 0.015, 0.02);
    rim.scale.set(1.08, 1.08, 0.5);
    root.add(rim);
  }
  root.add(box(frame, 0.04, 0.014, 0.014, 0, 0.02, 0.02));
  // Temples
  root.add(box(frame, 0.08, 0.012, 0.012, 0.14, 0.015, -0.02, 0, 0.5, 0));
  root.add(box(frame, 0.08, 0.012, 0.012, -0.14, 0.015, -0.02, 0, -0.5, 0));
  return root;
}

export function buildMonocle() {
  const root = new THREE.Group();
  root.name = 'face_monocle';
  // Sit the rim on the right eye (closer, slightly under the brow) with a
  // nose pad and a chain that arcs back to the ear, not a dangling handle.
  const gold = stdMat(0xb08d4f, { metalness: 0.4, roughness: 0.42 });
  const lens = stdMat(0xa8d8e8, { roughness: 0.22, metalness: 0.08, transparent: true, opacity: 0.4, side: THREE.DoubleSide });
  const cx = 0.058, cy = 0.012, cz = 0.012;
  root.add(torus(gold, 0.052, 0.012, 8, 5, cx, cy, cz));
  root.add(cyl(lens, 0.046, 0.046, 0.008, 8, cx, cy, cz, Math.PI / 2, 0, 0));
  // Nose rest toward the bridge
  root.add(box(gold, 0.02, 0.014, 0.016, cx - 0.055, cy - 0.018, cz + 0.004, 0, 0, 0.4));
  // Hinge nub at the outer rim
  root.add(sphere(gold, 0.012, 5, 4, cx + 0.052, cy - 0.004, cz));
  for (let i = 0; i < 6; i++) {
    const t = (i + 1) / 6;
    const x = cx + 0.05 + t * 0.07;
    const y = cy - 0.01 - Math.sin(t * Math.PI) * 0.045 - t * 0.02;
    const z = cz - t * 0.1;
    root.add(cyl(gold, 0.009, 0.009, 0.016, 5, x, y, z, 0, 0, t * 0.6));
  }
  return root;
}

export function buildSnorkel() {
  const root = new THREE.Group();
  root.name = 'face_snorkel';
  const rubber = stdMat(0x1f6ebd);
  const pale = stdMat(0xcfe9f5, { roughness: 0.35, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
  // Sit the mask on the bigger muzzle (was floating a disc in front of the face)
  const mask = cyl(rubber, 0.1, 0.1, 0.05, 8, 0, -0.025, 0.0, Math.PI / 2, 0, 0, true);
  mask.scale.set(1.2, 0.85, 1);
  root.add(mask);
  const glass = cyl(pale, 0.082, 0.082, 0.012, 8, 0, -0.025, 0.018, Math.PI / 2, 0, 0);
  glass.scale.set(1.2, 0.85, 1);
  root.add(glass);
  root.add(box(stdMat(0x17324d), 0.24, 0.022, 0.035, 0, -0.025, -0.05));
  const tube = stdMat(0xf5c518);
  root.add(cyl(tube, 0.016, 0.016, 0.13, 6, -0.125, 0.06, 0.015));
  const bend = torus(tube, 0.028, 0.016, 6, 4, -0.125, 0.125, -0.01, 0, 0, Math.PI / 2);
  bend.rotation.y = Math.PI / 2;
  root.add(bend);
  root.add(cyl(stdMat(0x1a1f2e), 0.02, 0.018, 0.028, 6, -0.125, 0.125, -0.04, Math.PI / 2, 0, 0));
  return root;
}

export function buildHudVisor() {
  const root = new THREE.Group();
  root.name = 'face_hud_visor';
  // Matte smoked pane — no emissive glow. Sits under the brow, closer to the face.
  const glass = stdMat(0x2f6e6a, { roughness: 0.32, metalness: 0.12, transparent: true, opacity: 0.62, side: THREE.DoubleSide });
  const frame = stdMat(0x1a1f2e, { metalness: 0.3, roughness: 0.5 });
  for (let i = -1; i <= 1; i++) {
    const pane = box(glass, 0.1, 0.05, 0.012, i * 0.09, 0.01, 0.02 + (i === 0 ? 0.01 : 0), 0, -i * 0.38, 0);
    root.add(pane);
  }
  root.add(box(frame, 0.3, 0.01, 0.018, 0, 0.038, 0.022));
  root.add(box(frame, 0.3, 0.01, 0.018, 0, -0.018, 0.022));
  root.add(box(frame, 0.08, 0.014, 0.014, 0.16, 0.01, -0.03, 0, 0.55, 0));
  root.add(box(frame, 0.08, 0.014, 0.014, -0.16, 0.01, -0.03, 0, -0.55, 0));
  return root;
}

export const FACE_BUILDERS = {
  face_mustache: buildMustache,
  face_bandit: buildBandit,
  face_star_shades: buildStarShades,
  face_monocle: buildMonocle,
  face_snorkel: buildSnorkel,
  face_hud_visor: buildHudVisor,
};
