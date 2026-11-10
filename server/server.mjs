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
import { MAPS, MODES, MONSTERS, CLASSIC_REACH, formDef, GEN_SPOTS, GEN_TURNS, GEN_MAX_RATE, GEN_GRAB_RANGE, genCountFor } from '../shared/defs.mjs';
import { sanitizeEquip } from '../shared/cosmetics.mjs';

const TICK_MS = 50;            // 20 Hz snapshots
const IMMUNE_MS = 2000;        // normal: a freshly tagged player can't tag for this long
const FAST = !!process.env.TT_FAST;   // TT_FAST=1 shortens timers for tests
const COUNTDOWN_MS = FAST ? 1500 : 3000, ROUND_END_MS = FAST ? 1500 : 6000, MAX_PLAYERS = 10;
const voteMs = (r) => (FAST ? 3000 : r.mode === 'horror' ? 24000 : 15000);   // monster: ~6s result + 24s vote ≈ 30s intermission
const roundSecs = () => (FAST ? 12 : MODES.horror.round);

const rooms = new Map();
let nextId = 1;
const now = () => Date.now();
const rnd = (n) => Math.floor(Math.random() * n);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
function code() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; let c; do { c = Array.from({ length: 4 }, () => A[rnd(A.length)]).join(''); } while (rooms.has(c)); return c; }
const send = (ws, o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)); };
const bcast = (room, o) => { const s = JSON.stringify(o); for (const p of room.players.values()) if (p.ws.readyState === 1) p.ws.send(s); };
const pick = (obj, v, d) => (v in obj ? v : d);
const tally = (r) => { const o = {}; for (const m of r.votes.values()) o[m] = (o[m] || 0) + 1; return o; };

function newRoom(mode, monster) {
  const r = { code: code(), map: 'forest', mode: pick(MODES, mode, 'normal'), monster: monster in MONSTERS ? monster : 'random',
    players: new Map(), votes: new Map(), host: null, phase: 'lobby', phaseAt: now(), phaseEnds: 0, round: 0, msg: 'Waiting for players', lastMonster: null, mType: null, gens: [] };
  rooms.set(r.code, r); return r;
}
const roomInfo = (r) => ({ code: r.code, map: r.map, votes: tally(r), mode: r.mode, monster: r.monster, host: r.host, phase: r.phase, msg: r.msg, left: Math.max(0, Math.ceil((r.phaseEnds - now()) / 1000)), mType: r.mType, round: r.round, gens: r.gens.map((g) => ({ id: g.id, x: g.x, y: g.y, z: g.z, ry: g.ry, p: +g.p.toFixed(3) })) });
const sync = (r) => bcast(r, { t: 'room', room: roomInfo(r) });
function setPhase(r, phase, msg = '', ms = 0) { r.phase = phase; r.phaseAt = now(); r.phaseEnds = ms ? now() + ms : 0; r.msg = msg; sync(r); }
function resetRound(r) { r.mType = null; r.gens = []; for (const p of r.players.values()) { p.it = false; p.caught = false; p.role = 'monkey'; p.form = null; p.formAt = 0; } }

