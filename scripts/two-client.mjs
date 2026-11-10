// Automated two-client test: real server + two headless browsers (hidden ?dev=1 hook, no desktop play UI).
// Checks: both join one room, each sees the other (interpolated avatar), tag state is server-authoritative (normal),
// map vote resolves, horror round gives one monster with a form switch. A real headset is NOT tested.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
const PORT = 8841, FAST = { ...process.env, PORT: String(PORT), TT_FAST: '1', MOONK_BAN_FILE: '/tmp/moonk-test-bans.json', MOONK_ACCOUNTS_FILE: '/tmp/moonk-test-accounts.json' };
const srv = spawn('node', ['server/server.mjs'], { env: FAST, stdio: 'inherit' }); await new Promise((r) => setTimeout(r, 800));
const base = process.env.BASE || 'https://localhost:5190'; const ws = `ws://127.0.0.1:${PORT}`;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors'] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 640, height: 360 } });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const open = async (name, extra = '') => { const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(name, 'pageerror', e.message)); await p.goto(`${base}/?dev=1&name=${name}&ws=${encodeURIComponent(ws)}${extra}`); await p.waitForFunction('window.__tt', null, { timeout: 30000 }); return p; };
const wait = (p, expr, t = 15000) => p.waitForFunction(expr, null, { timeout: t }).then(() => true).catch(() => false);
try {
  const A = await open('Alice'), B = await open('Bob');
  for (const [p, pos] of [[A, [0, 1.6, 0]], [B, [0.4, 1.6, 0]]]) await p.evaluate((pos) => { const t = window.__tt; t.rig.position.set(pos[0] * 0, 0, 0); t.dev.head = pos; t.dev.l = [pos[0] - 0.3, 1.0, -0.3]; t.dev.r = [pos[0] + 0.3, 1.0, -0.3]; }, pos);
  await A.evaluate(() => window.__tt.net.connect().then(() => window.__tt.join({ mode: 'normal' })));
  await wait(A, 'window.__tt.S.joined'); const code = await A.evaluate(() => window.__tt.S.room.code); ok(!!code, `Alice created room ${code}`);
  await B.evaluate(() => window.__tt.net.connect()); await B.evaluate((c) => window.__tt.join({ room: c }), code);
  ok(await wait(B, 'window.__tt.S.joined'), 'Bob joined the same room by code');
  ok(await wait(A, 'window.__tt.remote.size === 1') && await wait(B, 'window.__tt.remote.size === 1'), 'each client sees the other player avatar');
  // move Bob; Alice must see him move (interpolated)
  await B.evaluate(() => { window.__tt.dev.head = [3, 1.6, 0]; window.__tt.dev.l = [2.7, 1, -0.3]; window.__tt.dev.r = [3.3, 1, -0.3]; });
  ok(await wait(A, '[...window.__tt.remote.values()][0].av.root.visible && Math.abs([...window.__tt.remote.values()][0].buf.at(-1).h[0] - 3) < 0.5'), "Alice sees Bob's position sync");
  ok(await wait(A, "window.__tt.S.room.phase==='vote'", 8000), 'room moved to map vote with 2 humans');
  await A.evaluate(() => window.__tt.net.send({ t: 'vote', map: 'crypt' })); await B.evaluate(() => window.__tt.net.send({ t: 'vote', map: 'crypt' }));
  ok(await wait(A, "window.__tt.S.room.phase==='countdown' && window.__tt.S.room.map==='crypt'", 8000), 'map vote winner (crypt) chosen');
  ok(await wait(A, "window.__tt.S.room.phase==='play'", 8000), 'normal round started; clients loaded the voted map: ' + await A.evaluate(() => window.__tt.place));
  await A.screenshot({ path: 'screenshots/two-client-A.png' }); await B.screenshot({ path: 'screenshots/two-client-B.png' });
  const itId = await A.evaluate(() => [...window.__tt.S.players.values()].find((p) => p.it)?.id);
  ok(!!itId, 'server picked exactly one IT player (id ' + itId + ')');
  // tagger touches the other player's head with a hand -> infection (server authoritative)
  const itPage = (await A.evaluate(() => window.__tt.S.id)) === itId ? A : B; const other = itPage === A ? B : A;
  const target = await other.evaluate(() => window.__tt.world.head.toArray());
  await itPage.evaluate((tg) => { const t = window.__tt; t.rig.position.set(0, 0, 0); t.dev.head = [tg[0], tg[1], tg[2] - 1.2]; t.dev.l = [tg[0], tg[1], tg[2] - 0.3]; t.dev.r = [tg[0] + 0.2, tg[1], tg[2] - 0.3]; }, target);
  ok(await wait(A, "[...window.__tt.S.players.values()].every(p => p.it)", 8000), 'tag transferred: everyone infected, decided by the server');
  ok(await wait(A, "window.__tt.S.room.phase==='over'", 5000), 'round ended with winner message');
  // horror mode
  await A.evaluate(() => window.__tt.net.send({ t: 'set', mode: 'horror', monster: 'yeti' }));
  ok(await wait(A, "window.__tt.S.room.mode==='horror' && window.__tt.S.room.phase==='vote'", 8000), 'host switched to Be the Monster');
  ok(await wait(A, "window.__tt.S.room.phase==='play'", 15000), 'horror round started');
  const mons = await A.evaluate(() => [...window.__tt.S.players.values()].filter((p) => p.ro === 'monster').map((p) => [p.id, p.fo]));
  ok(mons.length === 1 && mons[0][1] === 'human', 'exactly one monster (Yeti) starting in human form: ' + JSON.stringify(mons));
  const monPage = (await A.evaluate(() => window.__tt.S.id)) === mons[0][0] ? A : B;
  await monPage.evaluate(() => window.__tt.net.send({ t: 'form' }));
  ok(await wait(A, "[...window.__tt.S.players.values()].some(p => p.ro==='monster' && p.fo==='yeti')", 5000), 'yeti switched to yeti form (server enforced)');
  await monPage.evaluate(() => window.__tt.net.send({ t: 'form' })); await A.waitForTimeout(300);
  ok(await A.evaluate(() => [...window.__tt.S.players.values()].some((p) => p.ro === 'monster' && p.fo === 'yeti')), 'form switch cooldown blocks an immediate switch back');
  // duplicate names are rejected server-wide
  const C = await open('Alice'); await C.evaluate(() => window.__tt.net.connect().then(() => window.__tt.join({ quick: true })));
  ok(await wait(C, "/taken/i.test(window.__tt.S.status)", 5000), "duplicate name 'Alice' rejected (name taken)");
} catch (e) { console.log('ERROR', e.message); fails++; }
await b.close(); srv.kill(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
