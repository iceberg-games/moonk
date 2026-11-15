// Load the MOONK Cosmetics launch kit at process start. Ids are not copied by hand.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import { catalogFromJson } from '../shared/cosmetics.js';

const here = dirname(fileURLToPath(import.meta.url));

export const DEFAULT_CATALOG_PATHS = [
  process.env.MOONK_COSMETICS_PATH,
  '/workspace/moonk-cosmetics/cosmetics.json',
  resolve(here, '../../../moonk-cosmetics/cosmetics.json'),
].filter(Boolean);

export function loadCosmeticsCatalog(path) {
  const tried = [];
  const candidates = path ? [path, ...DEFAULT_CATALOG_PATHS] : DEFAULT_CATALOG_PATHS;
  const unique = [...new Set(candidates)];
  for (const p of unique) {
    tried.push(p);
    try {
      if (!existsSync(p)) continue;
      const json = JSON.parse(readFileSync(p, 'utf8'));
      const catalog = catalogFromJson(json, p);
      if (catalog.size < 1) throw new Error('kit has no items');
      return catalog;
    } catch (err) {
      if (err && /invalid MOONK cosmetics kit/.test(err.message)) throw err;
    }
  }
  throw new Error(`MOONK cosmetics kit not found. Set MOONK_COSMETICS_PATH. Tried: ${tried.join(', ')}`);
}
