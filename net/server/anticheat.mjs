import {
  MAX_REACH, MAX_SPEED, SPEED_SLACK, SPEED_MAX_DT, REJOIN_SNAP_M,
  YETI_ARM_LENGTH, YETI_ARM_SLACK, YETI_MAX_REACH,
} from '../shared/protocol.js';
import { dist } from '../shared/math.js';

/**
 * Per-role hand-reach cap, matching the game server:
 *   monkey / default: MAX_REACH (1.45 m)
 *   Yeti form: armLength + 0.3 = 3.5 m (shared/defs.mjs: server rejects
 *   hands further than armLength+0.3 so the long reach cannot be spoofed).
 * Locust has no arm extension, so it stays on the default cap.
 */
export function handReachLimit(player = {}) {
  if (player.maxReach != null && Number.isFinite(player.maxReach)) return player.maxReach;
  const arm = player.armLength
    ?? ((player.role === 'monster' && player.form === 'yeti') ? YETI_ARM_LENGTH : null);
  if (arm != null && Number.isFinite(arm)) return arm + YETI_ARM_SLACK;
  return MAX_REACH;
}

export { YETI_MAX_REACH, YETI_ARM_LENGTH, MAX_REACH };

/**
 * Server-side movement / reach checks. The first accepted pose is always
 * allowed (spawn) once hands are inside the role's reach cap. Later poses
 * are rejected (previous state kept) if they teleport faster than MAX_SPEED
 * or put a hand beyond the role's reach.
 */
export function checkPose(prev, next, now, player = {}) {
  const maxReach = handReachLimit(player);
  const reachL = dist(next.h.p, next.l.p);
  const reachR = dist(next.h.p, next.r.p);
  if (reachL > maxReach || reachR > maxReach) {
    return { ok: false, reason: 'reach' };
  }
  if (!prev || !prev.pose) return { ok: true, pose: next };

  const dt = Math.max(0, (now - prev.at) / 1000);
  const moved = dist(prev.pose.h.p, next.h.p);
  if (dt > 1) {
    if (moved > REJOIN_SNAP_M) return { ok: false, reason: 'speed' };
    return { ok: true, pose: next };
  }
  const credit = Math.min(SPEED_MAX_DT, Math.max(dt, 1 / 60));
  const maxMove = MAX_SPEED * SPEED_SLACK * credit;
  if (moved > maxMove && moved > 0.05) return { ok: false, reason: 'speed' };
  if (dt > 0 && moved / dt > MAX_SPEED * SPEED_SLACK * 2) return { ok: false, reason: 'speed' };
  return { ok: true, pose: next };
}