function startVote(r, msg = 'Vote for the next map!') { resetRound(r); r.votes.clear(); setPhase(r, 'vote', msg, voteMs(r)); }
function resolveVote(r) {
  const tl = tally(r); const max = Math.max(0, ...Object.values(tl));
  const top = max ? Object.keys(tl).filter((k) => tl[k] === max) : [r.map];   // tie -> random; no votes -> keep map
  r.map = top[rnd(top.length)]; r.votes.clear();
  setPhase(r, 'countdown', `Map: ${MAPS[r.map].name}`, COUNTDOWN_MS); bcast(r, { t: 'ev', k: 'map', map: r.map });
}
function startRound(r) {
  const ps = [...r.players.values()]; resetRound(r); r.round++;
  if (ps.length < 2) { setPhase(r, 'lobby', 'Waiting for players'); return; }
  if (r.mode === 'normal') {
    const f = ps[rnd(ps.length)]; f.it = true; f.cool = now() + 1500;
    setPhase(r, 'play', `${f.name} is IT!`); bcast(r, { t: 'ev', k: 'start', by: f.id }); return;
  }
  const pool = ps.filter((p) => p.id !== r.lastMonster); const src = pool.length ? pool : ps; const m = src[rnd(src.length)];   // rotate who is the monster
  const types = Object.keys(MONSTERS); r.mType = r.monster === 'random' ? types[rnd(types.length)] : r.monster;
  m.role = 'monster'; m.form = MONSTERS[r.mType].startForm; m.formAt = 0; m.cool = now() + 1500; r.lastMonster = m.id;
  const spots = [...GEN_SPOTS[r.map]]; r.gens = []; for (let i = 0, n = genCountFor(ps.length); i < n && spots.length; i++) { const sp = spots.splice(rnd(spots.length), 1)[0]; r.gens.push({ id: i, x: sp[0], y: sp[1], z: sp[2], ry: Math.atan2(-sp[0], -sp[2]), p: 0, done: false }); }
  setPhase(r, 'play', `${m.name} is the ${MONSTERS[r.mType].name}! Run, monkeys!`, roundSecs() * 1000);
  bcast(r, { t: 'ev', k: 'start', by: m.id, type: r.mType });
}
function endRound(r, msg) {
  if (r.mode === 'horror') { const mon = [...r.players.values()].find((p) => p.role === 'monster'); if (mon && msg.startsWith('Monster')) mon.wins++; else for (const p of r.players.values()) if (p.role === 'monkey' && !p.caught) p.wins++; }
  setPhase(r, 'over', msg, ROUND_END_MS); bcast(r, { t: 'ev', k: 'over', msg });
}

