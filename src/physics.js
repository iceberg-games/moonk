import * as THREE from 'three';
// ======================================================================================================
// MOONK locomotion. Gorilla Tag-style arm movement: hands are small sphere colliders, a touching hand
// sticks to the surface and the body moves by the NEGATIVE of the hand's movement, letting go keeps the
// recent swing velocity. All of the tuning lives in LOCO right here. Units: metres, seconds.
// Everything is time based (exponentials, time windows, sweeps), so it behaves the same at 72/90/120 Hz.
// Colliders: {k:'box',min,max} | {k:'cyl',x,z,r,y0,y1} | {k:'sph',x,y,z,r}. A collider may carry an optional
// `slip` (0 = full grip, 1 = ice) for slippery surfaces, e.g. { k:'box', ..., slip: 0.9 }.
// ======================================================================================================
export const LOCO = {
  // --- hands -------------------------------------------------------------------------------------
  handRadius: 0.1,        // hand sphere collider. GT uses roughly 0.05-0.1; 0.1 feels forgiving on thin ledges and branches.
  skin: 0.01,             // contact margin: a hand counts as touching up to 1 cm off the surface. Prevents flicker while you hold still.
  armLength: 1.0,         // max distance the (visual) hand may be from the head. Real arms are ~0.7 m, this only catches tracking glitches / blocked bodies.
  maxHandSpeed: 30,       // hand speed (m/s, relative to the body) above which a frame is treated as a tracking glitch and ignored (no force).
  sweepStep: 0.05,        // continuous collision: hand path is sampled every <= 5 cm (half the hand radius) so fast swings can not tunnel through thin walls.
  maxHandPenetration: 0.12, // if a held hand ends up deeper than this (body was blocked), the body is pushed back out by the excess.
  // --- push-off / release ---------------------------------------------------------------------------
  velWindow: 0.085,       // s of hand-driven body velocity looked at on release (time based, so 72/90/120 Hz match). Was 0.065.
  peakWeight: 2,          // release velocity = mean of per-frame velocities weighted by speed^peakWeight (x dt). 0 = plain average; 2 = a hard swing that slows down before release still counts at nearly its peak.
  jumpMultiplier: 1.4,    // release speed = peak-weighted swing speed * this. Was 1.2. Higher = snappier, more explosive launches.
  maxJumpSpeed: 9.0,      // m/s cap on a push-off. Was 6.5. Hard ceiling on how fast arm strokes can fling you.
  wallPushBonus: 1.2,     // extra release gain when you launch off a near-vertical surface (|normal.y| < wallNormalY) away from it: wall kicks and climb-flings feel strong.
  wallNormalY: 0.35,      // surfaces with |normal.y| below this count as walls/trunks for the bonus.
  minReleaseSpeed: 0.35,  // below this an unclamped release just drops (stops tiny drift when you let go while still).
  maxFall: 25,            // m/s terminal fall speed (falling is not capped by maxSpeed so a long drop does not bleed your sideways speed).
  maxSpeed: 9.5,          // absolute speed cap in the air. Was 9.0. Server flings can exceed maxJumpSpeed but not this.
  // --- air + gravity -------------------------------------------------------------------------------
  gravity: 9.8,           // m/s^2. Real gravity gives GT's floaty-but-not-moon feel because jump speed is capped at 6.5.
  airDrag: 0.02,          // 1/s exponential velocity damping (v *= exp(-drag*dt)). Was 0.12. Nearly none: arcs stay long and fast.
  // --- body (head sphere) --------------------------------------------------------------------------------
  headRadius: 0.2,        // head sphere. You cannot lean through walls or floors; the whole play space is pushed back out.
  bodyRadius: 0.2,        // torso sphere hanging under the head (monkeys have a body, not just a floating head).
  bodyDrop: 0.45,         // torso sphere centre is this far below the head. Resting head height = bodyDrop + bodyRadius = 0.65 m, so hands hanging at hip height reach the ground (the GT stance).
  slideNormalY: 0.6,      // surface normal.y below this (steeper than ~53 deg) is too steep to rest on: the body slides down it.
  groundFriction: 2.2,    // 1/s horizontal friction while the body rests on a stand-able surface. Was 7. You skid (6 m/s slides ~2.7 m) instead of stopping dead.
  slideFriction: 0.4,     // 1/s friction on steep surfaces (small, so you slide).
  // --- timing ----------------------------------------------------------------------------------------------
  maxDt: 0.05,            // longest simulated frame; longer stalls (tab switch) are clamped.
  // --- walker (Locust / Yeti stick movement, has legs) --------------------------------------------------------
  walk: { stepUp: 0.35, bodyRadius: 0.3, turnSmooth: 1.9, snapAngle: Math.PI / 6, snapCooldown: 0.28, deadzone: 0.12 },
};

