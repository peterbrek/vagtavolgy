import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';

// Mesés díszítőelemek: cserépsoros tető, füst, zászlófüzér, futórózsa, virágláda, szélkakas.
// Minden anyag lapos árnyalású; a tetőanyagok (évszak: hó) a ROOF_MATS listába kerülnek.

export const ROOF_MATS = [];
const CACHE = new Map();
// egyszínű anyagok megosztva (kevesebb rajzhívás az összevonás után)
const L = (c, o = null) => { if (!o) { let m = CACHE.get(c); if (!m) { CACHE.set(c, m = new THREE.MeshLambertMaterial({ color: c, flatShading: true })); m.userData.deco = true; } return m; } return new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...o }); };
export const lam = L;
// a díszek egyszínű anyagai csúcsszínként egyetlen hálóba olvaszthatók
export const DECO_VC = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

export function roofMats(hexes) {
  const ms = hexes.map((h) => new THREE.MeshLambertMaterial({ color: h, flatShading: true })); ROOF_MATS.push(...ms); return ms;
}

// Cserépsorok egy nyeregtetőn. A gerinc az x tengely mentén fut, a lejtők ±z felé.
// y0: az eresz magassága, half: vízszintes távolság a gerinctől az ereszig, rise: a tető magassága.
export function roofRows(parent, { cx = 0, cz = 0, width, half, rise, y0, rows = 6, mats, ridgeMat, sides = [-1, 1] }) {
  const len = Math.hypot(half, rise), ang = Math.atan2(rise, half), rl = len / rows;
  for (const s of sides) {
    for (let k = 0; k < rows; k++) {
      const t = (k + 0.5) / rows;
      const y = y0 + rise * t, z = cz + s * half * (1 - t);
      const b = new THREE.Mesh(new THREE.BoxGeometry(width, 0.075, rl * 1.32), mats[k % mats.length]);
      b.position.set(cx, y + Math.cos(ang) * 0.1, z + s * Math.sin(ang) * 0.1);
      b.rotation.x = s * (ang - 0.09);
      b.castShadow = true; b.receiveShadow = true; parent.add(b);
    }
  }
  if (ridgeMat) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, width + 0.1, 5), ridgeMat);
    r.rotation.z = Math.PI / 2; r.position.set(cx, y0 + rise + 0.1, cz); r.castShadow = true; parent.add(r);
  }
}

