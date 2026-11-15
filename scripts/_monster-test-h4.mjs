// Server-level test for Be the Monster rules (no browser): round/intermission timing constants, Locust dwell (faster up close),
// Yeti human form can't tag, 0.4 s transform tell, 6 s switch cooldown, long-arm reach + spoofed-hand rejection.
// Real WebSocket clients playing as scripted humans (no bots in the game itself; these are test harness clients).
import { spawn } from 'node:child_process';
import WebSocket from 'ws';
import { MODES, MONSTERS, FORM_TELL, dwellFor, GEN_TURNS, GEN_COIN } from '../shared/defs.mjs';
const PORT = 8876; let fails = 0; const ok = (c, m, x = '') => { console.log((c ? 'PASS ' : 'FAIL ') + m + (x ? '  ' + x : '')); if (!c) fails++; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const srv = spawn('node', ['server/server.mjs'], { env: { ...process.env, PORT: String(PORT), TT_FAST: '1', MOONK_BAN_FILE: '/tmp/moonk-test-bans2.json', MOONK_ACCOUNTS_FILE: '/tmp/moonk-test-accounts2.json', MOONK_INV_FILE: '/tmp/moonk-test-inv2.json' }, stdio: 'inherit' }); await sleep(800);
ok(MODES.horror.round === 120, 'Be the Monster round is 120 s'); ok(MODES.horror.intermission === 30, 'intermission ~30 s (6 s result + 24 s vote)');
ok(MONSTERS.locust.forms.main.move.speed === 2.2 && MONSTERS.yeti.forms.human.move.speed === 3.5 && MONSTERS.yeti.forms.yeti.move.speed === 0.3, 'monster speeds 2.2 / 3.5 / 0.3 m/s');
ok(dwellFor(MONSTERS.locust.forms.main, 0.5) < dwellFor(MONSTERS.locust.forms.main, 2.1) / 4, 'locust catch dwell much shorter up close');
class C {
  constructor(name) { this.name = name; this.pose = { h: [0, 1.6, 0], q: [0, 0, 0, 1], l: [-0.3, 1, 0], r: [0.3, 1, 0] }; this.snap = null; this.ev = []; this.msgs = []; this.room = null; }
  async go(extra) { this.ws = new WebSocket(`ws://127.0.0.1:${PORT}`); await new Promise((r) => this.ws.on('open', r));
    this.ws.on('message', (d) => { const m = JSON.parse(d); if (m.t === 'welcome') { this.id = m.id; this.room = m.room; } if (m.t === 'room') this.room = m.room; if (m.t === 'snap') { this.snap = m; this.me = m.ps.find((p) => p.id === this.id); } if (m.t === 'ev') this.ev.push({ ...m, at: Date.now() }); if (m.t === 'fling' || m.t === 'shr' || m.t === 'ping' || m.t === 'tether') this.msgs.push({ ...m, at: Date.now() }); });
    this.ws.send(JSON.stringify({ t: 'join', name: this.name, ...extra })); this.iv = setInterval(() => this.ws.send(JSON.stringify({ t: 'pose', ...this.pose })), 50); }
  at(h, hands) { this.pose = { h, q: [0, 0, 0, 1], l: hands?.[0] || [h[0] - 0.3, h[1] - 0.6, h[2]], r: hands?.[1] || [h[0] + 0.3, h[1] - 0.6, h[2]] }; }
  send(o) { this.ws.send(JSON.stringify(o)); }
  caught(id) { return !!this.snap?.ps.find((p) => p.id === id)?.cg; }
}
async function round(monster) {
  const ps = ['P1', 'P2', 'P3'].map((n) => new C(n + monster)); await ps[0].go({ mode: 'horror', monster }); while (!ps[0].room) await sleep(20); await Promise.all(ps.slice(1).map((c) => c.go({ room: ps[0].room.code })));
  for (let i = 0; i < 200 && !(ps[0].room?.phase === 'play' && ps[0].me?.ro); i++) await sleep(100);
  const mon = ps.find((p) => p.me?.ro === 'monster'), mk = ps.filter((p) => p !== mon);
  mon.at([0, 1.6, 0]); mk[0].at([30, 1.6, 30]); mk[1].at([-30, 1.6, 30]);
  await sleep(1700);   // v1 spawn grace: monster cannot tag in the first 1.5 s
  return { ps, mon, mk, stop: () => { for (const p of ps) { clearInterval(p.iv); p.ws.close(); } } };
}
const waitFor = async (f, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return Date.now() - t0; await sleep(20); } return -1; };
try {
  // ---- cosmetics: unpaid / unlock-only slots fall back to defaults; paid items need a successful {t:'buy'}
  { const c = new C('Cosm'); await c.go({ cos: { hat: 'hat_antenna', fur: 'fur_moonk_brown', face: 'face_mustache', hand: 'hand_glow_bands' } }); c.at([0, 1.6, 0]); await sleep(400);
    ok(c.me?.c?.hat === null && c.me?.c?.hand === null && c.me.c.fur === 'fur_moonk_gray' && c.me.c.face == null, 'server drops unlock-only and unowned paid ids', JSON.stringify(c.me?.c));
    c.send({ t: 'buy', id: 'face_mustache' }); await sleep(150);
    c.send({ t: 'cos', cos: { v: 1, face: 'face_mustache', fur: 'fur_nebula', hat: 'hat_propeller' } }); await sleep(300);
    ok(c.me?.c?.face === 'face_mustache' && c.me.c.fur === 'fur_moonk_gray' && c.me.c.hat == null, "bought mustache equips; unlock-only fur_nebula and unowned hat_propeller rejected", JSON.stringify(c.me?.c));
    clearInterval(c.iv); c.ws.close(); }
  { const c = new C('Cosm2'); await c.go({ did: 'd-cosm2', cos: { v: 1, fur: 'fur_moonk_gray', hat: 'hat_banana_cap' } }); c.at([0, 1.6, 0]); await sleep(400);
    ok(c.me?.c?.v === 1 && c.me.c.fur === 'fur_moonk_gray' && c.me.c.hat === 'hat_banana_cap', 'wire loadout {v:1,...} accepted for starters');
    c.send({ t: 'buy', id: 'fur_banana' }); await sleep(150);
    c.send({ t: 'cos', cos: { v: 1, fur: 'fur_banana', hat: 'hat_banana_cap' } }); await sleep(300);
    ok(c.me?.c?.v === 1 && c.me.c.fur === 'fur_banana' && c.me.c.hat === 'hat_banana_cap', 'bought fur_banana equips on {v:1} loadout');
    c.send({ t: 'cos', cos: { v: 1, fur: 'fur_banana', hat: 'hat_bucket' } }); await sleep(300);
    ok(c.me?.c?.v === 1 && c.me.c.hat == null && c.me.c.fur === 'fur_banana', 'unowned hat_bucket falls back to the default hat (null)');
    clearInterval(c.iv); c.ws.close(); }
  // ---- Locust
  { const { mon, mk, stop } = await round('locust');
    ok(mon.me.fo === 'main', 'locust round started, one monster'); 
    mk[0].at([2.0, 1.6, 0]); const tFar = await waitFor(() => mon.caught(mk[0].id), 3000);
    ok(tFar > 250 && tFar < 1500, `locust catch at 2.0 m takes ${tFar} ms (slow at the edge of reach)`);
    mk[1].at([3.0, 1.6, 0]); await sleep(900); ok(!mon.caught(mk[1].id), 'monkey at 3.0 m (out of reach 2.2) is safe');
    await sleep(500); mk[1].at([0.4, 1.6, 0]); const tNear = await waitFor(() => mon.caught(mk[1].id), 3000);
    ok(tNear >= 0 && tNear < 400, `locust catch at 0.4 m takes ${tNear} ms (fast up close)`); ok(tNear < tFar, 'close catch faster than far catch'); stop(); }
  // ---- Generators (valve): server-authoritative fill, drain, anti-spoof, +1 Moon once
  { const { mon, mk, stop } = await round('locust'); const gens = mon.room.gens; ok(gens.length >= 3, `horror round spawned ${gens.length} generators`);
    mon.at([60, 1.6, 60]); const g = gens[0], vp = [g.x, g.y + 1.15, g.z]; mk[0].at([g.x, 1.6, g.z + 0.3], [vp, vp]); mk[1].at([-30, 1.6, 30]); await sleep(300);
    const gp = () => mk[0].snap?.gp?.[0] ?? 0; const turn = async (rad, step = 0.7) => { const n = Math.ceil(Math.abs(rad) / step); for (let i = 0; i < n; i++) { mk[0].send({ t: 'valve', id: g.id, d: Math.sign(rad) * Math.min(step, Math.abs(rad) - i * step) }); await sleep(100); } };
    await turn(6.2); ok(Math.abs(gp() - 0.5) < 0.1, `one clockwise turn of ${GEN_TURNS} fills ~50% (gp ${gp()})`);
    await turn(-3.1); ok(gp() > 0.2 && gp() < 0.32, `anticlockwise drains (gp ${gp()})`);
    const before = gp(); mk[0].send({ t: 'valve', id: g.id, d: 100 }); await sleep(300); ok(gp() - before < 0.12, `one spoofed 100 rad turn is rate-capped (gain ${(gp() - before).toFixed(3)})`);
    mk[1].send({ t: 'valve', id: g.id, d: 0.8 }); mk[1].send({ t: 'valve', id: g.id, d: 0.8 }); await sleep(300); const mid = gp(); ok(mid - before < 0.12, 'a monkey far from the valve cannot turn it');
    mon.ev.length = 0; mk[0].ev.length = 0; for (let i = 0; i < 40 && !mk[0].ev.some((e) => e.k === 'gen'); i++) { mk[0].send({ t: 'valve', id: g.id, d: 0.8 }); await sleep(100); }
    const ge = mk[0].ev.find((e) => e.k === 'gen'); ok(ge && ge.by === mk[0].id && ge.coin === GEN_COIN, 'full generator announces gen event paying 1 Moon to the finisher', JSON.stringify(ge)); ok(gp() >= 0.999, 'generator is full');
    mk[0].ev.length = 0; for (let i = 0; i < 6; i++) { mk[0].send({ t: 'valve', id: g.id, d: 0.8 }); await sleep(100); } ok(!mk[0].ev.some((e) => e.k === 'gen') && gp() >= 0.999, 'a finished generator pays only once and stays full');
    ok(mon.room.phase === 'play', 'round keeps running (generators are a side objective)'); stop(); }
  // ---- Gulper (Lunge)
  { const { mon, mk, stop } = await round('gulper'); const A = MONSTERS.gulper.ability;
    ok(mon.me.fo === 'main' && A.id === 'lunge' && A.cooldown === 8 && A.tell === 0.5, 'gulper round: lunge, 8 s cooldown, 0.5 s tell');
    mk[0].at([1.8, 1.6, 0]); await sleep(900); ok(!mon.caught(mk[0].id), 'gulper walking reach is short: monkey at 1.8 m is safe');
    const t0 = Date.now(); mon.send({ t: 'ab' }); const tl = await waitFor(() => mon.me.ab === 1, 800); ok(tl >= 0, 'ability tell starts (ab=1) and abstart event is sent'); ok(mon.ev.some((e) => e.k === 'abstart'), 'abstart event broadcast');
    await sleep(380); ok(!mon.caught(mk[0].id) && mon.me.ab === 1, 'no catch during the 0.5 s tell');
    const go = await waitFor(() => mon.me.ab === 2, 800); ok(go >= 0 && Date.now() - t0 >= 450 && Date.now() - t0 <= 800, `lunge goes active after the tell (${Date.now() - t0} ms)`);
    const c = await waitFor(() => mon.caught(mk[0].id), 600); ok(c >= 0, 'monkey at 1.8 m is caught during the lunge (bigger reach)');
    await waitFor(() => mon.me.ab === 0, 1000); mon.ev.length = 0; mon.send({ t: 'ab' }); await sleep(400); ok(mon.me.ab === 0 && mon.ev.some((e) => e.k === 'abdenied'), 'second lunge denied during the 8 s cooldown (server enforced)'); stop(); }
  // ---- Grinner (Blackout)
  { const { mon, mk, stop } = await round('grinner'); const A = MONSTERS.grinner.ability;
    ok(A.id === 'blackout' && A.cooldown === 15 && A.tell === 0.6 && A.active === 3, 'grinner round: blackout, 15 s cooldown, 0.6 s tell, 3 s active');
    mon.send({ t: 'ab' }); await waitFor(() => mon.me.ab === 1, 800); const t0 = Date.now(); mk[0].at([0.4, 1.6, 0]);   // monkey steps adjacent right at the start of the tell
    await sleep(400); ok(!mon.caught(mk[0].id), 'grinner cannot tag during its giggle tell');
    ok((await waitFor(() => mon.me.ab === 2, 1000)) >= 0, 'blackout goes active after the tell'); const tAct = Date.now() - t0;
    ok((await waitFor(() => mon.me.ab === 0 && !mon.caught(mk[1].id) || false, 3800)) >= 0, 'blackout ends after ~3 s (state back to 0)');
    mon.ev.length = 0; mon.send({ t: 'ab' }); await sleep(400); ok(mon.me.ab === 0 && mon.ev.some((e) => e.k === 'abdenied'), 'second blackout denied during the 15 s cooldown'); stop(); }
  // ---- Burrower (Burrow)
  { const { mon, mk, stop } = await round('burrower'); const A = MONSTERS.burrower.ability;
    ok(A.id === 'burrow' && A.cooldown === 14 && A.active === 2.5 && A.noTag.includes(2), 'burrower: burrow, 14 s cooldown, 2.5 s underground, cannot tag underground');
    mk[0].at([1.9, 1.6, 0]); await sleep(900); ok(!mon.caught(mk[0].id), 'burrower walking reach is short (1.3): monkey at 1.9 m safe');
    mon.send({ t: 'ab' }); ok((await waitFor(() => mon.me.ab === 1, 800)) >= 0, 'dive tell starts (ab=1)'); mk[0].at([0.4, 1.6, 0]);
    ok((await waitFor(() => mon.me.ab === 2, 1000)) >= 0, 'goes underground (ab=2) after the 0.45 s tell'); const tU = Date.now();
    await sleep(2200); ok(mon.me.ab === 2 && !mon.caught(mk[0].id), 'cannot tag while underground, even with a monkey 0.4 m away');
    ok((await waitFor(() => mon.me.ab === 3, 1200)) >= 0 && Date.now() - tU > 2300, `erupts after ~2.5 s underground (${Date.now() - tU} ms)`);
    ok((await waitFor(() => mon.caught(mk[0].id), 800)) >= 0, 'eruption catches the close monkey almost at once');
    ok(mon.ev.some((e) => e.k === 'abpost'), 'abpost (erupt) event broadcast');
    await waitFor(() => mon.me.ab === 0, 1000); mon.ev.length = 0; mon.send({ t: 'ab' }); await sleep(400); ok(mon.me.ab === 0 && mon.ev.some((e) => e.k === 'abdenied'), 'second burrow denied during the 14 s cooldown'); stop(); }
  // ---- Mimic (Disguise): the server holds the identity; others get a plain monkey snapshot
  { const { mon, mk, stop } = await round('mimic'); const A = MONSTERS.mimic.ability; const names = mk.map((c) => c.name);
    ok(A.id === 'disguise' && A.cooldown === 20 && A.active === 6 && A.tell === 0.3, 'mimic: disguise, 20 s cooldown, 6 s, 0.3 s tell');
    const view = () => mk[0].snap?.ps.find((p) => p.id === mon.id);
    ok(view()?.ro === 'monster', 'before disguising, the Mimic is visible as the monster');
    mon.send({ t: 'ab' }); ok((await waitFor(() => mon.me.ab === 2, 1200)) >= 0, 'disguise active (ab=2) after the tell');
    ok(names.includes(mon.me.dg), `the Mimic itself is told its disguise (dg = ${mon.me.dg}, a real player in the room)`);
    await sleep(150); const v = view(); ok(v && v.ro === 'monkey' && v.n === mon.me.dg && !v.ab && !v.fo, 'other clients see a plain monkey wearing that name', JSON.stringify({ ro: v?.ro, n: v?.n, ab: v?.ab, fo: v?.fo }));
    ok(!JSON.stringify(v).includes('monster') && v.dg === undefined, 'no role flag or disguise flag leaks in the snapshot other clients receive');
    ok(!mk[0].ev.some((e) => e.k === 'abstart' || e.k === 'abgo'), 'ability start/go events are private to the Mimic');
    mk[1].at([0.4, 1.6, 0]); ok((await waitFor(() => mon.caught(mk[1].id), 1500)) >= 0, 'a disguised Mimic can still tag (the ambush)');
    await sleep(120); const u = view(); ok(u && u.ro === 'monster' && u.ab === 3 && mk[0].ev.some((e) => e.k === 'abpost'), 'tagging unmasks it: everyone sees the monster + loud abpost event (ab=3)');
    await waitFor(() => view()?.ab === 0, 1500); mon.ev.length = 0; mon.send({ t: 'ab' }); await sleep(400); ok(mon.ev.some((e) => e.k === 'abdenied'), 'second disguise denied during the 20 s cooldown'); stop(); }
  { const { mon, mk, stop } = await round('mimic'); const view = () => mk[0].snap?.ps.find((p) => p.id === mon.id);   // timeout path: nobody near, the 6 s run out
    mon.send({ t: 'ab' }); await waitFor(() => mon.me.ab === 2, 1200); await sleep(200); ok(view()?.ro === 'monkey', 'disguised (timeout test)');
    const tt = await waitFor(() => view()?.ro === 'monster' && view()?.ab === 3, 7000); ok(tt >= 5000 && tt <= 6600, `the disguise times out after ~6 s and unmasks (${tt} ms)`); stop(); }
  // ---- Dangler (Reel): server-side tongue ray, yank + stun to the victim only
  { const { mon, mk, stop } = await round('dangler'); const A = MONSTERS.dangler.ability;
    ok(A.id === 'reel' && A.cooldown === 12 && A.tell === 0.5 && A.range === 9, 'dangler: reel, 12 s cooldown, 0.5 s tell, 9 m tongue');
    mk[0].at([0, 1.6, -6]); mk[1].at([4, 1.6, -6]); await sleep(300);   // monster at the origin faces -Z: mk[0] is dead ahead 6 m, mk[1] is 4 m off the line
    const t0 = Date.now(); mon.send({ t: 'ab' }); ok((await waitFor(() => mon.me.ab === 1, 800)) >= 0, 'throat-swell tell starts (ab=1)');
    await sleep(300); ok(mk[0].msgs.length === 0, 'no tongue or yank during the tell');
    ok((await waitFor(() => mon.me.ab === 2, 800)) >= 0 && Date.now() - t0 >= 450, `tongue shoots after the 0.5 s tell (${Date.now() - t0} ms)`);
    const go = mon.ev.find((e) => e.k === 'abgo'); ok(go && go.hit === mk[0].id && Math.abs(go.len - 6) < 0.3, 'abgo reports the hit runner and tongue length ~6 m (everyone sees the tongue)', JSON.stringify({ hit: go?.hit, len: go?.len }));
    const fl = await waitFor(() => mk[0].msgs.some((m) => m.t === 'fling'), 800); const fm = mk[0].msgs.find((m) => m.t === 'fling');
    ok(fl >= 0 && fm.v[2] > 8 && Math.abs(fm.v[0]) < 1 && fm.stun === 0.5, 'victim gets a fling toward the Dangler + 0.5 s stun', JSON.stringify(fm && { v: fm.v.map((x) => +x.toFixed(1)), stun: fm.stun }));
    ok(mk[1].msgs.length === 0, 'a runner 4 m off the tongue line is not hit');
    await waitFor(() => mon.me.ab === 0, 800); mon.ev.length = 0; mon.send({ t: 'ab' }); await sleep(400); ok(mon.me.ab === 0 && mon.ev.some((e) => e.k === 'abdenied'), 'second reel denied during the 12 s cooldown'); stop(); }
  { const { mon, mk, stop } = await round('dangler'); mk[0].at([0, 1.6, -12]); mk[1].at([0, 1.6, 12]); await sleep(300);   // out of range ahead / behind
    mon.send({ t: 'ab' }); await waitFor(() => mon.me.ab === 2, 1000); await sleep(200); const go = mon.ev.find((e) => e.k === 'abgo'); ok(go && go.hit === 0 && mk[0].msgs.length === 0 && mk[1].msgs.length === 0, 'tongue misses a runner beyond 9 m or behind it'); stop(); }
  // ---- Wailer (Shriek): affects runners within 10 m, pings only the Wailer
  { const { mon, mk, stop } = await round('wailer'); const A = MONSTERS.wailer.ability;
    ok(A.id === 'shriek' && A.cooldown === 16 && A.tell === 0.6 && A.radius === 10 && A.gain === 0.5, 'wailer: shriek, 16 s cooldown, 0.6 s inhale, 10 m, gain x0.5');
    mk[0].at([5, 1.6, 0]); mk[1].at([30, 1.6, 30]); await sleep(300);
    const t0 = Date.now(); mon.send({ t: 'ab' }); ok((await waitFor(() => mon.me.ab === 1, 800)) >= 0, 'inhale tell starts (ab=1)'); await sleep(350);
    ok(!mk[0].msgs.some((m) => m.t === 'shr'), 'no debuff during the inhale');
    ok((await waitFor(() => mon.me.ab === 2, 1000)) >= 0 && Date.now() - t0 >= 550, `shriek goes off after the 0.6 s tell (${Date.now() - t0} ms)`);
    await sleep(150); const sh = mk[0].msgs.find((m) => m.t === 'shr'); ok(sh && sh.gain === 0.5 && sh.ms === 2500, 'runner within 10 m gets push-off gain x0.5 for 2.5 s', JSON.stringify(sh));
    ok(!mk[1].msgs.some((m) => m.t === 'shr'), 'runner 42 m away is unaffected');
    const pg = mon.msgs.find((m) => m.t === 'ping'); ok(pg && pg.ids.length === 1 && pg.ids[0] === mk[0].id && pg.ms === 1500, 'the Wailer alone is pinged to the marked runner for 1.5 s', JSON.stringify(pg));
    ok(!mk[0].msgs.some((m) => m.t === 'ping') && !mk[1].msgs.some((m) => m.t === 'ping'), 'runners never receive the ping');
    await waitFor(() => mon.me.ab === 0, 3500); mon.ev.length = 0; mon.send({ t: 'ab' }); await sleep(400); ok(mon.me.ab === 0 && mon.ev.some((e) => e.k === 'abdenied'), 'second shriek denied during the 16 s cooldown'); stop(); }
  // ---- Lurker (Cling): no tag while clinging, early release -> pounce window with the bigger catch
  { const { mon, mk, stop } = await round('lurker'); const A = MONSTERS.lurker.ability;
    ok(A.id === 'cling' && A.cooldown === 14 && A.tell === 0.5 && A.active === 4 && A.post === 0.4 && A.noTag.includes(1) && A.noTag.includes(2), 'lurker: cling, 14 s cooldown, 0.5 s tell, 4 s cling, 0.4 s pounce, no tag while clinging');
    mk[0].at([1.8, 1.6, 0]); await sleep(900); ok(!mon.caught(mk[0].id), 'lurker walking reach is short (1.4): monkey at 1.8 m safe');
    const t0 = Date.now(); mon.send({ t: 'ab' }); ok((await waitFor(() => mon.me.ab === 1, 800)) >= 0, 'claw-scrape tell starts (ab=1)');
    ok((await waitFor(() => mon.me.ab === 2, 1000)) >= 0 && Date.now() - t0 >= 450, `cling starts after the 0.5 s tell (${Date.now() - t0} ms)`);
    mk[0].at([0.6, 1.6, 0]); await sleep(900); ok(mon.me.ab === 2 && !mon.caught(mk[0].id), 'cannot tag while clinging, even with a monkey 0.6 m away');
    mk[0].at([1.8, 1.6, 0]); await sleep(150); mon.ev.length = 0; mon.send({ t: 'ab' });   // release early (button)
    ok((await waitFor(() => mon.me.ab === 3, 600)) >= 0 && mon.ev.some((e) => e.k === 'abpost'), 'the button ends the cling early: pounce window (ab=3) + abpost');
    ok((await waitFor(() => mon.caught(mk[0].id), 600)) >= 0, 'pounce catches a monkey at 1.8 m (reach 2.0 > walking 1.4)');
    await waitFor(() => mon.me.ab === 0, 800); mon.ev.length = 0; mon.send({ t: 'ab' }); await sleep(400); ok(mon.me.ab === 0 && mon.ev.some((e) => e.k === 'abdenied'), 'second cling denied during the 14 s cooldown'); stop(); }
  { const { mon, mk, stop } = await round('lurker'); mon.send({ t: 'ab' }); await waitFor(() => mon.me.ab === 2, 1000); const t1 = Date.now();
    ok((await waitFor(() => mon.me.ab === 3, 4600)) >= 0 && Date.now() - t1 > 3800 && Date.now() - t1 < 4500, `cling times out after ~4 s into the pounce window (${Date.now() - t1} ms)`);
    ok((await waitFor(() => mon.me.ab === 0, 900)) >= 0, 'pounce window lasts ~0.4 s, then idle'); stop(); }
  // ---- Stringman (Tether): nearest runner in the facing cone is leashed to where it was hit; a miss still costs the cooldown
  { const { mon, mk, stop } = await round('stringman'); const A = MONSTERS.stringman.ability;
    ok(A.id === 'tether' && A.cooldown === 15 && A.tell === 0.5 && A.range === 8 && A.cone === 35 && A.leash === 2.5 && A.active === 2.5, 'stringman: tether, 15 s cooldown, 0.5 s tell, 8 m, 35 deg cone, 2.5 m leash for 2.5 s');
    mk[0].at([0, 1.6, -6]); mk[1].at([1, 1.6, -3]); await sleep(300);   // facing -Z: mk[1] is 3.2 m away, 18 deg off axis (nearest in the cone); mk[0] is 6 m dead ahead
    const t0 = Date.now(); mon.send({ t: 'ab' }); ok((await waitFor(() => mon.me.ab === 1, 800)) >= 0, 'strings-glow tell starts (ab=1)'); await sleep(300); ok(mk[1].msgs.length === 0, 'nothing is tied during the tell');
    ok((await waitFor(() => mon.me.ab === 2, 800)) >= 0 && Date.now() - t0 >= 450, `tether fires after the 0.5 s tell (${Date.now() - t0} ms)`);
    const go = mon.ev.find((e) => e.k === 'abgo'); ok(go && go.hit === mk[1].id && Math.abs(go.o[2] - -3) < 0.2, 'abgo names the nearest runner in the cone and the anchor point (everyone sees the string)', JSON.stringify({ hit: go?.hit, o: go?.o }));
    await waitFor(() => mk[1].msgs.some((m) => m.t === 'tether'), 600); const tm = mk[1].msgs.find((m) => m.t === 'tether');
    ok(tm && tm.r === 2.5 && tm.ms === 2500 && Math.abs(tm.o[0] - 1) < 0.2, 'the hit runner (only) gets {tether: anchor, 2.5 m leash, 2500 ms}', JSON.stringify(tm)); ok(mk[0].msgs.length === 0, 'the farther runner in the cone is not tied');
    await waitFor(() => mon.me.ab === 0, 3500); mon.ev.length = 0; mon.send({ t: 'ab' }); await sleep(400); ok(mon.me.ab === 0 && mon.ev.some((e) => e.k === 'abdenied'), 'second tether denied during the 15 s cooldown'); stop(); }
  { const { mon, mk, stop } = await round('stringman'); mk[0].at([5, 1.6, -5]); mk[1].at([0, 1.6, -12]); await sleep(300);   // 45 deg off axis / 12 m away: both miss
    mon.send({ t: 'ab' }); await waitFor(() => mon.me.ab === 2, 1000); await sleep(200); const go = mon.ev.find((e) => e.k === 'abgo');
    ok(go && go.hit === 0 && mk[0].msgs.length === 0 && mk[1].msgs.length === 0, 'tether misses a runner outside the 35 deg cone or beyond 8 m');
    await waitFor(() => mon.me.ab === 0, 3500); mon.ev.length = 0; mon.send({ t: 'ab' }); await sleep(400); ok(mon.me.ab === 0 && mon.ev.some((e) => e.k === 'abdenied'), 'a miss still triggers the cooldown'); stop(); }
  // ---- Yeti
  { const { mon, mk, stop } = await round('yeti');
    ok(mon.me.fo === 'human', 'yeti starts in human form'); mk[0].at([0.3, 1.6, 0]); await sleep(1200);
    ok(!mon.caught(mk[0].id), 'human form never tags even when touching a monkey');
    const t0 = Date.now(); mon.send({ t: 'form' }); const tell = await waitFor(() => mon.ev.some((e) => e.k === 'formstart'), 1000);
    ok(tell >= 0, 'server announces the transform tell (formstart)'); ok(mon.me.fo === 'human', 'still human during the tell');
    const tFlip = await waitFor(() => mon.me.fo === 'yeti', 1500); ok(tFlip + tell >= FORM_TELL * 1000 - 120 && tFlip + tell <= FORM_TELL * 1000 + 250, `form flips after ~${FORM_TELL} s tell (${tFlip + tell} ms)`);
    const tCatch = await waitFor(() => mon.caught(mk[0].id), 2000); ok(tCatch >= 0, `yeti form catches an adjacent monkey (${tCatch} ms after flip)`);
    mon.ev.length = 0; mon.send({ t: 'form' }); await sleep(600); ok(mon.me.fo === 'yeti' && mon.ev.some((e) => e.k === 'formdenied'), 'switch back denied during the 6 s cooldown (server enforced)');
    // long arms: spoofed hand 20 m from the head is rejected
    mk[1].at([20, 1.6, 0]); mon.at([0, 1.6, 0], [[20, 1.6, 0.2], [-0.3, 1, 0]]); await sleep(1500); ok(!mon.caught(mk[1].id), 'spoofed hand 20 m from the head catches nothing');
    // legit long arm: hand 3 m out catches a monkey standing 3.2 m away from the head
    mk[1].at([3.2, 1.6, 0]); mon.at([0, 1.6, 0], [[3.0, 1.6, 0], [-0.3, 1, 0]]); const tl = await waitFor(() => mon.caught(mk[1].id), 2500); ok(tl >= 0, `yeti long arm grabs a monkey 3.2 m from its head (${tl} ms)`);
    stop(); }
} catch (e) { console.log('ERROR', e); fails++; }
srv.kill(); console.log(fails ? `${fails} FAILED` : 'MONSTER TESTS PASSED'); process.exit(fails ? 1 : 0);