const _tmp = { n: new THREE.Vector3(), d: 0 };
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

// ======================================================================================================
// Locomotion controller. One instance per local player. Pure maths on THREE.Vector3 (no DOM/XR), so it is
// also unit-testable in node: see scripts/loco-test.mjs.
//   rp    = the rig (play space) origin in world space. It is moved in place.
//   headL / handsL[i] = tracked positions in rig space (world - rp). The rig is not rotated in arm mode.
// ======================================================================================================
const V = () => new THREE.Vector3();
export class Locomotion {
  constructor() {
    this.vel = V();                         // free-flight velocity (m/s)
    this.touch = [false, false];            // hand currently touching a surface
    this.touchN = [V(), V()];               // contact normals
    this.touchC = [null, null];             // collider being touched
    this.impact = [0, 0];                   // set on the frame a hand first touches: hand speed (m/s). 0 otherwise. Use for haptics/sfx.
    this.vis = [V(), V()];                  // visual hands (world): clamped to surfaces and to arm length. Draw/send these.
    this.headHit = null;                    // normal of the surface the body is resting on / sliding down (or null)
    this.holding = false;                   // any hand touching
    this.gain = 1;                          // release-speed multiplier (the Wailer's Shriek sets 0.5 for a couple of seconds)
    this.leash = null;                      // {o: Vector3, r, t}: soft leash to a point (the Stringman's Tether): the head may not stray more than r m from o for t seconds
    this.clinging = false;                  // set by cling() (the Lurker): true while stuck to a surface
    this.stun = 0;                          // seconds left in which hands cannot grab (the Dangler's Reel)
    this.grounded = false;                  // head sphere resting on a stand-able surface this frame
    this._prev = [V(), V()]; this._has = false; this._samples = []; this._yv = 0; this._snapAt = -1;
    this._h = { n: V(), d: 0, c: null }; this._a = V(); this._b = V(); this._p = V(); this._d = V(); this._hd = V(); this._pn = V(); this._hh = { n: V(), d: 0, c: null };
  }
  /** Forget all state (respawn, new map, switching between arm and walker modes). */
  reset() { this.vel.set(0, 0, 0); this.touch[0] = this.touch[1] = false; this.holding = false; this._has = false; this._samples.length = 0; this._yv = 0; this.headHit = null; }
  /** Server fling or any external impulse. */
  impulse(v) { this.vel.set(v[0], v[1], v[2]); this._samples.length = 0; if (this.vel.length() > LOCO.maxSpeed * 2.5) this.vel.setLength(LOCO.maxSpeed * 2.5); }

  /** Move the body by d in head-radius/2 increments, pushing the head sphere out of anything it hits. Cancels velocity into surfaces. */
  _move(cols, rp, headL, d, dt) {
    const len = d.length(); const hr = LOCO.headRadius; const n = Math.max(1, Math.ceil(len / (hr * 0.5)));
    const sx = d.x / n, sy = d.y / n, sz = d.z / n; const head = this._a, vel = this.vel;
    for (let k = 0; k < n; k++) {
      rp.x += sx; rp.y += sy; rp.z += sz;
      for (let it = 0; it < 4; it++) {
        head.copy(rp).add(headL); let h = deepest(cols, head, hr, this._hh);
        if (!h) { head.y -= LOCO.bodyDrop; h = deepest(cols, head, LOCO.bodyRadius, this._hh); if (!h) break; }   // head first, then torso
        rp.addScaledVector(h.n, h.d + 1e-4);
        const into = vel.dot(h.n); if (into < 0) vel.addScaledVector(h.n, -into);
        this.headHit = this.headHit || V(); this.headHit.copy(h.n); this._hitC = h.c;
      }
    }
  }
  /** Is a hand sphere (radius + skin) overlapping anything at p? Fills this._h. */
  _ov(cols, p) { return deepest(cols, p, LOCO.handRadius + LOCO.skin, this._h); }
  /**
   * Continuous hand contact test from S to E (world). Returns null (free) or {P, n, c}: the point where the hand
   * stops (first overlap along the path, bisected to ~1 mm), the surface normal and collider.
   * Holding: if the hand already overlaps at S it stays "touching" while the end of the move still overlaps; leaving the surface releases.
   */
  _contact(cols, S, E, out) {
    if (this._ov(cols, S)) { if (!this._ov(cols, E)) return null; out.P.copy(S); out.n.copy(this._h.n); out.c = this._h.c; return out; }
    const dx = E.x - S.x, dy = E.y - S.y, dz = E.z - S.z; const L = Math.hypot(dx, dy, dz); const k = Math.max(1, Math.ceil(L / LOCO.sweepStep)); const p = this._p;
    let lo = 0;
    for (let j = 1; j <= k; j++) {
      const f = j / k; p.set(S.x + dx * f, S.y + dy * f, S.z + dz * f);
      if (this._ov(cols, p)) {
        let a = lo, b = f;
        for (let i = 0; i < 6; i++) { const m = (a + b) / 2; p.set(S.x + dx * m, S.y + dy * m, S.z + dz * m); if (this._ov(cols, p)) b = m; else a = m; }
        out.P.set(S.x + dx * b, S.y + dy * b, S.z + dz * b); this._ov(cols, out.P); out.n.copy(this._h.n); out.c = this._h.c; return out;
      }
      lo = f;
    }
    return null;
  }