// Kéményfüst: felszálló, növő, majd zsugorodó pamacsok (egy rajzhívás)
const SMOKE_MAT = new THREE.MeshLambertMaterial({ color: '#f2f2ee', flatShading: true, transparent: true, opacity: 0.62, depthWrite: false });
export class Smoke {
  constructor(parent, x, y, z, n = 6) {
    this.n = n; this.base = new THREE.Vector3(x, y, z);
    this.mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.28, 0), SMOKE_MAT, n);
    this.mesh.userData.dynamic = true; this.mesh.castShadow = false; this.mesh.frustumCulled = false; parent.add(this.mesh);
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._p = new THREE.Vector3(); this._s = new THREE.Vector3();
  }
  update(t) {
    const n = this.n, P = 5.5;
    for (let i = 0; i < n; i++) {
      const u = ((t / P + i / n) % 1);
      this._p.set(this.base.x + u * 1.1 + Math.sin(t * 0.9 + i) * 0.12, this.base.y + u * 3.2, this.base.z + Math.sin(t * 0.7 + i * 2) * 0.15);
      const sc = (0.5 + u * 1.7) * Math.min(1, u * 8) * Math.min(1, (1 - u) * 3.5);
      this._s.setScalar(sc); this._q.setFromEuler(this._e.set(u * 2 + i, u * 3, 0));
      this.mesh.setMatrixAt(i, this._m.compose(this._p, this._q, this._s));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// Zászlófüzér: a pontok között belógó zsinór, rajta színes háromszögek
const BUNT = ['#e8453c', '#f2c33a', '#2f8fd6', '#43a85a', '#f27aaa', '#8a55d0', '#ff8a3d'];
export function bunting(parent, pts, { sag = 0.45, step = 0.55, size = 0.34, seed = 3 } = {}) {
  const r = mulberry32(seed), V = THREE.Vector3, pos = [], col = [], c = new THREE.Color();
  const linePts = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new V(...pts[i]), b = new V(...pts[i + 1]), d = a.distanceTo(b), n = Math.max(2, Math.round(d / step));
    for (let k = 0; k <= n; k++) {
      if (i > 0 && k === 0) continue;
      const t = k / n, p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * sag * Math.min(1, d / 8);
      linePts.push(p);
    }
  }
  for (let i = 0; i < linePts.length - 1; i++) {
    const a = linePts[i], b = linePts[i + 1], m = a.clone().lerp(b, 0.5), dir = b.clone().sub(a).normalize();
    const p0 = m.clone().addScaledVector(dir, -size / 2), p1 = m.clone().addScaledVector(dir, size / 2), tip = m.clone().add(new V(0, -size * 1.15, 0));
    pos.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, tip.x, tip.y, tip.z);
    c.set(BUNT[Math.floor(r() * BUNT.length)]);
    for (let k = 0; k < 3; k++) col.push(c.r, c.g, c.b);
  }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.computeVertexNormals();
  const flags = new THREE.Mesh(g, L('#ffffff', { vertexColors: true, side: THREE.DoubleSide })); flags.castShadow = true; parent.add(flags);
  const line = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(linePts), linePts.length * 2, 0.012, 3, false), L('#f4efe6')); parent.add(line);
  return flags;
}

// Futórózsa a falon: zöld lombcsomók, rajta rózsaszín és piros virágok
export function climbingRose(parent, x, y0, z, { h = 2.2, nx = 0, nz = 1, seed = 5 } = {}) {
  const r = mulberry32(seed), leafM = L('#4f9a3f'), fl = [L('#f27aaa'), L('#e8453c')];
  for (let k = 0; k < 6; k++) {
    const yy = y0 + 0.2 + (k / 5) * h, side = (r() - 0.5) * 0.5;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + r() * 0.12, 0), leafM);
    b.position.set(x + side * Math.abs(nz) + nx * 0.12, yy, z + side * Math.abs(nx) + nz * 0.12); b.scale.set(1, 1.2, 0.7 + Math.abs(nx) * 0.3); b.rotation.set(r(), r() * 3, r()); b.castShadow = true; parent.add(b);
    for (let q = 0; q < 3; q++) {
      const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.065, 0), fl[(k + q) % 2]);
      f.position.set(b.position.x + (r() - 0.5) * 0.35 * Math.abs(nz) + nx * 0.28, yy + (r() - 0.5) * 0.3, b.position.z + (r() - 0.5) * 0.35 * Math.abs(nx) + nz * 0.28); parent.add(f);
    }
  }
}

// virágcserép
export function flowerPot(parent, x, y, z, s = 1, seed = 7) {
  const r = mulberry32(seed);
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.2 * s, 0.15 * s, 0.32 * s, 7), L('#c8693f')); pot.position.set(x, y + 0.16 * s, z); pot.castShadow = true; parent.add(pot);
  const g = new THREE.Mesh(new THREE.IcosahedronGeometry(0.24 * s, 0), L('#4f9a3f')); g.position.set(x, y + 0.42 * s, z); g.scale.y = 0.8; parent.add(g);
  const cs = [L('#f2c33a'), L('#f27aaa'), L('#ffffff'), L('#e8453c')];
  for (let k = 0; k < 5; k++) { const f = new THREE.Mesh(new THREE.OctahedronGeometry(0.07 * s, 0), cs[Math.floor(r() * 4)]); const a = k / 5 * 6.28; f.position.set(x + Math.cos(a) * 0.17 * s, y + (0.5 + r() * 0.1) * s, z + Math.sin(a) * 0.17 * s); parent.add(f); }
}

