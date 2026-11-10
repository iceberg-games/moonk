// Remote-player interpolation buffer for MOONK.
// Inspired by Iceberg's multiplayer.js frame(): a render delay (default 100 ms),
// lerp of positions, and a capped extrapolation when packets are late.
// Rotations use quaternion slerp instead of Iceberg's yaw lerp.
import { RENDER_DELAY_MS, EXTRAPOLATE_MS } from '../shared/protocol.js';
import { lerp3, slerp, arrToPart, clonePose } from '../shared/math.js';

function partOf(sample, key) {
  return sample[key];
}

function blend(a, b, k) {
  return {
    h: { p: lerp3(a.h.p, b.h.p, k), q: slerp(a.h.q, b.h.q, k) },
    l: { p: lerp3(a.l.p, b.l.p, k), q: slerp(a.l.q, b.l.q, k) },
    r: { p: lerp3(a.r.p, b.r.p, k), q: slerp(a.r.q, b.r.q, k) },
  };
}

function extrapolate(a, b, ms) {
  const dt = (b.t - a.t) / 1000;
  const ex = Math.min(EXTRAPOLATE_MS, Math.max(0, ms)) / 1000;
  if (dt <= 1e-4 || ex <= 0) return clonePose(b);
  const vel = (pa, pb) => [(pb[0] - pa[0]) / dt, (pb[1] - pa[1]) / dt, (pb[2] - pa[2]) / dt];
  const step = (p, v) => [p[0] + v[0] * ex, p[1] + v[1] * ex, p[2] + v[2] * ex];
  // Hold the newest rotation — continuing angular velocity is too twitchy for VR hands.
  return {
    h: { p: step(b.h.p, vel(a.h.p, b.h.p)), q: b.h.q.slice() },
    l: { p: step(b.l.p, vel(a.l.p, b.l.p)), q: b.l.q.slice() },
    r: { p: step(b.r.p, vel(a.r.p, b.r.p)), q: b.r.q.slice() },
  };
}

export class InterpBuffer {
  constructor({ delayMs = RENDER_DELAY_MS, extrapolateMs = EXTRAPOLATE_MS, maxSamples = 40 } = {}) {
    this.delayMs = delayMs;
    this.extrapolateMs = extrapolateMs;
    this.maxSamples = maxSamples;
    this.samples = [];
  }

  reset() { this.samples = []; }

  /** @param {number} t server timestamp (ms) @param pose { h,l,r } */
  push(t, pose) {
    const last = this.samples[this.samples.length - 1];
    if (last && t <= last.t) return;
    this.samples.push({ t, h: pose.h, l: pose.l, r: pose.r });
    if (this.samples.length > this.maxSamples) this.samples.shift();
  }

  /** Sample the pose that should be drawn at server time `serverNow`. */
  sample(serverNow) {
    const sm = this.samples;
    if (!sm.length) return null;
    const T = serverNow - this.delayMs;
    while (sm.length > 2 && sm[1].t <= T) sm.shift();
    const a = sm[0];
    const b = sm[1] || sm[0];
    if (T <= a.t) return { pose: clonePose(a), extrapolated: false, snapped: sm.length === 1 };
    if (T >= b.t) {
      const late = T - b.t;
      if (late <= 0 || sm.length < 2) return { pose: clonePose(b), extrapolated: false, snapped: false };
      return { pose: extrapolate(a, b, Math.min(this.extrapolateMs, late)), extrapolated: late > 0, snapped: false };
    }
    const k = b.t > a.t ? Math.min(1, Math.max(0, (T - a.t) / (b.t - a.t))) : 1;
    return { pose: blend(a, b, k), extrapolated: false, snapped: false };
  }
}

export function poseFromSnapshotRow(row) {
  // [id, h0..h6, l0..l6, r0..r6]
  if (!Array.isArray(row) || row.length < 22) return null;
  const h = arrToPart(row.slice(1, 8));
  const l = arrToPart(row.slice(8, 15));
  const r = arrToPart(row.slice(15, 22));
  if (!h || !l || !r) return null;
  return { id: row[0], pose: { h, l, r } };
}

export { RENDER_DELAY_MS, EXTRAPOLATE_MS, partOf };