  /**
   * Advance arm locomotion one frame.
   * @returns this (read .touch, .impact, .vis, .vel). Moves rp in place.
   */
  step(dt, cols, rp, headL, handsL) {
    dt = Math.min(LOCO.maxDt, Math.max(1e-4, dt));
    const vel = this.vel, S = this._b, E = this._d, disp = this._hd, rem = this._pn; this.headHit = null; this._hitC = null; if (this.stun > 0) this.stun -= dt;
    if (!this._has) { this._prev[0].copy(handsL[0]); this._prev[1].copy(handsL[1]); this._has = true; }
    let any = false; const D = V(); const c = this._c ||= { P: V(), n: V(), c: null };
    for (let i = 0; i < 2; i++) {
      const cur = handsL[i], prev = this._prev[i]; const wasTouch = this.touch[i]; this.impact[i] = 0; this.touch[i] = false; this.touchC[i] = null;
      const speed = prev.distanceTo(cur) / dt;
      if (speed <= LOCO.maxHandSpeed && !(this.stun > 0)) {
        S.copy(rp).add(prev); E.copy(rp).add(cur);
        const hit = this._contact(cols, S, E, c);
        if (hit) {
          rem.copy(E).sub(hit.P);                                  // the part of the hand's move that was blocked by the surface
          const slip = hit.c?.slip || 0;
          if (slip > 0) { const rn = rem.dot(hit.n); rem.multiplyScalar(1 - slip).addScaledVector(hit.n, rn * slip); }   // slippery: only the push INTO the surface counts
          disp.copy(rem).multiplyScalar(-1);                       // body moves by the negative of the hand's blocked movement
          const b0 = this._d2 ||= V(); b0.copy(rp);
          this._move(cols, rp, headL, disp, dt);
          D.add(b0.sub(rp).multiplyScalar(-1));                    // displacement actually achieved (blocked by walls/floor if any)
          // held hand ended up too deep because the body was blocked: push the body out by the excess
          E.copy(rp).add(cur); const ph = deepest(cols, E, LOCO.handRadius, this._hh);
          if (ph && ph.d > LOCO.maxHandPenetration) { disp.copy(ph.n).multiplyScalar(ph.d - LOCO.maxHandPenetration); this._move(cols, rp, headL, disp, dt); }
          this.touch[i] = true; any = true; this.touchN[i].copy(hit.n); this.touchC[i] = hit.c;
          if (!wasTouch) this.impact[i] = Math.max(0.01, speed);
        }
      }
      prev.copy(cur);
    }
    if (any) {
      vel.set(0, 0, 0);
      const sm = this._samples; sm.push({ dt, x: D.x, y: D.y, z: D.z }); for (let i = 0; i < 2; i++) if (this.touch[i]) { this._wn = this._wn || V(); this._wn.copy(this.touchN[i]); }
      for (let k = sm.length - 1, tot = 0; k >= 0; k--) { tot += sm[k].dt; if (tot >= LOCO.velWindow) { sm.splice(0, k); break; } }   // keep ~velWindow seconds
      this.holding = true; this._yv = 0;
    } else {
      if (this.holding) {           // released: average hand-driven velocity over the window * multiplier, capped
        // peak-weighted estimate: weight each frame's velocity by speed^peakWeight * dt, so the fast part of the swing dominates
        let sx = 0, sy = 0, sz = 0, sw = 0;
        for (const q of this._samples) { const vx = q.x / q.dt, vy = q.y / q.dt, vz = q.z / q.dt; const w = Math.pow(Math.hypot(vx, vy, vz), LOCO.peakWeight) * q.dt; sx += vx * w; sy += vy * w; sz += vz * w; sw += w; }
        if (sw > 1e-9) vel.set(sx / sw, sy / sw, sz / sw);
        // ...but never faster than the fastest single frame, and scaled by how much of the window was really moving (a long hold then flick doesn't overcount)
        let peak = 0, tot = 0; for (const q of this._samples) { peak = Math.max(peak, Math.hypot(q.x, q.y, q.z) / q.dt); tot += q.dt; }
        if (vel.length() > peak) vel.setLength(peak);
        vel.multiplyScalar(LOCO.jumpMultiplier * this.gain);
        if (this._wn && Math.abs(this._wn.y) < LOCO.wallNormalY && vel.dot(this._wn) > 0) vel.multiplyScalar(LOCO.wallPushBonus);   // pushing off a wall/trunk, away from it
        if (vel.length() < LOCO.minReleaseSpeed) vel.set(0, 0, 0);
        if (vel.length() > LOCO.maxJumpSpeed) vel.setLength(LOCO.maxJumpSpeed);
        this._wn = null;
        this.holding = false; this._samples.length = 0;
      }
      // gravity + drag, integrated exactly for constant g so any frame rate gives the same arc
      const dragK = Math.exp(-LOCO.airDrag * dt); const vy0 = vel.y;
      vel.multiplyScalar(dragK); vel.y -= LOCO.gravity * dt;
      { const h = Math.hypot(vel.x, vel.z); if (h > LOCO.maxSpeed) { vel.x *= LOCO.maxSpeed / h; vel.z *= LOCO.maxSpeed / h; } vel.y = Math.max(-LOCO.maxFall, Math.min(LOCO.maxSpeed, vel.y)); }   // cap horizontal and upward speed; falling is limited separately
      disp.set(vel.x * dt, (vy0 * dragK + vel.y) * 0.5 * dt, vel.z * dt);
      this._move(cols, rp, headL, disp, dt);
      if (this.headHit) {                                           // resting on / sliding down a surface
        const n = this.headHit, slip = this._hitC?.slip || 0;
        const stand = n.y >= LOCO.slideNormalY; this.grounded = stand;
        const fr = (stand ? LOCO.groundFriction : LOCO.slideFriction) * (1 - slip);
        const vn = vel.dot(n); const vt = this._pn.copy(vel).addScaledVector(n, -vn);
        vel.addScaledVector(vt, -(1 - Math.exp(-fr * dt)));
        if (stand && vel.length() < 0.25) vel.set(0, 0, 0);
      } else this.grounded = false;
    }
    // keep head out of walls even with no movement (player leaning into a wall in real space)
    this._move(cols, rp, headL, disp.set(0, 0, 0), dt);
    if (this.leash) this._leash(rp, headL, dt);
    this._visual(cols, rp, headL, handsL);
    return this;
  }
  /** Soft leash: pull the body back toward the anchor so the head is at most leash.r away (spring, not a hard stop), and cancel velocity that pulls further out. */
  _leash(rp, headL, dt) {
    const L = this.leash; L.t -= dt; if (L.t <= 0) { this.leash = null; return; }
    const head = this._a.copy(rp).add(headL), d = this._d.copy(head).sub(L.o), dist = d.length();
    if (dist > L.r && dist > 1e-6) { d.multiplyScalar(1 / dist); rp.addScaledVector(d, -(dist - L.r) * Math.min(1, dt * 14)); const out = this.vel.dot(d); if (out > 0) this.vel.addScaledVector(d, -out); }
  }
  _visual(cols, rp, headL, handsL) {
    const head = this._a.copy(rp).add(headL);
    for (let i = 0; i < 2; i++) {
      const w = this.vis[i].copy(rp).add(handsL[i]); const v = this._d.copy(w).sub(head); const l = v.length();
      if (l > LOCO.armLength) w.copy(head).addScaledVector(v, LOCO.armLength / l);
      for (let it = 0; it < 2; it++) { const h = deepest(cols, w, LOCO.handRadius, this._hh); if (!h) break; w.addScaledVector(h.n, h.d); }
    }
  }

