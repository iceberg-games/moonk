import { chromium } from 'playwright';
const B = 'https://localhost:5190';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--ignore-certificate-errors'] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 800, height: 450 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`${B}/?dev=1&place=hub&name=Harness&t=${Date.now()}`, { waitUntil: 'networkidle' });
await p.waitForFunction('window.__tt && window.__tt.shop', null, { timeout: 30000 });
await p.waitForTimeout(400);
const col = await p.evaluate(() => {
  const r = window.__tt.shop.runColliderTest();
  // strip huge arrays for log
  const slim = JSON.parse(JSON.stringify(r, (k,v) => {
    if (k === 'travels' && Array.isArray(v)) return v.slice(0,3).concat(['...']);
    if (Array.isArray(v) && v.length > 20 && typeof v[0] !== 'object') return `[len ${v.length}]`;
    return v;
  }));
  return slim;
});
console.log('COLLIDER', JSON.stringify(col, null, 2));
await b.close();
if (!col.ok) process.exit(1);
console.log('COLLIDER PASS');
