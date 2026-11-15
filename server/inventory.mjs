// Server-side Moons wallet, owned/unlock lists, buy + equip authorization.
// Persistence is keyed by logged-in account name, else by the client's device id (`did`).
// Guests with no did keep an in-memory wallet for that socket only.
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { BY_ID, CATALOG, DEFAULT_EQUIP, SLOTS, STARTER_IDS, STARTER_MOONS } from '../shared/cosmetics.mjs';

export const INV_FILE = process.env.MOONK_INV_FILE || join(dirname(fileURLToPath(import.meta.url)), 'inventory.json');
export const BUY_BURST = 3;
export const BUY_WINDOW_MS = 2000;

const STARTERS = [...STARTER_IDS];

function emptyInv() {
  return { moons: STARTER_MOONS, owned: [...STARTERS], unlocks: [], catches: 0, lifeTags: 0, nightWins: 0, visits: [] };
}

function normalize(row) {
  const o = { ...emptyInv(), ...(row && typeof row === 'object' ? row : {}) };
  o.moons = Math.max(0, Math.floor(Number(o.moons) || 0));
  o.owned = [...new Set([...(Array.isArray(o.owned) ? o.owned : []), ...STARTERS].filter((id) => typeof id === 'string'))];
  o.unlocks = [...new Set((Array.isArray(o.unlocks) ? o.unlocks : []).filter((id) => typeof id === 'string'))];
  o.catches = Math.max(0, Math.floor(Number(o.catches) || 0));
  o.lifeTags = Math.max(0, Math.floor(Number(o.lifeTags) || 0));
  o.nightWins = Math.max(0, Math.floor(Number(o.nightWins) || 0));
  o.visits = [...new Set((Array.isArray(o.visits) ? o.visits : []).filter((d) => typeof d === 'string'))];
  return o;
}

let db = { wallets: {} };
export function load() {
  try {
    if (existsSync(INV_FILE)) db = { wallets: {}, ...JSON.parse(readFileSync(INV_FILE, 'utf8')) };
    if (!db.wallets || typeof db.wallets !== 'object') db.wallets = {};
  } catch { db = { wallets: {} }; }
  return db;
}
function persist() {
  try {
    const tmp = INV_FILE + '.tmp';
    writeFileSync(tmp, JSON.stringify(db, null, 1), { mode: 0o600 });
    renameSync(tmp, INV_FILE);
  } catch { /* */ }
}

export function invKey({ user, did } = {}) {
  if (user) return 'user:' + String(user).toLowerCase();
  if (did) return 'did:' + String(did);
  return null;
}

export function loadWallet(key) {
  if (!key) return emptyInv();
  const w = normalize(db.wallets[key]);
  db.wallets[key] = w;
  return w;
}

export function saveWallet(key, inv) {
  if (!key) return;
  db.wallets[key] = normalize(inv);
  persist();
}

export function invPayload(inv) {
  const w = normalize(inv);
  return { t: 'inv', moons: w.moons, owned: [...w.owned], unlocks: [...w.unlocks] };
}

export function todayStamp(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
}

/** Record a calendar-day hub visit (America/Phoenix). Returns true if this added a new day. */
export function recordVisit(inv, day = todayStamp()) {
  if (!inv.visits.includes(day)) { inv.visits.push(day); return true; }
  return false;
}

/** 7 PM inclusive to 6 AM exclusive, America/Phoenix (no DST). */
export const NIGHT_START_HOUR = 19;
export const NIGHT_END_HOUR = 6;
/** Documented night maps when MAPS[id].night is not yet set. Drowned Lighthouse is "storm island at night". */
export const NIGHT_MAPS = Object.freeze(['lighthouse']);

export function phoenixHour(d = new Date()) {
  const part = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d).find((p) => p.type === 'hour');
  return Number(part?.value ?? 0);
}