  /**
   * Walker movement for legged monsters (Locust, Yeti form). VRChat-style: left stick moves relative to where the head looks,
   * gravity + step-up ground follow, body radius collision against walls. `stick` = [x, y] (y: -1 = forward on Quest axes). Moves rp in place.
   */
  walk(dt, cols, rp, headL, stick, yaw, speed) {
    dt = Math.min(LOCO.maxDt, Math.max(1e-4, dt)); const W = LOCO.walk;
    this.vel.set(0, 0, 0); this.holding = false; this.touch[0] = this.touch[1] = false; this._has = false; this._samples.length = 0;
    const [lx, ly] = stick; const mag = Math.min(1, Math.hypot(lx, ly));
    if (mag > W.deadzone && speed > 0) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw); const rx = -fz, rz = fx;      // forward / right on the ground plane
      let dx = rx * lx + fx * -ly, dz = rz * lx + fz * -ly; const l = Math.hypot(dx, dz) || 1;
      const len = speed * mag * dt, n = Math.max(1, Math.ceil(len / 0.1)); dx = dx / l * len / n; dz = dz / l * len / n;
      for (let k = 0; k < n; k++) { rp.x += dx; rp.z += dz; this._wall(cols, rp, headL); }
    }
    // gravity + ground (step-up limited)
    this._yv -= LOCO.gravity * dt; rp.y += this._yv * dt;
    const hx = rp.x + headL.x, hz = rp.z + headL.z; const gnd = groundAt(cols, hx, hz, rp.y + W.stepUp);
    if (rp.y <= gnd) { rp.y = gnd; this._yv = 0; this.grounded = true; } else this.grounded = false;
    this._wall(cols, rp, headL);
    return this;
  }
  /**
   * Surface-following crawl (the Lurker's Cling): gravity off, the head stays ~0.3 m off the nearest wall / ceiling / floor collider within 1 m and the stick moves it along that surface.
   * On a wall, stick-forward climbs (when you look at it) and left/right slide sideways; on floors and ceilings the stick works as in walk(). No surface within reach: falls like walk().
   */
  cling(dt, cols, rp, headL, stick, yaw, speed) {
    dt = Math.min(LOCO.maxDt, Math.max(1e-4, dt)); const R = 1.0, stand = LOCO.headRadius + 0.1;
    this.vel.set(0, 0, 0); this.holding = false; this.touch[0] = this.touch[1] = false; this._has = false; this._samples.length = 0;
    const head = this._a.copy(rp).add(headL); let h = deepest(cols, head, R, this._hh);
    if (!h) { this.clinging = false; return this.walk(dt, cols, rp, headL, [0, 0], yaw, 0); }
    this.clinging = true; this._yv = 0; this.grounded = false;
    const n = this._pn.copy(h.n); const [lx, ly] = stick; const mag = Math.min(1, Math.hypot(lx, ly)); const W = LOCO.walk;
    if (mag > W.deadzone && speed > 0) {
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = -fz, rz = fx; const into = Math.max(0, -(fx * n.x + fz * n.z));   // how directly the head looks into the surface
      const dir = this._hd.set(rx * lx + fx * -ly, -ly * into * (Math.abs(n.y) < 0.7 ? 1 : 0), rz * lx + fz * -ly); dir.addScaledVector(n, -dir.dot(n));
      const l = dir.length(); if (l > 1e-4) {
        const len = speed * mag * dt, k = Math.max(1, Math.ceil(len / 0.1)); dir.multiplyScalar(len / k / l);
        for (let i = 0; i < k; i++) {
          rp.add(dir); head.copy(rp).add(headL); const hh = deepest(cols, head, R, this._hh);
          if (hh) { n.copy(hh.n); rp.addScaledVector(n, stand - (R - hh.d)); }
        }
      }
    } else rp.addScaledVector(n, (stand - (R - h.d)) * Math.min(1, dt * 10));   // idle: just hold the stand-off distance
    this._move(cols, rp, headL, this._d.set(0, 0, 0), dt);
    return this;
  }
  _wall(cols, rp, headL) {
    const W = LOCO.walk; const p = this._p;
    for (const h of [0.5, 1.0, 1.5]) { p.set(rp.x + headL.x, rp.y + h, rp.z + headL.z); const c = deepest(cols, p, W.bodyRadius, this._hh); if (c && Math.abs(c.n.y) < 0.9) { rp.x += c.n.x * c.d; rp.z += c.n.z * c.d; } }
  }
}
