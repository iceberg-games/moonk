// Shared protocol constants for MOONK net.
// Compact message type letters follow Iceberg's habit of short broadcast names
// ('s' move, 'st' state, 'ev' events) to keep frames small.

export const TICK_HZ = 20;
export const TICK_MS = 1000 / TICK_HZ;
export const MAX_PLAYERS = 10;
export const MAX_MESSAGE_BYTES = 4096;
export const MAX_ROOMS = 200;
export const MAX_NAME_LEN = 16;

// Unambiguous alphabet: no 0/O, 1/I/L.
export const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const CODE_LENGTH = 6;

export const RENDER_DELAY_MS = 100;     // interpolation buffer (Iceberg uses ~100 ms minimum)
export const EXTRAPOLATE_MS = 250;      // Iceberg's dead-reckon cap
export const HEARTBEAT_MS = 5000;
export const CLIENT_HB_MISS_CLOSE = true;
export const TIMEOUT_MS = 20000;        // server drops a silent socket
export const STALE_POSE_MS = 2000;

export const MAX_SPEED = 18;            // m/s, with slack below
export const SPEED_SLACK = 1.25;
export const SPEED_MAX_DT = 0.25;       // seconds of movement credited per pose
export const REJOIN_SNAP_M = 8;         // after a long gap, still reject huge teleports
export const MAX_REACH = 1.45;          // metres, head to hand
export const COORD_BOUND = 500;

export const TAG_BODY_RADIUS = 0.5;
export const TAG_BODY_DOWN = 0.28;      // chest is a bit below the headset
export const TAG_TOLERANCE_MS = 180;    // accept a tag if it was in range recently
export const TAG_COOLDOWN_MS = 1500;
export const TAG_IMMUNITY_MS = 1000;    // transfer mode: brief tag-back immunity
export const POSE_HISTORY_MS = 300;

export const POSE_SEND_HZ = 20;
export const DEFAULT_TAG_MODE = 'transfer'; // 'transfer' | 'infection'
export const TAG_MODES = ['transfer', 'infection'];

// Token buckets (Iceberg-style take(): rate + burst).
export const RATE = {
  all:    { rate: 40, burst: 80 },
  pose:   { rate: 25, burst: 30 },
  tag:    { rate: 5,  burst: 8 },
  cos:    { rate: 1,  burst: 3 },
  join:   { rate: 2,  burst: 4 },
};

export const MSG = {
  QJ: 'qj',
  CP: 'cp',
  JC: 'jc',
  POSE: 'p',
  TAG: 'tag',
  COS: 'cos',
  HB: 'hb',
  LEAVE: 'leave',
  WELCOME: 'welcome',
  JOIN: 'join',
  LEFT: 'left',
  SNAP: 's',
  STATE: 'st',
  REJ: 'rej',
  ERR: 'err',
};

export function newBucket(kind) {
  const cfg = RATE[kind] || RATE.all;
  return { tokens: cfg.burst, t: 0, rate: cfg.rate, burst: cfg.burst };
}

/** Iceberg-style token bucket. Returns true if a token was taken. */
export function take(bucket, now = Date.now()) {
  bucket.tokens = Math.min(bucket.burst, bucket.tokens + (bucket.t ? (now - bucket.t) / 1000 * bucket.rate : bucket.burst));
  bucket.t = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}

export function sanitizeName(raw) {
  const s = String(raw ?? '')
    .replace(/[^\w \-]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME_LEN);
  return s || 'Player';
}

export function normalizeCode(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LENGTH);
}

export function isCodeShape(code) {
  if (!code || code.length !== CODE_LENGTH) return false;
  for (const ch of code) if (!CODE_ALPHABET.includes(ch)) return false;
  return true;
}

export function makeCode(taken) {
  for (let i = 0; i < 64; i++) {
    let c = '';
    for (let j = 0; j < CODE_LENGTH; j++) c += CODE_ALPHABET[(Math.random() * CODE_ALPHABET.length) | 0];
    if (!taken.has(c)) return c;
  }
  throw new Error('room code space exhausted');
}

export function r3(v) {
  return Math.round(v * 1000) / 1000;
}

export function r4(v) {
  return Math.round(v * 10000) / 10000;
}
