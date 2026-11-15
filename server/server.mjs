// Treetop/MOONK game server: rooms, map voting, server-authoritative tag/monster state. Real humans only (no bots).
// Run: node server/server.mjs   (PORT env, default 8830). Clients connect with ws://host:8830 (or wss:// behind TLS).
import { WebSocketServer } from 'ws';
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { timingSafeEqual } from 'node:crypto';
import * as accounts from './accounts.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// OWNER AUTH: the owner secret comes ONLY from env MOONK_OWNER_KEY or the gitignored file .owner-key. It is never sent to clients.
const OWNER_KEY = (process.env.MOONK_OWNER_KEY || (existsSync(join(ROOT, '.owner-key')) ? readFileSync(join(ROOT, '.owner-key'), 'utf8') : '')).trim();
const isOwnerKey = (k) => { if (!OWNER_KEY || typeof k !== 'string' || k.length !== OWNER_KEY.length) return false; try { return timingSafeEqual(Buffer.from(k), Buffer.from(OWNER_KEY)); } catch { return false; } };
const BAN_FILE = process.env.MOONK_BAN_FILE || join(ROOT, 'server', 'bans.json');
let bans = { devices: [], ips: [] }; try { if (existsSync(BAN_FILE)) bans = { ...bans, ...JSON.parse(readFileSync(BAN_FILE, 'utf8')) }; } catch { /* */ }
const saveBans = () => { try { writeFileSync(BAN_FILE, JSON.stringify(bans, null, 1)); } catch { /* */ } };
const REGION = process.env.MOONK_REGION || 'Local';
const loginHits = new Map();   // ip -> [timestamps]
const loginLimited = (ip) => { const t = Date.now(); const a = (loginHits.get(ip) || []).filter((x) => t - x < 60000); a.push(t); loginHits.set(ip, a); return a.length > 8; };
const nameInUse = (name, exceptWs) => { const n = name.toLowerCase(); for (const r of rooms.values()) for (const p of r.players.values()) if (p.ws !== exceptWs && p.name.toLowerCase() === n) return true; return false; };
const ADMIN_TOOLS = ['kick', 'ban', 'fling'], ADMIN_RANGE = 2.2, FLING_SPEED = 20;
import { MAPS, MODES, MONSTERS, CLASSIC_REACH, FORM_TELL, dwellFor, GEN_ENABLED, GEN_COIN, formDef, GEN_SPOTS, GEN_TURNS, GEN_MAX_RATE, GEN_GRAB_RANGE, genCountFor } from '../shared/defs.mjs';
import * as inventory from './inventory.mjs';
// Server inventory: Moons, owned ids, and unlocks are authoritative here (see {t:'buy'}, {t:'buyres'}, {t:'inv'}, {t:'cosrej'}, {t:'unlock'}).
// Snap ps[i].c and join/cos loadout shape {v:1,hat,face,fur,hand} are unchanged.

const TICK_MS = 50;            // 20 Hz snapshots
const IMMUNE_MS = 2000;        // normal: a freshly tagged player can't tag for this long
const FAST = !!process.env.TT_FAST;   // TT_FAST=1 shortens timers for tests
const COUNTDOWN_MS = FAST ? 1500 : 3000, ROUND_END_MS = FAST ? 1500 : 6000, MAX_PLAYERS = 10;
const voteMs = (r) => (FAST ? 3000 : r.mode === 'horror' ? 24000 : 15000);   // monster: ~6s result + 24s vote ≈ 30s intermission
const roundSecs = (r) => (FAST ? 12 : MODES[r.mode].round);

