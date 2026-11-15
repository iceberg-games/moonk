// Screenshots of monster looks via /monsters.html (dev-only page). Usage: node scripts/shot-monsters.mjs <out.png> "<query>"
import { chromium } from 'playwright';
const [out, query] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors'] });
const p = await (await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: Number(new URLSearchParams(query).get('w') || 1600), height: Number(new URLSearchParams(query).get('h') || 700) } })).newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto('https://localhost:5190/monsters.html?' + (query || '')); await p.waitForFunction('window.__done', null, { timeout: 30000 }); await p.screenshot({ path: out });
console.log('wrote', out); await b.close();
