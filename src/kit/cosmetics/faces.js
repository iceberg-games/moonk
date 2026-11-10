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
  const gold = stdMat(0xe6c35c, { metalness: 0.55, roughness: 0.35 });
  const lens = stdMat(0xa8d8e8, { roughness: 0.15, metalness: 0.1, transparent: true, opacity: 0.45, side: THREE.DoubleSide });
  root.add(torus(gold, 0.05, 0.01, 8, 4, 0.055, 0.02, 0.03));
  const glass = cyl(lens, 0.045, 0.045, 0.006, 8, 0.055, 0.02, 0.03, Math.PI / 2, 0, 0);
  root.add(glass);
  // Chain drooping toward the right cheek / ear (boxes stay well under budget)
  for (let i = 0; i < 6; i++) {
    const t = (i + 1) / 6;
    const x = 0.09 + t * 0.08;
    const y = 0.02 - t * 0.1 - Math.sin(t * Math.PI) * 0.02;
    const z = 0.02 - t * 0.06;
    root.add(box(gold, 0.014, 0.014, 0.014, x, y, z));
  }
  return root;
}

export function buildSnorkel() {
  const root = new THREE.Group();
  root.name = 'face_snorkel';
  const rubber = stdMat(0x1f6ebd);
  const pale = stdMat(0xcfe9f5, { roughness: 0.3, transparent: true, opacity: 0.5, side: THREE.DoubleSide });
  const mask = cyl(rubber, 0.11, 0.11, 0.06, 8, 0, 0.0, 0.02, Math.PI / 2, 0, 0, true);
  mask.scale.set(1.05, 0.7, 1);
  root.add(mask);
  const glass = cyl(pale, 0.09, 0.09, 0.012, 8, 0, 0.0, 0.04, Math.PI / 2, 0, 0);
  glass.scale.set(1.05, 0.7, 1);
  root.add(glass);
  // Strap
  root.add(box(stdMat(0x17324d), 0.22, 0.025, 0.04, 0, 0.0, -0.04));
  // Tube up the left side
  const tube = stdMat(0xf5c518);
  root.add(cyl(tube, 0.018, 0.018, 0.16, 6, -0.11, 0.1, 0.04));
  const bend = torus(tube, 0.03, 0.018, 6, 4, -0.11, 0.18, 0.01, 0, 0, Math.PI / 2);
  bend.rotation.y = Math.PI / 2;
  root.add(bend);
  root.add(cyl(stdMat(0x1a1f2e), 0.022, 0.02, 0.03, 6, -0.11, 0.18, -0.03, Math.PI / 2, 0, 0));
  return root;
}

export function buildHudVisor() {
  const root = new THREE.Group();
  root.name = 'face_hud_visor';
  const glow = glowMat(0x3ef0e0, 0.9, { roughness: 0.25, metalness: 0.2, side: THREE.DoubleSide });
  const frame = stdMat(0x1a1f2e, { metalness: 0.3 });
  // Slightly wrap the visor with three panes
  for (let i = -1; i <= 1; i++) {
    const pane = box(glow, 0.1, 0.055, 0.012, i * 0.09, 0.02, 0.03 + (i === 0 ? 0.012 : 0), 0, -i * 0.4, 0);
    root.add(pane);
  }
  root.add(box(frame, 0.3, 0.012, 0.02, 0, 0.052, 0.03));
  root.add(box(frame, 0.3, 0.012, 0.02, 0, -0.012, 0.03));
  // Temples
  root.add(box(frame, 0.08, 0.016, 0.016, 0.16, 0.02, -0.03, 0, 0.55, 0));
  root.add(box(frame, 0.08, 0.016, 0.016, -0.16, 0.02, -0.03, 0, -0.55, 0));
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
