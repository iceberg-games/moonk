// Hour-4 close-ups and lineups. usage: node scripts/polish/h4-shots.mjs <prefix>
import { chromium } from 'playwright';
const pre = process.argv[2] || 'before-h4';
const out = '/workspace/vrtag/screenshots/overnight';
const E = (o) => encodeURIComponent(JSON.stringify({ v: 1, hat: null, face: null, fur: 'fur_moonk_gray', hand: null, ...o }));
const close = (o) => ({ kind: 'one', eq: [o], cam: '&cy=1.75&cz=2.1&ty=1.55&ry=0.5', w: 700, h: 700 });
const line = (list, cz) => ({ kind: 'line', eq: list, cam: `&gap=0.85&cy=1.8&cz=${cz}&ty=1.5&ry=0.35`, w: 1800, h: 520 });
const sets = {
  bucket: close({ hat: 'hat_bucket' }),
  cork: close({ hat: 'hat_cork_crown' }),
  antenna: close({ hat: 'hat_antenna' }),
  party: close({ hat: 'hat_party_cone' }),
  beanie: close({ hat: 'hat_moon_beanie' }),
  propeller: close({ hat: 'hat_propeller' }),
  'banana-cap': close({ hat: 'hat_banana_cap' }),
  monocle: close({ face: 'face_monocle' }),
  bandit: close({ face: 'face_bandit' }),
  mustache: close({ face: 'face_mustache' }),
  'star-shades': close({ face: 'face_star_shades' }),
  'banana-cuffs': close({ hand: 'hand_banana_cuffs' }),
  'star-knuckles': close({ hand: 'hand_star_knuckles' }),
  'leaf-gauntlets': close({ hand: 'hand_leaf_gauntlets' }),
  'moon-bracers': close({ hand: 'hand_moon_bracers' }),
  boxing: close({ hand: 'hand_boxing' }),
  hats: line([{ hat: 'hat_banana_cap' }, { hat: 'hat_moon_beanie' }, { hat: 'hat_propeller' }, { hat: 'hat_party_cone' }, { hat: 'hat_bucket' }, { hat: 'hat_cork_crown' }, { hat: 'hat_leaf_halo' }, { hat: 'hat_antenna' }], 5.0),
  faces: line([{ face: 'face_mustache' }, { face: 'face_bandit' }, { face: 'face_star_shades' }, { face: 'face_monocle' }, { face: 'face_snorkel' }, { face: 'face_hud_visor' }], 4.0),
  hands: line([{ hand: 'hand_banana_cuffs' }, { hand: 'hand_boxing' }, { hand: 'hand_moon_bracers' }, { hand: 'hand_star_knuckles' }, { hand: 'hand_leaf_gauntlets' }, { hand: 'hand_glow_bands' }], 4.0),
  furs: line([
    { fur: 'fur_moonk_gray' }, { fur: 'fur_moonk_brown' }, { fur: 'fur_banana' }, { fur: 'fur_midnight' },
    { fur: 'fur_lunar_white' }, { fur: 'fur_sunset_stripe' }, { fur: 'fur_nebula' }, { fur: 'fur_aurora' },
  ], 5.0),
};
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--ignore-certificate-errors'] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true });
for (const [name, s] of Object.entries(sets)) {
  const looks = s.eq.map(() => 'monkey:1:0').join(',');
  const eq = s.eq.map((o, i) => `&equip${i}=${E(o)}`).join('');
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(name, e.message));
  await p.goto(`https://localhost:5190/monsters.html?looks=${looks}${eq}&w=${s.w}&h=${s.h}${s.cam}&t=${Date.now()}`);
  await p.waitForFunction('window.__done', null, { timeout: 30000 }); await p.waitForTimeout(200);
  await p.locator('canvas').screenshot({ path: `${out}/${pre}-${name}.png` });
  console.log('wrote', `${pre}-${name}.png`);
  await p.close();
}
await b.close();