/**
 * A room is a Night lobby when a round starts if:
 *   - MOONK_NIGHT=1 (test) or MOONK_NIGHT=0 (force day), else
 *   - the map is marked night (MAPS[id].night or NIGHT_MAPS), or
 *   - the America/Phoenix clock is in [19, 24) U [0, 6).
 */
export function isNightLobby(map, { now = new Date(), mapNight = false, force = process.env.MOONK_NIGHT } = {}) {
  if (force === '1' || force === 'true' || force === true) return true;
  if (force === '0' || force === 'false' || force === false) return false;
  if (mapNight || (map && NIGHT_MAPS.includes(map))) return true;
  const h = phoenixHour(now);
  return h >= NIGHT_START_HOUR || h < NIGHT_END_HOUR;
}

function met(unlock, inv) {
  const catches = /^tag_catches_(\d+)$/.exec(unlock);
  if (catches) return inv.catches >= Number(catches[1]);
  const streak = /^tag_streak_(\d+)$/.exec(unlock);
  if (streak) return inv.lifeTags >= Number(streak[1]);
  if (unlock === 'hub_visits_5') return (inv.visits || []).length >= 5;
  if (unlock === 'night_lobby_win') return (inv.nightWins || 0) >= 1;
  return false;
}

/** Newly earned unlock-only item ids, added to inv.unlocks. */
export function evaluateUnlocks(inv) {
  const newly = [];
  for (const item of CATALOG) {
    if (item.price != null) continue;
    if (inv.unlocks.includes(item.id)) continue;
    if (!item.unlock || !met(item.unlock, inv)) continue;
    inv.unlocks.push(item.id);
    newly.push({ id: item.id, reason: item.unlock });
  }
  return newly;
}

export function slotReason(id, slot, inv) {
  if (typeof id !== 'string' || !id) return 'unknown';
  const item = BY_ID[id];
  if (!item || item.slot !== slot) return 'unknown';
  if (item.unlock === 'starter' || item.price === 0 || STARTERS.includes(id)) return null;
  if (item.price == null) return inv.unlocks.includes(id) ? null : 'locked';
  return inv.owned.includes(id) ? null : 'not_owned';
}

/**
 * Authorize a full loadout against this wallet. Omitted / null slots become defaults
 * (no rejection). Each provided id that is unknown or not allowed is rejected with
 * reason 'unknown' | 'not_owned' | 'locked' and that slot falls back to its default.
 * Does not mutate input. snap ps[i].c should use the returned equip.
 */
export function applyLoadout(raw, inv) {
  const equip = { ...DEFAULT_EQUIP, v: 1 };
  const rejections = [];
  if (raw && typeof raw === 'object') {
    for (const slot of SLOTS) {
      const id = raw[slot];
      if (id == null || id === '') { equip[slot] = DEFAULT_EQUIP[slot]; continue; }
      if (typeof id !== 'string') { rejections.push({ slot, id: String(id), reason: 'unknown' }); continue; }
      const reason = slotReason(id, slot, inv);
      if (reason) { rejections.push({ slot, id, reason }); continue; }
      equip[slot] = id;
    }
  }
  return { equip, rejections };
}

export function buyReason(id, inv) {
  if (typeof id !== 'string' || !id || !BY_ID[id]) return 'unknown';
  const item = BY_ID[id];
  if (item.price == null) return 'not_for_sale';
  if (inv.owned.includes(id) || STARTERS.includes(id)) return 'owned';
  if (item.price > inv.moons) return 'moons';
  return null;
}

/** Deduct moons and add to owned. Caller already checked buyReason is null. */
export function applyBuy(id, inv) {
  const item = BY_ID[id];
  inv.moons -= item.price;
  if (!inv.owned.includes(id)) inv.owned.push(id);
}

export function buyLimited(me, now = Date.now()) {
  me.buyHits = (me.buyHits || []).filter((t) => now - t < BUY_WINDOW_MS);
  if (me.buyHits.length >= BUY_BURST) return true;
  me.buyHits.push(now);
  return false;
}

load();