const rooms = new Map();
let nextId = 1;
const now = () => Date.now();
const rnd = (n) => Math.floor(Math.random() * n);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function code() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do { c = Array.from({ length: 4 }, () => A[rnd(A.length)]).join(''); } while (rooms.has(c)); return c; }
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const bcast = (room, o) => { const s = JSON.stringify(o); for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(s); };
const sendInv = (p) => send(p.ws, inventory.invPayload(p.inv));
const sendCosRej = (ws, rejections) => { for (const r of rejections) send(ws, { t: 'cosrej', slot: r.slot, id: r.id, reason: r.reason }); };
const persistInv = (p) => inventory.saveWallet(p.invKey, p.inv);
function grantPendingUnlocks(p) {
  const newly = inventory.evaluateUnlocks(p.inv);
  if (!newly.length) return;
  persistInv(p);
  for (const u of newly) send(p.ws, { t: 'unlock', id: u.id, items: [u.id], reason: u.reason });
  sendInv(p);
}
function onCatch(p) { p.inv.catches += 1; p.inv.lifeTags += 1; persistInv(p); grantPendingUnlocks(p); }
function onTagged(p) { p.inv.lifeTags = 0; persistInv(p); }
function creditMoons(p, n) { if (!n) return; p.inv.moons += n; persistInv(p); sendInv(p); }
const pick = (obj, v, d) => (v in obj ? v : d);
const tally = (r) => { const o = {}; for (const m of r.votes.values()) o[m] = (o[m] || 0) + 1; return o; };

function newRoom(mode, monster, isPrivate = false) {
  const r = { code: code(), map: 'forest', mode: pick(MODES, mode, 'normal'), monster: monster in MONSTERS ? monster : 'random',
    players: new Map(), votes: new Map(), host: null, phase: 'lobby', phaseAt: now(), phaseEnds: 0, round: 0, msg: 'Waiting for players', lastMonster: null, mType: null, gens: [], isPrivate: !!isPrivate, night: false };
  rooms.set(r.code, r); return r;
}
const roomInfo = (r) => ({ code: r.code, public: !r.isPrivate, map: r.map, votes: tally(r), mode: r.mode, monster: r.monster, host: r.host, phase: r.phase, msg: r.msg, left: Math.max(0, Math.ceil((r.phaseEnds - now()) / 1000)), mType: r.mType, round: r.round, night: !!r.night, gens: r.gens.map((g) => ({ id: g.id, x: g.x, y: g.y, z: g.z, ry: g.ry, p: +g.p.toFixed(3) })) });
const sync = (r) => bcast(r, { t: 'room', room: roomInfo(r) });
function setPhase(r, phase, msg = '', ms = 0) { r.phase = phase; r.phaseAt = now(); r.phaseEnds = ms ? now() + ms : 0; r.msg = msg; sync(r); }
// Ability effects that need the server's eyes: run ONCE when an ability goes active. Returns extra fields for the abgo event.
function abEffect(r, p, ab) {
  if (!p.pose) return {};
  const head = p.pose.h, runners = [...r.players.values()].filter((v) => v !== p && v.role === 'monkey' && !v.caught && v.pose);
  if (ab.id === 'reel') {
    const [x, y, z, w] = p.pose.q, f = [-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))];   // facing = camera forward (-Z) rotated by the head quaternion
    let best = null, bt = ab.range;
    for (const v of runners) { const d = [v.pose.h[0] - head[0], v.pose.h[1] - head[1], v.pose.h[2] - head[2]]; const t = d[0] * f[0] + d[1] * f[1] + d[2] * f[2]; if (t < 0.3 || t > bt) continue;
      if (Math.hypot(d[0] - f[0] * t, d[1] - f[1] * t, d[2] - f[2] * t) <= ab.radius) { best = v; bt = t; } }
    if (best) { const d = [head[0] - best.pose.h[0], head[1] - best.pose.h[1], head[2] - best.pose.h[2]], L = Math.hypot(...d) || 1, pull = Math.max(0, Math.min(ab.yank, L - 0.9)), sp = pull / 0.3;
      best.stunUntil = now() + ab.stun * 1000; send(best.ws, { t: 'fling', v: [d[0] / L * sp, d[1] / L * sp + 2.2, d[2] / L * sp], stun: ab.stun }); }
    return { o: head, f, len: best ? bt : ab.range, hit: best ? best.id : 0 };
  }
  if (ab.id === 'shriek') {
    const near = runners.filter((v) => dist(v.pose.h, head) <= ab.radius);
    for (const v of near) send(v.ws, { t: 'shr', gain: ab.gain, ms: ab.active * 1000 });
    send(p.ws, { t: 'ping', ids: near.map((v) => v.id), ms: ab.ping * 1000 });   // only the Wailer learns who it marked
    return { n: near.length };
  }
  if (ab.id === 'tether') {
    const [x, y, z, w] = p.pose.q, f = [-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))], cosC = Math.cos(ab.cone * Math.PI / 180);
    let best = null, bd = ab.range;
    for (const v of runners) { const d = [v.pose.h[0] - head[0], v.pose.h[1] - head[1], v.pose.h[2] - head[2]], L = Math.hypot(...d); if (L < 0.2 || L > bd) continue; if ((d[0] * f[0] + d[1] * f[1] + d[2] * f[2]) / L >= cosC) { best = v; bd = L; } }
    if (best) { const o = [...best.pose.h]; send(best.ws, { t: 'tether', o, r: ab.leash, ms: ab.active * 1000 }); return { o, f, hit: best.id, ms: ab.active * 1000 }; }
    return { o: head, f, hit: 0, ms: 0 };
  }
  return {};
}
function resetRound(r) { r.mType = null; r.gens = []; r.grab = new Map(); for (const p of r.players.values()) { p.it = false; p.caught = false; p.role = 'monkey'; p.form = null; p.formAt = 0; p.xfEnd = 0; p.xfTo = null; p.abState = 0; p.abT = 0; p.abAt = 0; p.dgName = null; } }

