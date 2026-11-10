import {
  TAG_BODY_RADIUS, TAG_BODY_DOWN, TAG_TOLERANCE_MS, TAG_COOLDOWN_MS, TAG_IMMUNITY_MS,
} from '../shared/protocol.js';
import { dist } from '../shared/math.js';

function bodyCenter(headP) {
  return [headP[0], headP[1] - TAG_BODY_DOWN, headP[2]];
}

export function handToBody(handP, headP) {
  return dist(handP, bodyCenter(headP)) - TAG_BODY_RADIUS;
}

export function inTagRange(taggerPose, targetPose) {
  if (!taggerPose || !targetPose) return false;
  const d = Math.min(
    handToBody(taggerPose.l.p, targetPose.h.p),
    handToBody(taggerPose.r.p, targetPose.h.p),
  );
  return d <= 0;
}

/** True if any tagger/target pose pair inside the latency window was in range. */
export function inRangeWithTolerance(tagger, target, now, windowMs = TAG_TOLERANCE_MS) {
  const tHist = samplesSince(tagger, now, windowMs);
  const vHist = samplesSince(target, now, windowMs);
  for (const a of tHist) for (const b of vHist) if (inTagRange(a.pose, b.pose)) return true;
  return false;
}

function samplesSince(player, now, windowMs) {
  const out = [];
  if (player.history) {
    for (const s of player.history) if (now - s.at <= windowMs) out.push(s);
  }
  if (player.pose && (!out.length || out[out.length - 1].at !== player.at)) {
    if (now - player.at <= windowMs * 2) out.push({ at: player.at, pose: player.pose });
  }
  return out;
}

/**
 * Server-authoritative tag. Clients only send a request (target id).
 * Returns { ok, reason? } or { ok:true, event }.
 */
export function tryTag(room, tagger, targetId, now = Date.now()) {
  if (!tagger?.it) return { ok: false, reason: 'not_it' };
  if (now < (tagger.coolUntil || 0)) return { ok: false, reason: 'cooldown' };
  const target = room.players.get(targetId);
  if (!target || target === tagger) return { ok: false, reason: 'bad_target' };
  if (room.mode === 'infection' && target.it) return { ok: false, reason: 'already_it' };
  if (room.mode === 'transfer' && target.it) return { ok: false, reason: 'already_it' };
  if (now < (target.immuneUntil || 0)) return { ok: false, reason: 'immune' };
  if (!inRangeWithTolerance(tagger, target, now)) return { ok: false, reason: 'out_of_reach' };

  if (room.mode === 'infection') {
    target.it = true;
  } else {
    tagger.it = false;
    target.it = true;
    tagger.immuneUntil = now + TAG_IMMUNITY_MS;
  }
  tagger.coolUntil = now + TAG_COOLDOWN_MS;
  target.coolUntil = now + TAG_COOLDOWN_MS;
  tagger.tags = (tagger.tags || 0) + 1;

  return {
    ok: true,
    event: {
      t: 'tag',
      from: tagger.id,
      to: target.id,
      mode: room.mode,
      it: itList(room),
      at: now,
    },
  };
}

export function itList(room) {
  return [...room.players.values()].filter((p) => p.it).map((p) => p.id);
}

/** First joiner is It. If every It leaves, the longest-present remaining player is It. */
export function ensureIt(room) {
  const ps = [...room.players.values()];
  if (!ps.length) return;
  if (ps.some((p) => p.it)) return;
  ps.sort((a, b) => a.joinedAt - b.joinedAt || a.id - b.id);
  ps[0].it = true;
}

export function publicState(room) {
  return {
    mode: room.mode,
    it: itList(room),
    players: [...room.players.values()].map((p) => ({
      id: p.id,
      name: p.name,
      cosmetics: p.cosmetics,
      it: !!p.it,
      joinedAt: p.joinedAt,
    })),
  };
}
