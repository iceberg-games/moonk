import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-certificate-errors'] });
const p = await (await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 900, height: 560 } })).newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message)); p.on('console', (m) => { if (m.type() === 'error') console.log('console', m.text()); });
await p.goto('https://localhost:5190/?dev=1&place=hub&name=Shot'); await p.waitForFunction('window.__tt', null, { timeout: 30000 }); await p.waitForTimeout(1500);
await p.evaluate(() => { const t = window.__tt; t.rig.position.set(0, -0.2, 11); t.dev.head = [0, 1.7, 0]; t.dev.look = [2.5, 1.2, 4.5]; });
await p.waitForTimeout(1500); await p.screenshot({ path: '/tmp/hub-shop.png' });
console.log(await p.evaluate(() => ({ shop: !!window.__tt.shop, cols: window.__tt.S.cols.length })));
await b.close();
