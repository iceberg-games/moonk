import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
// Builds a whole map into 1-2 merged meshes (vertex colours, one material) => a handful of draw calls on Quest.
export class MapKit {
  constructor(seed = 1) { this.parts = []; this.glowParts = []; this.cols = []; this.s = seed; }
  _add(geo, color, m, glow = false) {
    const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(m);
    g.deleteAttribute('uv');
    const col = new THREE.Color(color); const n = g.attributes.position.count; const a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const shade = 0.8 + 0.2 * Math.max(0, Math.min(1, (g.attributes.position.getY(i) + 2) / 16)); a[i * 3] = col.r * shade; a[i * 3 + 1] = col.g * shade; a[i * 3 + 2] = col.b * shade; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); (glow ? this.glowParts : this.parts).push(g);
  }
  box(x, y, z, w, h, d, color, col = true) { this._add(new THREE.BoxGeometry(w, h, d), color, new THREE.Matrix4().makeTranslation(x, y + h / 2, z)); if (col) this.cols.push({ k: 'box', min: [x - w / 2, y, z - d / 2], max: [x + w / 2, y + h, z + d / 2] }); }
  cyl(x, y, z, r, h, color, col = true, seg = 10, rTop = r) { this._add(new THREE.CylinderGeometry(rTop, r, h, seg), color, new THREE.Matrix4().makeTranslation(x, y + h / 2, z)); if (col) this.cols.push({ k: 'cyl', x, z, r: Math.max(r, rTop), y0: y, y1: y + h }); }
  ball(x, y, z, r, color, col = true, detail = 1) { this._add(new THREE.IcosahedronGeometry(r, detail), color, new THREE.Matrix4().makeTranslation(x, y, z)); if (col) this.cols.push({ k: 'sph', x, y, z, r }); }
  cone(x, y, z, r, h, color, seg = 7) { this._add(new THREE.ConeGeometry(r, h, seg), color, new THREE.Matrix4().makeTranslation(x, y + h / 2, z)); }
  tilt(geo, color, x, y, z, rx = 0, ry = 0, rz = 0, glow = false) { this._add(geo, color, new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1)), glow); }
  glowBall(x, y, z, r, color) { this._add(new THREE.IcosahedronGeometry(r, 0), color, new THREE.Matrix4().makeTranslation(x, y, z), true); }
  glowBox(x, y, z, w, h, d, color) { this._add(new THREE.BoxGeometry(w, h, d), color, new THREE.Matrix4().makeTranslation(x, y, z), true); }
  finish() {
    const group = new THREE.Group();
    group.add(new THREE.Mesh(mergeGeometries(this.parts), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })));
    if (this.glowParts.length) group.add(new THREE.Mesh(mergeGeometries(this.glowParts), new THREE.MeshBasicMaterial({ vertexColors: true })));
    return { group, cols: this.cols };
  }
}
