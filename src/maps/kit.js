import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// MapKit: builds a whole map out of primitives that each add (a) visual geometry and (b) a matching collider
// ({k:'box'} AABB | {k:'cyl'} vertical cylinder | {k:'sph'}). Everything static is merged by material (vertex colours, one
// Lambert material + one unlit glow material), optionally split into spatial chunks so the GPU can frustum-cull.
// `finish()` with no argument keeps the original v1 behaviour (hub.js relies on it). `finish({ bake, chunk })` enables
// the baked-lighting path: ambient occlusion, soft sun shadows from occluders and local light pools written into vertex
// colours, so a map needs no realtime shadows and at most one or two realtime lights.
const UP = new THREE.Vector3(0, 1, 0);
const _v = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _s = new THREE.Vector3(1, 1, 1);
const hash2 = (x, y) => { let h = Math.imul(Math.round(x * 4096) | 0, 374761393) ^ Math.imul(Math.round(y * 4096) | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
const smooth = (t) => t * t * (3 - 2 * t);
/** 2D value noise in [0,1]. */
export function noise2(x, z, f = 1) {
  x *= f; z *= f; const xi = Math.floor(x), zi = Math.floor(z), tx = smooth(x - xi), tz = smooth(z - zi);
  const a = hash2(xi, zi), b = hash2(xi + 1, zi), c = hash2(xi, zi + 1), d = hash2(xi + 1, zi + 1);
  return a + (b - a) * tx + (c - a) * tz + (a - b - c + d) * tx * tz;
}
export const lerpColor = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), Math.max(0, Math.min(1, t)));