function startVote(r, msg = 'Vote for the next map!') { resetRound(r); r.votes.clear(); setPhase(r, 'vote', msg, voteMs(r)); }
function resolveVote(r) {
  const tl = tally(r); const max = Math.max(0, ...Object.values(tl));
  const top = max ? Object.keys(tl).filter((k) => tl[k] === max) : [r.map];   // tie -> random; no votes -> keep map
  r.map = top[rnd(top.length)]; r.votes.clear();
  setPhase(r, 'countdown', `Map: ${MAPS[r.map].name}`, COUNTDOWN_MS); bcast(r, { t: 'ev', k: 'map', map: r.map });
}
function startRound(r) {
  const ps = [...r.players.values()]; resetRound(r); r.round++;
  if (ps.length < 2) { r.night = false; setPhase(r, 'lobby', 'Waiting for players'); return; }
  r.night = inventory.isNightLobby(r.map, { mapNight: !!(MAPS[r.map] && MAPS[r.map].night) });
  if (r.mode === 'normal') {
    const f = ps[rnd(ps.length)]; f.it = true; f.cool = now() + 1500;
    setPhase(r, 'play', `${f.name} is IT!`, roundSecs(r) * 1000); bcast(r, { t: 'ev', k: 'start', by: f.id }); return;
  }
  const pool = ps.filter((p) => p.id !== r.lastMonster); const src = pool.length ? pool : ps; const m = src[rnd(src.length)];   // rotate who is the monster
  const types = Object.keys(MONSTERS); r.mType = r.monster === 'random' ? types[rnd(types.length)] : r.monster;
  m.role = 'monster'; m.form = MONSTERS[r.mType].startForm; m.formAt = 0; m.cool = now() + 1500; r.lastMonster = m.id;
  const spots = [...(GEN_SPOTS[r.map] || [])]; r.gens = []; if (GEN_ENABLED && r.mode === 'horror') for (let i = 0, n = genCountFor(ps.length); i < n && spots.length; i++) { const sp = spots.splice(rnd(spots.length), 1)[0]; r.gens.push({ id: i, x: sp[0], y: sp[1], z: sp[2], ry: Math.atan2(-sp[0], -sp[2]), p: 0, done: false }); }
  setPhase(r, 'play', `${m.name} is the ${MONSTERS[r.mType].name}! Run, monkeys!`, roundSecs(r) * 1000);
  bcast(r, { t: 'ev', k: 'start', by: m.id, type: r.mType });
}
function endRound(r, msg) {
  const winners = [];
  if (r.mode === 'horror') {
    const mon = [...r.players.values()].find((p) => p.role === 'monster');
    if (mon && msg.startsWith('Monster')) { mon.wins++; winners.push(mon); }
    else for (const p of r.players.values()) if (p.role === 'monkey' && !p.caught) { p.wins++; winners.push(p); }
  } else if (r.mode === 'normal' && msg.startsWith('Time!')) {
    for (const p of r.players.values()) if (!p.it) winners.push(p);
  }
  if (r.night) for (const p of winners) { if (!p.inv) continue; p.inv.nightWins += 1; persistInv(p); grantPendingUnlocks(p); }
  setPhase(r, 'over', msg, ROUND_END_MS); bcast(r, { t: 'ev', k: 'over', msg });
}

