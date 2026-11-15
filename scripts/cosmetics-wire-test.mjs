// Wire-level inventory / cosmetics checks against the game server.
// Locked shapes (do not rename or reshape):
//   {t:'join', cos:{v:1,hat,face,fur,hand}}  {t:'cos', cos:{...}}  snap ps[i].c (sanitized loadout)
//   {t:'buy', id}
//   {t:'buyres', id, ok:true} then {t:'inv', moons, owned, unlocks}
//   {t:'buyres', id, ok:false, reason}  reason: unknown | not_for_sale | owned | moons | rate_limited
//   {t:'inv', moons, owned:[ids], unlocks:[ids]}  right after welcome and after every change
//   {t:'cosrej', slot, id, reason}  reason: unknown | not_owned | locked
//   {t:'unlock', id, items:[ids], reason} then inv
// No client cosmetics files are edited here.
import WebSocket from 'ws';
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import * as inventory from '../server/inventory.mjs';

const PORT = Number(process.env.MOONK_TEST_PORT) || 8852;
const INV = '/tmp/moonk-cos-inv.json';
const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Phoenix' });
const starters = ['hat_banana_cap', 'fur_moonk_gray'];
// Pre-seed: 4 prior hub days (plus today's visit on join = 5) and 24 catches / 2 life tags for unlock tests.
writeFileSync(INV, JSON.stringify({
  wallets: {
    'did:d-visits': { moons: 100, owned: starters, unlocks: [], catches: 0, lifeTags: 0, nightWins: 0, visits: ['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'] },
    'did:d-tags': { moons: 100, owned: starters, unlocks: [], catches: 24, lifeTags: 2, nightWins: 0, visits: [] },
  },
}, null, 1));

const srv = spawn('node', ['server/server.mjs'], {
  env: { ...process.env, PORT: String(PORT), TT_FAST: '1', MOONK_NIGHT: '1', MOONK_BAN_FILE: '/tmp/moonk-cos-bans.json', MOONK_ACCOUNTS_FILE: '/tmp/moonk-cos-accounts.json', MOONK_INV_FILE: INV },
  stdio: 'inherit',
});
await new Promise((r) => setTimeout(r, 700));

