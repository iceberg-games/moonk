// Fixed-camera wardrobe shots. usage: node scripts/polish/shots.mjs <prefix>  (before|after)
import { chromium } from 'playwright';
const pre = process.argv[2] || 'before';
const out = '/workspace/vrtag/screenshots/overnight';
const B = 'https://localhost:5190';
const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--ignore-gpu-blocklist','--ignore-certificate-errors'] });
const ctx = await b.newContext({ ignoreHTTPSErrors: true, viewport: { width: 1280, height: 720 } });
const p = await ctx.newPage();
p.on('pageerror', (e) => console.log('pageerror', e.message));
await p.goto(`${B}/?dev=1&place=hub&name=Shot&t=${Date.now()}`, { waitUntil: 'networkidle' });
await p.waitForFunction('window.__tt && window.__tt.shop', null, { timeout: 30000 });
await p.waitForTimeout(600);
await p.evaluate(() => {
  window.lock = (x, y, z, head, look) => {
    const t = window.__tt;
    t.__shot = { x, y, z, head, look };
    t.rig.position.set(x, y, z);
    t.dev.head = head;
    t.dev.look = look;
    t.loco?.reset?.();
  };
});
const cam = async (name, fn, opts = {}) => {
  await p.evaluate(fn);
  const hold = opts.hold ?? 8;
  if (hold > 0) {
    for (let i = 0; i < hold; i++) {
      await p.evaluate(() => {
        const t = window.__tt;
        if (!t || !t.__shot) return;
        const s = t.__shot;
        t.rig.position.set(s.x, s.y, s.z);
        t.dev.head = s.head;
        t.dev.look = s.look;
        t.loco?.reset?.();
      });
      await p.waitForTimeout(50);
    }
  } else {
    await p.waitForTimeout(400);
  }
  const pose = await p.evaluate(() => {
    const t = window.__tt;
    const c = t.camera; c.updateMatrixWorld(true);
    const v = c.position.clone(); if (v.applyMatrix4) c.getWorldPosition(v);
    return { cam: v.toArray ? v.toArray().map(n => +n.toFixed(3)) : null, rig: t.rig.position.toArray().map(n => +n.toFixed(3)), head: t.dev.head, look: t.dev.look };
  });
  console.log('POSE', name, JSON.stringify(pose));
  await p.screenshot({ path: `${out}/${pre}-${name}.png` });
};
const lock = (x, y, z, head, look) => { window.__tt.__shot = { x, y, z, head, look }; window.__tt.rig.position.set(x, y, z); window.__tt.dev.head = head; window.__tt.dev.look = look; window.__tt.loco?.reset?.(); };

// stats: stand draw calls / tris (render only the stand group)
const stats = await p.evaluate(() => {
  const t = window.__tt; const g = t.shop.group; let meshes = 0, tris = 0, mats = new Set();
  g.traverse((o) => { if (o.isMesh && o.visible && o.material?.visible !== false) { meshes++; mats.add(o.material.uuid); const gg = o.geometry; tris += (gg.index ? gg.index.count : gg.attributes.position.count) / 3; } });
  let tex = []; g.traverse((o) => { const m = o.material; if (m?.map?.image?.width) tex.push(m.map.image.width + 'x' + m.map.image.height); });
  return { meshes, tris: Math.round(tris), materials: mats.size, textures: [...new Set(tex)] };
});
console.log('STATS', JSON.stringify(stats));
const yaw = () => { const g = window.__tt.shop.group; return [g.position, g.rotation.y]; };
await cam('spawn', () => lock(0, 0, 10, [0, 1.6, 0], [0, 1.5, 5.2]));
await cam('stand', () => {
  const t = window.__tt; const g = t.shop.group, y = g.rotation.y;
  const x = g.position.x + Math.sin(y) * 3.05, z = g.position.z + Math.cos(y) * 3.05;
  lock(x, 0, z, [0, 1.32, 0], [g.position.x, 1.05, g.position.z]);
});
await cam('buttons', () => {
  const t = window.__tt; const g = t.shop.group; g.updateMatrixWorld(true);
  const V = t.camera.position.constructor;
  const e = g.localToWorld(new V(0.85, 1.05, 2.05));
  const l = g.localToWorld(new V(0.8, 0.62, 1.08));
  lock(e.x, 0, e.z, [0, e.y, 0], [l.x, l.y, l.z]);
});
await cam('mirror', async () => {
  const t = window.__tt; const g = t.shop.group; g.updateMatrixWorld(true);
  const V = t.camera.position.constructor;
  const Q = t.camera.quaternion.constructor;
  const mir = g.getObjectByName('shop_mirror');
  const unit = g.getObjectByName('shop_mirror_unit');
  const pos = mir.getWorldPosition(new V());
  const n = new V(0, 0, 1).applyQuaternion(unit.getWorldQuaternion(new Q()));
  const eye = pos.clone().addScaledVector(n, 1.85); eye.x += 0.2; eye.y += 0.05;
  if (mir) mir.visible = true;
  const { applyLoadout } = await import('/src/kit/loadout.js');
  const player = t.shop._state?.player;
  if (player) applyLoadout(player, { v: 1, hat: 'hat_banana_cap', face: 'face_star_shades', fur: 'fur_moonk_gray', hand: 'hand_boxing' });
  lock(eye.x, 0, eye.z, [0, eye.y, 0], [pos.x + eye.x, pos.y, pos.z + eye.z]);
});
await b.close();