function detectTags(r) {
  const t = now(); const ps = [...r.players.values()].filter((p) => p.pose);
  if (r.mode === 'normal') {
    for (const a of ps) { if (!a.it || t < a.cool) continue;
      for (const v of ps) { if (v === a || v.it) continue;
        const vh = v.pose.h, ap = a.pose;
        if (Math.min(dist(ap.l, vh), dist(ap.r, vh), dist(ap.h, vh) - 0.2) <= CLASSIC_REACH) {
          v.it = true; v.cool = t + IMMUNE_MS; a.tags++; onCatch(a); onTagged(v); bcast(r, { t: 'ev', k: 'tag', by: a.id, to: v.id });
          if (![...r.players.values()].some((p) => !p.it)) { endRound(r, `Everyone is infected! ${a.name} got the last tag`); return; }
          break; } } }
  } else {
    const mon = ps.find((p) => p.role === 'monster'); if (!mon) return;
    let def = formDef(r.mType, mon.form); if (!def || !def.canTag || t < mon.cool || mon.xfEnd || (MONSTERS[r.mType].ability?.noTag || [1]).includes(mon.abState)) { r.grab.clear(); return; }
    if (mon.abState === 2 && def.lunge) def = { ...def, ...def.lunge }; else if (mon.abState === 3 && def.erupt) def = { ...def, ...def.erupt };   // lunge dash: bigger, faster catch   // not while transforming (the tell)
    const dt = TICK_MS / 1000, head = mon.pose.h;
    const hands = [mon.pose.l, mon.pose.r].filter((h) => !def.armLength || dist(h, head) <= def.armLength + 0.3);   // long-arm forms: reject spoofed hands
    for (const v of ps) { if (v.role !== 'monkey' || v.caught) continue;
      const vh = v.pose.h; const d = Math.min(...hands.map((h) => dist(h, vh)), def.handOnly ? Infinity : dist(head, vh));
      if (d > def.reach) { const g = (r.grab.get(v.id) || 0) - dt * 2; if (g > 0) r.grab.set(v.id, g); else r.grab.delete(v.id); continue; }
      const prog = (r.grab.get(v.id) || 0) + dt / dwellFor(def, d);                 // closer = faster catch
      if (prog < 1) { r.grab.set(v.id, prog); continue; }
      r.grab.delete(v.id); v.caught = true; mon.cool = t + def.tagCooldown * 1000; mon.tags++; onCatch(mon); onTagged(v); bcast(r, { t: 'ev', k: 'tag', by: mon.id, to: v.id });
      { const ab = MONSTERS[r.mType].ability; if (ab?.revealOnTag && mon.abState === 2) { mon.abState = 3; mon.abT = t + ab.post * 1000; bcast(r, { t: 'ev', k: 'abpost', by: mon.id, id: ab.id }); } }   // a disguised Mimic that tags is unmasked
      if (![...r.players.values()].some((p) => p.role === 'monkey' && !p.caught)) { endRound(r, 'Monster wins! All monkeys caught'); return; }
      break; }
  }
}

