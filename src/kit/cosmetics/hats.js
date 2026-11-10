import * as THREE from 'three';
import {
  bananaGroup,
  box,
  cone,
  cyl,
  glowMat,
  leafMesh,
  sphere,
  stdMat,
  torus,
} from '../geom.js';

export function buildBananaCap() {
  const root = new THREE.Group();
  root.name = 'hat_banana_cap';
  const banana = bananaGroup({ length: 0.28, thick: 0.06, bend: 1.35, segs: 6 });
  banana.rotation.z = Math.PI / 2;
  banana.rotation.y = 0.15;
  banana.position.set(0.02, 0.04, 0.02);
  banana.scale.set(1.15, 1.0, 1.0);
  root.add(banana);
  // Tiny visor brim so it reads as a "cap"
  const brim = box(stdMat(0xf5c518), 0.16, 0.018, 0.08, 0, 0.0, 0.12);
  brim.rotation.x = -0.25;
  root.add(brim);
  return root;
}

export function buildMoonBeanie() {
  const root = new THREE.Group();
  root.name = 'hat_moon_beanie';
  const knit = stdMat(0x243056);
  const cuff = stdMat(0x1a2240);
  const cap = sphere(knit, 0.18, 8, 6, 0, 0.02, 0);
  cap.scale.set(1.05, 0.72, 1.05);
  root.add(cap);
  root.add(cyl(cuff, 0.19, 0.19, 0.055, 8, 0, -0.02, 0));
  const pom = sphere(stdMat(0xf4efe6), 0.045, 6, 5, 0, 0.14, 0);
  root.add(pom);
  // Crescent moon badge
  const moon = stdMat(0xf5c518, { metalness: 0.25, roughness: 0.4 });
  const disc = cyl(moon, 0.045, 0.045, 0.02, 8, 0, 0.04, 0.16, Math.PI / 2, 0, 0);
  root.add(disc);
  const bite = cyl(stdMat(0x243056), 0.032, 0.032, 0.022, 8, 0.02, 0.05, 0.175, Math.PI / 2, 0, 0);
  root.add(bite);
  return root;
}

export function buildPropeller() {
  const root = new THREE.Group();
  root.name = 'hat_propeller';
  const red = stdMat(0xd4453a);
  const blue = stdMat(0x2f6edb);
  const cap = sphere(red, 0.17, 8, 6, 0, 0.0, 0);
  cap.scale.set(1.05, 0.62, 1.05);
  root.add(cap);
  root.add(cyl(blue, 0.185, 0.185, 0.045, 8, 0, -0.04, 0));
  const mast = cyl(stdMat(0xc9d4e8, { metalness: 0.4 }), 0.012, 0.014, 0.11, 6, 0, 0.12, 0);
  root.add(mast);
  const hub = sphere(stdMat(0xf5c518, { metalness: 0.35 }), 0.022, 6, 5, 0, 0.18, 0);
  root.add(hub);
  const prop = new THREE.Group();
  prop.name = 'propeller_spin';
  prop.position.set(0, 0.18, 0);
  const blade = stdMat(0xf4efe6);
  for (let i = 0; i < 3; i++) {
    const b = box(blade, 0.16, 0.012, 0.04);
    b.position.x = 0.09;
    const arm = new THREE.Group();
    arm.rotation.y = (i * Math.PI * 2) / 3;
    arm.add(b);
    prop.add(arm);
  }
  root.add(prop);
  return root;
}

export function buildPartyCone() {
  const root = new THREE.Group();
  root.name = 'hat_party_cone';
  // Vertex-colored stripes on a single cone (keeps tris low)
  const geo = new THREE.ConeGeometry(0.13, 0.28, 8, 6);
  const colors = new Float32Array(geo.attributes.position.count * 3);
  const pos = geo.attributes.position;
  const yellow = new THREE.Color(0xf5c518);
  const magenta = new THREE.Color(0xe04b9f);
  const tmp = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const band = Math.floor((y + 0.14) / 0.045);
    tmp.copy(band % 2 === 0 ? yellow : magenta);
    colors[i * 3] = tmp.r;
    colors[i * 3 + 1] = tmp.g;
    colors[i * 3 + 2] = tmp.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const hat = new THREE.Mesh(geo, stdMat(0xffffff, { vertexColors: true }));
  hat.position.y = 0.12;
  root.add(hat);
  root.add(cyl(stdMat(0x243056), 0.14, 0.14, 0.03, 8, 0, -0.02, 0));
  root.add(sphere(stdMat(0xf4efe6), 0.04, 6, 5, 0, 0.28, 0));
  return root;
}

