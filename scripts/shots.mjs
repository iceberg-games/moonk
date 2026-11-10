// Screenshots of each place via the hidden ?dev=1 hook (software GL in headless Chrome).
import { chromium } from 'playwright';
const base = process.env.BASE || 'https://localhost:5190';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--ignore-certificate-errors'] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
const views = { hub: { head: [0, 1.7, 0], look: [0, 1.6, -6] }, 'hub-portals': { head: [0, 1.7, 0], look: [0, 2.2, 17] }, forest: { head: [0, 1.7, 0], look: [14, 6, -10] }, crypt: { head: [0, 1.7, 0], look: [0, 4, -18] }, marsh: { head: [0, 1.7, 0], look: [-12, 3, -12] } };
for (const [name, v] of Object.entries(views)) {
  const place = name.startsWith('hub') ? 'hub' : name;
  const p = await ctx.newPage(); p.on('pageerror', (e) => console.log(name, 'pageerror', e.message));
  await p.goto(`${base}/?dev=1&place=${place}`); await p.waitForFunction('window.__tt && window.__tt.S.map', null, { timeout: 30000 });
  await p.evaluate((v) => { const t = window.__tt; t.dev.head = v.head; t.dev.look = v.look; t.dev.l = [-0.4, 1.2, -0.4]; t.dev.r = [0.4, 1.2, -0.4]; }, v);
  await p.waitForTimeout(1500); await p.screenshot({ path: `screenshots/${name}.png` }); console.log('shot', name); await p.close();
}
await b.close();
