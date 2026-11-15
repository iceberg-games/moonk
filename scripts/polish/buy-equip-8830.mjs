import { chromium } from 'playwright';
const B = 'https://localhost:5190';
const name = 'BuyChk' + Math.random().toString(36).slice(2, 6);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--ignore-certificate-errors'] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 800, height: 450 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
p.on('console', (m) => { const t = m.text(); if (/buy|join|inv|error|ws/i.test(t)) console.log('CONSOLE', t); });
await p.goto(`${B}/?dev=1&place=hub&name=${name}&t=${Date.now()}`, { waitUntil: 'networkidle' });
await p.waitForFunction('window.__tt && window.__tt.shop && window.__tt.net && window.__tt.join', null, { timeout: 30000 });
const pre = await p.evaluate(() => ({ open: window.__tt.net.open, status: window.__tt.S.status, name: window.__tt.S.name, ready: window.__tt.net.ws?.readyState }));
console.log('PRE', pre);
if (!pre.open) {
  await p.evaluate(() => window.__tt.net.connect());
  await p.waitForFunction(() => window.__tt.net.open === true, null, { timeout: 15000 });
}
await p.evaluate(() => {
  const t = window.__tt;
  window.__buyLog = [];
  const orig = t.net.send.bind(t.net);
  t.net.send = (m) => {
    window.__buyLog.push({ dir: 'out', t: m.t, id: m.id, at: performance.now() });
    return orig(m);
  };
  for (const ev of ['inv', 'buyres', 'cosrej', 'welcome', 'err', 'error']) {
    t.net.on(ev, (m) => window.__buyLog.push({ dir: 'in', t: ev, id: m.id, ok: m.ok, reason: m.reason, moons: m.moons, owned: m.owned, unlocks: m.unlocks, code: m.room?.code, msg: m.msg || m.error, at: performance.now() }));
  }
  t.S.name = t.S.name || 'BuyChk';
  t.join({ mode: 'normal' });
  return { status: t.S.status, name: t.S.name };
}).then((x) => console.log('JOINED CALL', x));

const t0 = Date.now();
let snap;
while (Date.now() - t0 < 10000) {
  snap = await p.evaluate(() => ({
    joined: window.__tt.S.joined,
    status: window.__tt.S.status,
    room: window.__tt.S.room?.code,
    log: window.__buyLog,
    open: window.__tt.net.open,
  }));
  if (snap.joined && snap.log.some((x) => x.t === 'inv')) break;
  await p.waitForTimeout(150);
}
console.log('AFTER JOIN', JSON.stringify(snap, null, 2));
if (!(snap && snap.joined && snap.log.some((x) => x.t === 'inv'))) {
  console.error('join/inv failed');
  await b.close();
  process.exit(1);
}


const result = await p.evaluate(async () => {
  const t = window.__tt;
  const log = window.__buyLog;
  const V = t.camera.position.constructor;
  const press = (btn, n = 10) => {
    const face = btn.face;
    const d = btn.d || 0.07;
    for (let i = 0; i < n; i++) {
      face.updateMatrixWorld(true);
      const z = (d * 0.5 + 0.05) - i * ((d * 0.5 + 0.05) / (n - 1));
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
      if (performance.now() - t0 > ms) return reject(new Error('timeout ' + pred.toString().slice(0, 100) + ' log=' + JSON.stringify(log.filter(x => x.t !== 'pose').slice(-8))));
      setTimeout(tick, 30);
    };
    tick();
  });
  const selectItem = (slot, id) => {
    t.shop.setCategory(slot);
    const ped = t.shop._state.buttons.find((b) => b.item?.id === id);
    if (ped) press(ped, 8);
    else t.shop._state.selectedId = id;
  };

  const firstInv = log.find((x) => x.t === 'inv');
  selectItem('hat', 'hat_moon_beanie');
  const buyBtn = t.shop._state.buttons.find((b) => b.id === 'action:buy');
  const enabled = !!buyBtn?.enabled;
  const buysBefore = log.filter((x) => x.dir === 'out' && x.t === 'buy').length;
  for (let i = 0; i < 5; i++) press(buyBtn, 8);
  const buysAfterBurst = log.filter((x) => x.dir === 'out' && x.t === 'buy').length - buysBefore;

  const buyres = await waitFor(() => log.find((x) => x.t === 'buyres' && x.id === 'hat_moon_beanie'));
  const invAfter = await waitFor(() => {
    const invs = log.filter((x) => x.t === 'inv');
    return invs.length >= 2 ? invs[invs.length - 1] : null;
  });

  const coolAt = t.shop._state.buyCoolUntil || 0;
  const coolRemaining = coolAt - performance.now();
  // After a 75-Moon beanie, nothing else is affordable, so Buy is disabled.
  // Confirm the cooldown is armed, then send the visor on the wire after 400 ms
  // (same check Netcode ran) to verify reason 'moons'.
  const visorId = 'face_hud_visor';
  t.net.send({ t: 'buy', id: visorId }); // should be ignored by the *button*, but this is a raw send during cool — server may still answer
  // Don't count this as a button debounce failure. Wait for cool, then send once.
  await new Promise((r) => setTimeout(r, Math.max(0, coolRemaining) + 20));
  const afterCool = performance.now() >= (t.shop._state.buyCoolUntil || 0);
  t.net.send({ t: 'buy', id: visorId });
  const visorRes = await waitFor(() => log.filter((x) => x.t === 'buyres' && x.id === visorId).at(-1));

  selectItem('hat', 'hat_moon_beanie');
  const equipBtn = t.shop._state.buttons.find((b) => b.id === 'action:equip');
  const equipEnabled = !!equipBtn?.enabled;
  const cosBefore = log.filter((x) => x.dir === 'out' && x.t === 'cos').length;
  press(equipBtn, 8);
  await new Promise((r) => setTimeout(r, 300));
  const sel = t.shop.getSelection();
  let worn = false;
  const player = t.shop._state.player;
  if (player?.root) {
    player.root.traverse((o) => {
      if ((o.name || '').includes('beanie') || o.userData?.itemId === 'hat_moon_beanie' || o.userData?.id === 'hat_moon_beanie') worn = true;
    });
  }
  return {
    buyEnabled: enabled,
    firstInv,
    buyres,
    invAfter,
    buysAfterBurst,
    coolRemainingMs: Math.round(coolRemaining),
    afterCool,
    visorResCount: log.filter((x) => x.t === 'buyres' && x.id === visorId).length,
    visorRes,
    equipEnabled,
    equipped: sel.wallet.equipped,
    moons: sel.wallet.balance,
    ownedHasBeanie: [...sel.wallet.owned].includes('hat_moon_beanie'),
    cosSent: log.filter((x) => x.dir === 'out' && x.t === 'cos').length - cosBefore,
    worn,
    room: t.S.room?.code,
    name: t.S.name,
  };
});
console.log(JSON.stringify(result, null, 2));
await b.close();

const ok = result.buyEnabled === true
  && result.buyres?.ok === true
  && result.invAfter?.moons === 25
  && (result.invAfter?.owned || []).includes('hat_moon_beanie')
  && result.buysAfterBurst === 1
  && result.coolRemainingMs > 0
  && result.visorRes?.ok === false
  && result.visorRes?.reason === 'moons'
  && result.equipped?.hat === 'hat_moon_beanie'
  && result.ownedHasBeanie
  && result.moons === 25
  && result.firstInv?.moons === 100
  && result.cosSent >= 1;
if (!ok) {
  console.error('BUY-EQUIP CHECK FAILED');
  process.exit(1);
}
console.log('BUY-EQUIP CHECK PASS');
