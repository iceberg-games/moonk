import * as THREE from 'three';
import {
  bananaGroup,
  box,
  cone,
  cyl,
  leafMesh,
  meshOf,
  sphere,
  stdMat,
  torus,
} from '../geom.js';

export function buildBananaCap() {
  const root = new THREE.Group();
  root.name = 'hat_banana_cap';
  const crownCol = stdMat(0xf5c518);
  const bandCol = stdMat(0xe0b014);
  const billCol = stdMat(0x6b4a1b);
  // Crown + band — this is a cap first
  const crown = sphere(crownCol, 0.175, 8, 6, 0, 0.04, 0);
  crown.scale.set(1.08, 0.68, 1.05);
  root.add(crown);
  root.add(cyl(bandCol, 0.19, 0.19, 0.04, 8, 0, -0.01, 0));
  // Visor joins the front of the band (back edge overlaps the cylinder) and
  // still reaches far enough forward to read in the lobby mirror.
  const visor = bananaCapVisor(billCol);
  visor.position.set(0, -0.026, 0.14);
  visor.rotation.x = -0.18;
  root.add(visor);
  // Banana as a front accent, not the hat itself
  const banana = bananaGroup({ length: 0.13, thick: 0.026, bend: 1.35, segs: 5 });
  banana.position.set(0.055, 0.07, 0.15);
  banana.rotation.set(0.15, 0.55, 1.05);
  banana.scale.setScalar(0.9);
  root.add(banana);
  return root;
}

/** Low-poly cap brim. Local origin is the join at the band; +Z is forward. */
function bananaCapVisor(mat) {
  const shape = new THREE.Shape();
  const backW = 0.128; // matches the band chord at z ≈ 0.14
  const frontW = 0.16;
  const depth = 0.18;
  shape.moveTo(-backW, 0);
  shape.lineTo(-frontW, depth * 0.62);
  shape.quadraticCurveTo(0, depth + 0.015, frontW, depth * 0.62);
  shape.lineTo(backW, 0);
  // Slight inward curve so the back edge hugs the round band instead of sitting as a chord gap
  shape.quadraticCurveTo(0, 0.018, -backW, 0);

  const thick = 0.018;
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thick,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 5,
  });
  geo.rotateX(Math.PI / 2); // shape +Y (forward) → local +Z
  geo.translate(0, thick / 2, 0); // thickness hangs down from the join
  return meshOf(geo, mat);
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
  // A flat bottom parked on the crown apex reads as floating, because the
  // skull is wider than the pail a few centimetres down. Sit the pail over
  // the crown so its sides rest on the head.
  const pail = stdMat(0x2aa3a3);
  const rimMat = stdMat(0xc9d4e8, { metalness: 0.3, roughness: 0.45 });
  const wire = stdMat(0x4a5560, { metalness: 0.45, roughness: 0.45 });
  const inner = stdMat(0x153535);
  root.add(cyl(pail, 0.195, 0.17, 0.22, 8, 0, 0.03, 0));
  root.add(cyl(inner, 0.15, 0.15, 0.012, 8, 0, -0.015, 0));
  root.add(cyl(rimMat, 0.205, 0.205, 0.028, 8, 0, 0.14, 0));
  root.add(cyl(inner, 0.17, 0.17, 0.016, 8, 0, 0.125, 0));
  const bail = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.012, 5, 12, Math.PI), wire);
  bail.position.y = 0.14;
  root.add(bail);
  const drip = stdMat(0xf5c518);
  root.add(box(drip, 0.05, 0.025, 0.035, 0, 0.145, 0.185));
  root.add(box(drip, 0.035, 0.09, 0.03, 0, 0.09, 0.195));
  root.add(sphere(drip, 0.028, 5, 4, 0, 0.03, 0.2));
  return root;
}

