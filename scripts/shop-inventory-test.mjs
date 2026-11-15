// Unit tests for the buy/inv/cosrej/unlock client adapter, plus a stub server
// that speaks Netcode's final wire. Does not edit server/server.mjs.
import { WebSocketServer, WebSocket } from 'ws';
import {
  BUY_REASON_MSG, COSREJ_REASON_MSG,
  buyResMessage, cosRejMessage, unlockMessage,
  revertSlot, parseInv, createShopSession, defaultForSlot,
} from '../src/kit/shopInventory.js';

const results = [];
const check = (n, ok, d = '') => {
  results.push(!!ok);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + String(d).slice(0, 240)}`);
};

// ---- pure adapter ----
check('moons reason maps to Not enough Moons', BUY_REASON_MSG.moons === 'Not enough Moons');
check('owned reason maps to Already yours', BUY_REASON_MSG.owned === 'Already yours');
check('rate_limited maps to One moment...', BUY_REASON_MSG.rate_limited === 'One moment...');
check('unknown buy maps to Not in the shop', BUY_REASON_MSG.unknown === 'Not in the shop');
check('not_for_sale maps to Not for sale', BUY_REASON_MSG.not_for_sale === 'Not for sale');
check('buyRes ok has no sign message', buyResMessage({ ok: true, id: 'hat_moon_beanie' }) == null);
check('buyRes unknown uses the map', buyResMessage({ ok: false, reason: 'unknown' }) === 'Not in the shop');
check('buyRes mystery reason is polite', buyResMessage({ ok: false, reason: 'nope' }) === 'Cannot buy');
check('cosrej not_owned', COSREJ_REASON_MSG.not_owned === 'Not owned' && cosRejMessage({ reason: 'not_owned' }) === 'Not owned');
check('cosrej locked', cosRejMessage({ reason: 'locked' }) === 'Locked');
check('cosrej unknown', cosRejMessage({ reason: 'unknown' }) === 'Unknown item');

const names = { hat_antenna: 'Space Antenna', fur_nebula: 'Nebula' };
check('unlock one item', unlockMessage({ items: ['hat_antenna'] }, (id) => names[id]) === 'Unlocked: Space Antenna');
check('unlock two items', unlockMessage({ items: ['hat_antenna', 'fur_nebula'] }, (id) => names[id]) === 'Unlocked: Space Antenna, Nebula');
check('unlock empty', unlockMessage({ items: [] }, (id) => names[id]) === 'Unlocked');

const evicted = revertSlot({ v: 1, hat: 'hat_cork_crown', face: 'face_mustache', fur: 'fur_banana', hand: 'hand_boxing' }, 'hat');
check('revert hat slot to default null', evicted.hat == null && evicted.face === 'face_mustache' && evicted.fur === 'fur_banana' && evicted.hand === 'hand_boxing' && evicted.v === 1);
check('revert fur slot to gray', revertSlot({ fur: 'fur_nebula' }, 'fur').fur === 'fur_moonk_gray');
check('defaultForSlot', defaultForSlot('hat') == null && defaultForSlot('fur') === 'fur_moonk_gray');

const inv = parseInv({ t: 'inv', moons: 25, owned: ['fur_moonk_gray', 12, 'hat_banana_cap'], unlocks: ['hub_visits_5'] });
check('parseInv keeps string ids and numeric moons', inv.moons === 25 && inv.owned.join() === 'fur_moonk_gray,hat_banana_cap' && inv.unlocks.join() === 'hub_visits_5');
check('parseInv missing moons is 0', parseInv({}).moons === 0);

const session = createShopSession();
check('session starts inactive', session.active === false && session.inv == null);
session.applyInv({ moons: 100, owned: ['fur_moonk_gray'], unlocks: [] });
check('session active after inv', session.active && session.inv.moons === 100);
session.clear();
check('session clears on disconnect', session.active === false && session.inv == null);

// ---- stub server (Netcode's wire, in-memory per socket) ----
const STARTERS = ['fur_moonk_gray', 'hat_banana_cap'];
const PRICE = {
  hat_moon_beanie: 75,
  face_mustache: 50,
  hat_cork_crown: 500,
  hat_banana_cap: 0,
  hat_antenna: null,
};
const KNOWN = new Set([...STARTERS, ...Object.keys(PRICE)]);

function attachStub(ws) {
  let moons = 100;
  const owned = new Set(STARTERS);
  const unlocks = new Set();
  let lastBuy = 0;
  const send = (o) => ws.send(JSON.stringify(o));
  const sendInv = () => send({ t: 'inv', moons, owned: [...owned], unlocks: [...unlocks] });
  ws.on('message', (buf) => {
    let m; try { m = JSON.parse(buf.toString()); } catch { return; }
    if (m.t === 'join') {
      send({ t: 'welcome', id: 1, room: { code: 'STUB', public: false } });
      sendInv();
      return;
    }
    if (m.t === 'buy') {
      const id = m.id;
      const now = Date.now();
      if (now - lastBuy < 80) { send({ t: 'buyres', id, ok: false, reason: 'rate_limited' }); return; }
      lastBuy = now;
      if (!KNOWN.has(id) || PRICE[id] === undefined && !STARTERS.includes(id)) {
        send({ t: 'buyres', id, ok: false, reason: 'unknown' }); return;
      }
      if (PRICE[id] == null) { send({ t: 'buyres', id, ok: false, reason: 'not_for_sale' }); return; }
      if (owned.has(id)) { send({ t: 'buyres', id, ok: false, reason: 'owned' }); return; }
      if (moons < PRICE[id]) { send({ t: 'buyres', id, ok: false, reason: 'moons' }); return; }
      moons -= PRICE[id];
      owned.add(id);
      send({ t: 'buyres', id, ok: true });
      sendInv();
      return;
    }
    if (m.t === 'cos') {
      const c = m.cos || {};
      for (const slot of ['hat', 'face', 'fur', 'hand']) {
        const id = c[slot];
        if (!id) continue;
        if (!KNOWN.has(id)) { send({ t: 'cosrej', slot, id, reason: 'unknown' }); return; }
        if (PRICE[id] === null && !unlocks.has(id)) { send({ t: 'cosrej', slot, id, reason: 'locked' }); return; }
        if (!owned.has(id)) { send({ t: 'cosrej', slot, id, reason: 'not_owned' }); return; }
      }
      return;
    }
    if (m.t === '__grant_unlock') {
      for (const id of m.items || []) { owned.add(id); unlocks.add(id); }
      send({ t: 'unlock', id: m.id, items: m.items, reason: m.reason || 'test' });
      sendInv();
    }
  });
}

const PORT = 8849;
const wss = new WebSocketServer({ port: PORT, host: '127.0.0.1' });
wss.on('connection', attachStub);
await new Promise((r) => wss.once('listening', r));

function connect() {
  return new Promise((ok, bad) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}`);
    const msgs = [];
    ws.on('open', () => ok({ ws, msgs }));
    ws.on('error', bad);
    ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { /* */ } });
  });
}
const waitFor = async (fn, ms = 2000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 15)); }
  return fn();
};

