// Monsterview lineups on the vrtag rig. usage: node scripts/polish/rig.mjs <prefix>
import { chromium } from 'playwright';
const pre = process.argv[2] || 'before';
const out = '/workspace/vrtag/screenshots/overnight';
const E = (o) => encodeURIComponent(JSON.stringify({ v: 1, hat: null, face: null, fur: 'fur_moonk_gray', hand: null, ...o }));
const sets = {
  bucket: [{ hat: 'hat_bucket' }],
  'cosmetic-bucket': [{ hat: 'hat_bucket' }],
  'cosmetic-snorkel': [{ face: 'face_snorkel' }],
  'cosmetic-hud-visor': [{ face: 'face_hud_visor' }],
  'cosmetic-glow-bands': [{ hand: 'hand_glow_bands' }],
  'cosmetic-leaf-halo': [{ hat: 'hat_leaf_halo' }],
  hats: [{ hat: 'hat_banana_cap' }, { hat: 'hat_moon_beanie' }, { hat: 'hat_propeller' }, { hat: 'hat_party_cone' }, { hat: 'hat_bucket' }, { hat: 'hat_cork_crown' }, { hat: 'hat_leaf_halo' }, { hat: 'hat_antenna' }],
  faces: [{ face: 'face_mustache' }, { face: 'face_bandit' }, { face: 'face_star_shades' }, { face: 'face_monocle' }, { face: 'face_snorkel' }, { face: 'face_hud_visor' }],
  hands: [{ hand: 'hand_banana_cuffs' }, { hand: 'hand_boxing' }, { hand: 'hand_moon_bracers' }, { hand: 'hand_star_knuckles' }, { hand: 'hand_leaf_gauntlets' }, { hand: 'hand_glow_bands' }],
};
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--ignore-certificate-errors'] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true });
for (const [name, list] of Object.entries(sets)) {
  const one = list.length === 1;
  const looks = list.map(() => 'monkey:1:0').join(',');
  const eq = list.map((o, i) => `&equip${i}=${E(o)}`).join('');
  const W = one ? 700 : 1800, H = one ? 700 : 520;
  const cam = one ? '&cy=1.75&cz=2.1&ty=1.55&ry=0.5' : `&gap=0.85&cy=1.8&cz=${list.length > 6 ? 5.0 : 4.0}&ty=1.5&ry=0.35`;
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(name, e.message));
  await p.goto(`https://localhost:5190/monsters.html?looks=${looks}${eq}&w=${W}&h=${H}${cam}&t=${Date.now()}`);
  await p.waitForFunction('window.__done', null, { timeout: 30000 }); await p.waitForTimeout(200);
  await p.locator('canvas').screenshot({ path: `${out}/${pre}-rig-${name}.png` }); await p.close();
}
await b.close();
