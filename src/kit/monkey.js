import * as THREE from 'three';
import { addColorAttr, box, cyl, hash3, meshOf, sphere, stdMat } from './geom.js';

const DEFAULT_FUR = 0x8d9099;
const DEFAULT_SKIN = 0xc9ccd4;

/**
 * Original MOONK placeholder rig: head, chunky body, two arms, a short curl
 * of tail, and no legs. Attach points live in consistent local frames so
 * cosmetics can be parented without per-item offsets for L/R.
 *
 * Attach frames:
 *   head_top  — origin at the crown; +Y up, +Z forward
 *   face      — origin at the bridge of the snout; +Y up, +Z forward
 *   body      — origin at the chest; +Y up, +Z forward
 *   hand_L/R  — origin at the fist center; +X toward the thumb, +Y toward
 *               the fingertips, +Z out the back of the hand
 *   forearm_L/R — origin mid-forearm; +Y toward the hand, +Z out the outer
 *               / back side, +X toward the thumb
 */
export function createMonkey() {
  const root = new THREE.Group();
  root.name = 'moonk';

  const furMat = stdMat(DEFAULT_FUR, { roughness: 0.9, metalness: 0 });
  const skinMat = stdMat(DEFAULT_SKIN, { roughness: 0.82, metalness: 0 });
  const eyeWhite = stdMat(0xf6f3ea, { roughness: 0.45, flatShading: false });
  const eyeDark = stdMat(0x1a1410, { roughness: 0.4, flatShading: false });
  const shine = stdMat(0xffffff, { roughness: 0.2, flatShading: false });
  const mouth = stdMat(0x3a2418, { roughness: 0.7 });

  const furMeshes = [];
  const skinMeshes = [];

  function fur(mesh) {
    addColorAttr(mesh.geometry);
    furMeshes.push(mesh);
    return mesh;
  }
  function skin(mesh) {
    skinMeshes.push(mesh);
    return mesh;
  }

  // --- Body (bean / pear, sitting on its bottom — no legs) ---
  const body = fur(meshOf(new THREE.SphereGeometry(0.23, 8, 6), furMat, 0, 0.32, 0));
  body.name = 'body';
  body.scale.set(1.05, 1.18, 0.92);
  root.add(body);

  const belly = skin(meshOf(new THREE.SphereGeometry(0.165, 8, 6), skinMat, 0, 0.27, 0.13));
  belly.scale.set(0.95, 1.1, 0.58);
  root.add(belly);
  // hand-crafted silhouette extras (hour 2): hunched trapezius, a lighter chest patch
  const hump = fur(meshOf(new THREE.SphereGeometry(0.2, 8, 6), furMat, 0, 0.51, -0.02));
  hump.scale.set(1.05, 0.5, 0.8);
  root.add(hump);
  const chest = skin(meshOf(new THREE.SphereGeometry(0.1, 7, 5), skinMat, 0, 0.44, 0.145));
  chest.scale.set(1.15, 0.7, 0.45);
  root.add(chest);

  // --- Head ---
  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, 0.68, 0.02);
  root.add(head);

  const skull = fur(meshOf(new THREE.SphereGeometry(0.175, 8, 7), furMat));
  skull.name = 'skull';
  skull.scale.set(1.02, 0.98, 1.0);
  head.add(skull);

  // lighter face mask (heart-ish: two brow-side lobes + muzzle) over the skull
  const mask = skin(meshOf(new THREE.SphereGeometry(0.125, 8, 6), skinMat, 0, 0.0, 0.1));
  mask.scale.set(1.0, 0.95, 0.62);
  head.add(mask);
  const snout = skin(meshOf(new THREE.SphereGeometry(0.09, 8, 6), skinMat, 0, -0.045, 0.145));
  snout.scale.set(1.28, 0.82, 1.0);
  head.add(snout);
  const chin = skin(meshOf(new THREE.SphereGeometry(0.05, 6, 5), skinMat, 0, -0.095, 0.15));
  chin.scale.set(1.3, 0.6, 0.9);
  head.add(chin);
  for (const sx of [-1, 1]) {      // cheek tufts
    const cheek = fur(meshOf(new THREE.SphereGeometry(0.05, 6, 5), furMat, sx * 0.135, -0.04, 0.07));
    cheek.scale.set(0.6, 1.0, 1.0);
    head.add(cheek);
  }

  const noseBridge = skin(meshOf(new THREE.SphereGeometry(0.04, 6, 5), skinMat, 0, 0.01, 0.175));
  noseBridge.scale.set(1.2, 0.7, 0.7);
  head.add(noseBridge);

  for (const sx of [-1, 1]) {
    const nostril = meshOf(new THREE.SphereGeometry(0.012, 5, 4), mouth, sx * 0.02, -0.015, 0.225);
    head.add(nostril);
  }

  // Ears
  for (const sx of [-1, 1]) {
    const ear = fur(meshOf(new THREE.SphereGeometry(0.09, 7, 6), furMat, sx * 0.18, 0.02, -0.01));
    ear.scale.set(0.5, 1.0, 0.9);
    ear.rotation.z = sx * -0.35;
    head.add(ear);
    const inner = skin(meshOf(new THREE.SphereGeometry(0.055, 6, 5), skinMat, sx * 0.187, 0.02, 0.016));
    inner.scale.set(0.35, 0.78, 0.6);
    inner.rotation.z = sx * -0.35;
    head.add(inner);
  }

  // Eyes — slightly wide and low-poly, readable at distance
  for (const sx of [-1, 1]) {
    const white = meshOf(new THREE.SphereGeometry(0.038, 7, 6), eyeWhite, sx * 0.055, 0.03, 0.155);
    white.scale.set(1.0, 1.05, 0.7);
    head.add(white);
    const pupil = meshOf(new THREE.SphereGeometry(0.02, 6, 5), eyeDark, sx * 0.055, 0.028, 0.185);
    head.add(pupil);
    const glint = meshOf(new THREE.SphereGeometry(0.007, 5, 4), shine, sx * 0.048, 0.038, 0.2);
    head.add(glint);
  }

  // heavy brow ridge: a lobe over each eye plus a bridge, tilted a touch angry so it reads from a distance
  for (const sx of [-1, 1]) {
    const lobe = fur(meshOf(new THREE.SphereGeometry(0.05, 7, 5), furMat, sx * 0.058, 0.073, 0.15));
    lobe.scale.set(1.25, 0.5, 0.8);
    lobe.rotation.z = sx * 0.28;
    head.add(lobe);
  }
  const bridge = fur(meshOf(new THREE.SphereGeometry(0.03, 6, 4), furMat, 0, 0.068, 0.165));
  bridge.scale.set(1.3, 0.6, 0.7);
  head.add(bridge);

  const mouthMesh = box(mouth, 0.08, 0.011, 0.012, 0, -0.082, 0.205, 0.1, 0, 0);
  head.add(mouthMesh);
  for (const sx of [-1, 1]) { const corner = box(mouth, 0.026, 0.01, 0.012, sx * 0.045, -0.075, 0.2, 0.1, 0, sx * 0.55); head.add(corner); }

  // --- Tail (original monkey cue, not a cosmetic) ---
  const tail = new THREE.Group();
  tail.position.set(0.02, 0.18, -0.18);
  root.add(tail);
  const tailSegs = [
    [0.05, 0.07, 0, 0.02, -0.05, 0.6, 0, 0],
    [0.042, 0.07, 0.04, 0.0, -0.1, 0.9, 0, 0.4],
    [0.034, 0.065, 0.09, 0.02, -0.15, 1.1, 0, 0.7],
    [0.026, 0.055, 0.13, 0.07, -0.17, 0.6, 0.2, 1.1],
    [0.02, 0.045, 0.15, 0.12, -0.14, 0.3, 0.4, 1.4],
  ];
  for (const [r, h, x, y, z, rx, ry, rz] of tailSegs) {
    tail.add(fur(cyl(furMat, r * 0.75, r, h, 6, x, y, z, rx, ry, rz)));
  }

  // --- Arms ---
  const armL = buildArm(1, furMat, skinMat, fur, skin);
  const armR = buildArm(-1, furMat, skinMat, fur, skin);
  root.add(armL.root, armR.root);

  // --- Attach points ---
  const headTop = new THREE.Object3D();
  headTop.name = 'head_top';
  headTop.position.set(0, 0.175, 0);
  head.add(headTop);

  const face = new THREE.Object3D();
  face.name = 'face';
  face.position.set(0, 0.02, 0.2);
  head.add(face);

  const bodyPt = new THREE.Object3D();
  bodyPt.name = 'body';
  bodyPt.position.set(0, 0.38, 0.16);
  root.add(bodyPt);

  const attach = {
    head_top: headTop,
    face,
    body: bodyPt,
    hand_L: armL.handAttach,
    hand_R: armR.handAttach,
    forearm_L: armL.forearmAttach,
    forearm_R: armR.forearmAttach,
  };

  function applyFur(spec) {
    const emissive = spec.emissive ?? 0x000000;
    const emissiveIntensity = spec.emissiveIntensity ?? 0;
    furMat.emissive.set(emissive);
    furMat.emissiveIntensity = emissiveIntensity;
    skinMat.color.set(spec.skin ?? DEFAULT_SKIN);

    if (spec.vertexPaint) {
      furMat.vertexColors = true;
      furMat.color.set(0xffffff);
      paintFur(root, furMeshes, spec.vertexPaint);
    } else {
      furMat.vertexColors = false;
      furMat.color.set(spec.fur ?? DEFAULT_FUR);
    }
    furMat.needsUpdate = true;
    skinMat.needsUpdate = true;
  }

  return {
    root,
    head,
    arms: [armL, armR],
    attach,
    furMat,
    skinMat,
    furMeshes,
    applyFur,
  };
}

