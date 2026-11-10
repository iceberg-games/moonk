// Simple server-side accounts: unique username + password, scrypt-hashed, stored in a JSON file (gitignored).
import { scryptSync, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
export const ACCOUNTS_FILE = process.env.MOONK_ACCOUNTS_FILE || join(dirname(fileURLToPath(import.meta.url)), 'accounts.json');
const NAME_RE = /^[A-Za-z0-9_ -]{3,14}$/;
export const validName = (n) => typeof n === 'string' && NAME_RE.test(n.trim()) && !/^\s|\s$/.test(n);
let db = { users: {} };
export function load() { try { if (existsSync(ACCOUNTS_FILE)) db = { users: {}, ...JSON.parse(readFileSync(ACCOUNTS_FILE, 'utf8')) }; } catch { db = { users: {} }; } return db; }
function persist() { const tmp = ACCOUNTS_FILE + '.tmp'; writeFileSync(tmp, JSON.stringify(db, null, 1), { mode: 0o600 }); renameSync(tmp, ACCOUNTS_FILE); }
const hash = (pw, salt) => scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
export const exists = (name) => !!db.users[String(name).toLowerCase()];
export const hasOwner = () => Object.values(db.users).some((u) => u.owner);
export function create(name, password, { owner = false } = {}) {
  name = String(name).trim();
  if (!validName(name)) return { ok: false, err: 'Username must be 3-14 letters, numbers, space, - or _' };
  if (typeof password !== 'string' || password.length < 6 || password.length > 100) return { ok: false, err: 'Password must be at least 6 characters' };
  if (exists(name)) return { ok: false, err: 'Name taken' };
  const salt = randomBytes(16); db.users[name.toLowerCase()] = { name, salt: salt.toString('hex'), hash: hash(password, salt).toString('hex'), owner: !!owner, created: Date.now() };
  persist(); return { ok: true, name, owner: !!owner };
}
export function check(name, password) {
  const u = db.users[String(name).trim().toLowerCase()]; const salt = Buffer.from(u ? u.salt : '00'.repeat(16), 'hex');
  const h = hash(String(password || ''), salt); if (!u) return null;
  return timingSafeEqual(h, Buffer.from(u.hash, 'hex')) ? { name: u.name, owner: !!u.owner } : null;
}
load();