// szélkakas lófigurával
export function weatherVane(parent, x, y, z, mat) {
  const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.03, 1.0, 5), mat); pole.position.y = 0.5; g.add(pole);
  const arrow = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.03, 0.03), mat); arrow.position.y = 0.72; g.add(arrow);
  const tip = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.16, 4), mat); tip.rotation.z = -Math.PI / 2; tip.position.set(0.42, 0.72, 0); g.add(tip);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.02), mat); fin.position.set(-0.36, 0.72, 0); fin.rotation.z = Math.PI / 4; g.add(fin);
  // ugró ló sziluett
  const sh = new THREE.Shape();
  const P = [[-0.26, 0.0], [-0.2, 0.08], [-0.1, 0.1], [0.08, 0.1], [0.16, 0.2], [0.24, 0.24], [0.27, 0.19], [0.2, 0.14], [0.17, 0.06], [0.22, -0.04], [0.16, -0.06], [0.1, 0.02], [-0.05, 0.0], [-0.14, -0.08], [-0.22, -0.06], [-0.18, -0.01], [-0.3, 0.06], [-0.34, 0.02]];
  sh.moveTo(P[0][0], P[0][1]); for (const [a, b] of P.slice(1)) sh.lineTo(a, b); sh.closePath();
  const hg = new THREE.ExtrudeGeometry(sh, { depth: 0.025, bevelEnabled: false }); hg.translate(0, 0, -0.0125); hg.scale(1.6, 1.6, 1);
  const horse = new THREE.Mesh(hg, mat); horse.position.y = 0.9; g.add(horse);
  g.rotation.y = 0.6;
  return g;
}

// kövek egy alap mentén (szabálytalan "kőlábazat")
export function stoneRow(parent, pts, { y = 0.12, r0 = 0.13, mats = null, seed = 9 } = {}) {
  const r = mulberry32(seed), ms = mats || [L('#a09a90'), L('#8c867d'), L('#b3ada2')];
  for (const [x, z] of pts) {
    const s = new THREE.Mesh(new THREE.DodecahedronGeometry(r0 * (0.8 + r() * 0.5), 0), ms[Math.floor(r() * ms.length)]);
    s.position.set(x, y + (r() - 0.5) * 0.05, z); s.scale.set(1.2, 0.8, 1); s.rotation.set(r(), r() * 3, r()); s.castShadow = true; parent.add(s);
  }
}

// alacsony léckerítés (kertkerítés)
export function picketFence(parent, x0, z0, x1, z1, mat, h = 0.5) {
  const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(2, Math.round(len / 0.18)), yaw = Math.atan2(x1 - x0, z1 - z0);
  const parts = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n, g = new THREE.BoxGeometry(0.07, h, 0.03); g.translate(0, h / 2, 0);
    const tip = new THREE.ConeGeometry(0.05, 0.08, 4); tip.rotateY(Math.PI / 4); tip.translate(0, h + 0.04, 0);
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x0 + (x1 - x0) * t, 0, z0 + (z1 - z0) * t), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw + Math.PI / 2), new THREE.Vector3(1, 1, 1));
    g.applyMatrix4(m); tip.applyMatrix4(m); parts.push(g.toNonIndexed(), tip.toNonIndexed());
  }
  for (const yy of [h * 0.3, h * 0.75]) { const g = new THREE.BoxGeometry(0.03, 0.05, len); g.rotateY(yaw); g.translate((x0 + x1) / 2, yy, (z0 + z1) / 2); parts.push(g.toNonIndexed()); }
  for (const p of parts) p.deleteAttribute('uv');
  const m = new THREE.Mesh(mergeGeometries(parts), mat); m.castShadow = true; m.receiveShadow = true; parent.add(m);
  return m;
}