function buildArm(sign, furMat, skinMat, fur, skin) {
  // sign: +1 left, -1 right (character's left = +X)
  {
    const root = new THREE.Group();
    root.name = sign > 0 ? 'arm_L' : 'arm_R';

    const shoulder = new THREE.Group();
    shoulder.position.set(sign * 0.23, 0.48, 0.02);
    // Hang in a relaxed A-pose, slightly forward so hands read on camera
    shoulder.rotation.z = sign * 0.55;
    shoulder.rotation.x = 0.25;
    root.add(shoulder);

    const upper = fur(cyl(furMat, 0.055, 0.07, 0.28, 7, 0, -0.14, 0));
    shoulder.add(upper);

    const elbow = new THREE.Group();
    elbow.position.set(0, -0.28, 0);
    elbow.rotation.x = -0.45;
    shoulder.add(elbow);

    const forearm = fur(cyl(furMat, 0.048, 0.055, 0.26, 7, 0, -0.13, 0));
    elbow.add(forearm);

    const forearmAttach = new THREE.Object3D();
    forearmAttach.name = sign > 0 ? 'forearm_L' : 'forearm_R';
    forearmAttach.position.set(0, -0.13, 0);
    // +Y toward the hand (down the forearm in bind pose), +Z out the back
    forearmAttach.rotation.x = Math.PI;
    // +X toward the thumb: on the left arm thumb is +X in world-ish after
    // the shoulder z-rotation; flip the right side so cosmetics share geo.
    if (sign < 0) forearmAttach.rotation.y = Math.PI;
    elbow.add(forearmAttach);

    const wrist = new THREE.Group();
    wrist.position.set(0, -0.27, 0);
    wrist.rotation.x = -0.15;
    elbow.add(wrist);

    const fist = fur(meshOf(new THREE.SphereGeometry(0.083, 8, 6), furMat, 0, -0.04, 0));
    fist.scale.set(1.1, 1.15, 1.0);
    wrist.add(fist);

    // Palmar pad
    const pad = skin(meshOf(new THREE.SphereGeometry(0.05, 6, 5), skinMat, 0, -0.05, 0.045));
    pad.scale.set(0.95, 1.05, 0.45);
    wrist.add(pad);

    // knuckles: four chunky bumps across the back of the fist (back of the hand is -Z here)
    for (let k = 0; k < 4; k++) {
      const kn = fur(meshOf(new THREE.SphereGeometry(0.03, 6, 5), furMat, (k - 1.5) * 0.04, -0.082 + (k === 1 || k === 2 ? 0.008 : 0), -0.05));
      kn.scale.set(1.0, 0.9, 0.9);
      wrist.add(kn);
    }
    // Thumb bump
    const thumb = fur(meshOf(new THREE.SphereGeometry(0.034, 6, 5), furMat, sign * 0.07, -0.02, 0.03));
    thumb.scale.set(0.8, 1.2, 0.85);
    wrist.add(thumb);

    const handAttach = new THREE.Object3D();
    handAttach.name = sign > 0 ? 'hand_L' : 'hand_R';
    handAttach.position.set(0, -0.04, 0);
    // +Y fingertips (continuing down the arm), +Z back of hand (toward -local Z
    // of the wrist, which is the back because pad is on +Z).
    // Current wrist: pad is +Z (palm), so back of hand is -Z. Rotate 180 around Y
    // so attach +Z is the back.
    handAttach.rotation.x = Math.PI;
    handAttach.rotation.y = Math.PI;
    if (sign < 0) handAttach.rotation.y += Math.PI; // +X toward thumb
    wrist.add(handAttach);

    return { root, handAttach, forearmAttach, shoulder, elbow, wrist };
  }
}

