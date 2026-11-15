import * as THREE from 'three';
import { box, cyl, glowMat, leafMesh, sphere, starMesh, stdMat } from '../geom.js';

/**
 * Each builder returns a group in the attach-point frame of ONE side.
 * +X thumb, +Y fingertips / toward the hand, +Z back of the hand (hands)
 * or outer/back of the forearm (bracers). The same mesh is used on L and R
 * because the attach frames already mirror +X toward the thumb.
 */

export function buildBananaCuffs() {
  const root = new THREE.Group();
  root.name = 'hand_banana_cuffs';
  // Sits on the wrist, just behind the fist: hand attach origin is fist
  // center, so the cuff lives toward -Y (toward the forearm).
  const peel = bananaishCuff();
  peel.position.set(0, -0.08, 0);
  peel.rotation.x = Math.PI / 2;
  root.add(peel);
  return root;
}

function bananaishCuff() {
  const g = new THREE.Group();
  const yellow = stdMat(0xf5c518, { roughness: 0.7 });
  const pith = stdMat(0xfff4c4, { roughness: 0.75 });
  const tip = stdMat(0x5b3a14, { roughness: 0.8 });
  // Open C of chunky curved peels so the silhouette reads as a banana, not dice.
  const n = 5;
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1);
    const a = -1.05 + t * 2.1;
    const r = 0.08 + Math.sin(t * Math.PI) * 0.012;
    const seg = box(yellow, 0.055, 0.1, 0.032);
    seg.position.set(Math.sin(a) * r, Math.sin(t * Math.PI) * 0.02, Math.cos(a) * r);
    seg.lookAt(0, 0, 0);
    seg.rotateX(0.15);
    g.add(seg);
    const inner = box(pith, 0.036, 0.07, 0.012);
    inner.position.set(Math.sin(a) * (r - 0.018), Math.sin(t * Math.PI) * 0.02, Math.cos(a) * (r - 0.018));
    inner.lookAt(0, 0, 0);
    g.add(inner);
  }
  // Stem and a darker blossom end so it reads as one banana wrapped around the wrist.
  g.add(cyl(tip, 0.014, 0.02, 0.04, 5, 0.0, 0.06, 0.085, 0.6, 0, 0));
  g.add(sphere(tip, 0.016, 5, 4, Math.sin(-1.05) * 0.08, 0.0, Math.cos(-1.05) * 0.08));
  return g;
}

export function buildBoxing() {
  const root = new THREE.Group();
  root.name = 'hand_boxing';
  const red = stdMat(0xc4282c);
  const lace = stdMat(0xf4efe6);
  const glove = sphere(red, 0.1, 6, 4, 0, 0.0, 0.01);
  glove.scale.set(1.15, 1.2, 1.05);
  root.add(glove);
  const cuff = cyl(red, 0.07, 0.08, 0.07, 6, 0, -0.1, 0);
  root.add(cuff);
  root.add(cyl(lace, 0.072, 0.072, 0.016, 6, 0, -0.12, 0));
  // Thumb
  const thumb = sphere(red, 0.04, 5, 4, 0.08, -0.01, 0.03);
  thumb.scale.set(0.85, 1.1, 0.8);
  root.add(thumb);
  // Palm pad
  root.add(box(stdMat(0x8e1c22), 0.1, 0.08, 0.03, 0, 0.0, -0.07));
  return root;
}

export function buildMoonBracers() {
  const root = new THREE.Group();
  root.name = 'hand_moon_bracers';
  // Built for forearm attach: origin mid-forearm, +Y toward the hand
  const plate = stdMat(0xc9d4e8, { metalness: 0.45, roughness: 0.4 });
  const dark = stdMat(0x243056, { metalness: 0.2 });
  root.add(cyl(plate, 0.065, 0.07, 0.16, 8, 0, 0, 0, 0, 0, 0, true));
  root.add(cyl(dark, 0.068, 0.068, 0.02, 8, 0, 0.07, 0));
  root.add(cyl(dark, 0.072, 0.072, 0.02, 8, 0, -0.07, 0));
  // Crescent badge on the outer (+Z) face
  const gold = stdMat(0xe6c35c, { metalness: 0.5, roughness: 0.35 });
  const disc = cyl(gold, 0.032, 0.032, 0.016, 8, 0, 0, 0.068, Math.PI / 2, 0, 0);
  root.add(disc);
  const bite = cyl(dark, 0.022, 0.022, 0.018, 8, 0.012, 0.006, 0.078, Math.PI / 2, 0, 0);
  root.add(bite);
  return root;
}

export function buildStarKnuckles() {
  const root = new THREE.Group();
  root.name = 'hand_star_knuckles';
  const gold = stdMat(0xe6c35c, { metalness: 0.55, roughness: 0.35 });
  const strap = stdMat(0x4a3424);
  root.add(cyl(strap, 0.075, 0.075, 0.04, 7, 0, 0.0, 0, 0, 0, 0, true));
  // Three stars across the back of the hand (+Z)
  for (let i = -1; i <= 1; i++) {
    const star = starMesh(gold, 0.035, 0.015, 0.016);
    star.position.set(i * 0.045, 0.02, 0.075);
    star.rotation.x = 0;
    root.add(star);
  }
  return root;
}

export function buildLeafGauntlets() {
  const root = new THREE.Group();
  root.name = 'hand_leaf_gauntlets';
  const band = stdMat(0x2f6b2f);
  const leafCol = stdMat(0x3fa34a, { side: THREE.DoubleSide });
  const leafCol2 = stdMat(0x62c44a, { side: THREE.DoubleSide });
  // Forearm attach
  root.add(cyl(band, 0.06, 0.065, 0.04, 7, 0, 0.0, 0));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const leaf = leafMesh(i % 2 ? leafCol : leafCol2, 0.13, 0.055, 0.01);
    leaf.position.set(Math.sin(a) * 0.06, 0.04, Math.cos(a) * 0.06);
    leaf.lookAt(0, 0.2, 0);
    leaf.rotateX(-0.3);
    root.add(leaf);
  }
  return root;
}

export function buildGlowBands() {
  const root = new THREE.Group();
  root.name = 'hand_glow_bands';
  // Stacked wrist rings. No emissive glow — brass accent plus a dark band, thick enough to read at a distance.
  root.add(cyl(stdMat(0xb08d4f, { metalness: 0.35, roughness: 0.45 }), 0.082, 0.082, 0.034, 8, 0, -0.055, 0));
  root.add(cyl(stdMat(0x2a2a28, { metalness: 0.15, roughness: 0.6 }), 0.078, 0.078, 0.03, 8, 0, -0.095, 0));
  return root;
}

export const HAND_BUILDERS = {
  hand_banana_cuffs: { build: buildBananaCuffs, attach: ['hand_L', 'hand_R'] },
  hand_boxing: { build: buildBoxing, attach: ['hand_L', 'hand_R'] },
  hand_moon_bracers: { build: buildMoonBracers, attach: ['forearm_L', 'forearm_R'] },
  hand_star_knuckles: { build: buildStarKnuckles, attach: ['hand_L', 'hand_R'] },
  hand_leaf_gauntlets: { build: buildLeafGauntlets, attach: ['forearm_L', 'forearm_R'] },
  hand_glow_bands: { build: buildGlowBands, attach: ['hand_L', 'hand_R'] },
};
