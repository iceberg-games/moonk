// Sync the MOONK Cosmetics kit into this repo (Vite/the client can not import outside the repo root, so we keep copies).
//   cosmetics.json  -> shared/cosmetics.json   (single source of cosmetic ids; append-only; loaded by shared/cosmetics.mjs)
//   kit files       -> src/kit/                (shopStand, loadout, geom, cosmetics/*). src/kit/monkey.js is NOT synced: vrtag's copy has extra head/arms fields the avatar needs.
// Usage: npm run sync:cosmetics   (override the source with MOONK_COSMETICS_DIR)
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
const SRC = process.env.MOONK_COSMETICS_DIR || '/workspace/moonk-cosmetics', ROOT = new URL('..', import.meta.url).pathname;
if (!existsSync(join(SRC, 'cosmetics.json'))) { console.error('kit not found at ' + SRC); process.exit(1); }
const files = [['cosmetics.json', 'shared/cosmetics.json'], ...['shopStand.js', 'loadout.js', 'geom.js'].map((f) => ['src/' + f, 'src/kit/' + f]), ...['catalog', 'faces', 'furs', 'hands', 'hats'].map((f) => [`src/cosmetics/${f}.js`, `src/kit/cosmetics/${f}.js`])];
mkdirSync(join(ROOT, 'src/kit/cosmetics'), { recursive: true });
for (const [a, b] of files) { copyFileSync(join(SRC, a), join(ROOT, b)); console.log('synced', b); }