function tick() {
  const t = now();
  for (const r of rooms.values()) {
    const n = r.players.size;
    if (n === 0) { rooms.delete(r.code); continue; }
    if (r.phase === 'lobby' && n >= 2) startVote(r);
    else if (r.phase === 'vote' && t >= r.phaseEnds) resolveVote(r);
    else if (r.phase === 'countdown' && t >= r.phaseEnds) startRound(r);
    else if (r.phase === 'over' && t >= r.phaseEnds) startVote(r, 'Intermission: vote for the next map!');
    else if (r.phase === 'play') {
      if (n < 2) { resetRound(r); setPhase(r, 'lobby', 'Waiting for players'); }
      else if (r.mode === 'normal' && t >= r.phaseEnds) { const left = [...r.players.values()].filter((p) => !p.it).length; endRound(r, `Time! ${left} runner${left === 1 ? '' : 's'} survived`); }
      else if (r.mode === 'normal' && ![...r.players.values()].some((p) => p.it)) { const ps = [...r.players.values()]; const f = ps[rnd(ps.length)]; f.it = true; f.cool = t + 1500; setPhase(r, 'play', `${f.name} is IT!`, Math.max(1000, r.phaseEnds - t)); }
      else if (r.mode === 'horror' && ![...r.players.values()].some((p) => p.role === 'monster')) startVote(r, 'Monster left. Vote for a map!');
      else if (r.mode === 'horror' && t >= r.phaseEnds) endRound(r, 'Monkeys win! Survived the full 2 minutes');
      else detectTags(r);
    }
    if (r.phase === 'play') for (const p of r.players.values()) { const ab = p.role === 'monster' && r.mType ? MONSTERS[r.mType].ability : null;
      if (ab && p.abState === 1 && t >= p.abT) { p.abState = 2; p.abT = t + ab.active * 1000; const e = { t: 'ev', k: 'abgo', by: p.id, id: ab.id, ...abEffect(r, p, ab) }; if (ab.private) send(p.ws, e); else bcast(r, e); }
      else if (ab && p.abState === 2 && t >= p.abT) { if (ab.post) { p.abState = 3; p.abT = t + ab.post * 1000; bcast(r, { t: 'ev', k: 'abpost', by: p.id, id: ab.id }); } else { p.abState = 0; bcast(r, { t: 'ev', k: 'abend', by: p.id, id: ab.id }); } }
      else if (ab && p.abState === 3 && t >= p.abT) { p.abState = 0; bcast(r, { t: 'ev', k: 'abend', by: p.id, id: ab.id }); } }
    if (r.phase === 'play') for (const p of r.players.values()) if (p.xfEnd && t >= p.xfEnd) { p.form = p.xfTo; p.xfEnd = 0; p.xfTo = null; bcast(r, { t: 'ev', k: 'form', by: p.id, form: p.form }); }   // the tell is over: the form flips now
    for (const p of r.players.values()) if (r.phase === 'play' && !p.it && !p.caught && p.role !== 'monster') p.survive += TICK_MS / 1000;
    const snap = { t: 'snap', ts: t, gp: r.gens.map((g) => +g.p.toFixed(3)), left: Math.max(0, Math.ceil((r.phaseEnds - t) / 1000)), night: !!r.night, ps: [...r.players.values()].filter((p) => p.pose).map((p) => ({ id: p.id, n: p.name, it: p.it, ro: p.role, fo: p.form, cg: p.caught, c: p.cos, tg: p.tags, sv: Math.round(p.survive), w: p.wins, tl: p.tool, xf: p.xfEnd ? Math.max(1, p.xfEnd - t) : 0, ab: p.abState || 0, ac: p.role === 'monster' && r.mType && MONSTERS[r.mType].ability ? Math.max(0, Math.round(((p.abAt + MONSTERS[r.mType].ability.cooldown * 1000) - t) / 100) / 10) : 0, xt: p.xfTo, fc: p.role === 'monster' && r.mType ? Math.max(0, Math.round(((p.formAt + MONSTERS[r.mType].switchCooldown * 1000) - t) / 100) / 10) : 0, ...p.pose })) };
    const dgs = [...r.players.values()].filter((p) => p.abState === 2 && p.dgName);   // disguised Mimics: the server holds the true identity; only the Mimic itself gets it back (plus a `dg` indicator)
    if (!dgs.length) bcast(r, snap); else for (const q of r.players.values()) send(q.ws, { ...snap, ps: snap.ps.map((e) => { const m = dgs.find((p) => p.id === e.id); return !m ? e : m === q ? { ...e, dg: m.dgName } : { ...e, n: m.dgName, ro: 'monkey', fo: null, xf: 0, ab: 0, ac: 0, it: false, tg: 0, sv: 0, w: 0, c: m.dgCos || e.c }; }) });
  }
}