export function buildCorkCrown() {
  const root = new THREE.Group();
  root.name = 'hat_cork_crown';
  // Hug the upper skull (a thin ring at the apex reads as floating).
  const leather = stdMat(0x5c4030, { roughness: 0.85 });
  const brass = stdMat(0xb08d4f, { metalness: 0.35, roughness: 0.45 });
  const cork = stdMat(0xc4a36a, { roughness: 0.88 });
  const pith = stdMat(0xead8b0, { roughness: 0.8 });
  root.add(cyl(leather, 0.205, 0.21, 0.055, 8, 0, -0.02, 0, 0, 0, 0, true));
  root.add(cyl(brass, 0.214, 0.214, 0.012, 8, 0, 0.01, 0, 0, 0, 0, true));
  root.add(cyl(brass, 0.214, 0.214, 0.01, 8, 0, -0.044, 0, 0, 0, 0, true));
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const x = Math.sin(a) * 0.195;
    const z = Math.cos(a) * 0.195;
    const h = i === 0 ? 0.14 : 0.11;
    const y0 = 0.01;
    // Tapered cork: fatter toward the top, cream lip. Groove is skipped to stay under 300 tris.
    root.add(cyl(cork, 0.04, 0.032, h, 5, x, y0 + h * 0.5, z));
    root.add(cyl(pith, 0.036, 0.036, 0.016, 5, x, y0 + h - 0.004, z));
  }
  return root;
}

export function buildLeafHalo() {
  const root = new THREE.Group();
  root.name = 'hat_leaf_halo';
  const ring = stdMat(0x2f6b2f);
  root.add(torus(ring, 0.175, 0.014, 10, 4, 0, -0.01, 0, Math.PI / 2, 0, 0));
  const colors = [0x3fa34a, 0x62c44a, 0x2e8b3c, 0x8fbf3f, 0x3fa34a, 0x247a36, 0x4aad3a, 0x2e8b3c];
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const leaf = leafMesh(stdMat(colors[i], { side: THREE.DoubleSide }), 0.15, 0.065, 0.012);
    leaf.position.set(Math.sin(a) * 0.175, 0.03, Math.cos(a) * 0.175);
    leaf.lookAt(0, 0.16, 0);
    leaf.rotateX(-0.45);
    leaf.rotateZ((i % 2 === 0 ? 1 : -1) * 0.2);
    root.add(leaf);
  }
  return root;
}

export function buildAntenna() {
  const root = new THREE.Group();
  root.name = 'hat_antenna';
  // Matte pewter band hugging the crown. No emissive, no second neon accent:
  // one brass ball, one cream ball, pewter coils.
  const band = stdMat(0x6a6e76, { metalness: 0.3, roughness: 0.5 });
  const brass = stdMat(0xb08d4f, { metalness: 0.35, roughness: 0.45 });
  const cream = stdMat(0xe8e0d0, { roughness: 0.55 });
  const coil = stdMat(0x8a8e96, { metalness: 0.3, roughness: 0.5 });
  root.add(cyl(band, 0.20, 0.205, 0.04, 8, 0, -0.02, 0, 0, 0, 0, true));
  root.add(cyl(brass, 0.208, 0.208, 0.01, 8, 0, 0.002, 0, 0, 0, 0, true));
  // +rot.z tilts the stem top to the left, so the left post leans out with a positive angle.
  const springs = [
    { x: -0.09, z: 0.02, ball: brass, lean: 0.55 },
    { x: 0.09, z: -0.02, ball: cream, lean: -0.55 },
  ];
  for (const s of springs) {
    const stem = new THREE.Group();
    stem.position.set(s.x, 0.0, s.z);
    stem.rotation.z = s.lean;
    // Chunky coil: short open rings stacked on a thin rod (low tris, reads as a spring).
    stem.add(cyl(coil, 0.01, 0.01, 0.2, 5, 0, 0.12, 0));
    for (let i = 0; i < 4; i++) {
      stem.add(cyl(coil, 0.028, 0.028, 0.018, 6, 0, 0.04 + i * 0.036, 0, 0, 0, 0, true));
    }
    stem.add(sphere(s.ball, 0.048, 7, 5, 0, 0.24, 0));
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