export class MapKit {
  constructor(seed = 1) {
    this.parts = []; this.glowParts = []; this.cols = []; this.colG = []; this.inst = []; this.occ = []; this.lightsBaked = [];
    this.s = seed >>> 0 || 1; this._grp = 0; this._lock = false;
  }
  /** seeded random in [0,1) */
  rand() { this.s = (this.s + 0x6d2b79f5) >>> 0; let t = this.s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  range(a, b) { return a + (b - a) * this.rand(); }
  pick(arr) { return arr[Math.floor(this.rand() * arr.length)]; }
  _begin() { if (!this._lock) this._grp++; }
  _group(fn) { const was = this._lock; if (!was) { this._grp++; this._lock = true; } fn(); this._lock = was; }
  _col(c) { this.cols.push(c); this.colG.push(this._grp); }
  _add(geo, color, m, glow = false) {
    const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(m);
    g.deleteAttribute('uv');
    const col = new THREE.Color(color); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const shade = 0.8 + 0.2 * Math.max(0, Math.min(1, (g.attributes.position.getY(i) + 2) / 16)); a[i * 3] = col.r * shade; a[i * 3 + 1] = col.g * shade; a[i * 3 + 2] = col.b * shade; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    (glow ? this.glowParts : this.parts).push({ g, base: col, grp: this._grp, glow });
  }
  // ---- v1 primitives (signatures unchanged) -------------------------------------------------------------------
  box(x, y, z, w, h, d, color, col = true) { this._begin(); this._add(new THREE.BoxGeometry(w, h, d), color, _m.makeTranslation(x, y + h / 2, z)); if (col) this._col({ k: 'box', min: [x - w / 2, y, z - d / 2], max: [x + w / 2, y + h, z + d / 2] }); }
  cyl(x, y, z, r, h, color, col = true, seg = 10, rTop = r) { this._begin(); this._add(new THREE.CylinderGeometry(rTop, r, h, seg), color, _m.makeTranslation(x, y + h / 2, z)); if (col) this._col({ k: 'cyl', x, z, r: Math.max(r, rTop), y0: y, y1: y + h }); }
  ball(x, y, z, r, color, col = true, detail = 1) { this._begin(); this._add(new THREE.IcosahedronGeometry(r, detail), color, _m.makeTranslation(x, y, z)); if (col) this._col({ k: 'sph', x, y, z, r }); }
  cone(x, y, z, r, h, color, seg = 7) { this._begin(); this._add(new THREE.ConeGeometry(r, h, seg), color, _m.makeTranslation(x, y + h / 2, z)); }
  tilt(geo, color, x, y, z, rx = 0, ry = 0, rz = 0, glow = false) { this._begin(); this._add(geo, color, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)), glow); }
  glowBall(x, y, z, r, color) { this._begin(); this._add(new THREE.IcosahedronGeometry(r, 0), color, _m.makeTranslation(x, y, z), true); }
  glowBox(x, y, z, w, h, d, color) { this._begin(); this._add(new THREE.BoxGeometry(w, h, d), color, _m.makeTranslation(x, y + 0, z), true); }
  // ---- v2 helpers ---------------------------------------------------------------------------------------------
  /** Box given by min/max corners. */
  slab(x0, y0, z0, x1, y1, z1, color, col = true) { this.box((x0 + x1) / 2, y0, (z0 + z1) / 2, Math.abs(x1 - x0), y1 - y0, Math.abs(z1 - z0), color, col); }
  /** Round platform / stepping pad whose TOP surface is at y. Collider is a vertical cylinder matching the visual. */
  pad(x, y, z, r, h, color, seg = 9, col = true) { this.cyl(x, y - h, z, r, h, color, col, seg); }
  /** Vertical cylinder (post, pillar, rope) from y0 to y1, collider radius matched to the polygon (not the corners). */
  post(x, z, y0, y1, r, color, seg = 8, col = true) {
    this._begin(); this._add(new THREE.CylinderGeometry(r, r, y1 - y0, seg), color, _m.makeTranslation(x, (y0 + y1) / 2, z));
    if (col) this._col({ k: 'cyl', x, z, r: r * (1 + Math.cos(Math.PI / seg)) / 2, y0, y1 });
  }
  /** Tapered trunk: one visual cone-cylinder, stacked cylinder colliders that follow the taper within ~6 cm. */
  trunk(x, z, y0, y1, rB, rT, color, seg = 10, col = true) {
    this._begin(); const h = y1 - y0; this._add(new THREE.CylinderGeometry(rT, rB, h, seg), color, _m.makeTranslation(x, y0 + h / 2, z));
    if (!col) return; const f = (1 + Math.cos(Math.PI / seg)) / 2; const n = Math.max(1, Math.min(Math.ceil(h / 1.6), Math.ceil(Math.abs(rB - rT) * f / 0.07)));
    for (let i = 0; i < n; i++) { const a = i / n, b = (i + 1) / n; this._col({ k: 'cyl', x, z, r: (rB + (rT - rB) * a) * f, y0: y0 + h * a, y1: y0 + h * b }); }
  }
  /**
   * A round limb from A to B. Visual: oriented cylinder. Collider: one AABB when it is level and axis-aligned, otherwise a
   * chain of spheres (the physics only has AABBs, vertical cylinders and spheres).
   */
  beam(x0, y0, z0, x1, y1, z1, r, color, seg = 6, col = true, rEnd = r) {
    this._begin(); const len = Math.hypot(x1 - x0, y1 - y0, z1 - z0); _v.set(x1 - x0, y1 - y0, z1 - z0).normalize(); _q.setFromUnitVectors(UP, _v);
    this._add(new THREE.CylinderGeometry(rEnd, r, len, seg), color, new THREE.Matrix4().compose(new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), _q, _s));
    if (!col) return; const lvl = Math.abs(y1 - y0) < 1e-3; const R = Math.max(r, rEnd);
    if (lvl && (Math.abs(x1 - x0) < 1e-3 || Math.abs(z1 - z0) < 1e-3)) { this._col({ k: 'box', min: [Math.min(x0, x1) - R, y0 - R, Math.min(z0, z1) - R], max: [Math.max(x0, x1) + R, y0 + R, Math.max(z0, z1) + R] }); return; }
    const n = Math.max(2, Math.ceil(len / (R * 1.4))); for (let i = 0; i <= n; i++) { const t = i / n; this._col({ k: 'sph', x: x0 + (x1 - x0) * t, y: y0 + (y1 - y0) * t, z: z0 + (z1 - z0) * t, r: r + (rEnd - r) * t }); }
  }
  /** Irregular leaf/rock blob (vertex-jittered icosahedron). Registers itself as a sun-shadow occluder unless occlude=false. */
  blob(x, y, z, r, color, col = false, detail = 1, jitter = 0.18, occlude = true) {
    this._begin(); const g = new THREE.IcosahedronGeometry(r, detail), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) { const k = 1 + (hash2(p.getX(i) + x, p.getZ(i) + z + p.getY(i)) - 0.5) * 2 * jitter; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.82, p.getZ(i) * k); }
    g.computeVertexNormals(); this._add(g, color, _m.makeTranslation(x, y, z));
    if (col) this._col({ k: 'sph', x, y, z, r: r * 0.92 }); if (occlude) this.occ.push({ x, y, z, r: r * 0.95, grp: this._grp });
  }
  /** Collider only (no visual). extra e.g. { slip: 0.9 } for ice-like surfaces. */
  collide(c, extra) { this._begin(); this._col(extra ? { ...c, ...extra } : c); }
  occluder(x, y, z, r) { this.occ.push({ x, y, z, r, grp: -1 }); }
  /** Several things under one group id (they will not occlude each other in the AO bake). */
  group(fn) { this._group(fn); }
  /** Shaded flat disc (polar grid, constant cell size) used as ground so the bake has vertices to paint on. colorFn(x,z)->Color. */
  groundDisc(R, cell, y, colorFn, col = true) {
    this._begin(); const pos = [], colr = [], nor = []; const rings = Math.max(1, Math.round(R / cell));
    const P = (r, a) => [Math.cos(a) * r, Math.sin(a) * r];
    const push1 = (p) => { pos.push(p[0], y, p[1]); nor.push(0, 1, 0); const c = colorFn(p[0], p[1]); colr.push(c.r, c.g, c.b); };
    const tri = (p, q, r) => { const ny = (q[1] - p[1]) * (r[0] - p[0]) - (q[0] - p[0]) * (r[1] - p[1]); if (ny >= 0) { push1(p); push1(q); push1(r); } else { push1(p); push1(r); push1(q); } };
    for (let i = 0; i < rings; i++) {
      const r0 = (i / rings) * R, r1 = ((i + 1) / rings) * R; const n1 = Math.max(6, Math.round((2 * Math.PI * r1) / cell)); const n0 = i === 0 ? 0 : Math.max(6, Math.round((2 * Math.PI * r0) / cell));
      if (i === 0) { for (let j = 0; j < n1; j++) { const a = (j / n1) * Math.PI * 2, b = ((j + 1) / n1) * Math.PI * 2; tri([0, 0], P(r1, b), P(r1, a)); } continue; }
      // quad strip between ring i (n0) and ring i+1 (n1) that may have different counts: triangulate by walking both rims
      let a0 = 0, a1 = 0; while (a0 < n0 || a1 < n1) {
        const t0 = a0 / n0, t1 = a1 / n1; const adv0 = a0 < n0 && (a1 >= n1 || (a0 + 1) / n0 <= (a1 + 1) / n1 + 1e-9);
        const A = P(r0, (a0 / n0) * Math.PI * 2), B = P(r1, (a1 / n1) * Math.PI * 2);
        if (adv0) { const A2 = P(r0, ((a0 + 1) / n0) * Math.PI * 2); tri(A, B, A2); a0++; } else { const B2 = P(r1, ((a1 + 1) / n1) * Math.PI * 2); tri(A, B, B2); a1++; }
        void t0; void t1;
      }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    this.parts.push({ g, base: new THREE.Color(1, 1, 1), grp: this._grp, glow: false, ownColors: true });
    if (col) this._col({ k: 'cyl', x: 0, z: 0, r: R, y0: y - 3, y1: y });
  }
  /** Flat rectangular floor tessellated in `cell` squares (so the bake / colorFn can paint tiles and light pools). */
  groundGrid(x0, z0, x1, z1, cell, y, colorFn, col = true) {
    this._begin(); const pos = [], colr = [], nor = []; const nx = Math.max(1, Math.round((x1 - x0) / cell)), nz = Math.max(1, Math.round((z1 - z0) / cell));
    const v = (x, z) => { pos.push(x, y, z); nor.push(0, 1, 0); const c = colorFn(x, z); colr.push(c.r, c.g, c.b); };
    for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) {
      const xa = x0 + (x1 - x0) * i / nx, xb = x0 + (x1 - x0) * (i + 1) / nx, za = z0 + (z1 - z0) * j / nz, zb = z0 + (z1 - z0) * (j + 1) / nz; const c = colorFn((xa + xb) / 2, (za + zb) / 2);
      for (const [x, z] of [[xa, za], [xa, zb], [xb, za], [xb, za], [xa, zb], [xb, zb]]) { pos.push(x, y, z); nor.push(0, 1, 0); colr.push(c.r, c.g, c.b); }   // flat colour per tile (crisp tiles)
    }
    void v; const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(colr, 3));
    this.parts.push({ g, base: new THREE.Color(1, 1, 1), grp: this._grp, glow: false, ownColors: true });
    if (col) this._col({ k: 'box', min: [x0, y - 3, z0], max: [x1, y, z1] });
  }
  /** Bake a local light pool into the vertex colours (warm lantern etc.). */
  bakeLight(x, y, z, color, intensity, radius) { this.lightsBaked.push({ p: new THREE.Vector3(x, y, z), c: new THREE.Color(color), i: intensity, r: radius }); }
  /** Stepping pads (and optional posts to the ground) from A to B; returns the pad centres. */
  stepPath(a, b, gap, r, color, opts = {}) {
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]); const n = Math.max(1, Math.round(len / gap)); const out = [];
    for (let i = 1; i < n; i++) {
      const t = i / n; const w = (opts.wobble || 0); const x = a[0] + (b[0] - a[0]) * t + (this.rand() - 0.5) * w, z = a[2] + (b[2] - a[2]) * t + (this.rand() - 0.5) * w, y = a[1] + (b[1] - a[1]) * t + (this.rand() - 0.5) * (opts.dy || 0);
      if (opts.post) this.cyl(x, 0, z, r, y, color, true, opts.seg || 7); else this.pad(x, y, z, r, opts.h || 0.3, color, opts.seg || 9);
      out.push([x, y, z]);
    }
    return out;
  }
  /** Repeated small prop drawn with one InstancedMesh (1 draw call). mats: array of THREE.Matrix4. colors optional array of colours. */
  instance(geo, color, mats, colors) { this.inst.push({ geo, color: new THREE.Color(color), mats, colors }); }
  // ---- finish -----------------------------------------------------------------------------------------------
  finish(o) {
    const group = new THREE.Group();
    if (!o) {
      group.add(new THREE.Mesh(mergeGeometries(this.parts.map((p) => p.g)), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
      if (this.glowParts.length) group.add(new THREE.Mesh(mergeGeometries(this.glowParts.map((p) => p.g)), new THREE.MeshBasicMaterial({ vertexColors: true })));
      return { group, cols: this.cols };
    }
    if (o.bake) this._bake(o.bake);
    const lit = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: o.flat !== false }), glow = new THREE.MeshBasicMaterial({ vertexColors: true });
    const chunkOf = (parts, mat) => {
      const cell = o.chunk || 0; const buckets = new Map();
      for (const p of parts) { p.g.computeBoundingBox(); const c = p.g.boundingBox.getCenter(new THREE.Vector3()); const key = cell ? `${Math.floor(c.x / cell)},${Math.floor(c.z / cell)}` : 'all'; (buckets.get(key) || buckets.set(key, []).get(key)).push(p.g); }
      for (const gs of buckets.values()) { const g = mergeGeometries(gs); g.computeBoundingSphere(); const m = new THREE.Mesh(g, mat); m.matrixAutoUpdate = false; group.add(m); }
    };
    chunkOf(this.parts, lit); if (this.glowParts.length) chunkOf(this.glowParts, glow);
    for (const it of this.inst) {
      const g = it.geo.index ? it.geo.toNonIndexed() : it.geo.clone(); g.deleteAttribute('uv');
      const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const t = 0.55 + 0.45 * Math.max(0, Math.min(1, g.attributes.position.getY(i) / Math.max(0.01, (g.boundingBox || (g.computeBoundingBox(), g.boundingBox)).max.y))); a[i * 3] = it.color.r * t; a[i * 3 + 1] = it.color.g * t; a[i * 3 + 2] = it.color.b * t; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
      const im = new THREE.InstancedMesh(g, lit, it.mats.length); it.mats.forEach((m, i) => { im.setMatrixAt(i, m); if (it.colors) im.setColorAt(i, it.colors[i]); }); im.instanceMatrix.needsUpdate = true; im.computeBoundingSphere(); group.add(im);
    }
    const cols = this.cols;
    return { group, cols };
  }
  // ---- baked lighting -----------------------------------------------------------------------------------------
  _bake(b) {
    const R = b.aoRadius ?? 1.3, strength = b.ao ?? 0.55, amb = b.ambient ?? 1, CELL = 3;
    const sun = b.sun ? { d: new THREE.Vector3(...b.sun.dir).normalize(), k: b.sun.shadow ?? 0.45 } : null;
    // spatial hash of "small" colliders (floors, walls and ceilings are handled by the analytic ground/room terms)
    const grid = new Map(); const key = (i, j, k) => `${i},${j},${k}`;
    const aabb = (c) => c.k === 'box' ? [c.min, c.max] : c.k === 'cyl' ? [[c.x - c.r, c.y0, c.z - c.r], [c.x + c.r, c.y1, c.z + c.r]] : [[c.x - c.r, c.y - c.r, c.z - c.r], [c.x + c.r, c.y + c.r, c.z + c.r]];
    this.cols.forEach((c, idx) => {
      const [lo, hi] = aabb(c); if (hi[0] - lo[0] > 12 || hi[2] - lo[2] > 12) return;
      for (let i = Math.floor((lo[0] - R) / CELL); i <= Math.floor((hi[0] + R) / CELL); i++) for (let j = Math.floor((lo[1] - R) / CELL); j <= Math.floor((hi[1] + R) / CELL); j++) for (let k = Math.floor((lo[2] - R) / CELL); k <= Math.floor((hi[2] + R) / CELL); k++) { const kk = key(i, j, k); (grid.get(kk) || grid.set(kk, []).get(kk)).push(idx); }
    });
    const dist = (c, x, y, z) => {
      if (c.k === 'box') { const dx = Math.max(c.min[0] - x, 0, x - c.max[0]), dy = Math.max(c.min[1] - y, 0, y - c.max[1]), dz = Math.max(c.min[2] - z, 0, z - c.max[2]); return Math.hypot(dx, dy, dz); }
      if (c.k === 'cyl') { const rr = Math.max(0, Math.hypot(x - c.x, z - c.z) - c.r), dy = Math.max(c.y0 - y, 0, y - c.y1); return Math.hypot(rr, dy); }
      return Math.max(0, Math.hypot(x - c.x, y - c.y, z - c.z) - c.r);
    };
    const gc = new THREE.Color(), tmpC = new THREE.Color();
    for (const part of this.parts.concat(this.glowParts)) {
      const g = part.g, P = g.attributes.position, N = g.attributes.normal, C = g.attributes.color; const glow = part.glow;
      for (let i = 0; i < P.count; i++) {
        const x = P.getX(i), y = P.getY(i), z = P.getZ(i), nx = N.getX(i), ny = N.getY(i), nz = N.getZ(i);
        if (part.ownColors) gc.setRGB(C.getX(i), C.getY(i), C.getZ(i)); else gc.copy(part.base);
        if (b.vary && !glow) { const v = 1 + (hash2(Math.floor(x * 3), Math.floor(z * 3) + Math.floor(y * 3)) - 0.5) * b.vary; gc.multiplyScalar(v); }
        let ao = 1, add = null;
        if (!glow) {
          const qx = x + nx * 0.3, qy = y + ny * 0.3, qz = z + nz * 0.3; let occ = 0;
          const cl = grid.get(key(Math.floor(qx / CELL), Math.floor(qy / CELL), Math.floor(qz / CELL)));
          if (cl) for (const ci of cl) { if (this.colG[ci] === part.grp) continue; const d = dist(this.cols[ci], qx, qy, qz); if (d < R) { const t = 1 - d / R; occ += t * t; } }
          ao *= 1 - Math.min(0.7, occ * strength);
          if (b.groundY !== undefined) { const h = Math.max(0, y - b.groundY); ao *= 1 - (b.groundAO ?? 0.4) * Math.exp(-h / 0.9) * (1 - Math.max(0, ny)); }
          if (b.room) { const r = b.room; const dd = Math.min(x - r.x[0], r.x[1] - x, z - r.z[0], r.z[1] - z, y - r.y[0], r.y[1] - y); ao *= 1 - (r.ao ?? 0.45) * Math.exp(-Math.max(0, dd) / 2.5); }
          if (b.grad) { const [y0, y1, m0, m1] = b.grad; ao *= m0 + (m1 - m0) * Math.max(0, Math.min(1, (y - y0) / (y1 - y0))); }
          if (ny < -0.5) ao *= b.under ?? 0.75;
          if (sun && nx * sun.d.x + ny * sun.d.y + nz * sun.d.z > -0.2) {
            let sh = 0; for (const s of this.occ) {
              if (s.grp === part.grp) continue; const dx = s.x - x, dy = s.y - y, dz = s.z - z; const t = dx * sun.d.x + dy * sun.d.y + dz * sun.d.z; if (t <= 0) continue;
              const d2 = dx * dx + dy * dy + dz * dz - t * t; const rr = s.r * s.r; if (d2 < rr) { const f = Math.min(1, (1 - Math.sqrt(d2) / s.r) * 2.2); if (f > sh) sh = f; }
            }
            ao *= 1 - sun.k * sh;
          }
        }
        for (const L of this.lightsBaked) {
          const dx = L.p.x - x, dy = L.p.y - y, dz = L.p.z - z; const d = Math.hypot(dx, dy, dz); if (d >= L.r) continue;
          const t = 1 - d / L.r; const nd = glow ? 1 : Math.max(0.25, (nx * dx + ny * dy + nz * dz) / (d || 1)); const w = L.i * t * t * nd;
          (add ||= new THREE.Color(0, 0, 0)).r += L.c.r * w; add.g += L.c.g * w; add.b += L.c.b * w;
        }
        if (glow) { C.setXYZ(i, gc.r, gc.g, gc.b); continue; }
        tmpC.copy(gc).multiplyScalar(amb * ao); if (add) { tmpC.r += gc.r * add.r; tmpC.g += gc.g * add.g; tmpC.b += gc.b * add.b; }
        C.setXYZ(i, tmpC.r, tmpC.g, tmpC.b);
      }
    }
  }
}
