// Isolated buy+equip on 8861 via the 8862 Vite client. Second page joins the same room and reads snap c.
import { chromium } from 'playwright';
const B = 'https://localhost:8862';
const nameA = 'H4A' + Math.random().toString(36).slice(2, 5);
const nameB = 'H4B' + Math.random().toString(36).slice(2, 5);
const browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--ignore-certificate-errors'] });
const ctx = await browser.newContext({ ignoreHTTPSErrors: true, viewport: { width: 800, height: 450 } });

async function open(name) {
  const p = await ctx.newPage();
  p.on('pageerror', (e) => console.log('pageerror', name, e.message));
  await p.goto(`${B}/?dev=1&place=hub&name=${name}&t=${Date.now()}`, { waitUntil: 'networkidle' });
  await p.waitForFunction('window.__tt && window.__tt.shop && window.__tt.net && window.__tt.join', null, { timeout: 30000 });
  await p.waitForFunction(() => window.__tt.net.open === true, null, { timeout: 15000 });
  await p.evaluate((nm) => {
    const t = window.__tt;
    t.S.name = nm;
    window.__h4 = [];
    const orig = t.net.send.bind(t.net);
    t.net.send = (m) => { window.__h4.push({ dir: 'out', t: m.t, id: m.id, cos: m.cos }); return orig(m); };
    for (const ev of ['inv', 'buyres', 'cosrej', 'welcome', 'snap']) {
      t.net.on(ev, (m) => window.__h4.push({
        dir: 'in', t: ev, id: m.id, ok: m.ok, reason: m.reason,
        moons: m.moons, owned: m.owned, code: m.room?.code,
        ps: (m.ps || []).map((p) => ({ id: p.id, n: p.n, c: p.c })),
      }));
    }
  }, name);
  return p;
}

const pA = await open(nameA);
const pB = await open(nameB);

await pA.evaluate(() => window.__tt.join({ mode: 'normal' }));
const t0 = Date.now();
let aJoin;
while (Date.now() - t0 < 10000) {
  aJoin = await pA.evaluate(() => ({
    joined: window.__tt.S.joined,
    room: window.__tt.S.room?.code,
    log: window.__h4,
  }));
  if (aJoin.joined && aJoin.log.some((x) => x.t === 'inv')) break;
  await pA.waitForTimeout(100);
}
if (!aJoin?.joined) { console.error('A join failed', aJoin); await browser.close(); process.exit(1); }
console.log('A joined', aJoin.room, 'inv', aJoin.log.find((x) => x.t === 'inv'));

await pB.evaluate((code) => window.__tt.join({ room: code }), aJoin.room);
const t1 = Date.now();
let bJoin;
while (Date.now() - t1 < 10000) {
  bJoin = await pB.evaluate(() => ({ joined: window.__tt.S.joined, room: window.__tt.S.room?.code, log: window.__h4 }));
  if (bJoin.joined && bJoin.log.some((x) => x.t === 'inv')) break;
  await pB.waitForTimeout(100);
}
if (!bJoin?.joined) { console.error('B join failed', bJoin); await browser.close(); process.exit(1); }
console.log('B joined', bJoin.room);

const buy = await pA.evaluate(async () => {
  const t = window.__tt;
  const log = window.__h4;
  const V = t.camera.position.constructor;
  const press = (btn, n = 10) => {
    const face = btn.face;
    const d = btn.d || 0.07;
    for (let i = 0; i < n; i++) {
      face.updateMatrixWorld(true);
      const z = (d * 0.5 + 0.05) - i * ((d * 0.5 + 0.05) / Math.max(1, n - 1));
      const tip = new V(0, 0, z);
      face.localToWorld(tip);
      t.shop.update(0.016, { hands: [{ position: tip, radius: 0.04 }] });
    }
    t.shop.update(0.016, { hands: [] });
  };
  const waitFor = (pred, ms = 8000) => new Promise((resolve, reject) => {
    const t0 = performance.now();
    const tick = () => {
      const hit = pred();
      if (hit) return resolve(hit);
      if (performance.now() - t0 > ms) return reject(new Error('timeout'));
      setTimeout(tick, 30);
    };
    tick();
  });
  const firstInv = log.find((x) => x.t === 'inv');
  t.shop.setCategory('hat');
  const ped = t.shop._state.buttons.find((b) => b.item?.id === 'hat_moon_beanie');
  if (ped) press(ped, 8);
  else t.shop._state.selectedId = 'hat_moon_beanie';
  const buyBtn = t.shop._state.buttons.find((b) => b.id === 'action:buy');
  press(buyBtn, 10);
  const buyres = await waitFor(() => log.find((x) => x.t === 'buyres' && x.id === 'hat_moon_beanie'));
  const invAfter = await waitFor(() => {
    const invs = log.filter((x) => x.t === 'inv');
    return invs.length >= 2 ? invs[invs.length - 1] : null;
  });
  const ped2 = t.shop._state.buttons.find((b) => b.item?.id === 'hat_moon_beanie');
  if (ped2) press(ped2, 8);
  const equipBtn = t.shop._state.buttons.find((b) => b.id === 'action:equip');
  press(equipBtn, 10);
  await new Promise((r) => setTimeout(r, 400));
  const sel = t.shop.getSelection();
  return {
    firstInv, buyres, invAfter,
    equipped: sel.wallet.equipped,
    moons: sel.wallet.balance,
    ownedHasBeanie: [...sel.wallet.owned].includes('hat_moon_beanie'),
    cosOut: log.filter((x) => x.dir === 'out' && x.t === 'cos').slice(-1)[0],
  };
});
console.log('A buy/equip', JSON.stringify(buy, null, 2));

await pB.waitForTimeout(600);
const bSnap = await pB.evaluate(() => {
  const log = window.__h4;
  const snaps = log.filter((x) => x.t === 'snap');
  const last = snaps[snaps.length - 1];
  const other = (last?.ps || []).find((p) => p.n && p.n !== window.__tt.S.name);
  // also look at remotes / players
  let fromPlayers = null;
  const ps = window.__tt.S.players;
  if (ps && typeof ps.values === 'function') {
    fromPlayers = [...ps.values()].map((p) => ({ id: p.id, n: p.n, c: p.c }));
  }
  return { lastPs: last?.ps, other, fromPlayers, snapCount: snaps.length };
});
console.log('B snap', JSON.stringify(bSnap, null, 2));

await browser.close();

const otherC = bSnap.other?.c || (bSnap.fromPlayers || []).find((p) => p.c?.hat === 'hat_moon_beanie')?.c;
const ok = buy.firstInv?.moons === 100
  && buy.buyres?.ok === true
  && buy.invAfter?.moons === 25
  && (buy.invAfter?.owned || []).includes('hat_moon_beanie')
  && buy.equipped?.hat === 'hat_moon_beanie'
  && otherC?.hat === 'hat_moon_beanie';
if (!ok) { console.error('H4 BUY-EQUIP FAILED'); process.exit(1); }
console.log('H4 BUY-EQUIP PASS', { room: aJoin.room, otherC });