const results = [];
const check = (n, ok, d = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}${ok ? '' : '  ' + String(d).slice(0, 400)}`); };

const atPhx = (isoHour) => new Date(`2026-11-10T${isoHour}:00-07:00`);
check('7 PM America/Phoenix is a night hour', inventory.isNightLobby('forest', { now: atPhx('19:00'), force: '' }));
check('5:59 AM America/Phoenix is still night', inventory.isNightLobby('forest', { now: atPhx('05:59'), force: '' }));
check('6 AM America/Phoenix is not night hours', !inventory.isNightLobby('forest', { now: atPhx('06:00'), force: '' }));
check('1 PM America/Phoenix is not night hours', !inventory.isNightLobby('forest', { now: atPhx('13:00'), force: '' }));
check('lighthouse is a night lobby even at 1 PM (documented night map)', inventory.isNightLobby('lighthouse', { now: atPhx('13:00'), force: '' }));
check('MAPS[id].night is honored when passed in', inventory.isNightLobby('forest', { now: atPhx('13:00'), mapNight: true, force: '' }));
check('MOONK_NIGHT=1 forces night on a day-time forest room', inventory.isNightLobby('forest', { now: atPhx('13:00'), force: '1' }));
check('MOONK_NIGHT=0 forces day even on lighthouse', !inventory.isNightLobby('lighthouse', { now: atPhx('02:00'), force: '0' }));


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
  while (Date.now() - t0 < ms) { const v = fn(); if (v) return v; await new Promise((r) => setTimeout(r, 20)); }
  return fn();
};
const pose = { t: 'pose', h: [0, 1.6, 0], q: [0, 0, 0, 1], l: [-0.3, 1, 0], r: [0.3, 1, 0] };
const after = (msgs, pred, start = 0) => msgs.slice(start).find(pred);

try {
  // ---- join welcome + inv (starters, 100 Moons) ----
  const a = await connect();
  const starterCos = { v: 1, hat: 'hat_banana_cap', face: null, fur: 'fur_moonk_gray', hand: null };
  a.ws.send(JSON.stringify({ t: 'join', name: 'CosA', did: 'd-cosa', cos: starterCos, mode: 'normal' }));
  const welcome = await waitFor(() => a.msgs.find((m) => m.t === 'welcome'));
  check('join accepts {v:1, hat, face, fur, hand}', !!welcome, JSON.stringify(welcome));
  const inv0 = await waitFor(() => after(a.msgs, (m) => m.t === 'inv', a.msgs.indexOf(welcome)));
  const wi = welcome && a.msgs.indexOf(welcome), ii = inv0 && a.msgs.indexOf(inv0);
  check('inv is sent right after the join welcome', !!inv0 && ii === wi + 1, JSON.stringify(a.msgs.slice(0, 6)));
  check(
    'inv has moons, owned starter ids, and empty unlocks',
    inv0 && inv0.moons === 100 && Array.isArray(inv0.owned) && inv0.owned.includes('hat_banana_cap') && inv0.owned.includes('fur_moonk_gray') && Array.isArray(inv0.unlocks) && inv0.unlocks.length === 0 && !('badge' in inv0),
    JSON.stringify(inv0),
  );
  a.ws.send(JSON.stringify(pose));
  const snapA = await waitFor(() => {
    const s = [...a.msgs].reverse().find((m) => m.t === 'snap' && m.ps?.some((p) => p.id === welcome.id));
    return s && s.ps.find((p) => p.id === welcome.id);
  });
  check(
    'snap ps[i].c keeps the sanitized starter loadout shape',
    snapA?.c && snapA.c.v === 1 && snapA.c.hat === 'hat_banana_cap' && snapA.c.fur === 'fur_moonk_gray' && snapA.c.face == null && snapA.c.hand == null && !('badge' in snapA.c) && !('color' in snapA.c),
    JSON.stringify(snapA?.c),
  );
  check('no cosrej for a valid starter loadout', !a.msgs.some((m) => m.t === 'cosrej'));

  // ---- join rejects: unknown / not_owned / locked + snap sanitized ----
  const b = await connect();
  const bad = { v: 1, hat: 'hat_not_a_real_item', face: 'face_star_shades', fur: 'fur_nebula', hand: 'hand_boxing' };
  b.ws.send(JSON.stringify({ t: 'join', name: 'CosB', did: 'd-cosb', cos: bad, room: welcome.room.code }));
  const wb = await waitFor(() => b.msgs.find((m) => m.t === 'welcome'));
  const invB = await waitFor(() => after(b.msgs, (m) => m.t === 'inv', b.msgs.indexOf(wb)));
  check('second player also receives inv after welcome', !!invB && invB.moons === 100);
  const rejs = await waitFor(() => {
    const list = b.msgs.filter((m) => m.t === 'cosrej');
    return list.length >= 4 ? list : null;
  });
  const bySlot = Object.fromEntries((rejs || b.msgs.filter((m) => m.t === 'cosrej')).map((m) => [m.slot, m]));
  check('cosrej unknown for a fake hat id', bySlot.hat && bySlot.hat.id === 'hat_not_a_real_item' && bySlot.hat.reason === 'unknown', JSON.stringify(bySlot.hat));
  check('cosrej not_owned for an unbought paid face', bySlot.face && bySlot.face.id === 'face_star_shades' && bySlot.face.reason === 'not_owned', JSON.stringify(bySlot.face));
  check('cosrej locked for unlock-only fur_nebula', bySlot.fur && bySlot.fur.id === 'fur_nebula' && bySlot.fur.reason === 'locked', JSON.stringify(bySlot.fur));
  check('cosrej not_owned for unbought hand_boxing', bySlot.hand && bySlot.hand.id === 'hand_boxing' && bySlot.hand.reason === 'not_owned', JSON.stringify(bySlot.hand));
  b.ws.send(JSON.stringify(pose));
  const snapB = await waitFor(() => {
    const s = [...a.msgs].reverse().find((m) => m.t === 'snap' && m.ps?.some((p) => p.id === wb?.id));
    return s && s.ps.find((p) => p.id === wb.id);
  });
  check(
    'snap ps[i].c shows the sanitized defaults after rejected join slots',
    snapB?.c && snapB.c.v === 1 && snapB.c.hat == null && snapB.c.face == null && snapB.c.fur === 'fur_moonk_gray' && snapB.c.hand == null,
    JSON.stringify(snapB?.c),
  );

  // ---- buy failures use buyres reasons, not a generic notice ----
  // Space every non-rate-limit buy by more than the 2 s burst window so reason checks
  // cannot trip rate_limited (the explicit flood test below is the only back-to-back case).
  const pauseBuy = () => new Promise((r) => setTimeout(r, 2200));
  const buyFail = async (id) => {
    await pauseBuy();
    const n = a.msgs.length;
    a.ws.send(JSON.stringify({ t: 'buy', id }));
    return waitFor(() => after(a.msgs, (m) => m.t === 'buyres' && m.id === id, n));
  };
  const rUnknown = await buyFail('hat_not_a_real_item');
  check('buy unknown id -> buyres ok:false reason unknown', rUnknown && rUnknown.ok === false && rUnknown.reason === 'unknown' && rUnknown.id === 'hat_not_a_real_item', JSON.stringify(rUnknown));
  const rNfs = await buyFail('hat_antenna');
  check('buy unlock-only -> buyres ok:false reason not_for_sale', rNfs && rNfs.ok === false && rNfs.reason === 'not_for_sale', JSON.stringify(rNfs));
  const rOwned = await buyFail('hat_banana_cap');
  check('buy a starter already owned -> buyres ok:false reason owned', rOwned && rOwned.ok === false && rOwned.reason === 'owned', JSON.stringify(rOwned));
  const rMoons = await buyFail('face_hud_visor'); // 850 Moons
  check('buy too expensive -> buyres ok:false reason moons', rMoons && rMoons.ok === false && rMoons.reason === 'moons', JSON.stringify(rMoons));
  check('failed buys do not send a trailing inv', !a.msgs.slice(a.msgs.findIndex((m) => m === rUnknown)).some((m) => m.t === 'inv' && a.msgs.indexOf(m) > a.msgs.indexOf(rUnknown) && a.msgs.indexOf(m) <= a.msgs.indexOf(rMoons) + 1)
    || !after(a.msgs, (m) => m.t === 'inv', a.msgs.indexOf(rUnknown) + 1) 
    || a.msgs.indexOf(after(a.msgs, (m) => m.t === 'inv', a.msgs.indexOf(rUnknown))) < a.msgs.indexOf(rUnknown),
    'inv after a failed buy');
  // Simpler failed-buy inv check: none of the four failure responses is immediately followed by inv
  const fails = [rUnknown, rNfs, rOwned, rMoons];
  check(
    'buy failures are buyres only (no inv after a failed buyres)',
    fails.every((r) => r && a.msgs[a.msgs.indexOf(r) + 1]?.t !== 'inv'),
    JSON.stringify(fails.map((r) => a.msgs[a.msgs.indexOf(r) + 1])),
  );

  // ---- successful buy: buyres ok true, then inv ----
  await pauseBuy();
  const nBuy = a.msgs.length;
  a.ws.send(JSON.stringify({ t: 'buy', id: 'fur_banana' })); // 80 Moons
  const rOk = await waitFor(() => after(a.msgs, (m) => m.t === 'buyres' && m.id === 'fur_banana', nBuy));
  const invBuy = await waitFor(() => after(a.msgs, (m) => m.t === 'inv', a.msgs.indexOf(rOk)));
  check('buy fur_banana -> buyres ok:true', rOk && rOk.ok === true && rOk.id === 'fur_banana' && rOk.reason === undefined, JSON.stringify(rOk));
  check('successful buyres is followed by inv', invBuy && a.msgs.indexOf(invBuy) === a.msgs.indexOf(rOk) + 1, JSON.stringify(a.msgs.slice(nBuy, nBuy + 4)));
  check('inv after buy deducts 80 Moons and lists fur_banana as owned', invBuy && invBuy.moons === 20 && invBuy.owned.includes('fur_banana'), JSON.stringify(invBuy));
  const rOwned2 = await buyFail('fur_banana');
  check('buying an already-owned paid item -> owned', rOwned2 && rOwned2.ok === false && rOwned2.reason === 'owned', JSON.stringify(rOwned2));

  // ---- equip the purchased fur; mid-session cosrej for locked/unowned ----
  const nCos = a.msgs.length;
  a.ws.send(JSON.stringify({ t: 'cos', cos: { v: 1, hat: 'hat_banana_cap', face: null, fur: 'fur_banana', hand: null } }));
  const snapGood = await waitFor(() => {
    const s = [...a.msgs].reverse().find((m) => m.t === 'snap' && m.ps?.some((p) => p.id === welcome.id && p.c?.fur === 'fur_banana'));
    return s && s.ps.find((p) => p.id === welcome.id);
  });
  check('snap ps[i].c shows the purchased fur after a valid cos', snapGood?.c?.fur === 'fur_banana' && snapGood.c.v === 1 && snapGood.c.hat === 'hat_banana_cap', JSON.stringify(snapGood?.c));
  check('valid cos does not emit cosrej', !after(a.msgs, (m) => m.t === 'cosrej', nCos));

  const nBadCos = a.msgs.length;
  a.ws.send(JSON.stringify({ t: 'cos', cos: { v: 1, hat: 'hat_antenna', face: 'face_star_shades', fur: 'fur_aurora', hand: 'hand_glow_bands' } }));
  const midRej = await waitFor(() => after(a.msgs, (m) => m.t === 'cosrej', nBadCos) && a.msgs.filter((m, i) => i >= nBadCos && m.t === 'cosrej').length >= 4
    ? a.msgs.filter((m, i) => i >= nBadCos && m.t === 'cosrej') : null);
  const midBy = Object.fromEntries((midRej || []).map((m) => [m.slot, m]));
  check('cosrej locked for hat_antenna on a mid-session cos', midBy.hat?.reason === 'locked' && midBy.hat.id === 'hat_antenna', JSON.stringify(midBy.hat));
  check('cosrej not_owned for unbought face_star_shades on cos', midBy.face?.reason === 'not_owned', JSON.stringify(midBy.face));
  check('cosrej locked for fur_aurora on cos', midBy.fur?.reason === 'locked' && midBy.fur.id === 'fur_aurora', JSON.stringify(midBy.fur));
  check('cosrej locked for hand_glow_bands on cos', midBy.hand?.reason === 'locked', JSON.stringify(midBy.hand));
  const midSnap = await waitFor(() => {
    const s = [...a.msgs].reverse().find((m) => m.t === 'snap' && m.ps?.some((p) => p.id === welcome.id && p.c?.hat !== 'hat_banana_cap'));
    return s && s.ps.find((p) => p.id === welcome.id && p.c?.hat !== 'hat_antenna' && p.c?.fur !== 'fur_aurora');
  });
  check(
    'snap ps[i].c stays on the sanitized loadout after rejected cos (defaults, not the rejected ids)',
    midSnap?.c && midSnap.c.v === 1 && midSnap.c.hat == null && midSnap.c.fur === 'fur_moonk_gray' && midSnap.c.hand == null && midSnap.c.face == null,
    JSON.stringify(midSnap?.c),
  );

  // ---- rate_limited: 4th buy within 2s (burst 3) ----
  const cRate = await connect();
  cRate.ws.send(JSON.stringify({ t: 'join', name: 'CosRate', did: 'd-rate', cos: starterCos, mode: 'normal' }));
  await waitFor(() => cRate.msgs.find((m) => m.t === 'welcome'));
  for (const id of ['hat_leaf_halo', 'face_hud_visor', 'hand_star_knuckles', 'fur_sunset_stripe']) {
    cRate.ws.send(JSON.stringify({ t: 'buy', id }));
  }
  const rateMsgs = await waitFor(() => {
    const list = cRate.msgs.filter((m) => m.t === 'buyres');
    return list.length >= 4 ? list : null;
  });
  check(
    '4th rapid buy is rate_limited (buyres ok:false reason rate_limited)',
    rateMsgs && rateMsgs[3] && rateMsgs[3].ok === false && rateMsgs[3].reason === 'rate_limited',
    JSON.stringify(rateMsgs),
  );

  // ---- unlock on join: 4 stored hub days + today => hat_antenna, unlock then inv ----
  const v = await connect();
  v.ws.send(JSON.stringify({ t: 'join', name: 'Visits', did: 'd-visits', cos: { v: 1, hat: 'hat_antenna', face: null, fur: 'fur_moonk_gray', hand: null }, mode: 'normal' }));
  const vw = await waitFor(() => v.msgs.find((m) => m.t === 'welcome'));
  const vUnlock = await waitFor(() => after(v.msgs, (m) => m.t === 'unlock', v.msgs.indexOf(vw)));
  const vInv = await waitFor(() => after(v.msgs, (m) => m.t === 'inv', v.msgs.indexOf(vUnlock || vw)));
  check(
    'unlock for hat_antenna after 5 hub visit days: {t:unlock, id, items, reason:hub_visits_5}',
    vUnlock && vUnlock.id === 'hat_antenna' && Array.isArray(vUnlock.items) && vUnlock.items.includes('hat_antenna') && vUnlock.reason === 'hub_visits_5',
    JSON.stringify(vUnlock),
  );
  check('unlock is followed by inv listing hat_antenna in unlocks', vInv && Array.isArray(vInv.unlocks) && vInv.unlocks.includes('hat_antenna') && a.msgs && v.msgs.indexOf(vInv) === v.msgs.indexOf(vUnlock) + 1, JSON.stringify(vInv));
  const vRej = v.msgs.filter((m) => m.t === 'cosrej');
  check('hat_antenna is allowed on join once unlocked (no locked cosrej for that slot)', !vRej.some((m) => m.slot === 'hat' && m.reason === 'locked'), JSON.stringify(vRej));
  v.ws.send(JSON.stringify(pose));
  const snapV = await waitFor(() => {
    const s = [...v.msgs].reverse().find((m) => m.t === 'snap' && m.ps?.some((p) => p.id === vw?.id));
    return s && s.ps.find((p) => p.id === vw.id);
  });
  check('snap ps[i].c can wear unlocked hat_antenna', snapV?.c?.hat === 'hat_antenna' && snapV.c.v === 1, JSON.stringify(snapV?.c));
  void today;

  // ---- unlock from a catch: pre-seeded 24 catches + 2 life tags, one tag grants nebula + glow bands ----
  // Retry a 2-player private room until the seeded player is IT, standing far away otherwise so they are not tagged first.
  let tagger, victim, tw, gotUnlocks = null;
  for (let attempt = 0; attempt < 6 && !gotUnlocks; attempt++) {
    try { b.ws.close(); } catch { /* */ }
    tagger = await connect();
    victim = await connect();
    tagger.ws.send(JSON.stringify({ t: 'join', name: 'Tagger', did: 'd-tags', cos: starterCos, mode: 'normal' }));
    tw = await waitFor(() => tagger.msgs.find((m) => m.t === 'welcome'));
    victim.ws.send(JSON.stringify({ t: 'join', name: ('Vict' + attempt).slice(0, 14), did: 'd-victim' + attempt, cos: starterCos, room: tw?.room?.code }));
    await waitFor(() => victim.msgs.find((m) => m.t === 'welcome'));
    const phaseOf = () => ([...tagger.msgs].reverse().find((m) => m.room?.phase)?.room?.phase);
    const amIt = () => {
      const s = [...tagger.msgs].reverse().find((m) => m.t === 'snap');
      return !!s?.ps?.find((p) => p.id === tw.id)?.it;
    };
    const poseAt = (c, h, hand) => c.ws.send(JSON.stringify({ t: 'pose', h, q: [0, 0, 0, 1], l: hand, r: [hand[0] + 0.2, hand[1], hand[2]] }));
    const ivFar = setInterval(() => {
      poseAt(tagger, [0, 1.6, 0], [-0.3, 1, 0]);
      poseAt(victim, [20, 1.6, 0], [19.7, 1, 0]);
    }, 50);
    const play = await waitFor(() => phaseOf() === 'play', 10000);
    await new Promise((r) => setTimeout(r, 1600));
    const it = play && amIt();
    clearInterval(ivFar);
    if (!it) { try { tagger.ws.close(); victim.ws.close(); } catch { /* */ } continue; }
    const ivClose = setInterval(() => {
      poseAt(tagger, [0, 1.6, 0], [0.2, 1.6, 0.15]);
      poseAt(victim, [0.25, 1.6, 0.1], [0.5, 1.0, 0]);
    }, 50);
    gotUnlocks = await waitFor(() => {
      const list = tagger.msgs.filter((m) => m.t === 'unlock');
      const ids = list.flatMap((m) => m.items || []);
      return ids.includes('fur_nebula') && ids.includes('hand_glow_bands') ? list : null;
    }, 6000);
    clearInterval(ivClose);
    if (!gotUnlocks) { try { tagger.ws.close(); victim.ws.close(); } catch { /* */ } }
  }

  const neb = (gotUnlocks || (tagger ? tagger.msgs.filter((m) => m.t === 'unlock') : [])).find((m) => (m.items || []).includes('fur_nebula') || m.id === 'fur_nebula');
  const glow = (gotUnlocks || (tagger ? tagger.msgs.filter((m) => m.t === 'unlock') : [])).find((m) => (m.items || []).includes('hand_glow_bands') || m.id === 'hand_glow_bands');
  check(
    'a catch at 25 / streak 3 sends unlock fur_nebula reason tag_catches_25',
    neb && neb.id === 'fur_nebula' && neb.items.includes('fur_nebula') && neb.reason === 'tag_catches_25',
    JSON.stringify(neb),
  );
  check(
    'same catch also sends unlock hand_glow_bands reason tag_streak_3',
    glow && glow.id === 'hand_glow_bands' && glow.items.includes('hand_glow_bands') && glow.reason === 'tag_streak_3',
    JSON.stringify(glow),
  );
  const afterUnlockInv = neb && tagger && after(tagger.msgs, (m) => m.t === 'inv', tagger.msgs.indexOf(neb));
  check(
    'each unlock is followed by inv listing the new ids',
    afterUnlockInv && afterUnlockInv.unlocks.includes('fur_nebula') && afterUnlockInv.unlocks.includes('hand_glow_bands'),
    JSON.stringify(afterUnlockInv),
  );
  if (tagger && tw) {
    tagger.ws.send(JSON.stringify({ t: 'cos', cos: { v: 1, hat: 'hat_banana_cap', face: null, fur: 'fur_nebula', hand: 'hand_glow_bands' } }));
    const snapU = await waitFor(() => {
      const s = [...tagger.msgs].reverse().find((m) => m.t === 'snap' && m.ps?.some((p) => p.id === tw.id && p.c?.fur === 'fur_nebula'));
      return s && s.ps.find((p) => p.id === tw.id);
    }, 3000);
    check('snap ps[i].c can wear fur_nebula and hand_glow_bands after those unlocks', snapU?.c?.fur === 'fur_nebula' && snapU.c.hand === 'hand_glow_bands', JSON.stringify(snapU?.c));
  } else {
    check('snap ps[i].c can wear fur_nebula and hand_glow_bands after those unlocks', false, 'no tagger session');
  }

  // ---- night lobby: winners of a night round get fur_aurora (reason night_lobby_win) then inv ----
  const NightA = await connect(), NightB = await connect();
  const starterCosN = { v: 1, hat: 'hat_banana_cap', face: null, fur: 'fur_moonk_gray', hand: null };
  NightA.ws.send(JSON.stringify({ t: 'join', name: 'NightA', did: 'd-night-a', cos: starterCosN, mode: 'horror', monster: 'locust' }));
  const nw = await waitFor(() => NightA.msgs.find((m) => m.t === 'welcome'));
  NightB.ws.send(JSON.stringify({ t: 'join', name: 'NightB', did: 'd-night-b', cos: starterCosN, room: nw?.room?.code }));
  await waitFor(() => NightB.msgs.find((m) => m.t === 'welcome'));
  const poseAtN = (c, h) => c.ws.send(JSON.stringify({ t: 'pose', h, q: [0, 0, 0, 1], l: [h[0] - 0.3, 1, 0], r: [h[0] + 0.3, 1, 0] }));
  const ivN = setInterval(() => { poseAtN(NightA, [0, 1.6, 0]); poseAtN(NightB, [20, 1.6, 0]); }, 50);
  const nightFlag = await waitFor(() => {
    const rm = [...NightA.msgs].reverse().find((m) => m.room && m.room.phase === 'play');
    const sn = [...NightA.msgs].reverse().find((m) => m.t === 'snap' && m.night === true);
    return (rm && rm.room.night === true && sn) ? { room: rm.room, snap: true } : null;
  }, 20000);
  check('roomInfo and snap carry night:true when the night-lobby round starts', !!nightFlag, JSON.stringify(nightFlag && nightFlag.room));
  // Stay far apart so the locust cannot catch; FAST horror round ends on the timer with the monkeys winning.
  const aurora = await waitFor(() => NightA.msgs.find((m) => m.t === 'unlock' && (m.id === 'fur_aurora' || (m.items || []).includes('fur_aurora'))), 20000);
  const auroraInv = aurora && after(NightA.msgs, (m) => m.t === 'inv', NightA.msgs.indexOf(aurora));
  clearInterval(ivN);
  check(
    'winning a night lobby sends unlock fur_aurora reason night_lobby_win',
    aurora && aurora.id === 'fur_aurora' && aurora.items.includes('fur_aurora') && aurora.reason === 'night_lobby_win',
    JSON.stringify(aurora),
  );
  check('night unlock is followed by inv listing fur_aurora in unlocks', auroraInv && auroraInv.unlocks.includes('fur_aurora') && NightA.msgs.indexOf(auroraInv) === NightA.msgs.indexOf(aurora) + 1, JSON.stringify(auroraInv));
  NightA.ws.send(JSON.stringify({ t: 'cos', cos: { v: 1, hat: 'hat_banana_cap', face: null, fur: 'fur_aurora', hand: null } }));
  const snapAur = await waitFor(() => {
    const s = [...NightA.msgs].reverse().find((m) => m.t === 'snap' && m.ps?.some((p) => p.id === nw.id && p.c?.fur === 'fur_aurora'));
    return s && s.ps.find((p) => p.id === nw.id);
  }, 3000);
  check('snap ps[i].c can wear fur_aurora after a night-lobby win', snapAur?.c?.fur === 'fur_aurora', JSON.stringify(snapAur?.c));

  // Day-forced control: a second server with MOONK_NIGHT=0 must not grant aurora on the same win path.
  const DAYPORT = PORT + 1;
  const daySrv = spawn('node', ['server/server.mjs'], {
    env: { ...process.env, PORT: String(DAYPORT), TT_FAST: '1', MOONK_NIGHT: '0', MOONK_BAN_FILE: '/tmp/moonk-cos-day-bans.json', MOONK_ACCOUNTS_FILE: '/tmp/moonk-cos-day-accounts.json', MOONK_INV_FILE: '/tmp/moonk-cos-day-inv.json' },
    stdio: 'inherit',
  });
  await new Promise((r) => setTimeout(r, 700));
  const dconnect = () => new Promise((ok, bad) => {
    const ws = new WebSocket(`ws://127.0.0.1:${DAYPORT}`);
    const msgs = [];
    ws.on('open', () => ok({ ws, msgs }));
    ws.on('error', bad);
    ws.on('message', (d) => { try { msgs.push(JSON.parse(d)); } catch { /* */ } });
  });
  try {
    const DayA = await dconnect(), DayB = await dconnect();
    DayA.ws.send(JSON.stringify({ t: 'join', name: 'DayA', did: 'd-day-a', cos: starterCosN, mode: 'horror', monster: 'locust' }));
    const dw = await waitFor(() => DayA.msgs.find((m) => m.t === 'welcome'));
    DayB.ws.send(JSON.stringify({ t: 'join', name: 'DayB', did: 'd-day-b', cos: starterCosN, room: dw?.room?.code }));
    await waitFor(() => DayB.msgs.find((m) => m.t === 'welcome'));
    const ivD = setInterval(() => {
      DayA.ws.send(JSON.stringify({ t: 'pose', h: [0, 1.6, 0], q: [0, 0, 0, 1], l: [-0.3, 1, 0], r: [0.3, 1, 0] }));
      DayB.ws.send(JSON.stringify({ t: 'pose', h: [20, 1.6, 0], q: [0, 0, 0, 1], l: [19.7, 1, 0], r: [20.3, 1, 0] }));
    }, 50);
    const dayOver = await waitFor(() => DayA.msgs.find((m) => m.t === 'ev' && m.k === 'over'), 20000);
    await new Promise((r) => setTimeout(r, 400));
    clearInterval(ivD);
    const dayNight = [...DayA.msgs].reverse().find((m) => m.t === 'snap' || (m.room && m.room.phase === 'play'));
    check('MOONK_NIGHT=0 keeps room/snap night false during the day-forced round', dayNight && ((dayNight.t === 'snap' && dayNight.night === false) || dayNight.room?.night === false || !dayNight.night && !dayNight.room?.night), JSON.stringify(dayNight && (dayNight.room || { t: dayNight.t, night: dayNight.night })));
    check('a win in a day-forced lobby does not grant fur_aurora', !!dayOver && !DayA.msgs.some((m) => m.t === 'unlock' && (m.id === 'fur_aurora' || (m.items || []).includes('fur_aurora'))), JSON.stringify(DayA.msgs.filter((m) => m.t === 'unlock')));
    try { DayA.ws.close(); DayB.ws.close(); } catch { /* */ }
  } finally { daySrv.kill(); }

  for (const c of [a, b, cRate, v, tagger, victim, NightA, NightB]) try { c && c.ws.close(); } catch { /* */ }
} catch (e) {
  check('unexpected error', false, e.stack || e.message);
} finally {
  srv.kill();
}
const failed = results.filter((x) => !x).length;
console.log(failed ? `${failed} FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);
