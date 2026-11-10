import * as THREE from 'three';

export function stdMat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: extra.roughness ?? 0.72,
    metalness: extra.metalness ?? 0.05,
    flatShading: extra.flatShading ?? true,
    side: extra.side ?? THREE.FrontSide,
    vertexColors: extra.vertexColors ?? false,
    emissive: extra.emissive ?? 0x000000,
    emissiveIntensity: extra.emissiveIntensity ?? 0,
    transparent: extra.transparent ?? false,
    opacity: extra.opacity ?? 1,
  });
}

export function glowMat(color, intensity = 0.8, extra = {}) {
  return stdMat(color, {
    roughness: 0.4,
    metalness: 0.1,
    emissive: color,
    emissiveIntensity: intensity,
    ...extra,
  });
}

export function addColorAttr(geometry, hex = 0xffffff) {
  const n = geometry.attributes.position.count;
  const arr = new Float32Array(n * 3);
  const c = new THREE.Color(hex);
  for (let i = 0; i < n; i++) {
    arr[i * 3] = c.r;
    arr[i * 3 + 1] = c.g;
    arr[i * 3 + 2] = c.b;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geometry;
}

export function meshOf(geometry, material, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.rotation.set(rx, ry, rz);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

export function box(mat, w, h, d, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return meshOf(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rx, ry, rz);
}

export function sphere(mat, r, w = 7, h = 5, x = 0, y = 0, z = 0) {
  return meshOf(new THREE.SphereGeometry(r, w, h), mat, x, y, z);
}

export function cyl(mat, rTop, rBot, h, seg = 8, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, open = false) {
  return meshOf(new THREE.CylinderGeometry(rTop, rBot, h, seg, 1, open), mat, x, y, z, rx, ry, rz);
}

export function cone(mat, r, h, seg = 8, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return meshOf(new THREE.ConeGeometry(r, h, seg, 1), mat, x, y, z, rx, ry, rz);
}

export function torus(mat, r, tube, rSeg = 8, tSeg = 4, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
  return meshOf(new THREE.TorusGeometry(r, tube, tSeg, rSeg), mat, x, y, z, rx, ry, rz);
}

/** 5-point star extruded as a thin prism. ~20 tris typical at default. */
export function starMesh(mat, outer = 0.06, inner = 0.028, thick = 0.02, points = 5) {
  const shape = new THREE.Shape();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const x = Math.cos(a) * r;
    const y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y);
    else shape.lineTo(x, y);
  }
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thick,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 1,
  });
  geo.translate(0, 0, -thick / 2);
  return new THREE.Mesh(geo, mat);
}

/** Simple kite / tropical leaf in the XY plane, slightly thickened. */
export function leafMesh(mat, length = 0.12, width = 0.06, thick = 0.012) {
  const shape = new THREE.Shape();
  shape.moveTo(0, -length * 0.15);
  shape.quadraticCurveTo(width, length * 0.25, 0, length);
  shape.quadraticCurveTo(-width, length * 0.25, 0, -length * 0.15);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: thick,
    bevelEnabled: false,
    steps: 1,
    curveSegments: 4,
  });
  geo.translate(0, 0, -thick / 2);
  const m = new THREE.Mesh(geo, mat);
  return m;
}

/** Faceted banana arc. Origin at the mid-inside of the curve. */
export function bananaGroup({
  length = 0.22,
  thick = 0.055,
  bend = 1.15,
  segs = 6,
  color = 0xf5c518,
  tipColor = 0x5b3a14,
} = {}) {
  const g = new THREE.Group();
  const mat = stdMat(color);
  const tip = stdMat(tipColor);
  for (let i = 0; i < segs; i++) {
    const t = i / (segs - 1);
    const ang = (t - 0.5) * bend;
    const r = thick * (0.5 + Math.sin(t * Math.PI) * 0.55);
    const isTip = i === 0 || i === segs - 1;
    const mesh = box(isTip ? tip : mat, r * 1.15, r * 1.7, (length / segs) * 1.2);
    const arc = length * 0.55;
    mesh.position.set(Math.sin(ang) * arc, -Math.cos(ang) * arc + arc * 0.15, 0);
    mesh.rotation.z = ang;
    g.add(mesh);
  }
  const stem = cyl(tip, 0.01, 0.014, 0.04, 5);
  const t0 = 0;
  const ang0 = (t0 - 0.5) * bend;
  const arc = length * 0.55;
  stem.position.set(Math.sin(ang0) * arc, -Math.cos(ang0) * arc + arc * 0.15 + 0.03, 0);
  stem.rotation.z = ang0 * 0.6;
  g.add(stem);
  return g;
}

export function triangleCount(root) {
  let n = 0;
  root.traverse((c) => {
    if (!c.isMesh || !c.geometry) return;
    const geo = c.geometry;
    if (geo.index) n += geo.index.count / 3;
    else if (geo.attributes.position) n += geo.attributes.position.count / 3;
  });
  return Math.round(n);
}

export function disposeObject(root) {
  root.traverse((c) => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) {
      const mats = Array.isArray(c.material) ? c.material : [c.material];
      for (const m of mats) m.dispose?.();
    }
  });
}

/** Hash 0..1 from a position, stable and texture-free. */
export function hash3(x, y, z) {
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
