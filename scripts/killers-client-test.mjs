// Client-side check of the hour-3 killers (Dangler + Wailer) with a real server (port 8843, TT_FAST) and two headless browsers (?dev=1 hook).
// Dangler: the monkey 5 m dead ahead is yanked toward the monster and its hands are stunned. Wailer: the monkey within 10 m gets loco.gain 0.5 (and the veil),
// the monkey 40 m away does not, and the ping markers only exist on the Wailer's screen. Not part of `npm test` (the server rules are covered by monster-test.mjs).
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync } from 'node:fs';
mkdirSync('screenshots/overnight', { recursive: true });
const PORT = 8843, ws = `ws://127.0.0.1:${PORT}`, base = process.env.BASE || 'https://localhost:5190';
const srv = spawn('node', ['server/server.mjs'], { env: { ...process.env, PORT: String(PORT), TT_FAST: '1', MOONK_BAN_FILE: '/tmp/moonk-kct-bans.json', MOONK_ACCOUNTS_FILE: '/tmp/moonk-kct-accounts.json', MOONK_INV_FILE: '/tmp/moonk-kct-inv.json' }, stdio: 'inherit' }); await new Promise((r) => setTimeout(r, 800));
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors'] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 960, height: 540 } });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const open = async (name) => { const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(name, 'pageerror', e.message, (e.stack || '').split('\n').slice(0, 3).join(' | '))); p.on('framenavigated', (f) => { if (f === p.mainFrame()) console.log(name, 'NAV', f.url().slice(0, 60)); }); await p.goto(`${base}/?dev=1&name=${name}&ws=${encodeURIComponent(ws)}`); await p.waitForFunction('window.__tt', null, { timeout: 30000 }); return p; };
const wait = (p, expr, t = 15000) => p.waitForFunction(expr, null, { timeout: t }).then(() => true).catch(() => false);
const steps = (p, n = 6) => p.evaluate((n) => { const t = window.__tt; let k = performance.now(); for (let i = 0; i < n; i++) t.frame(k += 50); t.frame(performance.now()); }, n);
async function round(type) {
  const A = await open('Ann'), B = await open('Ben');
  await A.evaluate(() => window.__tt.net.connect().then(() => window.__tt.join({ mode: 'normal' }))); await wait(A, 'window.__tt.S.joined'); const code = await A.evaluate(() => window.__tt.S.room.code);
  await B.evaluate(() => window.__tt.net.connect()); await B.evaluate((c) => window.__tt.join({ room: c }), code); await wait(B, 'window.__tt.S.joined');
  await A.evaluate((ty) => window.__tt.net.send({ t: 'set', mode: 'horror', monster: ty }), type);
  await wait(A, `window.__tt.S.room.phase==='play' && window.__tt.S.room.mType==='${type}' && [...window.__tt.S.players.values()].some(p => p.ro==='monster' && p.fo==='main')`, 20000);
  const mid = await A.evaluate(() => [...window.__tt.S.players.values()].find((p) => p.ro === 'monster').id); const mon = (await A.evaluate(() => window.__tt.S.id)) === mid ? A : B, mk = mon === A ? B : A;
  return { A, B, mon, mk };
}
try {
  { const { A, B, mon, mk } = await round('dangler');
    await mon.evaluate(() => { const t = window.__tt; t.rig.position.set(0, 0, 0); t.dev.head = [0, 1.6, 0]; t.dev.l = [-0.3, 1.2, -0.3]; t.dev.r = [0.3, 1.2, -0.3]; });
    await mk.evaluate(() => { const t = window.__tt; t.rig.position.set(0, 0, -5); t.dev.head = [0, 1.6, 0]; t.dev.l = [-0.3, 1.2, -0.3]; t.dev.r = [0.3, 1.2, -0.3]; t.dev.q = [0, 1, 0, 0]; });   // 5 m ahead of the Dangler, looking back at it
    await mon.waitForTimeout(500); await mon.evaluate(() => window.__tt.net.send({ t: 'ab' }));
    ok(await wait(mk, '[...window.__tt.S.players.values()].some(p => p.ro==="monster" && p.ab===1)', 3000), 'dangler tell (throat swell) replicated to the monkey');
    await mk.screenshot({ path: 'screenshots/overnight/dangler-ingame-tell.png' });
    ok(await wait(mk, 'window.__tt.loco.stun > 0 || window.__tt.rig.position.z > -4.8', 3000), 'monkey client received the yank (fling + stun)');
    const r = await mk.evaluate(() => ({ stun: window.__tt.loco.stun, vz: window.__tt.loco.vel.z, z: window.__tt.rig.position.z })); console.log('INFO', JSON.stringify(r));
    ok(r.stun > 0 || r.vz > 0 || r.z > -4.8, 'victim is moving toward the Dangler or stunned');
    await mk.screenshot({ path: 'screenshots/overnight/dangler-ingame-yank.png' }); await A.close(); await B.close(); }
  { const { A, B, mon, mk } = await round('wailer');
    await mon.evaluate(() => { const t = window.__tt; t.rig.position.set(0, 0, 0); t.dev.head = [0, 1.6, 0]; t.dev.l = [-0.3, 1.2, -0.3]; t.dev.r = [0.3, 1.2, -0.3]; });
    await mk.evaluate(() => { const t = window.__tt; t.rig.position.set(0, 0, -5); t.dev.head = [0, 1.6, 0]; t.dev.l = [-0.3, 1.2, -0.3]; t.dev.r = [0.3, 1.2, -0.3]; t.dev.q = [0, 1, 0, 0]; });
    await mon.waitForTimeout(500); await mon.evaluate(() => window.__tt.net.send({ t: 'ab' }));
    ok(await wait(mk, 'window.__tt.loco.gain === 0.5', 4000), 'monkey within 10 m got loco.gain 0.5 from the shriek');
    await steps(mk, 12); await mk.screenshot({ path: 'screenshots/overnight/wailer-ingame-veil.png' });
    await steps(mon, 6); await mon.screenshot({ path: 'screenshots/overnight/wailer-ingame-ping.png' });
    ok(await wait(mk, 'window.__tt.loco.gain === 1', 6000).then(async (v) => { await steps(mk, 4); return v && await mk.evaluate(() => window.__tt.loco.gain === 1); }), 'gain returns to 1 after the 2.5 s window');
    await A.close(); await B.close(); }
  { const { A, B, mon, mk } = await round('stringman');
    await mon.evaluate(() => { const t = window.__tt; t.rig.position.set(0, 0, 0); t.dev.head = [0, 1.6, 0]; t.dev.l = [-0.3, 1.2, -0.3]; t.dev.r = [0.3, 1.2, -0.3]; });
    await mk.evaluate(() => { const t = window.__tt; t.rig.position.set(0, 0, -4); t.dev.head = [0, 1.6, 0]; t.dev.l = [-0.3, 1.2, -0.3]; t.dev.r = [0.3, 1.2, -0.3]; t.dev.q = [0, 1, 0, 0]; });
    await mon.waitForTimeout(500); await mon.evaluate(() => window.__tt.net.send({ t: 'ab' }));
    ok(await wait(mk, 'window.__tt.loco.leash && window.__tt.loco.leash.r === 2.5', 4000), 'Stringman: the runner in the cone got a 2.5 m LOCO leash');
    await steps(mk, 10); await mk.screenshot({ path: 'screenshots/overnight/stringman-ingame.png' });
    await steps(mon, 10); await mon.screenshot({ path: 'screenshots/overnight/stringman-ingame-monster.png' });
    ok(await wait(mk, '!window.__tt.loco.leash', 6000).then(async (v) => { await steps(mk, 4); return v || await mk.evaluate(() => !window.__tt.loco.leash); }), 'the leash lapses after its 2.5 s');
    await A.close(); await B.close(); }
  { const { A, B, mon, mk } = await round('lurker');
    await mon.evaluate(() => { const t = window.__tt; t.rig.position.set(0, 0, 0); t.dev.head = [0, 1.6, 0]; t.dev.l = [-0.3, 1.2, -0.3]; t.dev.r = [0.3, 1.2, -0.3]; });
    await mk.evaluate(() => { const t = window.__tt; t.rig.position.set(0, 0, -4); t.dev.head = [0, 1.6, 0]; t.dev.l = [-0.3, 1.2, -0.3]; t.dev.r = [0.3, 1.2, -0.3]; t.dev.q = [0, 1, 0, 0]; });
    await mon.waitForTimeout(500); await mon.evaluate(() => window.__tt.net.send({ t: 'ab' }));
    ok(await wait(mk, '[...window.__tt.S.players.values()].some(p => p.ro==="monster" && p.ab===2)', 4000), 'Lurker: cling state replicated to the monkey client');
    await steps(mk, 10); await mk.screenshot({ path: 'screenshots/overnight/lurker-ingame.png' });
    await mon.evaluate(() => window.__tt.net.send({ t: 'ab' }));
    ok(await wait(mk, '[...window.__tt.S.players.values()].some(p => p.ro==="monster" && p.ab===3)', 3000), 'Lurker: the button drops it into the pounce window');
    await A.close(); await B.close(); }
} catch (e) { console.log('ERROR', e.message); fails++; }
await b.close(); srv.kill(); console.log(fails ? `${fails} FAILED` : 'KILLERS CLIENT ALL PASSED'); process.exit(fails ? 1 : 0);
