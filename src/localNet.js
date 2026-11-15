// Single-player game "server" that runs inside the page. Same message protocol as server/server.mjs
// (join/pose/form/ab/valve/vote/set/cos in; welcome/room/snap/ev/fling/shr/tether/ping out), one room,
// the local player plus AI monkeys / an AI monster. Used when the build has no game server
// (VITE_WS_URL empty and no ?ws= param) so the hosted site plays offline. Multiplayer is untouched:
// game.js only picks LocalNet in that case. Moons/shop stay on the client save (no {t:'inv'} is ever sent).
import * as THREE from 'three';
import { Locomotion } from './physics.js';
import { MAPS, MODES, MONSTERS, CLASSIC_REACH, dwellFor, GEN_ENABLED, GEN_COIN, formDef, GEN_SPOTS, GEN_TURNS, GEN_MAX_RATE, GEN_GRAB_RANGE, genCountFor, FORM_TELL } from '../shared/defs.mjs';

const TICK_MS = 50, IMMUNE_MS = 2000, COUNTDOWN_MS = 3000, ROUND_END_MS = 6000, VOTE_MS = 10000;
const roundSecs = (r) => MODES[r.mode].round;
const BOT_NAMES = ['Bonzo', 'Kiki', 'Mango', 'Pip', 'Rascal', 'Coco', 'Taro', 'Nibbles', 'Zuzu', 'Biscuit'];
const BOT_LOOKS = [
  { hat: 'hat_banana_cap', face: null, fur: 'fur_banana', hand: null },
  { hat: 'hat_propeller', face: 'face_mustache', fur: 'fur_moonk_brown', hand: null },
  { hat: null, face: 'face_star_shades', fur: 'fur_midnight', hand: 'hand_boxing' },
  { hat: 'hat_party_cone', face: null, fur: 'fur_lunar_white', hand: 'hand_banana_cuffs' },
  { hat: 'hat_moon_beanie', face: 'face_bandit', fur: 'fur_sunset_stripe', hand: null },
  { hat: 'hat_bucket', face: null, fur: 'fur_moonk_gray', hand: 'hand_moon_bracers' },
].map((l) => ({ v: 1, ...l }));
const HUMAN = 1;
const now = () => Date.now();
const rnd = (n) => Math.floor(Math.random() * n);
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const flat = (a, b) => Math.hypot(a[0] - b[0], a[2] - b[2]);
function phoenixHour(d = new Date()) {
  try { return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Phoenix', hour: 'numeric', hourCycle: 'h23' }).formatToParts(d).find((p) => p.type === 'hour')?.value ?? 12); } catch { return 12; }
}
const isNight = (map) => map === 'lighthouse' || !!MAPS[map]?.night || phoenixHour() >= 19 || phoenixHour() < 6;
const tally = (r) => { const o = {}; for (const m of r.votes.values()) o[m] = (o[m] || 0) + 1; return o; };
const _q = new THREE.Quaternion(), _e = new THREE.Euler();

export class LocalNet {
  /** getMap(placeId) -> built map ({cols, spawn, voidY, radius}); 'hub' is the lobby. */
  constructor({ getMap } = {}) {
    this.local = true; this.h = {}; this.ws = null; this.id = null; this.open = false; this.url = 'local';
    this.getMap = getMap; this.room = null; this.iv = null;
  }
  on(t, fn) { (this.h[t] ||= []).push(fn); return this; }
  _emit(t, m) { (this.h[t] || []).forEach((f) => { try { f(m); } catch (e) { console.warn(e); } }); }
  connect() { this.open = true; return Promise.resolve(); }
  send(o) { try { this._msg(o); } catch (e) { console.warn('[local]', e); } }
  // ---- outgoing: only the human has a "socket"; bots react to the few messages that change them
  _out(o) { const s = JSON.parse(JSON.stringify(o)); setTimeout(() => this._emit(s.t, s), 0); }
  _to(p, o) {
    if (p.human) return this._out(o);
    if (o.t === 'fling' && o.stun) p.bot.stun = now() + o.stun * 1000;
    if (o.t === 'shr') p.bot.slow = now() + (o.ms || 2500);
  }
  _bcast(o) { this._out(o); }
  _sync() { const r = this.room; if (r) this._bcast({ t: 'room', room: this._info() }); }
  _info() {
    const r = this.room;
    return { code: 'SOLO', public: false, local: true, map: r.map, votes: tally(r), mode: r.mode, monster: r.monster, host: HUMAN, phase: r.phase, msg: r.msg, left: Math.max(0, Math.ceil((r.phaseEnds - now()) / 1000)), mType: r.mType, round: r.round, night: !!r.night, gens: r.gens.map((g) => ({ id: g.id, x: g.x, y: g.y, z: g.z, ry: g.ry, p: +g.p.toFixed(3) })) };
  }
  _phase(phase, msg = '', ms = 0) { const r = this.room; r.phase = phase; r.phaseAt = now(); r.phaseEnds = ms ? now() + ms : 0; r.msg = msg; this._sync(); }

  // ---- room setup
  _newPlayer(id, name, human, cos) {
    return { id, name, human, it: false, role: 'monkey', form: null, formAt: 0, caught: false, cool: 0, pose: null, cos, tags: 0, survive: 0, wins: 0, tool: null, xfEnd: 0, xfTo: null, abState: 0, abT: 0, abAt: 0,
      bot: human ? null : { loco: new Locomotion(), rp: new THREE.Vector3(), headL: new THREE.Vector3(0, 0.7, 0), place: null, yaw: Math.random() * 6.28, wander: Math.random() * 6.28, wanderT: 0, stuckT: 0, last: new THREE.Vector3(), stun: 0, slow: 0, voteAt: 0, far: 0, t: Math.random() * 10 } };
  }
  _fillBots(r, mode) {
    const want = mode === 'horror' ? 4 : 5;
    for (const p of [...r.players.values()]) if (!p.human) r.players.delete(p.id);
    const names = [...BOT_NAMES].sort(() => Math.random() - 0.5);
    for (let i = 0; i < want; i++) { const id = 2 + i; r.players.set(id, this._newPlayer(id, names[i], false, BOT_LOOKS[(i + rnd(6)) % BOT_LOOKS.length])); }
  }
  _pickMap(mode) { const ids = Object.keys(MAPS).filter((k) => mode !== 'horror' || MAPS[k].horror); return ids[rnd(ids.length)]; }
  _start(mode, msg) {
    const r = this.room; r.mode = mode in MODES ? mode : 'normal'; if (r.mode === 'horror') r.humanMonsterNext = true;
    this._fillBots(r, r.mode); this._reset(); r.votes.clear(); r.map = this._pickMap(r.mode);
    this._phase('countdown', msg || `Map: ${MAPS[r.map].name}`, COUNTDOWN_MS); this._bcast({ t: 'ev', k: 'map', map: r.map });
  }

  // ---- incoming
  _msg(m) {
    if (!m || typeof m !== 'object') return;
    if (m.t === 'join') {
      const name = String(m.name || 'Player').replace(/[^\w \-]/g, '').trim().slice(0, 14) || 'Player';
      if (!this.room) {
        this.room = { code: 'SOLO', map: 'forest', mode: 'normal', monster: m.monster in MONSTERS ? m.monster : 'random', players: new Map(), votes: new Map(), host: HUMAN, phase: 'lobby', phaseAt: now(), phaseEnds: 0, round: 0, msg: '', lastMonster: null, mType: null, gens: [], night: false, grab: new Map() };
        this.iv = setInterval(() => this._tick(), TICK_MS);
      }
      const r = this.room; const me = r.players.get(HUMAN) || this._newPlayer(HUMAN, name, true, m.cos || null);
      me.name = name; if (m.cos) me.cos = m.cos; r.players.set(HUMAN, me); this.id = HUMAN;
      this._out({ t: 'welcome', id: HUMAN, room: this._info(), owner: false, tools: [] });
      this._start(m.mode || 'normal');
      return;
    }
    const r = this.room; const me = r?.players.get(HUMAN); if (!r || !me) return;
    if (m.t === 'pose') {
      const ok = (a) => Array.isArray(a) && a.length >= 3 && a.every((x) => Number.isFinite(x) && Math.abs(x) < 1000);
      if (ok(m.h) && ok(m.l) && ok(m.r)) me.pose = { h: m.h.slice(0, 3), q: Array.isArray(m.q) ? m.q.slice(0, 4) : [0, 0, 0, 1], l: m.l.slice(0, 3), r: m.r.slice(0, 3) };
    } else if (m.t === 'form') { if (!this._form(me)) this._to(me, { t: 'ev', k: 'formdenied' }); }
    else if (m.t === 'ab') { if (!this._ab(me)) this._to(me, { t: 'ev', k: 'abdenied' }); }
    else if (m.t === 'valve' && r.phase === 'play' && r.mode === 'horror' && me.role === 'monkey' && !me.caught && me.pose) {
      const g = r.gens[m.id | 0]; if (!g || g.done || !Number.isFinite(m.d)) return;
      const vp = [g.x, g.y + 1.15, g.z]; if (Math.min(dist(me.pose.l, vp), dist(me.pose.r, vp)) > GEN_GRAB_RANGE) return;
      const t = now(); const dt = Math.min(0.5, Math.max(0.03, (t - (me.lastValve || t - 100)) / 1000)); me.lastValve = t;
      const maxA = GEN_MAX_RATE * dt, d = Math.max(-maxA, Math.min(maxA, m.d));
      const before = g.p; g.p = Math.max(0, Math.min(1, g.p + d / (Math.PI * 2 * GEN_TURNS)));
      if (g.p >= 1 && !g.done) { g.done = true; g.by = me.id; this._bcast({ t: 'ev', k: 'gen', id: g.id, by: me.id, coin: GEN_COIN }); this._sync(); }   // the client adds the Moon to its local save
      else if (before !== g.p && Math.floor(before * 4) !== Math.floor(g.p * 4)) this._bcast({ t: 'ev', k: 'genstep', id: g.id });
    } else if (m.t === 'vote' && r.phase === 'vote' && m.map in MAPS) { r.votes.set(me.id, m.map); this._sync(); }
    else if (m.t === 'cos') { if (m.cos && typeof m.cos === 'object') me.cos = m.cos; }
    else if (m.t === 'set') {
      if (m.monster in MONSTERS || m.monster === 'random') r.monster = m.monster;
      this._start(m.mode in MODES ? m.mode : r.mode, 'Settings changed');
    } else if (m.t === 'ping') this._out({ t: 'pong', ts: m.ts });
  }
  _form(p) {
    const r = this.room; if (r.phase !== 'play' || p.role !== 'monster') return false;
    const d = formDef(r.mType, p.form), mt = MONSTERS[r.mType];
    if (!(d?.switchTo && !p.xfEnd && now() - p.formAt >= mt.switchCooldown * 1000)) return false;
    p.xfTo = d.switchTo; p.xfEnd = now() + FORM_TELL * 1000; p.formAt = now(); this._bcast({ t: 'ev', k: 'formstart', by: p.id, to: p.xfTo, ms: FORM_TELL * 1000 }); return true;
  }
  _ab(p) {
    const r = this.room; if (r.phase !== 'play' || p.role !== 'monster') return false;
    const ab = MONSTERS[r.mType]?.ability;
    if (ab && !p.abState && !p.xfEnd && now() - (p.abAt || 0) >= ab.cooldown * 1000) {
      p.abState = 1; p.abAt = now(); p.abT = now() + ab.tell * 1000;
      if (ab.id === 'disguise') { const pool = [...r.players.values()].filter((q) => q.role === 'monkey' && !q.caught); const who = pool[rnd(pool.length)]; p.dgName = who ? who.name : 'Moonk'; p.dgCos = who ? who.cos : null; }
      const e = { t: 'ev', k: 'abstart', by: p.id, id: ab.id, ms: ab.tell * 1000 }; if (ab.private) this._to(p, e); else this._bcast(e); return true;
    }
    if (ab?.release && p.abState === 2) { p.abT = now(); return true; }
    return false;
  }

  // ---- round flow (ported from server/server.mjs)
  _reset() { const r = this.room; r.mType = null; r.gens = []; r.grab = new Map(); for (const p of r.players.values()) { p.it = false; p.caught = false; p.role = 'monkey'; p.form = null; p.formAt = 0; p.xfEnd = 0; p.xfTo = null; p.abState = 0; p.abT = 0; p.abAt = 0; p.dgName = null; } }
  _startVote(msg = 'Vote for the next map!') { const r = this.room; this._reset(); r.votes.clear(); for (const p of r.players.values()) if (p.bot) p.bot.voteAt = now() + 1500 + Math.random() * (VOTE_MS - 3000); this._phase('vote', msg, VOTE_MS); }
  _resolveVote() {
    const r = this.room; const tl = tally(r); const max = Math.max(0, ...Object.values(tl));
    const top = max ? Object.keys(tl).filter((k) => tl[k] === max) : [r.map]; r.map = top[rnd(top.length)]; r.votes.clear();
    this._phase('countdown', `Map: ${MAPS[r.map].name}`, COUNTDOWN_MS); this._bcast({ t: 'ev', k: 'map', map: r.map });
  }
  _startRound() {
    const r = this.room; const ps = [...r.players.values()]; this._reset(); r.round++;
    r.night = isNight(r.map);
    if (r.mode === 'normal') { const f = ps[rnd(ps.length)]; f.it = true; f.cool = now() + 1500; this._phase('play', `${f.name} is IT!`, roundSecs(r) * 1000); this._bcast({ t: 'ev', k: 'start', by: f.id }); return; }
    let m;
    if (r.humanMonsterNext) { m = r.players.get(HUMAN); r.humanMonsterNext = false; }   // Be the Monster: you hunt first, then the role rotates
    else { const pool = ps.filter((p) => p.id !== r.lastMonster); const src = pool.length ? pool : ps; m = src[rnd(src.length)]; }
    const types = Object.keys(MONSTERS); r.mType = r.monster === 'random' ? types[rnd(types.length)] : r.monster;
    m.role = 'monster'; m.form = MONSTERS[r.mType].startForm; m.formAt = 0; m.cool = now() + 1500; r.lastMonster = m.id;
    const spots = [...(GEN_SPOTS[r.map] || [])]; r.gens = [];
    if (GEN_ENABLED) for (let i = 0, n = genCountFor(ps.length); i < n && spots.length; i++) { const sp = spots.splice(rnd(spots.length), 1)[0]; r.gens.push({ id: i, x: sp[0], y: sp[1], z: sp[2], ry: Math.atan2(-sp[0], -sp[2]), p: 0, done: false }); }
    this._phase('play', `${m.human ? 'You are' : m.name + ' is'} the ${MONSTERS[r.mType].name}! Run, monkeys!`, roundSecs(r) * 1000);
    this._bcast({ t: 'ev', k: 'start', by: m.id, type: r.mType });
  }
  _endRound(msg) {
    const r = this.room;
    if (r.mode === 'horror') { const mon = [...r.players.values()].find((p) => p.role === 'monster'); if (mon && msg.startsWith('Monster')) mon.wins++; else for (const p of r.players.values()) if (p.role === 'monkey' && !p.caught) p.wins++; }
    this._phase('over', msg, ROUND_END_MS); this._bcast({ t: 'ev', k: 'over', msg });
  }
  _abEffect(p, ab) {
    const r = this.room; if (!p.pose) return {};
    const head = p.pose.h, runners = [...r.players.values()].filter((v) => v !== p && v.role === 'monkey' && !v.caught && v.pose);
    const fwd = () => { const [x, y, z, w] = p.pose.q; return [-2 * (x * z + w * y), -2 * (y * z - w * x), -(1 - 2 * (x * x + y * y))]; };
    if (ab.id === 'reel') {
      const f = fwd(); let best = null, bt = ab.range;
      for (const v of runners) { const d = [v.pose.h[0] - head[0], v.pose.h[1] - head[1], v.pose.h[2] - head[2]]; const t = d[0] * f[0] + d[1] * f[1] + d[2] * f[2]; if (t < 0.3 || t > bt) continue; if (Math.hypot(d[0] - f[0] * t, d[1] - f[1] * t, d[2] - f[2] * t) <= ab.radius) { best = v; bt = t; } }
      if (best) { const d = [head[0] - best.pose.h[0], head[1] - best.pose.h[1], head[2] - best.pose.h[2]], L = Math.hypot(...d) || 1, pull = Math.max(0, Math.min(ab.yank, L - 0.9)), sp = pull / 0.3; best.stunUntil = now() + ab.stun * 1000; this._to(best, { t: 'fling', v: [d[0] / L * sp, d[1] / L * sp + 2.2, d[2] / L * sp], stun: ab.stun }); }
      return { o: head, f, len: best ? bt : ab.range, hit: best ? best.id : 0 };
    }
    if (ab.id === 'shriek') { const near = runners.filter((v) => dist(v.pose.h, head) <= ab.radius); for (const v of near) this._to(v, { t: 'shr', gain: ab.gain, ms: ab.active * 1000 }); this._to(p, { t: 'ping', ids: near.map((v) => v.id), ms: ab.ping * 1000 }); return { n: near.length }; }
    if (ab.id === 'tether') {
      const f = fwd(), cosC = Math.cos(ab.cone * Math.PI / 180); let best = null, bd = ab.range;
      for (const v of runners) { const d = [v.pose.h[0] - head[0], v.pose.h[1] - head[1], v.pose.h[2] - head[2]], L = Math.hypot(...d); if (L < 0.2 || L > bd) continue; if ((d[0] * f[0] + d[1] * f[1] + d[2] * f[2]) / L >= cosC) { best = v; bd = L; } }
      if (best) { const o = [...best.pose.h]; this._to(best, { t: 'tether', o, r: ab.leash, ms: ab.active * 1000 }); if (best.bot) best.bot.stun = now() + ab.active * 600; return { o, f, hit: best.id, ms: ab.active * 1000 }; }
      return { o: head, f, hit: 0, ms: 0 };
    }
    return {};
  }
  _detectTags() {
    const r = this.room, t = now(), ps = [...r.players.values()].filter((p) => p.pose);
    if (r.mode === 'normal') {
      for (const a of ps) { if (!a.it || t < a.cool) continue;
        for (const v of ps) { if (v === a || v.it) continue; const vh = v.pose.h, ap = a.pose;
          if (Math.min(dist(ap.l, vh), dist(ap.r, vh), dist(ap.h, vh) - 0.2) <= CLASSIC_REACH) {
            v.it = true; v.cool = t + IMMUNE_MS; a.tags++; this._bcast({ t: 'ev', k: 'tag', by: a.id, to: v.id });
            if (![...r.players.values()].some((p) => !p.it)) { this._endRound(`Everyone is infected! ${a.name} got the last tag`); return; }
            break; } } }
      return;
    }
    const mon = ps.find((p) => p.role === 'monster'); if (!mon) return;
    let def = formDef(r.mType, mon.form); if (!def || !def.canTag || t < mon.cool || mon.xfEnd || (MONSTERS[r.mType].ability?.noTag || [1]).includes(mon.abState)) { r.grab.clear(); return; }
    if (mon.abState === 2 && def.lunge) def = { ...def, ...def.lunge }; else if (mon.abState === 3 && def.erupt) def = { ...def, ...def.erupt };
    const dt = TICK_MS / 1000, head = mon.pose.h; const hands = [mon.pose.l, mon.pose.r].filter((h) => !def.armLength || dist(h, head) <= def.armLength + 0.3);
    for (const v of ps) { if (v.role !== 'monkey' || v.caught) continue;
      const vh = v.pose.h; const d = Math.min(...hands.map((h) => dist(h, vh)), def.handOnly ? Infinity : dist(head, vh));
      if (d > def.reach) { const g = (r.grab.get(v.id) || 0) - dt * 2; if (g > 0) r.grab.set(v.id, g); else r.grab.delete(v.id); continue; }
      const prog = (r.grab.get(v.id) || 0) + dt / dwellFor(def, d); if (prog < 1) { r.grab.set(v.id, prog); continue; }
      r.grab.delete(v.id); v.caught = true; mon.cool = t + def.tagCooldown * 1000; mon.tags++; this._bcast({ t: 'ev', k: 'tag', by: mon.id, to: v.id });
      { const ab = MONSTERS[r.mType].ability; if (ab?.revealOnTag && mon.abState === 2) { mon.abState = 3; mon.abT = t + ab.post * 1000; this._bcast({ t: 'ev', k: 'abpost', by: mon.id, id: ab.id }); } }
      if (![...r.players.values()].some((p) => p.role === 'monkey' && !p.caught)) { this._endRound('Monster wins! All monkeys caught'); return; }
      break; }
  }
  _tick() {
    const r = this.room; if (!r) return; const t = now();
    if (r.phase === 'vote' && t >= r.phaseEnds) this._resolveVote();
    else if (r.phase === 'countdown' && t >= r.phaseEnds) this._startRound();
    else if (r.phase === 'over' && t >= r.phaseEnds) this._startVote('Intermission: vote for the next map!');
    else if (r.phase === 'play') {
      if (r.mode === 'normal' && t >= r.phaseEnds) { const left = [...r.players.values()].filter((p) => !p.it).length; this._endRound(`Time! ${left} runner${left === 1 ? '' : 's'} survived`); }
      else if (r.mode === 'horror' && t >= r.phaseEnds) this._endRound('Monkeys win! Survived the full 2 minutes');
      else this._detectTags();
    }
    if (r.phase === 'play') for (const p of r.players.values()) { const ab = p.role === 'monster' && r.mType ? MONSTERS[r.mType].ability : null;
      if (ab && p.abState === 1 && t >= p.abT) { p.abState = 2; p.abT = t + ab.active * 1000; const e = { t: 'ev', k: 'abgo', by: p.id, id: ab.id, ...this._abEffect(p, ab) }; if (ab.private) this._to(p, e); else this._bcast(e); }
      else if (ab && p.abState === 2 && t >= p.abT) { if (ab.post) { p.abState = 3; p.abT = t + ab.post * 1000; this._bcast({ t: 'ev', k: 'abpost', by: p.id, id: ab.id }); } else { p.abState = 0; this._bcast({ t: 'ev', k: 'abend', by: p.id, id: ab.id }); } }
      else if (ab && p.abState === 3 && t >= p.abT) { p.abState = 0; this._bcast({ t: 'ev', k: 'abend', by: p.id, id: ab.id }); } }
    if (r.phase === 'play') for (const p of r.players.values()) if (p.xfEnd && t >= p.xfEnd) { p.form = p.xfTo; p.xfEnd = 0; p.xfTo = null; this._bcast({ t: 'ev', k: 'form', by: p.id, form: p.form }); }
    for (const p of r.players.values()) if (r.phase === 'play' && !p.it && !p.caught && p.role !== 'monster') p.survive += TICK_MS / 1000;
    for (const p of r.players.values()) if (p.bot) this._bot(p, TICK_MS / 1000, t);
    const snap = { t: 'snap', ts: t, gp: r.gens.map((g) => +g.p.toFixed(3)), left: Math.max(0, Math.ceil((r.phaseEnds - t) / 1000)), night: !!r.night, ps: [...r.players.values()].filter((p) => p.pose).map((p) => ({ id: p.id, n: p.name, it: p.it, ro: p.role, fo: p.form, cg: p.caught, c: p.cos, tg: p.tags, sv: Math.round(p.survive), w: p.wins, tl: p.tool, xf: p.xfEnd ? Math.max(1, p.xfEnd - t) : 0, ab: p.abState || 0, ac: p.role === 'monster' && r.mType && MONSTERS[r.mType].ability ? Math.max(0, Math.round(((p.abAt + MONSTERS[r.mType].ability.cooldown * 1000) - t) / 100) / 10) : 0, xt: p.xfTo, fc: p.role === 'monster' && r.mType ? Math.max(0, Math.round(((p.formAt + MONSTERS[r.mType].switchCooldown * 1000) - t) / 100) / 10) : 0, ...p.pose })) };
    const dg = [...r.players.values()].find((p) => p.abState === 2 && p.dgName);   // disguised Mimic: only the Mimic itself sees through it
    if (dg && !dg.human) snap.ps = snap.ps.map((e) => e.id !== dg.id ? e : { ...e, n: dg.dgName, ro: 'monkey', fo: null, xf: 0, ab: 0, ac: 0, it: false, tg: 0, sv: 0, w: 0, c: dg.dgCos || e.c });
    else if (dg) snap.ps = snap.ps.map((e) => e.id !== dg.id ? e : { ...e, dg: dg.dgName });
    this._out(snap);
  }

  // ---- AI: bots walk (yaw convention: forward = (-sin yaw, -cos yaw), so heading toward d is atan2(-d.x, -d.z)) on the same colliders as the player (Locomotion.walk), chase / flee / wander
  _bot(p, dt, t) {
    const r = this.room, b = p.bot; const place = (r.phase === 'play' || r.phase === 'over') ? r.map : 'hub';
    const map = this.getMap?.(place); if (!map) return;
    if (b.place !== place) {
      b.place = place; const s = map.spawn, a = Math.random() * Math.PI * 2, d = 2.5 + Math.random() * 4;
      b.rp.set(s[0] + Math.cos(a) * d, s[1] + 0.5, s[2] + (place === 'hub' ? -Math.abs(Math.sin(a)) * d : Math.sin(a) * d)); b.loco.reset(); b.stuckT = 0;
    }
    const mon = r.phase === 'play' && p.role === 'monster'; const def = mon ? formDef(r.mType, p.form) : null; const ab = mon ? MONSTERS[r.mType]?.ability : null;
    const me = b.rp.clone().add(b.headL); const head = [me.x, me.y, me.z];
    const others = [...r.players.values()].filter((q) => q !== p && q.pose);
    const nearest = (f) => { let best = null, bd = Infinity; for (const q of others) { if (!f(q)) continue; const d = flat(q.pose.h, head); if (d < bd) { bd = d; best = q; } } return [best, bd]; };
    let dir = null, speed = 0, target = null, td = Infinity;
    if (r.phase === 'play' && r.mode === 'normal') {
      if (p.it) { [target, td] = nearest((q) => !q.it); if (target && t >= p.cool) { dir = Math.atan2(-(target.pose.h[0] - head[0]), -(target.pose.h[2] - head[2])); speed = 3.1; } }
      else { const [it, d] = nearest((q) => q.it); if (it && d < 11) { dir = Math.atan2(it.pose.h[0] - head[0], it.pose.h[2] - head[2]); speed = 2.7; } }
    } else if (r.phase === 'play' && r.mode === 'horror') {
      if (mon && def) {
        [target, td] = nearest((q) => q.role === 'monkey' && !q.caught);
        if (target) {
          dir = Math.atan2(-(target.pose.h[0] - head[0]), -(target.pose.h[2] - head[2]));
          speed = def.move?.type === 'stick' ? def.move.speed : 3.0;
          if (def.switchTo && !def.canTag && td < 4) this._form(p);                       // Yeti: grow when someone is close
          if (def.switchTo && def.canTag) { b.far = td > 5 ? b.far + dt : 0; if (b.far > 2.5) { this._form(p); b.far = 0; } }   // ...and shrink back to chase
          if (ab && !ab.release && td < (ab.range || 7) && !p.abState) this._ab(p);
          if (ab?.release && p.abState === 2 && td < 3) this._ab(p);
          if (p.abState === 2 && ab?.speed) speed = ab.speed;
          if (p.xfEnd || p.abState === 1 || (p.abState === 3 && ab?.id === 'burrow')) speed = 0;
          if (def.move?.type === 'stick' && def.move.speed < 1 && td < 3) speed = Math.max(speed, 1.2);   // giant Yeti shuffles in for the grab
        }
      } else if (!p.caught) { const [m2, d] = nearest((q) => q.role === 'monster'); if (m2 && d < 10) { dir = Math.atan2(m2.pose.h[0] - head[0], m2.pose.h[2] - head[2]); speed = 1.9; } }
    } else if (r.phase === 'vote' && t >= b.voteAt && !r.votes.has(p.id)) { const ids = Object.keys(MAPS).filter((k) => r.mode !== 'horror' || MAPS[k].horror); r.votes.set(p.id, ids[rnd(ids.length)]); this._sync(); }
    if (dir === null && r.phase !== 'over' && !(p.caught && r.phase === 'play')) {   // wander (in the hub, stay around the plaza)
      b.wanderT -= dt; if (b.wanderT <= 0) { b.wanderT = 1.5 + Math.random() * 3; b.wander = Math.random() * Math.PI * 2; b.idle = Math.random() < 0.3; }
      if (place === 'hub') { const s = map.spawn; if (Math.hypot(b.rp.x - s[0], b.rp.z - (s[2] - 3)) > 7) b.wander = Math.atan2(b.rp.x - s[0], b.rp.z - (s[2] - 3)); }
      dir = b.wander; speed = b.idle ? 0 : 1.3;
    }
    if (b.stuckT > 0) { b.stuckT -= dt; dir = b.unstick; speed = Math.max(speed, 1.5); }
    if (t < b.stun) speed = 0; else if (t < b.slow) speed *= 0.5;
    const before = b.rp.clone();
    if (dir !== null) b.yaw += Math.atan2(Math.sin(dir - b.yaw), Math.cos(dir - b.yaw)) * Math.min(1, dt * 8);
    b.headL.y = mon ? 1.5 : 0.7;
    b.loco.walk(dt, map.cols, b.rp, b.headL, [0, speed > 0 ? -1 : 0], b.yaw, speed);
    if (speed > 0.5 && b.rp.distanceTo(before) < speed * dt * 0.25) { b.stuckAcc = (b.stuckAcc || 0) + dt; if (b.stuckAcc > 0.6) { b.stuckAcc = 0; b.stuckT = 1.2; b.unstick = b.yaw + Math.PI / 2 + (Math.random() - 0.5) * Math.PI; } } else b.stuckAcc = 0;
    if (b.rp.y + 1.5 < (map.voidY ?? -20) || Math.hypot(b.rp.x, b.rp.z) > (map.radius || 60) + 20) b.place = null;   // fell out: respawn next tick
    // pose: head + two hands swinging (or reaching for the target when close)
    b.t += dt * (speed > 0 ? speed * 2.2 : 0.8);
    const h = b.rp.clone().add(b.headL); _q.setFromEuler(_e.set(0, b.yaw, 0)); const fx = -Math.sin(b.yaw), fz = -Math.cos(b.yaw), rx = -fz, rz = fx;
    const sw = Math.sin(b.t) * 0.22, lift = mon ? 0.5 : 0.45;
    let l = [h.x - rx * 0.28 + fx * (0.2 + sw), h.y - lift + Math.max(0, sw) * 0.4, h.z - rz * 0.28 + fz * (0.2 + sw)];
    let rr = [h.x + rx * 0.28 + fx * (0.2 - sw), h.y - lift + Math.max(0, -sw) * 0.4, h.z + rz * 0.28 + fz * (0.2 - sw)];
    if (target && (mon || p.it) && dist(target.pose.h, [h.x, h.y, h.z]) < 3.5) {   // reach for the target's head
      const maxL = def?.armLength || 0.9, tv = target.pose.h, dv = [tv[0] - h.x, tv[1] - h.y, tv[2] - h.z], L = Math.hypot(...dv) || 1, k = Math.min(maxL, L) / L;
      rr = [h.x + dv[0] * k, h.y + dv[1] * k, h.z + dv[2] * k]; l = [h.x + dv[0] * k * 0.85 - rx * 0.15, h.y + dv[1] * k * 0.85, h.z + dv[2] * k * 0.85 - rz * 0.15];
    }
    const r3 = (v) => Math.round(v * 1000) / 1000;
    p.pose = { h: [h.x, h.y, h.z].map(r3), q: [_q.x, _q.y, _q.z, _q.w].map(r3), l: l.map(r3), r: rr.map(r3) };
  }
}
