import { COORD_BOUND, r3, r4 } from './protocol.js';

export function dist(a, b) {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export function quatLen(q) {
  return Math.hypot(q[0], q[1], q[2], q[3]);
}

export function quatNorm(q) {
  const n = quatLen(q);
  return n > 1e-8 ? [q[0] / n, q[1] / n, q[2] / n, q[3] / n] : [0, 0, 0, 1];
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function lerp3(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

/** Spherical interpolation; shortest path; falls back to normalized lerp when almost identical. */
export function slerp(a, b, t) {
  let ax = a[0], ay = a[1], az = a[2], aw = a[3];
  let bx = b[0], by = b[1], bz = b[2], bw = b[3];
  let dot = ax * bx + ay * by + az * bz + aw * bw;
  if (dot < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; dot = -dot; }
  if (dot > 0.9995) {
    const cx = ax + (bx - ax) * t, cy = ay + (by - ay) * t, cz = az + (bz - az) * t, cw = aw + (bw - aw) * t;
    const n = Math.hypot(cx, cy, cz, cw) || 1;
    return [cx / n, cy / n, cz / n, cw / n];
  }
  const theta = Math.acos(Math.min(1, dot));
  const s = Math.sin(theta);
  const w1 = Math.sin((1 - t) * theta) / s;
  const w2 = Math.sin(t * theta) / s;
  return [ax * w1 + bx * w2, ay * w1 + by * w2, az * w1 + bz * w2, aw * w1 + bw * w2];
}

export function isFiniteNum(x) {
  return typeof x === 'number' && Number.isFinite(x);
}

export function isVec3(v, bound = COORD_BOUND) {
  return Array.isArray(v) && v.length >= 3 && isFiniteNum(v[0]) && isFiniteNum(v[1]) && isFiniteNum(v[2])
    && Math.abs(v[0]) < bound && Math.abs(v[1]) < bound && Math.abs(v[2]) < bound;
}

export function isQuat(q) {
  if (!Array.isArray(q) || q.length < 4) return false;
  if (!isFiniteNum(q[0]) || !isFiniteNum(q[1]) || !isFiniteNum(q[2]) || !isFiniteNum(q[3])) return false;
  const n = quatLen(q);
  return n > 0.4 && n < 2.5;
}

function asPart(src) {
  if (!src) return null;
  if (Array.isArray(src)) {
    if (src.length >= 7 && isVec3(src, COORD_BOUND) && isQuat(src.slice(3, 7))) {
      return { p: [src[0], src[1], src[2]], q: quatNorm(src.slice(3, 7)) };
    }
    return null;
  }
  if (typeof src === 'object' && isVec3(src.p, COORD_BOUND) && isQuat(src.q)) {
    return { p: [src.p[0], src.p[1], src.p[2]], q: quatNorm(src.q) };
  }
  return null;
}

/** Parse a head + two-hand pose. Accepts compact 7-vectors or { p, q } objects. */
export function parsePose(head, left, right) {
  const h = asPart(head), l = asPart(left), r = asPart(right);
  if (!h || !l || !r) return null;
  return { h, l, r };
}

export function partToArr(part) {
  return [
    r3(part.p[0]), r3(part.p[1]), r3(part.p[2]),
    r4(part.q[0]), r4(part.q[1]), r4(part.q[2]), r4(part.q[3]),
  ];
}

export function arrToPart(a) {
  if (!Array.isArray(a) || a.length < 7) return null;
  if (!isVec3(a, COORD_BOUND) || !isQuat(a.slice(3, 7))) return null;
  return { p: [a[0], a[1], a[2]], q: quatNorm(a.slice(3, 7)) };
}

export function clonePose(pose) {
  return {
    h: { p: pose.h.p.slice(), q: pose.h.q.slice() },
    l: { p: pose.l.p.slice(), q: pose.l.q.slice() },
    r: { p: pose.r.p.slice(), q: pose.r.q.slice() },
  };
}

export function identPart(p = [0, 1.6, 0]) {
  return { p: p.slice(), q: [0, 0, 0, 1] };
}
