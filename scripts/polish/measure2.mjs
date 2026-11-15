import { chromium } from 'playwright';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-certificate-errors'] });
const p = await (await b.newContext({ ignoreHTTPSErrors: true })).newPage();
await p.goto('https://localhost:5190/monsters.html?looks=monkey:1:0&equip0=' + encodeURIComponent(JSON.stringify({v:1,hat:'hat_bucket',fur:'fur_moonk_gray'})) + '&t=' + Date.now());
await p.waitForFunction('window.__done');
const r = await p.evaluate(() => {
  const root = document.querySelector('canvas').__three || null;
  // walk the live scene from the only canvas's renderer is hard; query the avatar in the module scope? not exported.
  // Find hat_bucket in the page's scene via three objects on canvas? monsterview doesn't expose scene.
  return 'need expose';
});
// Re-run measure inside a page that imports and poses like Avatar
await p.goto('https://localhost:5190/?dev=1&place=hub&t=' + Date.now(), { waitUntil: 'networkidle', timeout: 60000 });
await p.waitForFunction('window.__tt');
const info = await p.evaluate(async () => {
  const { createMonkey } = await import('/src/kit/monkey.js');
  const { applyLoadout } = await import('/src/kit/loadout.js');
  const THREE = await import('/node_modules/three/build/three.module.js').catch(() => import('three'));
  const V = THREE.Vector3;
  const ids = ['hat_bucket','hat_banana_cap','hat_moon_beanie','hat_propeller','hat_party_cone','hat_cork_crown','hat_leaf_halo','hat_antenna'];
  const out = {};
  for (const id of ids) {
    const m = createMonkey();
    applyLoadout(m, { v: 1, hat: id, fur: 'fur_moonk_gray' });
    m.root.updateMatrixWorld(true);
    const ht = m.attach.head_top.getWorldPosition(new V());
    const hat = m.attach.head_top.getObjectByName(id) || m.root.getObjectByName(id);
    const box = new THREE.Box3();
    if (hat) box.setFromObject(hat);
    // skull top
    let skull = -Infinity;
    m.head.traverse((o) => { if (!o.isMesh) return; const pos = o.geometry.attributes.position; const v = new V(); for (let i = 0; i < pos.count; i++) { v.fromBufferAttribute(pos, i).applyMatrix4(o.matrixWorld); if (Math.hypot(v.x - ht.x, v.z - ht.z) < 0.08) skull = Math.max(skull, v.y); } });
    out[id] = { skull, ht: ht.y, hatMin: hat ? box.min.y : null, hatMax: hat ? box.max.y : null, gap: hat ? +(box.min.y - skull).toFixed(4) : null, children: hat ? hat.children.length : 0 };
  }
  return out;
});
console.log(JSON.stringify(info, null, 2));
await b.close();
