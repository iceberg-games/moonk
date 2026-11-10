#!/usr/bin/env node
// Automated harness for moonk-net. Simulated *test clients* only — not gameplay bots.
import WebSocket from 'ws';
import { startServer } from '../server/server.mjs';
import { NetClient } from '../client/NetClient.js';
import { InterpBuffer } from '../client/interpolate.js';
import { slerp, lerp3 } from '../shared/math.js';
import { CODE_ALPHABET, CODE_LENGTH, MSG } from '../shared/protocol.js';
import { DEFAULT_COSMETICS } from '../shared/cosmetics.js';

const results = [];
const check = (name, ok, detail = '') => {
  results.push([ok ? 'PASS' : 'FAIL', name, detail]);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '\n      ' + String(detail).slice(0, 800) : ''}`);
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms = 2000, step = 20) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    const v = fn();
    if (v) return v;
    await sleep(step);
  }
  return fn();
};

function poseAt(hx, hy, hz, lx, ly, lz, rx, ry, rz) {
  const q = [0, 0, 0, 1];
  return {
    h: { p: [hx, hy, hz], q },
    l: { p: [lx, ly, lz], q },
    r: { p: [rx, ry, rz], q },
  };
}

function standing(x, z, y = 1.6) {
  // Hands within reach of the head, slightly in front and down.
  return poseAt(x, y, z, x - 0.25, y - 0.3, z + 0.15, x + 0.25, y - 0.3, z + 0.15);
}

function rawConnect(url) {
  return new Promise((ok, bad) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => bad(new Error('raw connect timeout')), 3000);
    ws.on('open', () => { clearTimeout(timer); ok(ws); });
    ws.on('error', (e) => { clearTimeout(timer); bad(e); });
  });
}

function collect(ws) {
  const msgs = [];
  ws.on('message', (d) => {
    try { msgs.push(JSON.parse(d.toString())); } catch { /* */ }
  });
  return msgs;
}

async function client(url, name, cosmetics) {
  const c = new NetClient({ url, WebSocketImpl: WebSocket, name, cosmetics });
  const ev = { reject: [], error: [], tag: [], cosmetics: [], join: [], leave: [], welcome: [] };
  c.on('reject', (m) => ev.reject.push(m));
  c.on('error', (m) => ev.error.push(m));
  c.on('tag', (m) => ev.tag.push(m));
  c.on('cosmetics', (m) => ev.cosmetics.push(m));
  c.on('join', (m) => ev.join.push(m));
  c.on('leave', (m) => ev.leave.push(m));
  c.on('welcome', (m) => ev.welcome.push(m));
  c._ev = ev;
  return c;
}

// ---- unit: interpolation (no server) ---------------------------------------
{
  const a = [0, 0, 0, 1], b = [0, 1, 0, 0];
  const mid = slerp(a, b, 0.5);
  const n = Math.hypot(...mid);
  check('slerp mid-point is unit length', Math.abs(n - 1) < 1e-9, n);
  const p = lerp3([0, 0, 0], [10, 0, 0], 0.5);
  check('lerp3 midpoint', p[0] === 5 && p[1] === 0 && p[2] === 0, JSON.stringify(p));

  const buf = new InterpBuffer({ delayMs: 100, extrapolateMs: 250 });
  const pose = (x) => standing(x, 0);
  buf.push(1000, pose(0));
  buf.push(1100, pose(2)); // 2 m in 100 ms
  const midP = buf.sample(1000 + 100 + 50); // T = 1050, halfway
  check(
    'interp buffer lerps position at ~100 ms delay',
    midP && Math.abs(midP.pose.h.p[0] - 1) < 0.05 && !midP.extrapolated,
    midP && JSON.stringify(midP.pose.h.p),
  );
  const late = buf.sample(1100 + 100 + 200); // T = 1300, 200 ms past last sample
  check(
    'interp buffer extrapolates with a cap',
    late && late.extrapolated && late.pose.h.p[0] > 2 && late.pose.h.p[0] < 8,
    late && JSON.stringify({ p: late.pose.h.p, ex: late.extrapolated }),
  );
}

const t0 = Date.now();
let server, url;

try {
  server = await startServer({ port: 0, host: '127.0.0.1', maxPlayers: 3, defaultMode: 'transfer' });
  url = `ws://127.0.0.1:${server.port}`;
  check('server starts on an ephemeral port', Number.isInteger(server.port) && server.port > 0, String(server.port));

  const health = await fetch(`http://127.0.0.1:${server.port}/health`).then((r) => r.json());
  check('health endpoint', health.ok === true && health.service === 'moonk-net', JSON.stringify(health));

  // ---- quick-join fills the fullest non-full public room --------------------
  const a = await client(url, 'Alpha');
  const wa = await a.quickJoin();
  check('quick-join A gets a welcome + server id', Number.isInteger(wa.id) && wa.room && wa.room.public === true && wa.you?.id === wa.id, JSON.stringify({ id: wa.id, room: wa.room }));

  const b = await client(url, 'Bravo');
  const wb = await b.quickJoin();
  check('quick-join B lands in the same public room as A', wb.room.code === wa.room.code && wb.id !== wa.id, JSON.stringify({ a: wa.room, b: wb.room, ids: [wa.id, wb.id] }));
  check('B welcome lists A (late joiner roster)', (wb.players || []).some((p) => p.id === wa.id && p.name === 'Alpha'), JSON.stringify(wb.players));

  // Fill room (maxPlayers=3), then C+D should open a second public room, E joins that fullest non-full one.
  const c = await client(url, 'Charlie');
  const wc = await c.quickJoin();
  check('third player still joins the first room (cap 3)', wc.room.code === wa.room.code, wc.room.code);

  const d = await client(url, 'Delta');
  const wd = await d.quickJoin();
  check('fourth player opens a new public room (first is full)', wd.room.code !== wa.room.code && wd.room.public === true, JSON.stringify({ first: wa.room.code, second: wd.room.code }));

  const e = await client(url, 'Echo');
  const we = await e.quickJoin();
  check('fifth player joins the fullest non-full public room (room 2)', we.room.code === wd.room.code, JSON.stringify({ second: wd.room.code, fifth: we.room.code }));

  // ---- private 6-char codes ------------------------------------------------
  const p1 = await client(url, 'PrivateOne');
  const wp1 = await p1.createPrivate();
  const code = wp1.room?.code;
  const alphabetOk = typeof code === 'string' && code.length === CODE_LENGTH && [...code].every((ch) => CODE_ALPHABET.includes(ch));
  check('createPrivate returns a 6-char unambiguous code', alphabetOk && wp1.room.public === false, String(code));

  const p2 = await client(url, 'PrivateTwo');
  const wp2 = await p2.joinCode(code.toLowerCase());
  check('joinCode is case-insensitive and works', wp2.room.code === code && wp2.id !== wp1.id, JSON.stringify(wp2.room));

  const stray = await client(url, 'Stray');
  let strayErr = null;
  try { await stray.joinCode('ZZZZZZ'); } catch (err) { strayErr = err; }
  check('joinCode with an unknown code is rejected', !!strayErr, strayErr && strayErr.message);

  const q = await client(url, 'Quickie');
  const wq = await q.quickJoin();
  check('quick-join does not enter a private room', wq.room.code !== code, JSON.stringify({ private: code, public: wq.room.code }));

  // ---- pose sync -----------------------------------------------------------
  const roomCode = wa.room.code;
  // A, B, C share room 1. Have A stand at a known pose; B should see it after snapshots + interp delay.
  const aPose = standing(1, 2);
  for (let i = 0; i < 8; i++) { a.sendPose(aPose.h, aPose.l, aPose.r, { force: true }); await sleep(50); }
  const seen = await waitFor(() => {
    const rem = b.sampleRemotes();
    const o = rem.get(a.localId);
    return o && Math.hypot(o.pose.h.p[0] - 1, o.pose.h.p[2] - 2) < 0.25 ? o : null;
  }, 1500);
  check('pose sync: B interpolates A near the sent position', !!seen, seen ? JSON.stringify(seen.pose.h.p) : 'timeout');

  // ---- valid tag accepted (transfer) --------------------------------------
  // First joiner A is It. Place A's right hand on B's body, B close by.
  const taggerPose = poseAt(0, 1.6, 0, -0.2, 1.3, 0.1, 0.35, 1.35, 0.2);
  const victimPose = standing(0.4, 0.2);
  for (let i = 0; i < 6; i++) {
    a.sendPose(taggerPose.h, taggerPose.l, taggerPose.r, { force: true });
    b.sendPose(victimPose.h, victimPose.l, victimPose.r, { force: true });
    await sleep(50);
  }
  b._ev.tag.length = 0; a._ev.tag.length = 0;
  a.requestTag(b.localId);
  const tagOk = await waitFor(() => a._ev.tag.find((t) => t.to === b.localId && t.from === a.localId), 1000);
  check('valid tag is accepted and announced', !!tagOk && Array.isArray(tagOk.it) && tagOk.it.includes(b.localId) && !tagOk.it.includes(a.localId), JSON.stringify(tagOk));
  const bSaw = await waitFor(() => b._ev.tag.find((t) => t.to === b.localId), 500);
  check('tag event reaches the other client', !!bSaw, JSON.stringify(bSaw));
  check('transfer mode: tagger is no longer It', !a.players.get(a.localId)?.it && !!b.players.get(b.localId)?.it);

  // ---- out-of-reach tag rejected ------------------------------------------
  // B is now It. Move A far away, B tries to tag A.
  // Wait out the post-tag cooldown so a later request is judged on reach, not timing.
  await sleep(1600);
  const far = standing(12, 0);
  const stay = standing(0, 0);
  for (let i = 0; i < 6; i++) {
    a.sendPose(far.h, far.l, far.r, { force: true });
    b.sendPose(stay.h, stay.l, stay.r, { force: true });
    await sleep(50);
  }
  a._ev.reject.length = 0; b._ev.reject.length = 0; a._ev.tag.length = 0; b._ev.tag.length = 0;
  const itBefore = (b.it || []).slice();
  b.requestTag(a.localId);
  const reachRej = await waitFor(() => b._ev.reject.find((r) => r.for === 'tag' && r.reason === 'out_of_reach'), 1000);
  check('out-of-reach tag is rejected', !!reachRej, JSON.stringify(b._ev.reject));
  await sleep(200);
  check('out-of-reach tag does not transfer It', b._ev.tag.length === 0 && a._ev.tag.length === 0 && (b.it || itBefore).includes(b.localId), JSON.stringify({ tags: b._ev.tag, it: b.it }));

  // ---- speed-hack rejected (raw client; bypasses NetClient throttle) -------
  const hack = await rawConnect(url);
  const hackMsgs = collect(hack);
  hack.send(JSON.stringify({ t: MSG.QJ, name: 'Hacker' }));
  const hackWelcome = await waitFor(() => hackMsgs.find((m) => m.t === 'welcome'), 2000);
  check('raw client can quick-join (for adversarial tests)', !!hackWelcome, JSON.stringify(hackWelcome));
  const origin = standing(0, 0);
  hack.send(JSON.stringify({ t: MSG.POSE, h: [...origin.h.p, ...origin.h.q], l: [...origin.l.p, ...origin.l.q], r: [...origin.r.p, ...origin.r.q] }));
  await sleep(80);
  const tele = standing(80, 0);
  hack.send(JSON.stringify({ t: MSG.POSE, h: [...tele.h.p, ...tele.h.q], l: [...tele.l.p, ...tele.l.q], r: [...tele.r.p, ...tele.r.q] }));
  const speedRej = await waitFor(() => hackMsgs.find((m) => m.t === 'rej' && m.reason === 'speed' && m.for === 'pose'), 1000);
  check('speed-hack / teleport pose is rejected', !!speedRej, JSON.stringify(hackMsgs.filter((m) => m.t === 'rej' || m.t === 'err')));

  // Confirm snapshots still show the origin, not the teleport, for this player.
  await sleep(120);
  const snaps = hackMsgs.filter((m) => m.t === 's').slice(-3);
  const hackId = hackWelcome.id;
  let leaked = false, appeared = false;
  for (const s of snaps) {
    const row = (s.p || []).find((r) => r[0] === hackId);
    if (!row) continue;
    appeared = true;
    if (Math.abs(row[1] - 80) < 1) leaked = true; // x of head
  }
  check('rejected teleport is not broadcast in snapshots', appeared && !leaked, JSON.stringify({ appeared, leaked, last: snaps.at(-1)?.p }));

  // ---- rate limit ----------------------------------------------------------
  const before = hackMsgs.filter((m) => m.t === 'rej' && m.reason === 'rate_limited').length;
  for (let i = 0; i < 200; i++) hack.send(JSON.stringify({ t: MSG.HB, ts: i }));
  await sleep(200);
  const after = hackMsgs.filter((m) => m.t === 'rej' && m.reason === 'rate_limited').length;
  check('rate limit trips when a socket floods messages', after > before, `before=${before} after=${after}`);
  // Server should still be healthy after the flood.
  const health2 = await fetch(`http://127.0.0.1:${server.port}/health`).then((r) => r.json());
  check('server still healthy after a flood', health2.ok === true, JSON.stringify(health2));
  try { hack.close(); } catch { /* */ }

  // ---- cosmetics sync ------------------------------------------------------
  const loadA = { hat: 'cap', face: 'smile', badge: 'moon', color: '#88AACC' };
  const f1 = await client(url, 'FashionA', loadA);
  const wf1 = await f1.createPrivate();
  check('join accepts a valid cosmetics loadout', wf1.you?.cosmetics?.hat === 'cap' && wf1.you?.cosmetics?.color === '#88AACC', JSON.stringify(wf1.you?.cosmetics));

  const f2 = await client(url, 'FashionB', { hat: 'beanie', face: 'wink', badge: 'star', color: '#112233' });
  const wf2 = await f2.joinCode(wf1.room.code);
  const lateCos = (wf2.players || []).find((p) => p.id === f1.localId)?.cosmetics;
  check('late joiner receives everyone\'s cosmetics in welcome', lateCos && lateCos.hat === 'cap' && lateCos.badge === 'moon', JSON.stringify(wf2.players));

  f2._ev.cosmetics.length = 0;
  f1.setCosmetics({ hat: 'horn', face: 'mask', badge: 'comet', color: '#FF8800' });
  const cosEv = await waitFor(() => f2._ev.cosmetics.find((c) => c.id === f1.localId && c.cosmetics?.hat === 'horn'), 1000);
  check('cosmetics change is broadcast to the room', !!cosEv && cosEv.cosmetics.color === '#FF8800', JSON.stringify(cosEv));

  f1._ev.reject.length = 0;
  const beforeHat = f1.players.get(f1.localId)?.cosmetics?.hat;
  f1.setCosmetics({ hat: 'admin_crown_hack', face: 'smile', badge: 'moon', color: '#000000' });
  const badCos = await waitFor(() => f1._ev.reject.find((r) => r.for === 'cos'), 800);
  check('non-allowlist cosmetics are rejected', !!badCos, JSON.stringify(f1._ev.reject));
  await sleep(80);
  check('rejected cosmetics leave the previous loadout in place', f1.players.get(f1.localId)?.cosmetics?.hat === beforeHat, JSON.stringify(f1.players.get(f1.localId)?.cosmetics));

  // Rate-limit cosmetics updates (1/s, burst 3).
  f1._ev.reject.length = 0;
  for (let i = 0; i < 8; i++) f1.setCosmetics({ hat: 'leaf', face: 'grin', badge: 'leaf', color: '#ABCDEF' });
  const cosRate = await waitFor(() => f1._ev.reject.find((r) => r.for === 'cos' && r.reason === 'rate_limited'), 800);
  check('cosmetics updates are rate limited', !!cosRate, JSON.stringify(f1._ev.reject));

  // No client-chosen ids: a raw join with id: 1 should be ignored (server assigns).
  const raw = await rawConnect(url);
  const rawMsgs = collect(raw);
  raw.send(JSON.stringify({ t: MSG.QJ, name: 'Spoof', id: 1 }));
  const spoofW = await waitFor(() => rawMsgs.find((m) => m.t === 'welcome'), 2000);
  check('server ignores client-chosen ids', !!spoofW && spoofW.id !== 1, JSON.stringify({ id: spoofW?.id }));
  try { raw.close(); } catch { /* */ }

  // Cleanup clients
  for (const cl of [a, b, c, d, e, p1, p2, stray, q, f1, f2]) {
    try { cl.disconnect(); } catch { /* */ }
  }
} catch (err) {
  check('unexpected error', false, err.stack || err.message);
} finally {
  try { await server?.close(); } catch { /* */ }
}

const failed = results.filter((r) => r[0] === 'FAIL').length;
const passed = results.length - failed;
console.log(`\n${passed}/${results.length} moonk-net checks passed in ${Math.round((Date.now() - t0) / 1000)} s`);
process.exit(failed ? 1 : 0);
