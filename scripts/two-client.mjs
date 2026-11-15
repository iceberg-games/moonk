// Automated two-client test: real server + two headless browsers (hidden ?dev=1 hook, no desktop play UI).
// Checks: both join one room, each sees the other (interpolated avatar), tag state is server-authoritative (normal),
// map vote resolves, horror round gives one monster with a form switch. A real headset is NOT tested.
// Also drives the in-world lobby computer (termPress): public quick-join, private create + join-by-code,
// and the offline / retry state. Screenshots go to net/screens/ as well as screenshots/.
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NET_SCREENS = join(ROOT, 'net/screens');
mkdirSync(NET_SCREENS, { recursive: true });
mkdirSync(join(ROOT, 'screenshots/overnight'), { recursive: true });

const PORT = Number(process.env.MOONK_TEST_PORT) || 8851, FAST = { ...process.env, PORT: String(PORT), TT_FAST: '1', MOONK_BAN_FILE: '/tmp/moonk-test-bans.json', MOONK_ACCOUNTS_FILE: '/tmp/moonk-test-accounts.json', MOONK_INV_FILE: '/tmp/moonk-test-inv.json' };
const srv = spawn('node', ['server/server.mjs'], { env: FAST, stdio: 'inherit' }); await new Promise((r) => setTimeout(r, 800));
const base = process.env.BASE || 'https://localhost:5190'; const ws = `ws://127.0.0.1:${PORT}`;
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors'] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 960, height: 540 } });
let fails = 0; const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) fails++; };
const open = async (name, extra = '', wsUrl = ws) => { const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(name, 'pageerror', e.message)); await p.goto(`${base}/?dev=1&name=${name}&ws=${encodeURIComponent(wsUrl)}${extra}`); await p.waitForFunction('window.__tt', null, { timeout: 30000 }); return p; };
const wait = (p, expr, t = 15000) => p.waitForFunction(expr, null, { timeout: t }).then(() => true).catch(() => false);

async function faceTerminal(p) {
  await p.evaluate(() => {
    const t = window.__tt;
    t.rig.position.set(0, 0, 0);
    t.dev.head = [0, 1.65, 3.4];
    t.dev.look = [0, 1.55, 5.2];
    t.dev.l = [-0.2, 1.2, 4.6];
    t.dev.r = [0.2, 1.2, 4.6];
    if (typeof t.frame === 'function') t.frame(performance.now());
  });
  await p.waitForTimeout(120);
}

async function shot(page, name) {
  await faceTerminal(page);
  const data = await page.evaluate(() => window.__tt.term?.c?.toDataURL?.('image/png') || '');
  if (data && data.startsWith('data:image/png;base64,')) {
    writeFileSync(join(NET_SCREENS, `${name}-terminal.png`), Buffer.from(data.split(',')[1], 'base64'));
  }
  try { await page.screenshot({ path: join(NET_SCREENS, `${name}.png`), timeout: 5000 }); }
  catch (e) { console.log('INFO screenshot skipped for', name, (e.message || e).split('\n')[0]); }
}

