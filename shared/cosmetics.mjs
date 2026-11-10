// Cosmetic loadout validation for the server. The catalog itself (meshes, names, prices in free Moons) lives in the MOONK Cosmetics kit
// (src/kit/cosmetics/catalog.js); shared/cosmetic-ids.json is its id list. No real money anywhere.
import { readFileSync } from 'node:fs';
const ids = JSON.parse(readFileSync(new URL('./cosmetic-ids.json', import.meta.url), 'utf8')).items;
export const KNOWN = new Map(ids.map((i) => [i.id, i.slot]));
export const DEFAULT_EQUIP = { hat: null, face: null, fur: 'fur_moonk_gray', hand: null };
export function sanitizeEquip(e) {
  const o = { ...DEFAULT_EQUIP };
  if (e && typeof e === 'object') for (const s of ['hat', 'face', 'fur', 'hand']) if (typeof e[s] === 'string' && KNOWN.get(e[s]) === s) o[s] = e[s];
  return o;
}