export function buildPaintBucket() {
  const root = new THREE.Group();
  root.name = 'hat_bucket';
  const pail = stdMat(0x2aa3a3);
  const rim = stdMat(0xc9d4e8, { metalness: 0.35 });
  // Upside-down bucket sitting on the head
  root.add(cyl(pail, 0.16, 0.2, 0.16, 8, 0, 0.07, 0));
  root.add(cyl(rim, 0.21, 0.21, 0.025, 8, 0, 0.15, 0));
  root.add(cyl(stdMat(0x1a3a3a), 0.15, 0.15, 0.012, 8, 0, 0.0, 0)); // closed "bottom" against skull
  // Handle
  const handle = torus(stdMat(0x6b7280, { metalness: 0.4 }), 0.12, 0.012, 8, 4, 0, 0.1, 0, Math.PI / 2, 0, 0);
  handle.scale.set(1, 0.85, 1);
  root.add(handle);
  // Paint drip
  const drip = stdMat(0xf5c518);
  root.add(box(drip, 0.04, 0.03, 0.03, 0.08, 0.155, 0.14));
  root.add(sphere(drip, 0.025, 5, 4, 0.1, 0.12, 0.17));
  root.add(sphere(drip, 0.016, 5, 4, 0.11, 0.07, 0.185));
  return root;
}

export function buildCorkCrown() {
  const root = new THREE.Group();
  root.name = 'hat_cork_crown';
  const band = stdMat(0xe6c35c, { metalness: 0.45, roughness: 0.4 });
  root.add(cyl(band, 0.17, 0.17, 0.04, 10, 0, 0.02, 0, 0, 0, 0, true));
  const cork = stdMat(0xc4a36a);
  const end = stdMat(0xead8b0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.sin(a) * 0.15;
    const z = Math.cos(a) * 0.15;
    const h = i === 0 ? 0.13 : 0.1;
    const peg = cyl(cork, 0.03, 0.034, h, 6, x, 0.06 + h * 0.35, z);
    root.add(peg);
    root.add(cyl(end, 0.028, 0.028, 0.012, 6, x, 0.06 + h * 0.7, z));
  }
  return root;
}

export function buildLeafHalo() {
  const root = new THREE.Group();
  root.name = 'hat_leaf_halo';
  const ring = stdMat(0x2f6b2f);
  root.add(torus(ring, 0.17, 0.012, 10, 4, 0, 0.02, 0, Math.PI / 2, 0, 0));
  const colors = [0x3fa34a, 0x62c44a, 0x2e8b3c, 0x8fbf3f, 0x3fa34a, 0x247a36];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const leaf = leafMesh(stdMat(colors[i], { side: THREE.DoubleSide }), 0.16, 0.07, 0.012);
    leaf.position.set(Math.sin(a) * 0.17, 0.06, Math.cos(a) * 0.17);
    leaf.lookAt(0, 0.2, 0);
    leaf.rotateX(-0.6);
    leaf.rotateZ((i % 2 === 0 ? 1 : -1) * 0.25);
    root.add(leaf);
  }
  return root;
}

export function buildAntenna() {
  const root = new THREE.Group();
  root.name = 'hat_antenna';
  const band = stdMat(0xc9d4e8, { metalness: 0.35 });
  root.add(cyl(band, 0.16, 0.16, 0.03, 8, 0, 0.0, 0, 0, 0, 0, true));
  const springs = [
    { x: -0.07, color: 0xe04b9f, lean: -0.35 },
    { x: 0.07, color: 0x3ef0e0, lean: 0.35 },
  ];
  for (const s of springs) {
    const stem = new THREE.Group();
    stem.position.set(s.x, 0.02, 0);
    stem.rotation.z = s.lean;
    const coil = stdMat(0x9aa3b5, { metalness: 0.4 });
    // Zig-zag spring (boxes beat tori on the Quest budget)
    for (let i = 0; i < 4; i++) {
      stem.add(box(coil, 0.04, 0.028, 0.014, (i % 2 ? 1 : -1) * 0.012, 0.03 + i * 0.032, 0, 0, 0, (i % 2 ? 1 : -1) * 0.7));
    }
    const ball = sphere(glowMat(s.color, 0.7), 0.04, 6, 5, 0, 0.18, 0);
    stem.add(ball);
    root.add(stem);
  }
  return root;
}

export const HAT_BUILDERS = {
  hat_banana_cap: buildBananaCap,
  hat_moon_beanie: buildMoonBeanie,
  hat_propeller: buildPropeller,
  hat_party_cone: buildPartyCone,
  hat_bucket: buildPaintBucket,
  hat_cork_crown: buildCorkCrown,
  hat_leaf_halo: buildLeafHalo,
  hat_antenna: buildAntenna,
};
