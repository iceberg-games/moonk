// Browser-safe loadout defaults (the server validates against shared/cosmetic-ids.json).
export const DEFAULT_EQUIP = { hat: null, face: null, fur: 'fur_moonk_gray', hand: null };
export function sanitizeEquip(e) { const o = { ...DEFAULT_EQUIP }; if (e && typeof e === 'object') for (const s of ['hat', 'face', 'fur', 'hand']) if (typeof e[s] === 'string' && e[s].length < 40) o[s] = e[s]; return o; }
