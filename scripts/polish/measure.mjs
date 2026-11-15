import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-certificate-errors'] });
const p = await (await b.newContext({ ignoreHTTPSErrors: true })).newPage();
p.on('pageerror', (e) => console.log(e.message));
await p.goto('https://localhost:5190/monsters.html?looks=monkey:1:0&t=' + Date.now()); await p.waitForFunction('window.__done');
const r = await p.evaluate(async () => {
  const THREE = await import('/node_modules/.vite/deps/three.js').catch(() => null);
  const { createMonkey } = await import('/src/kit/monkey.js');
  const { applyLoadout } = await import('/src/kit/loadout.js');
  const m = createMonkey(); m.root.updateMatrixWorld(true);
  const ht = m.attach.head_top; const V = ht.position.constructor;
  const top = ht.getWorldPosition(new V());
  // skull max y along vertical through head center: sample head mesh verts near x,z≈0
  let maxY = -1; const head = m.head;
  head.traverse((o) => { if (!o.isMesh) return; const pos = o.geometry.attributes.position; const v = new V(); for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.x - top.x) < 0.06 && Math.abs(v.z - top.z) < 0.06) maxY = Math.max(maxY, v.y); } });
  // skull max radius at y within 0.05 of skull top-0.06
  let rad = 0; head.traverse((o) => { if (!o.isMesh || o.name?.includes('ear')) return; const pos = o.geometry.attributes.position; const v = new V(); for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (Math.abs(v.y - (maxY - 0.06)) < 0.02) rad = Math.max(rad, Math.hypot(v.x - top.x, v.z - top.z)); } });
  return { headTopY: top.y, skullTopY: maxY, gap: top.y - maxY, radiusAt6cm: rad, scale: ht.getWorldScale(new V()).toArray() };
});
console.log(JSON.stringify(r)); await b.close();
