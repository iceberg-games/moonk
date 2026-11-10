import { MAX_REACH, MAX_SPEED, SPEED_SLACK, SPEED_MAX_DT, REJOIN_SNAP_M, STALE_POSE_MS } from '../shared/protocol.js';
import { dist } from '../shared/math.js';

/**
 * Server-side movement / reach checks. The first accepted pose is always
 * allowed (spawn). Later poses are rejected (previous state kept) if they
 * teleport faster than MAX_SPEED or put a hand beyond MAX_REACH of the head.
 */
export function checkPose(prev, next, now) {
  const reachL = dist(next.h.p, next.l.p);
  const reachR = dist(next.h.p, next.r.p);
  if (reachL > MAX_REACH || reachR > MAX_REACH) {
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
  // A pose arriving almost immediately after the last one still cannot jump
  // further than a single tick's budget (stops "100 m in 1 ms" teleports).
  const tickBudget = MAX_SPEED * SPEED_SLACK * (SPEED_MAX_DT);
  if (dt < 0.02 && moved > maxMove) return { ok: false, reason: 'speed' };
  if (moved > maxMove && moved > 0.05) return { ok: false, reason: 'speed' };
  // Also reject if implied speed over the real dt is absurd even with slack.
  if (dt > 0 && moved / dt > MAX_SPEED * SPEED_SLACK * 2) return { ok: false, reason: 'speed' };
  void tickBudget;
  void STALE_POSE_MS;
  return { ok: true, pose: next };
}