function paintFur(root, furMeshes, kind) {
  root.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  const c = new THREE.Color();
  for (const mesh of furMeshes) {
    const pos = mesh.geometry.attributes.position;
    let col = mesh.geometry.attributes.color;
    if (!col) {
      addColorAttr(mesh.geometry);
      col = mesh.geometry.attributes.color;
    }
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      paintAt(kind, v, c);
      col.setXYZ(i, c.r, c.g, c.b);
    }
    col.needsUpdate = true;
  }
}

function paintAt(kind, v, c) {
  const { x, y, z } = v;
  if (kind === 'sunset') {
    const band = Math.sin(y * 14.0 + z * 1.5);
    if (band > 0.25) c.set(0xff7a32);
    else if (band > -0.25) c.set(0xff4d8a);
    else c.set(0x6b2d8a);
    return;
  }
  if (kind === 'nebula') {
    const n = hash3(x * 3.1, y * 3.1, z * 3.1);
    const n2 = hash3(x * 7.7, y * 5.2, z * 4.4);
    if (n2 > 0.82) c.set(0xff9be8);
    else if (n > 0.55) c.set(0x7a4cff);
    else if (n > 0.3) c.set(0x2a1170);
    else c.set(0x1a0a36);
    return;
  }
  if (kind === 'aurora') {
    const w = 0.5 + 0.5 * Math.sin(y * 9.0 + x * 6.0);
    const w2 = 0.5 + 0.5 * Math.sin(z * 8.0 + y * 4.0);
    const g = 0.15 + w * 0.85;
    const b = 0.25 + w2 * 0.55;
    c.setRGB(0.05 * w2, g, 0.2 + b * 0.4);
    return;
  }
  c.set(0xffffff);
}

export const ATTACH_POINTS = [
  'head_top',
  'face',
  'body',
  'hand_L',
  'hand_R',
  'forearm_L',
  'forearm_R',
];