function detectTags(r) {
  const t = now(); const ps = [...r.players.values()].filter((p) => p.pose);
  if (r.mode === 'normal') {
    for (const a of ps) { if (!a.it || t < a.cool) continue;
      for (const v of ps) { if (v === a || v.it) continue;
        const vh = v.pose.h, ap = a.pose;
        if (Math.min(dist(ap.l, vh), dist(ap.r, vh), dist(ap.h, vh) - 0.2) <= CLASSIC_REACH) {
          v.it = true; v.cool = t + IMMUNE_MS; a.tags++; bcast(r, { t: 'ev', k: 'tag', by: a.id, to: v.id });
          if (![...r.players.values()].some((p) => !p.it)) { endRound(r, `Everyone is infected! ${a.name} got the last tag`); return; }
          break; } } }
  } else {
    const mon = ps.find((p) => p.role === 'monster'); if (!mon) return;
    const def = formDef(r.mType, mon.form); if (!def || !def.canTag || t < mon.cool) return;
    for (const v of ps) { if (v.role !== 'monkey' || v.caught) continue;
      const vh = v.pose.h;
      if (Math.min(dist(mon.pose.h, vh), dist(mon.pose.l, vh), dist(mon.pose.r, vh)) <= def.reach) {
        v.caught = true; mon.cool = t + def.tagCooldown * 1000; mon.tags++; bcast(r, { t: 'ev', k: 'tag', by: mon.id, to: v.id });
        if (![...r.players.values()].some((p) => p.role === 'monkey' && !p.caught)) { endRound(r, 'Monster wins! All monkeys caught'); return; }
        break; } }
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
      else if (r.mode === 'normal' && ![...r.players.values()].some((p) => p.it)) { const ps = [...r.players.values()]; const f = ps[rnd(ps.length)]; f.it = true; f.cool = t + 1500; setPhase(r, 'play', `${f.name} is IT!`); }
      else if (r.mode === 'horror' && ![...r.players.values()].some((p) => p.role === 'monster')) startVote(r, 'Monster left. Vote for a map!');
      else if (r.mode === 'horror' && t >= r.phaseEnds) endRound(r, 'Monster wins! Generators not finished in time');
      else detectTags(r);
    }
    for (const p of r.players.values()) if (r.phase === 'play' && !p.it && !p.caught && p.role !== 'monster') p.survive += TICK_MS / 1000;
    bcast(r, { t: 'snap', ts: t, gp: r.gens.map((g) => +g.p.toFixed(3)), left: Math.max(0, Math.ceil((r.phaseEnds - t) / 1000)), ps: [...r.players.values()].filter((p) => p.pose).map((p) => ({ id: p.id, n: p.name, it: p.it, ro: p.role, fo: p.form, cg: p.caught, c: p.cos, tg: p.tags, sv: Math.round(p.survive), w: p.wins, tl: p.tool, ...p.pose })) });
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
      else if (m.quick) r = [...rooms.values()].filter((x) => x.players.size < MAX_PLAYERS && (!m.mode || x.mode === m.mode)).sort((a, b) => b.players.size - a.players.size)[0] || null;
      if (!r) r = newRoom(m.mode, m.monster);
      if (r.players.size >= MAX_PLAYERS) return send(ws, { t: 'error', msg: 'Room full' });
      me = { id: nextId++, name, ws, it: false, role: 'monkey', form: null, formAt: 0, caught: false, cool: 0, pose: null, cos: sanitizeEquip(m.cos), tags: 0, survive: 0, wins: 0, did, ip, owner: !!(auth && auth.owner) || isOwnerKey(m.ownerKey), tool: null, lastAdmin: 0 };
      room = r; r.players.set(me.id, me); if (!r.host) r.host = me.id;
      send(ws, { t: 'welcome', id: me.id, room: roomInfo(r), owner: me.owner, tools: me.owner ? ADMIN_TOOLS : [] }); sync(r);
    } else if (!me || !room) return;
    else if (m.t === 'pose') {
      const ok = (a) => Array.isArray(a) && a.length >= 3 && a.every((x) => Number.isFinite(x) && Math.abs(x) < 1000);
      if (ok(m.h) && ok(m.l) && ok(m.r)) me.pose = { h: m.h.slice(0, 3), q: Array.isArray(m.q) ? m.q.slice(0, 4) : [0, 0, 0, 1], l: m.l.slice(0, 3), r: m.r.slice(0, 3) };
    } else if (m.t === 'form' && room.phase === 'play' && me.role === 'monster') {
      const d = formDef(room.mType, me.form); const mt = MONSTERS[room.mType];
      if (d?.switchTo && now() - me.formAt >= mt.switchCooldown * 1000) { me.form = d.switchTo; me.formAt = now(); bcast(room, { t: 'ev', k: 'form', by: me.id, form: me.form }); }
      else send(ws, { t: 'ev', k: 'formdenied' });
    } else if (m.t === 'valve' && room.phase === 'play' && room.mode === 'horror' && me.role === 'monkey' && !me.caught && me.pose) {
      const g = room.gens[m.id | 0]; if (!g || g.done || !Number.isFinite(m.d)) return;
      const vp = [g.x, g.y + 1.15, g.z]; if (Math.min(dist(me.pose.l, vp), dist(me.pose.r, vp)) > GEN_GRAB_RANGE) return;
      const t = now(); const dt = Math.min(0.5, Math.max(0.03, (t - (me.lastValve || t - 100)) / 1000)); me.lastValve = t;
      const maxA = GEN_MAX_RATE * dt, d = Math.max(-maxA, Math.min(maxA, m.d));   // + = clockwise
      const before = g.p; g.p = Math.max(0, Math.min(1, g.p + d / (Math.PI * 2 * GEN_TURNS)));
      if (g.p >= 1 && !g.done) { g.done = true; bcast(room, { t: 'ev', k: 'gen', id: g.id, by: me.id }); sync(room);
        if (room.gens.every((x) => x.done)) endRound(room, 'Runners win! All generators complete'); }
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
    else if (m.t === 'cos') { me.cos = sanitizeEquip(m.cos); }
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
