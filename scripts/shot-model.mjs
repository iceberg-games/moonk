import { chromium } from 'playwright';
const url = process.argv[2] || 'http://localhost:5190/model.html';
const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome',  args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const p = await (await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1600, height: 800 } })).newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message)); p.on('console', (m) => m.type() === 'error' && console.log('console', m.text()));
await p.goto(url); await p.waitForFunction('window.__done', null, { timeout: 30000 });
await p.screenshot({ path: process.argv[3] || 'screenshots/monkey-model.png' }); await b.close(); console.log('saved');