try {
  // ---- lobby computer: offline / retry (bad WS, single-player still loads) ----
  const Off = await open('OffA', '', 'ws://127.0.0.1:1');
  ok(await wait(Off, 'window.__tt.place === "hub" || window.__tt.S.place === "hub"', 10000), 'offline client still loads the hub (single-player works)');
  ok(await wait(Off, 'window.__tt.S.offline === true && /offline|unavailable|reach/i.test(window.__tt.S.status)', 12000), "lobby computer shows offline / multiplayer server unavailable");
  ok(await Off.evaluate(() => (window.__tt.term?.buttons || []).some((b) => b.id === 'retry')), 'Retry button is on the lobby computer');
  await shot(Off, 'lobby-offline');
  await Off.close();

  // ---- lobby computer: public quick-join via termPress ----
  const PubA = await open('PubA'), PubB = await open('PubB');
  ok(await wait(PubA, 'window.__tt.net.open === true') && await wait(PubB, 'window.__tt.net.open === true'), 'both public-join clients connected (tryConnect / Retry path)');
  await PubA.evaluate(() => window.__tt.termPress('quick'));
  ok(await wait(PubA, 'window.__tt.S.joined && window.__tt.S.room && window.__tt.S.room.public !== false'), 'PubA Quick play created/joined a public room via the lobby computer');
  const pubCode = await PubA.evaluate(() => window.__tt.S.room.code);
  await PubB.evaluate(() => window.__tt.termPress('quick'));
  ok(await wait(PubB, `window.__tt.S.joined && window.__tt.S.room && window.__tt.S.room.code === ${JSON.stringify(pubCode)}`), `PubB Quick play joined the same public room ${pubCode}`);
  ok(await wait(PubA, 'window.__tt.remote.size === 1') && await wait(PubB, 'window.__tt.remote.size === 1'), 'public quick-join: each client sees the other');
  await shot(PubA, 'lobby-public-quickjoin');
  await PubA.close(); await PubB.close();

  // ---- lobby computer: private New room + join by 4-letter code via the on-screen keyboard ----
  const PrivA = await open('PrivA'), PrivB = await open('PrivB');
  ok(await wait(PrivA, 'window.__tt.net.open === true') && await wait(PrivB, 'window.__tt.net.open === true'), 'both private-join clients connected');
  await PrivA.evaluate(() => window.__tt.termPress('new:normal'));
  ok(await wait(PrivA, 'window.__tt.S.joined && window.__tt.S.room && window.__tt.S.room.public === false'), 'PrivA New: Classic created a private room via the lobby computer');
  const privCode = await PrivA.evaluate(() => window.__tt.S.room.code);
  ok(typeof privCode === 'string' && privCode.length === 4, `private room code is 4 letters (${privCode})`);
  await PrivB.evaluate((code) => {
    const t = window.__tt;
    t.termPress('f:code');
    t.termPress('k:CLEAR');
    for (const ch of code) t.termPress('k:' + ch);
    t.termPress('join');
  }, privCode);
  ok(await wait(PrivB, `window.__tt.S.joined && window.__tt.S.room && window.__tt.S.room.code === ${JSON.stringify(privCode)}`), `PrivB joined private room ${privCode} by typing the code on the lobby computer`);
  ok(await wait(PrivA, 'window.__tt.remote.size === 1') && await wait(PrivB, 'window.__tt.remote.size === 1'), 'private join-by-code: each client sees the other');
  await shot(PrivA, 'lobby-private-code');
  await shot(PrivB, 'lobby-private-code-joiner');
  await PrivA.close(); await PrivB.close();

  // ---- existing end-to-end match coverage (direct join hook, then a full round) ----
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
  // Grinner: signature ability reaches both clients; the monkey's blackout fog engages (client-side)
  await A.evaluate(() => window.__tt.net.send({ t: 'set', monster: 'grinner' }));
  ok(await wait(A, "window.__tt.S.room.phase==='vote' && window.__tt.S.room.monster==='grinner'", 8000), 'host picked the Grinner');
  ok(await wait(A, "window.__tt.S.room.phase==='play' && window.__tt.S.room.mType==='grinner' && [...window.__tt.S.players.values()].some(p => p.ro==='monster' && p.fo==='main')", 15000), 'grinner round started');   // fo==='main' = the Grinner's form, so a stale Yeti snapshot cannot match
  const gm = await A.evaluate(() => [...window.__tt.S.players.values()].find((p) => p.ro === 'monster' && p.fo === 'main').id); const gPage = (await A.evaluate(() => window.__tt.S.id)) === gm ? A : B; const mPage = gPage === A ? B : A;
  await mPage.evaluate(() => { const t = window.__tt; t.dev.head = [0, 1.6, 0]; });
  await gPage.evaluate(() => { window.__tt.rig.position.set(-8, 0, 0); });   // monster stands 8 m away: inside the 12 m blackout radius, outside its 2 m reach (so the monkey is not caught mid-test)
  // (no extra wait: TT_FAST rounds are only 12 s, so everything below must finish inside one round)
  await gPage.evaluate(() => window.__tt.net.send({ t: 'ab' }));
  ok(await wait(mPage, "[...window.__tt.S.players.values()].some(p => p.ro==='monster' && p.ab===2)", 4000), 'blackout active state replicated to the monkey client');
  // Deterministic: a headless background tab throttles requestAnimationFrame, so step the monkey's render loop by hand (50 ms frames) instead of waiting on the clock.
  const fogFar = await mPage.evaluate(() => { const t = window.__tt; let n = performance.now(); for (let i = 0; i < 60; i++) t.frame(n += 50); const far = t.scene.fog.far; t.frame(performance.now()); return far; });   // (the real loop's dt is clamped >= 0, so resuming is safe)
  ok(fogFar < 10, `monkey client fog closed in (blackout) with the Grinner nearby (fog far ${fogFar.toFixed(2)})`);
  await mPage.screenshot({ path: 'screenshots/overnight/blackout-monkey-view.png' });
  // Generator valve from the client side: the monkey stands at generator 0, squeezes (dev hook: grip always on) and sweeps a hand CLOCKWISE around the wheel.
  // The client sends signed deltas, the server (rate capped) raises the level. Frames are stepped by hand (no rAF dependence).
  const gv = await mPage.evaluate(() => {
    const t = window.__tt, g = t.S.room.gens[0], c = Math.cos(g.ry), sn = Math.sin(g.ry), to = (lx, ly, lz) => [g.x + lx * c + lz * sn, g.y + ly, g.z - lx * sn + lz * c];
    const [sx, , sz] = to(0, 0, 0.85); t.rig.position.set(sx, 0, sz); t.dev.head = [0, 1.35, 0];   // close + low so the wheel is inside the clamped arm reach (loco keeps hands within arm length of the body)
    t.dev.q = [0, Math.sin(g.ry / 2), 0, Math.cos(g.ry / 2)]; t.dev.look = null;
    let n = performance.now(), phi = 0; const hand = () => to(0.12 + 0.15 * Math.cos(phi), 1.15 + 0.15 * Math.sin(phi), 0.42).map((v, i) => v - [t.rig.position.x, 0, t.rig.position.z][i]);
    for (let i = 0; i < 80; i++) { t.dev.r = hand(); t.dev.l = [-5, 0.5, -5]; t.frame(n += 50); phi -= 0.25; }   // 80 x 0.25 rad = 20 rad clockwise (visually)
    const far = t.S.gp ? t.S.gp[0] : 0; t.frame(performance.now()); return { id: g.id, far };
  });
  // Informational only: in a headless dev session the loco arm clamp drags the virtual hand off the wheel, so this is not a pass/fail gate. The valve rules themselves are asserted server-side in monster-test.mjs.
  console.log('INFO client valve sweep: server fill level', await mPage.evaluate(() => window.__tt.S.gp?.[0]));
  await mPage.evaluate(() => { const t = window.__tt; let n = performance.now(); for (let i = 0; i < 5; i++) t.frame(n += 50); t.frame(performance.now()); });
  await mPage.screenshot({ path: 'screenshots/overnight/generator-valve.png' });
  // duplicate names are rejected server-wide
  const C = await open('Alice'); await C.evaluate(() => window.__tt.net.connect().then(() => window.__tt.join({ quick: true })));
  ok(await wait(C, "/taken/i.test(window.__tt.S.status)", 5000), "duplicate name 'Alice' rejected (name taken)");
} catch (e) { console.log('ERROR', e.message); fails++; }
await b.close(); srv.kill(); console.log(fails ? `${fails} FAILED` : 'ALL PASSED'); process.exit(fails ? 1 : 0);