const http = createServer((req, res) => {
  const h = { 'content-type': 'application/json', 'access-control-allow-origin': '*' };
  if (req.url === '/health') { res.writeHead(200, h); res.end(JSON.stringify({ ok: true, rooms: rooms.size, players: [...rooms.values()].reduce((a, r) => a + r.players.size, 0) })); return; }
  if (req.url === '/rooms') { res.writeHead(200, h); res.end(JSON.stringify([...rooms.values()].map((r) => ({ ...roomInfo(r), players: r.players.size })))); return; }
  res.writeHead(200); res.end('MOONK game server');
});
const wss = new WebSocketServer({ server: http, maxPayload: 4096 });

wss.on('connection', (ws, req) => {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  let me = null, room = null, auth = null;
  ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; });
  const leave = () => {
    if (!room || !me) return;
    room.players.delete(me.id); room.votes.delete(me.id); bcast(room, { t: 'left', id: me.id });
    if (room.host === me.id) { const nx = room.players.values().next().value; room.host = nx ? nx.id : null; }
    sync(room); room = null;
  };
  ws.on('message', (raw) => {
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (m.t === 'login' || m.t === 'register') {
      if (loginLimited(ip)) return send(ws, { t: 'auth', ok: false, msg: 'Too many attempts, wait a minute' });
      if (m.t === 'register') { const r = accounts.create(m.user, m.pass); if (!r.ok) return send(ws, { t: 'auth', ok: false, msg: r.err }); auth = { name: r.name, owner: false }; }
      else { const a = accounts.check(m.user, m.pass); if (!a) return send(ws, { t: 'auth', ok: false, msg: 'Wrong username or password' }); auth = a; }
      return send(ws, { t: 'auth', ok: true, name: auth.name, owner: auth.owner });
    }
    if (m.t === 'logout') { auth = null; return send(ws, { t: 'auth', ok: false, msg: 'Logged out' }); }
    if (m.t === 'list') return send(ws, { t: 'rooms', region: REGION, rooms: [...rooms.values()].map((r) => ({ code: r.code, mode: r.mode, players: r.players.size, phase: r.phase })) });
    if (m.t === 'join') {
      leave();
      const did = String(m.did || '').replace(/[^\w-]/g, '').slice(0, 40);
      if ((did && bans.devices.includes(did)) || (ip && bans.ips.includes(ip))) { send(ws, { t: 'error', msg: 'You are banned from MOONK.' }); return ws.close(); }
      let name = String(m.name || 'Player').replace(/[^\w \-]/g, '').trim().slice(0, 14) || 'Player';
      if (auth) name = auth.name;
      else if (accounts.exists(name)) return send(ws, { t: 'error', code: 'name_taken', msg: 'Name taken' });
      if (nameInUse(name, ws)) return send(ws, { t: 'error', code: 'name_taken', msg: 'Name taken' });
      let r = null;
      if (m.room) { r = rooms.get(String(m.room).toUpperCase()); if (!r) return send(ws, { t: 'error', msg: 'Room not found' }); }
      else if (m.quick) r = [...rooms.values()].filter((x) => !x.isPrivate && x.players.size < MAX_PLAYERS && (!m.mode || x.mode === m.mode)).sort((a, b) => b.players.size - a.players.size)[0] || null;
      if (!r) r = newRoom(m.mode, m.monster, !m.quick);   // "New room" is private (join by code); quick-join opens or fills a public lobby
      if (r.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'Room full' });
      const key = inventory.invKey({ user: auth && auth.name, did });
      const inv = inventory.loadWallet(key);
      inventory.recordVisit(inv);
      const newly = inventory.evaluateUnlocks(inv);
      const equipped = inventory.applyLoadout(m.cos, inv);
      me = { id: nextId++, name, ws, it: false, role: 'monkey', form: null, formAt: 0, caught: false, cool: 0, pose: null, cos: equipped.equip, tags: 0, survive: 0, wins: 0, did, ip, owner: !!(auth && auth.owner) || isOwnerKey(m.ownerKey), tool: null, lastAdmin: 0, inv, invKey: key };
      persistInv(me);
      room = r; r.players.set(me.id, me); if (!r.host) r.host = me.id;
      send(ws, { t: 'welcome', id: me.id, room: roomInfo(r), owner: me.owner, tools: me.owner ? ADMIN_TOOLS : [] });
      for (const u of newly) send(ws, { t: 'unlock', id: u.id, items: [u.id], reason: u.reason });
      sendInv(me);
      sendCosRej(ws, equipped.rejections);
      sync(r);
    } else if (!me || !room) return;
    else if (m.t === 'pose') {
      const ok = (a) => Array.isArray(a) && a.length >= 3 && a.every((x) => Number.isFinite(x) && Math.abs(x) < 1000);
      if (ok(m.h) && ok(m.l) && ok(m.r)) me.pose = { h: m.h.slice(0, 3), q: Array.isArray(m.q) ? m.q.slice(0, 4) : [0, 0, 0, 1], l: m.l.slice(0, 3), r: m.r.slice(0, 3) };
    } else if (m.t === 'form' && room.phase === 'play' && me.role === 'monster') {
      // Server enforced: switchCooldown counted from the start of the previous switch, and a FORM_TELL second "transforming" tell before the form flips.
      const d = formDef(room.mType, me.form); const mt = MONSTERS[room.mType];
      if (d?.switchTo && !me.xfEnd && now() - me.formAt >= mt.switchCooldown * 1000) { me.xfTo = d.switchTo; me.xfEnd = now() + FORM_TELL * 1000; me.formAt = now(); bcast(room, { t: 'ev', k: 'formstart', by: me.id, to: me.xfTo, ms: FORM_TELL * 1000 }); }
      else send(ws, { t: 'ev', k: 'formdenied' });
    } else if (m.t === 'ab' && room.phase === 'play' && me.role === 'monster') {
      // Signature ability (Gulper lunge, Grinner blackout): server enforced cooldown (from the start of the last use) and tell.
      const ab = MONSTERS[room.mType]?.ability;
      if (ab && !me.abState && !me.xfEnd && now() - (me.abAt || 0) >= ab.cooldown * 1000) { me.abState = 1; me.abAt = now(); me.abT = now() + ab.tell * 1000; if (ab.id === 'disguise') { const pool = [...room.players.values()].filter((q) => q.role === 'monkey' && !q.caught); const who = pool[rnd(pool.length)]; me.dgName = who ? who.name : 'Moonk'; me.dgCos = who ? who.cos : null; } const e = { t: 'ev', k: 'abstart', by: me.id, id: ab.id, ms: ab.tell * 1000 }; if (ab.private) send(ws, e); else bcast(room, e); }
      else if (ab?.release && me.abState === 2) me.abT = now();   // Lurker: the button ends the cling early; the tick moves it on to the pounce window (state 3)
      else send(ws, { t: 'ev', k: 'abdenied' });
    } else if (m.t === 'valve' && room.phase === 'play' && room.mode === 'horror' && me.role === 'monkey' && !me.caught && me.pose) {
      const g = room.gens[m.id | 0]; if (!g || g.done || !Number.isFinite(m.d)) return;
      const vp = [g.x, g.y + 1.15, g.z]; if (Math.min(dist(me.pose.l, vp), dist(me.pose.r, vp)) > GEN_GRAB_RANGE) return;
      const t = now(); const dt = Math.min(0.5, Math.max(0.03, (t - (me.lastValve || t - 100)) / 1000)); me.lastValve = t;
      const maxA = GEN_MAX_RATE * dt, d = Math.max(-maxA, Math.min(maxA, m.d));   // + = clockwise
      const before = g.p; g.p = Math.max(0, Math.min(1, g.p + d / (Math.PI * 2 * GEN_TURNS)));
      if (g.p >= 1 && !g.done) { g.done = true; g.by = me.id; me.coins = (me.coins || 0) + GEN_COIN; creditMoons(me, GEN_COIN); bcast(room, { t: 'ev', k: 'gen', id: g.id, by: me.id, coin: GEN_COIN }); sync(room); }
      else if (before !== g.p && Math.floor(before * 4) !== Math.floor(g.p * 4)) bcast(room, { t: 'ev', k: 'genstep', id: g.id });
    } else if (m.t === 'tool') { me.tool = me.owner && ADMIN_TOOLS.includes(m.tool) ? m.tool : null; }
    else if (m.t === 'admin') {
      // Every kick / ban / fling is validated server-side: owner session only, target in the same room, hit range, rate limit.
      if (!me.owner || !ADMIN_TOOLS.includes(m.a) || !me.pose || now() - me.lastAdmin < 400) return;
      const v = room.players.get(m.to | 0); if (!v || v === me || v.owner || !v.pose) return;
      if (Math.min(dist(me.pose.l, v.pose.h), dist(me.pose.r, v.pose.h)) > ADMIN_RANGE) return;
      me.lastAdmin = now();
      if (m.a === 'fling') {
        const hand = dist(me.pose.l, v.pose.h) < dist(me.pose.r, v.pose.h) ? me.pose.l : me.pose.r;
        let d = [v.pose.h[0] - hand[0], 0.35, v.pose.h[2] - hand[2]]; const l = Math.hypot(d[0], d[1], d[2]) || 1; d = d.map((x) => (x / l) * FLING_SPEED);
        send(v.ws, { t: 'fling', v: d }); bcast(room, { t: 'ev', k: 'fling', to: v.id });
      } else {
        if (m.a === 'ban') { if (v.did && !bans.devices.includes(v.did)) bans.devices.push(v.did); if (v.ip && !bans.ips.includes(v.ip)) bans.ips.push(v.ip); saveBans(); }
        send(v.ws, { t: 'kicked', ban: m.a === 'ban' }); bcast(room, { t: 'ev', k: m.a, to: v.id }); setTimeout(() => v.ws.close(), 100);
      }
    } else if (m.t === 'vote' && room.phase === 'vote' && m.map in MAPS) { room.votes.set(me.id, m.map); sync(room); }
    else if (m.t === 'cos') {
      const equipped = inventory.applyLoadout(m.cos, me.inv);
      me.cos = equipped.equip;
      sendCosRej(ws, equipped.rejections);
    } else if (m.t === 'buy') {
      const id = m.id;
      if (inventory.buyLimited(me)) return send(ws, { t: 'buyres', id, ok: false, reason: 'rate_limited' });
      const reason = inventory.buyReason(id, me.inv);
      if (reason) return send(ws, { t: 'buyres', id, ok: false, reason });
      inventory.applyBuy(id, me.inv); persistInv(me);
      send(ws, { t: 'buyres', id, ok: true });
      sendInv(me);
    }
    else if (m.t === 'set' && room.host === me.id) {
      if (m.mode in MODES) room.mode = m.mode;
      if (m.monster in MONSTERS || m.monster === 'random') room.monster = m.monster;
      startVote(room, 'Settings changed. Vote for a map!');
    } else if (m.t === 'ping') send(ws, { t: 'pong', ts: m.ts });
  });
  ws.on('close', leave); ws.on('error', () => {});
});

const iv = setInterval(tick, TICK_MS);
const hb = setInterval(() => { for (const ws of wss.clients) { if (!ws.isAlive) { ws.terminate(); continue; } ws.isAlive = false; ws.ping(); } }, 15000);
export function start(port = Number(process.env.PORT) || 8830) {
  return new Promise((ok) => http.listen(port, '0.0.0.0', () => { console.log(`[moonk] server on ws://0.0.0.0:${port}`); ok({ port, close: () => { clearInterval(iv); clearInterval(hb); wss.close(); http.close(); } }); }));
}
if (import.meta.url === `file://${process.argv[1]}`) start();
