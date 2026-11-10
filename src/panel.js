import * as THREE from 'three';
// A world-space UI panel drawn on a canvas. Touch it with a controller hand (no pointer needed).
export class Panel {
  constructor(pxW, pxH, w, h) {
    this.pxW = pxW; this.pxH = pxH; this.w = w; this.h = h; this.c = document.createElement('canvas'); this.c.width = pxW; this.c.height = pxH; this.g = this.c.getContext('2d');
    this.tex = new THREE.CanvasTexture(this.c); this.tex.colorSpace = THREE.SRGBColorSpace; this.buttons = []; this.meshes = [];
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, side: THREE.DoubleSide }); this.geo = new THREE.PlaneGeometry(w, h);
  }
  mesh() { const m = new THREE.Mesh(this.geo, this.mat); this.meshes.push(m); return m; }
  refresh() { this.tex.needsUpdate = true; }
  btn(id, x, y, w, h) { this.buttons.push({ id, x, y, w, h }); }
  /** world-space point -> button id (or null). Hand must be within ~12 cm of the panel plane. */
  hit(p, reach = 0.12) {
    const v = new THREE.Vector3();
    for (const m of this.meshes) {
      v.copy(p); m.worldToLocal(v); if (Math.abs(v.z) > reach) continue;
      const px = (v.x / this.w + 0.5) * this.pxW, py = (0.5 - v.y / this.h) * this.pxH;
      for (const b of this.buttons) if (px >= b.x && px <= b.x + b.w && py >= b.y && py <= b.y + b.h) return b.id;
    }
    return null;
  }
}
export function roundRect(g, x, y, w, h, r, fill, stroke) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.strokeStyle = stroke; g.lineWidth = 4; g.stroke(); }
}
export function textSprite(text, color = '#fff', size = 64, w = 512, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.font = `bold ${size}px sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineWidth = 8; g.strokeStyle = 'rgba(0,0,0,.7)'; g.strokeText(text, w / 2, h / 2); g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return { tex: t, canvas: c, ctx: g };
}
