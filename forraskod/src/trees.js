import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32 } from './noise.js';
import { hashF, jitter } from './lowpoly.js';

// Low-poly fák: kúpokból álló fenyő, ikozaéder-lombos lombos fa, nyír és almafa.
// Csúcsszín laponként + "leaf" attribútum (0 = törzs/ág, 1 = lomb, 2 = gyümölcs) az évszakokhoz.

function part(geo, colors, leaf, { vary = 0.09, seed = 1, jit = 0, pick } = {}) {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv'); g.deleteAttribute('normal');
  if (jit) jitter(g, jit, seed);
  const p = g.attributes.position, n = p.count / 3, col = new Float32Array(p.count * 3), lf = new Float32Array(p.count);
  const cs = (Array.isArray(colors) ? colors : [colors]).map((c) => new THREE.Color(c)), c = new THREE.Color();
  for (let f = 0; f < n; f++) {
    const x = p.getX(f * 3), y = p.getY(f * 3), z = p.getZ(f * 3);
    const h = hashF(x + seed, y * 1.3, z - seed);
    c.copy(pick ? pick(f, h, y) : cs[Math.floor(hashF(z, x + seed, y) * cs.length) % cs.length]).multiplyScalar(1 - vary + h * vary * 2);
    const lv = leaf === 1 ? 1 + hashF(z * 1.7, y + seed, x * 1.3) * 0.45 : leaf;
    for (let k = 0; k < 3; k++) { const i = f * 3 + k; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; lf[i] = lv; }
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('leaf', new THREE.BufferAttribute(lf, 1));
  return g;
}
function done(parts) { const g = mergeGeometries(parts); g.computeVertexNormals(); g.computeBoundingSphere(); return g; }

const DEC = {
  trunk: [0.19, 0.33, 3.8], br: 1, seed: 44, greens: ['#5a9b3c', '#6aab44', '#78b84c', '#4f8f38'],
  clusters: [[1.8, 0, 4.9, 0], [1.45, 1.15, 4.2, 0.35], [1.4, -1.05, 4.3, -0.45], [1.3, 0.25, 5.9, -0.3], [1.2, -0.4, 3.8, 1.05], [1.15, 0.55, 3.9, -1.05], [1.0, -0.7, 5.5, 0.6]],
};
const BIRCH = {
  trunk: [0.1, 0.19, 5.6], br: 0.6, seed: 46, greens: ['#86c04e', '#97cb58', '#a6d566', '#7ab446'], birch: true,
  clusters: [[1.2, 0, 6.4, 0], [1.0, 0.7, 5.5, 0.3], [1.0, -0.6, 5.7, -0.4], [0.95, 0.2, 7.3, -0.2], [0.85, -0.3, 4.9, 0.6], [0.8, 0.4, 5.0, -0.7], [0.75, -0.5, 6.8, 0.4]],
};
const APPLE = {
  trunk: [0.16, 0.26, 2.3], br: 0.75, seed: 48, greens: ['#5c9d3e', '#69aa44', '#528f37'], apple: true,
  clusters: [[1.6, 0, 3.4, 0], [1.3, 1.1, 2.9, 0.3], [1.3, -1.0, 3.0, -0.4], [1.15, 0.3, 4.1, -0.3], [1.1, -0.5, 2.7, 1.0], [1.05, 0.6, 2.8, -1.0]],
};

function decGeo(P = DEC) {
  const parts = [], r = mulberry32(P.seed);
  const trunkC = P.birch ? null : '#6e4b32';
  const tg = new THREE.CylinderGeometry(P.trunk[0], P.trunk[1], P.trunk[2], 6, P.birch ? 7 : 1, true); tg.translate(0, P.trunk[2] / 2, 0);
  parts.push(part(tg, trunkC || '#ece8df', 0, P.birch ? { vary: 0.04, pick: (f, h) => new THREE.Color(h < 0.3 ? '#3a332c' : '#ece8df') } : { vary: 0.07 }));
  for (const [rx, rz, y, len] of [[0.75, 0.2, 3.0, 1.9], [-0.7, -0.4, 3.3, 1.7], [0.3, -0.9, 3.6, 1.5], [-0.2, 0.8, 3.9, 1.4]]) {
    const b = new THREE.CylinderGeometry(0.06 * P.br, 0.12 * P.br, len * P.br, 4, 1, true); b.translate(0, len * P.br / 2, 0); b.rotateZ(rx); b.rotateX(rz); b.translate(0, y * P.trunk[2] / 3.8, 0);
    parts.push(part(b, P.birch ? '#d9d4ca' : '#6e4b32', 0));
  }
  P.clusters.forEach(([R, cx, cy, cz], i) => {
    const g = new THREE.IcosahedronGeometry(R * 1.02, 0); g.scale(1, 0.86, 1); g.rotateY(r() * 6); g.rotateX((r() - 0.5) * 0.6); g.translate(cx, cy, cz);
    parts.push(part(g, P.greens, 1, { vary: 0.1, seed: P.seed + i * 7, jit: R * 0.22, pick: (f, h, y) => new THREE.Color(P.greens[(i + Math.floor(h * 2)) % P.greens.length]).multiplyScalar(0.86 + Math.min(0.24, Math.max(0, (y - cy + R) / (2 * R)) * 0.28)) }));
    if (P.apple) for (let k = 0; k < 3; k++) {
      const a = r() * 6.28, e = (r() - 0.2) * 1.2, d = R * 0.92;
      const f = new THREE.OctahedronGeometry(0.11, 0); f.translate(cx + Math.cos(a) * Math.cos(e) * d, cy + Math.sin(e) * d * 0.86, cz + Math.sin(a) * Math.cos(e) * d);
      parts.push(part(f, r() < 0.8 ? '#d0322a' : '#e8b020', 2, { vary: 0.05 }));
    }
  });
  return done(parts);
}

function conGeo() {
  const parts = [], r = mulberry32(77);
  // az alsó ágak lovasmagasság fölött kezdődnek, hogy át lehessen lovagolni a fák között
  const t = new THREE.CylinderGeometry(0.11, 0.3, 10.4, 6, 1, true); t.translate(0, 5.2, 0); parts.push(part(t, '#5f4330', 0));
  const tiers = [[2.8, 2.75, 3.3], [4.55, 2.3, 3.0], [6.25, 1.8, 2.75], [7.85, 1.25, 2.6]];
  const greens = ['#2f7a4e', '#37865a', '#2a6d47', '#3b8f5d'];
  tiers.forEach(([y0, rad, h], i) => {
    const c = new THREE.ConeGeometry(rad, h, 7, 1, false); c.translate(0, y0 + h / 2, 0); c.rotateY(r() * 3);
    parts.push(part(c, greens[i], 1, { vary: 0.1, seed: 77 + i * 13, jit: 0.16 }));
  });
  return done(parts);
}

// fa-anyag: lapos árnyalás, csúcsszín, szél a példány helye szerint, "leaf" átadása az évszak-kódnak
function treeMat(uTime) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = 'uniform float uTime; attribute float leaf; varying float vLeaf;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
      vLeaf = leaf;
      #ifdef USE_INSTANCING
      float ph = instanceMatrix[3][0]*0.21 + instanceMatrix[3][2]*0.17;
      float sw = max(position.y - 2.0, 0.0) * 0.018;
      transformed.x += sin(uTime*1.3 + ph + position.y*0.3) * sw; transformed.z += cos(uTime*1.1 + ph*1.3) * sw;
      #endif`);
    sh.fragmentShader = 'varying float vLeaf;\n' + sh.fragmentShader;
  };
  m.customProgramCacheKey = () => 'lp-tree';
  return m;
}

export function makeTreeAssets(uTime) {
  return {
    dec: decGeo(DEC), con: conGeo(), birch: decGeo(BIRCH), apple: decGeo(APPLE),
    decMat: treeMat(uTime), conMat: treeMat(uTime), autMat: treeMat(uTime), birchMat: treeMat(uTime), appleMat: treeMat(uTime),
  };
}