try {
  const a = await connect();
  a.ws.send(JSON.stringify({ t: 'join', name: 'InvA', cos: { v: 1, hat: null, face: null, fur: 'fur_moonk_gray', hand: null } }));
  const welcome = await waitFor(() => a.msgs.find((m) => m.t === 'welcome'));
  const firstInv = await waitFor(() => a.msgs.find((m) => m.t === 'inv'));
  check('stub sends inv right after join', !!welcome && firstInv?.t === 'inv' && firstInv.moons === 100 && firstInv.owned.includes('fur_moonk_gray'));
  const sess = createShopSession();
  sess.applyInv(firstInv);
  check('adapter treats first inv as session truth', sess.active && sess.inv.moons === 100);

  a.ws.send(JSON.stringify({ t: 'buy', id: 'hat_moon_beanie' }));
  const buyOk = await waitFor(() => a.msgs.find((m) => m.t === 'buyres' && m.id === 'hat_moon_beanie'));
  const invAfter = await waitFor(() => [...a.msgs].reverse().find((m) => m.t === 'inv' && m.owned?.includes('hat_moon_beanie')));
  check('successful buy: buyres ok then inv with item and deducted moons', buyOk?.ok === true && invAfter?.moons === 25 && invAfter.owned.includes('hat_moon_beanie'));
  sess.applyInv(invAfter);
  check('session wallet follows inv after buy', sess.inv.moons === 25 && sess.inv.owned.includes('hat_moon_beanie'));

  const pause = () => new Promise((r) => setTimeout(r, 120));
  await pause();
  a.ws.send(JSON.stringify({ t: 'buy', id: 'hat_cork_crown' }));
  const buyMoons = await waitFor(() => a.msgs.find((m) => m.t === 'buyres' && m.id === 'hat_cork_crown'));
  check('too expensive: buyres moons', buyMoons?.ok === false && buyMoons.reason === 'moons' && buyResMessage(buyMoons) === 'Not enough Moons');

  await pause();
  a.ws.send(JSON.stringify({ t: 'buy', id: 'hat_not_real' }));
  const buyUnk = await waitFor(() => a.msgs.find((m) => m.t === 'buyres' && m.id === 'hat_not_real'));
  check('unknown id: buyres unknown', buyUnk?.ok === false && buyUnk.reason === 'unknown');

  await pause();
  a.ws.send(JSON.stringify({ t: 'buy', id: 'hat_antenna' }));
  const buyLock = await waitFor(() => a.msgs.find((m) => m.t === 'buyres' && m.id === 'hat_antenna'));
  check('unlock-only: buyres not_for_sale', buyLock?.ok === false && buyLock.reason === 'not_for_sale' && buyResMessage(buyLock) === 'Not for sale');

  await pause();
  a.ws.send(JSON.stringify({ t: 'buy', id: 'hat_banana_cap' }));
  const buyOwned = await waitFor(() => a.msgs.find((m) => m.t === 'buyres' && m.id === 'hat_banana_cap'));
  check('already owned: buyres owned', buyOwned?.ok === false && buyOwned.reason === 'owned' && buyResMessage(buyOwned) === 'Already yours');

  await pause();
  // rate limit: two buys in one tick
  const before = a.msgs.length;
  a.ws.send(JSON.stringify({ t: 'buy', id: 'face_mustache' }));
  a.ws.send(JSON.stringify({ t: 'buy', id: 'face_mustache' }));
  const rate = await waitFor(() => a.msgs.slice(before).find((m) => m.t === 'buyres' && m.reason === 'rate_limited'));
  check('rapid buys: buyres rate_limited', !!rate && buyResMessage(rate) === 'One moment...');

  a.ws.send(JSON.stringify({ t: 'cos', cos: { v: 1, hat: 'hat_cork_crown', face: null, fur: 'fur_moonk_gray', hand: null } }));
  const rej = await waitFor(() => a.msgs.find((m) => m.t === 'cosrej'));
  check('equip unowned: cosrej not_owned', rej?.reason === 'not_owned' && rej.slot === 'hat' && rej.id === 'hat_cork_crown');
  const reverted = revertSlot({ v: 1, hat: 'hat_cork_crown', fur: 'fur_moonk_gray' }, rej.slot);
  check('client reverts the rejected slot', reverted.hat == null && reverted.fur === 'fur_moonk_gray');

  a.ws.send(JSON.stringify({ t: 'cos', cos: { v: 1, hat: 'hat_antenna', fur: 'fur_moonk_gray' } }));
  const rejLock = await waitFor(() => a.msgs.find((m) => m.t === 'cosrej' && m.id === 'hat_antenna'));
  check('equip locked: cosrej locked', rejLock?.reason === 'locked' && cosRejMessage(rejLock) === 'Locked');

  a.ws.send(JSON.stringify({ t: '__grant_unlock', id: 'hub_visits_5', items: ['hat_antenna'], reason: 'hub_visits_5' }));
  const unl = await waitFor(() => a.msgs.find((m) => m.t === 'unlock' && m.items?.includes('hat_antenna')));
  const invUnl = await waitFor(() => [...a.msgs].reverse().find((m) => m.t === 'inv' && m.owned?.includes('hat_antenna')));
  check('unlock then inv', unlockMessage(unl, (id) => names[id]) === 'Unlocked: Space Antenna' && invUnl.owned.includes('hat_antenna') && invUnl.unlocks.includes('hat_antenna'));

  a.ws.close();
} finally {
  await new Promise((r) => wss.close(r));
}

const failed = results.filter((x) => !x).length;
console.log(failed ? `FAILED  ${failed}/${results.length}` : `ALL PASSED  (${results.length})`);
process.exitCode = failed ? 1 : 0;
