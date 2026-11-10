import { DEFAULT_EQUIP, sanitizeEquip } from '../shared/cosmetics-ids.js';
const KEY = 'moonk.save.v2';
const fresh = () => ({ name: 'Moonk' + Math.floor(100 + Math.random() * 900), did: 'd' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36), moons: 100, owned: [], equip: { ...DEFAULT_EQUIP }, smoothTurn: false });
let data; try { data = { ...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { data = fresh(); }
data.equip = sanitizeEquip(data.equip);
export const save = data;
export const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* */ } };
