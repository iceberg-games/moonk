import * as THREE from 'three';
// Colliders: {k:'box',min:[x,y,z],max:[x,y,z]} | {k:'cyl',x,z,r,y0,y1} | {k:'sph',x,y,z,r}
/** Penetration of sphere (p, r) into collider c. Returns {n:Vector3(unit, outward), d:depth} or null. */
export function sphereVsCollider(c, p, r, out) {
  if (c.k === 'box') {
    const cx = Math.max(c.min[0], Math.min(p.x, c.max[0])), cy = Math.max(c.min[1], Math.min(p.y, c.max[1])), cz = Math.max(c.min[2], Math.min(p.z, c.max[2]));
    const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz; const l2 = dx * dx + dy * dy + dz * dz;
    if (l2 > r * r) return null;
    if (l2 > 1e-10) { const l = Math.sqrt(l2); out.n.set(dx / l, dy / l, dz / l); out.d = r - l; return out; }
    const ex = [p.x - c.min[0], c.max[0] - p.x, p.y - c.min[1], c.max[1] - p.y, p.z - c.min[2], c.max[2] - p.z];
    let bi = 0; for (let i = 1; i < 6; i++) if (ex[i] < ex[bi]) bi = i;
    out.n.set(0, 0, 0); out.n.setComponent(bi >> 1, bi & 1 ? 1 : -1); out.d = ex[bi] + r; return out;
  }
  if (c.k === 'cyl') {
    if (p.y < c.y0 - r || p.y > c.y1 + r) return null;
    const dx = p.x - c.x, dz = p.z - c.z; const rad = Math.hypot(dx, dz);
    const cy = Math.max(c.y0, Math.min(p.y, c.y1)); const dy = p.y - cy;
    if (rad <= c.r) {
      if (dy !== 0) { const l = Math.abs(dy); if (l > r) return null; out.n.set(0, Math.sign(dy), 0); out.d = r - l; return out; }
      const up = c.y1 - p.y, dn = p.y - c.y0, side = c.r - rad;
      if (up <= dn && up <= side) { out.n.set(0, 1, 0); out.d = up + r; } else if (dn <= side) { out.n.set(0, -1, 0); out.d = dn + r; } else { out.n.set(rad ? dx / rad : 1, 0, rad ? dz / rad : 0); out.d = side + r; }
      return out;
    }
    const qx = c.x + (dx / rad) * c.r, qz = c.z + (dz / rad) * c.r;
    const ax = p.x - qx, az = p.z - qz; const l2 = ax * ax + dy * dy + az * az; if (l2 > r * r) return null;
    const l = Math.sqrt(l2) || 1e-6; out.n.set(ax / l, dy / l, az / l); out.d = r - l; return out;
  }
  const dx = p.x - c.x, dy = p.y - c.y, dz = p.z - c.z; const l = Math.hypot(dx, dy, dz); const rr = r + c.r;
  if (l > rr) return null; if (l < 1e-6) { out.n.set(0, 1, 0); out.d = rr; return out; }
  out.n.set(dx / l, dy / l, dz / l); out.d = rr - l; return out;
}
const _tmp = { n: new THREE.Vector3(), d: 0 };
/** Deepest penetration over all colliders, or null. */
export function deepest(cols, p, r, out = { n: new THREE.Vector3(), d: 0, c: null }) {
  out.d = 0; out.c = null;
  for (const c of cols) { const h = sphereVsCollider(c, p, r, _tmp); if (h && h.d > out.d) { out.d = h.d; out.n.copy(h.n); out.c = c; } }
  return out.d > 0 ? out : null;
}
/** Highest walkable top surface at (x,z) not above y+step (or -Infinity). */
export function groundAt(cols, x, z, y, step = 0.35) {
  let best = -Infinity;
  for (const c of cols) {
    let top = null;
    if (c.k === 'box') { if (x >= c.min[0] && x <= c.max[0] && z >= c.min[2] && z <= c.max[2]) top = c.max[1]; }
    else if (c.k === 'cyl') { if (Math.hypot(x - c.x, z - c.z) <= c.r) top = c.y1; }
    else { const dx = x - c.x, dz = z - c.z, d2 = c.r * c.r - dx * dx - dz * dz; if (d2 > 0) top = c.y + Math.sqrt(d2); }
    if (top !== null && top <= y + step && top > best) best = top;
  }
  return best;
}
