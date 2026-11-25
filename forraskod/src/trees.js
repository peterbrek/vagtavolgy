import * as THREE from 'three';
import { mulberry32 } from './noise.js';

// Levélkártyás lombos fa és ágkártyás fenyő. Egy textúra-atlasz: bal oldalt lomb/ág (átlátszó), jobb szélen kéreg.
const BARK_U0 = 0.9, BARK_U1 = 0.99, LEAF_U1 = 0.86;

function atlas(kind) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  const r = mulberry32({ leaf: 5, needle: 8, aut: 13, birch: 21, apple: 34 }[kind] || 3);
  // kéreg
  if (kind === 'birch') {
    x.fillStyle = '#ebe7de'; x.fillRect(230, 0, 26, 256);
    for (let i = 0; i < 40; i++) { x.fillStyle = `rgba(25,22,20,${0.55 + r() * 0.4})`; x.fillRect(230 + r() * 18, r() * 256, 4 + r() * 10, 1.5 + r() * 3); }
  } else {
    x.fillStyle = kind === 'needle' ? '#5a3f2c' : '#6b4c33'; x.fillRect(230, 0, 26, 256);
    for (let i = 0; i < 60; i++) { x.fillStyle = `rgba(${r() < 0.5 ? '30,20,12' : '150,120,90'},${0.25 + r() * 0.3})`; x.fillRect(230 + r() * 26, r() * 256, 1 + r() * 2, 8 + r() * 30); }
  }
  if (kind !== 'needle') {
    const pal = {
      leaf: () => [85 + r() * 35, 40 + r() * 22, 20 + r() * 20],
      apple: () => [88 + r() * 30, 42 + r() * 20, 20 + r() * 18],
      birch: () => [72 + r() * 25, 45 + r() * 20, 30 + r() * 20],
      aut: () => { const k = r(); return k < 0.45 ? [22 + r() * 16, 75 + r() * 15, 38 + r() * 14] : k < 0.8 ? [40 + r() * 14, 80 + r() * 12, 42 + r() * 12] : [6 + r() * 10, 65 + r() * 15, 32 + r() * 12]; },
    }[kind];
    const cx = 112, cy = 128, R = 104;
    for (let i = 0; i < 520; i++) {
      const a = r() * Math.PI * 2, d = R * Math.sqrt(r()) * 0.95;
      const px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d * 0.95;
      const lit = 1 - (py - (cy - R)) / (2 * R) * 0.5 - d / R * 0.15;
      const [h, sat, l0] = pal(); const l = l0 * (0.75 + lit * 0.5);
      x.fillStyle = `hsl(${h},${sat}%,${l}%)`;
      x.save(); x.translate(px, py); x.rotate(r() * Math.PI * 2);
      const sz = kind === 'birch' ? 0.75 : 1;
      const w = (5 + r() * 6) * sz, hh = (2.6 + r() * 2.4) * sz;
      x.beginPath(); x.ellipse(0, 0, w, hh, 0, 0, Math.PI * 2); x.fill();
      x.strokeStyle = `rgba(20,40,10,0.35)`; x.lineWidth = 0.6; x.beginPath(); x.moveTo(-w, 0); x.lineTo(w, 0); x.stroke();
      x.restore();
    }
    if (kind === 'apple') for (let i = 0; i < 46; i++) {
      const a = r() * Math.PI * 2, d = 96 * Math.sqrt(r()), px = 112 + Math.cos(a) * d, py = 128 + Math.sin(a) * d;
      x.fillStyle = r() < 0.8 ? '#c8261f' : '#e0a21c'; x.beginPath(); x.arc(px, py, 4.5 + r() * 1.8, 0, Math.PI * 2); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.55)'; x.beginPath(); x.arc(px - 1.5, py - 1.5, 1.4, 0, Math.PI * 2); x.fill();
    }
  } else {
    // fenyőág: szár balról jobbra, tűlevelekkel
    const y0 = 128;
    x.strokeStyle = '#3b2c1e'; x.lineWidth = 3; x.beginPath(); x.moveTo(0, y0); x.lineTo(214, y0); x.stroke();
    for (let i = 0; i < 900; i++) {
      const t = r(); const px = t * 214; const spread = (1 - t) * 70 + 22;
      const side = r() < 0.5 ? -1 : 1; const len = 10 + r() * spread * 0.55;
      const py = y0 + side * r() * 6;
      const l = 16 + r() * 18 + (side < 0 ? 6 : 0);
      x.strokeStyle = `hsl(${120 + r() * 25},${35 + r() * 20}%,${l}%)`; x.lineWidth = 1.4 + r() * 1.2;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + len * 0.45, py + side * len); x.stroke();
    }
    for (let k = 0; k < 7; k++) { // mellékágak
      const bx = 20 + k * 27, side = k % 2 ? 1 : -1; x.strokeStyle = '#35281b'; x.lineWidth = 1.5;
      x.beginPath(); x.moveTo(bx, y0); x.lineTo(bx + 30, y0 + side * (60 - k * 6)); x.stroke();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

class Builder {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.col = []; this.idx = []; }
  quad(a, b, c, d, na, nb, nc, nd, uv, col) { // a-b-c-d körbe
    const o = this.pos.length / 3;
    for (const [p, n, t, k] of [[a, na, uv[0], col[0]], [b, nb, uv[1], col[1]], [c, nc, uv[2], col[2]], [d, nd, uv[3], col[3]]]) {
      this.pos.push(p.x, p.y, p.z); this.nor.push(n.x, n.y, n.z); this.uv.push(t[0], t[1]); this.col.push(k, k, k);
    }
    this.idx.push(o, o + 1, o + 2, o, o + 2, o + 3);
  }
  addGeo(g, color = 1) { // henger kéreg-UV-val
    const ng = g.index ? g.toNonIndexed() : g; const o = this.pos.length / 3;
    const p = ng.attributes.position, n = ng.attributes.normal, u = ng.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      this.pos.push(p.getX(i), p.getY(i), p.getZ(i)); this.nor.push(n.getX(i), n.getY(i), n.getZ(i));
      this.uv.push(BARK_U0 + u.getX(i) * (BARK_U1 - BARK_U0), u.getY(i) * 2); this.col.push(color, color, color); this.idx.push(o + i);
    }
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setIndex(this.idx); g.computeBoundingSphere(); return g;
  }
}

const DEC = {
  trunk: [0.19, 0.33, 3.8], br: 1, center: 4.6, seed: 44, quads: 12,
  clusters: [[1.8, 0, 4.9, 0], [1.45, 1.15, 4.2, 0.35], [1.4, -1.05, 4.3, -0.45], [1.3, 0.25, 5.9, -0.3], [1.2, -0.4, 3.8, 1.05], [1.15, 0.55, 3.9, -1.05], [1.0, -0.7, 5.5, 0.6]],
};
const BIRCH = {
  trunk: [0.1, 0.19, 5.6], br: 0.6, center: 5.8, seed: 46, quads: 10,
  clusters: [[1.2, 0, 6.4, 0], [1.0, 0.7, 5.5, 0.3], [1.0, -0.6, 5.7, -0.4], [0.95, 0.2, 7.3, -0.2], [0.85, -0.3, 4.9, 0.6], [0.8, 0.4, 5.0, -0.7], [0.75, -0.5, 6.8, 0.4]],
};
const APPLE = {
  trunk: [0.16, 0.26, 2.3], br: 0.75, center: 3.0, seed: 48, quads: 12,
  clusters: [[1.6, 0, 3.4, 0], [1.3, 1.1, 2.9, 0.3], [1.3, -1.0, 3.0, -0.4], [1.15, 0.3, 4.1, -0.3], [1.1, -0.5, 2.7, 1.0], [1.05, 0.6, 2.8, -1.0]],
};
function decGeo(P = DEC) {
  const B = new Builder(), r = mulberry32(P.seed), V = THREE.Vector3;
  const t = new THREE.CylinderGeometry(P.trunk[0], P.trunk[1], P.trunk[2], 8, 1, true); t.translate(0, P.trunk[2] / 2, 0); B.addGeo(t, 0.95);
  for (const [rx, rz, y, len] of [[0.75, 0.2, 3.0, 1.9], [-0.7, -0.4, 3.3, 1.7], [0.3, -0.9, 3.6, 1.5], [-0.2, 0.8, 3.9, 1.4]]) {
    const b = new THREE.CylinderGeometry(0.06 * P.br, 0.12 * P.br, len * P.br, 6, 1, true); b.translate(0, len * P.br / 2, 0); b.rotateZ(rx); b.rotateX(rz); b.translate(0, y * P.trunk[2] / 3.8, 0); B.addGeo(b, 0.95);
  }
  const center = new V(0, P.center, 0);
  const clusters = P.clusters;
  for (const [R, cx, cy, cz] of clusters) {
    const C = new V(cx, cy, cz);
    for (let k = 0; k < P.quads; k++) {
      const d = new V(r() * 2 - 1, r() * 1.6 - 0.6, r() * 2 - 1).normalize();
      const q = C.clone().addScaledVector(d, R * (0.35 + r() * 0.35));
      const n = d.clone().add(new V(r() - 0.5, r() - 0.5, r() - 0.5)).normalize();
      const t1 = new V().crossVectors(n, Math.abs(n.y) > 0.9 ? new V(1, 0, 0) : new V(0, 1, 0)).normalize(), t2 = new V().crossVectors(n, t1);
      const s = R * (1.05 + r() * 0.35) / 2;
      const cs = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => q.clone().addScaledVector(t1, a * s).addScaledVector(t2, b * s));
      const ns = cs.map((p) => p.clone().sub(center).normalize().add(new V(0, 0.45, 0)).normalize());
      const shade = cs.map((p) => Math.min(1.15, 0.62 + Math.max(0, (p.y - P.center + 1.6) / 3.6) * 0.45 + p.clone().sub(center).length() / 3.2 * 0.18));
      B.quad(cs[0], cs[1], cs[2], cs[3], ns[0], ns[1], ns[2], ns[3], [[0, 0], [LEAF_U1, 0], [LEAF_U1, 1], [0, 1]], shade);
    }
  }
  return B.geo();
}

function conGeo() {
  const B = new Builder(), r = mulberry32(77), V = THREE.Vector3;
  const t = new THREE.CylinderGeometry(0.1, 0.27, 9.4, 7, 1, true); t.translate(0, 4.7, 0); B.addGeo(t, 0.9);
  const tiers = 8;
  for (let i = 0; i < tiers; i++) {
    const y = 1.5 + i * 1.02, R = 2.6 * (1 - i / (tiers + 0.6)) + 0.35, n = 9 - Math.floor(i / 3);
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + i * 0.7 + r() * 0.3;
      const out = new V(Math.cos(a), 0, Math.sin(a)), side = new V(-Math.sin(a), 0, Math.cos(a));
      const droop = R * (0.38 + r() * 0.12), w = R * 0.42 + 0.15;
      const p0 = new V(0, y, 0).addScaledVector(out, 0.12), p1 = new V(0, y - droop, 0).addScaledVector(out, R);
      const shade0 = 0.55 + i / tiers * 0.35, shade1 = 0.85 + i / tiers * 0.3;
      const nUp = out.clone().multiplyScalar(0.55).add(new V(0, 0.85, 0)).normalize();
      // vízszintes ág
      B.quad(p0.clone().addScaledVector(side, -w * 0.35), p1.clone().addScaledVector(side, -w), p1.clone().addScaledVector(side, w), p0.clone().addScaledVector(side, w * 0.35),
        nUp, nUp, nUp, nUp, [[0, 0.1], [LEAF_U1, 0.0], [LEAF_U1, 1.0], [0, 0.9]], [shade0, shade1, shade1, shade0]);
      // függőleges kereszt-ág
      const upv = new V(0, 1, 0), nOut = out.clone().add(new V(0, 0.4, 0)).normalize();
      B.quad(p0.clone().addScaledVector(upv, -w * 0.3), p1.clone().addScaledVector(upv, -w * 0.7), p1.clone().addScaledVector(upv, w * 0.55), p0.clone().addScaledVector(upv, w * 0.3),
        nOut, nOut, nOut, nOut, [[0, 0.1], [LEAF_U1, 0.0], [LEAF_U1, 1.0], [0, 0.9]], [shade0, shade1 * 0.92, shade1 * 0.92, shade0]);
    }
  }
  // csúcs
  for (let k = 0; k < 3; k++) {
    const a = k * Math.PI / 3, side = new V(Math.cos(a), 0, Math.sin(a)), n = new V(-Math.sin(a), 0.3, Math.cos(a)).normalize();
    const b0 = new V(0, 8.9, 0), b1 = new V(0, 10.4, 0);
    B.quad(b0.clone().addScaledVector(side, -0.5), b0.clone().addScaledVector(side, 0.5), b1.clone().addScaledVector(side, 0.08), b1.clone().addScaledVector(side, -0.08), n, n, n, n,
      [[0, 0], [0, 1], [LEAF_U1, 0.55], [LEAF_U1, 0.45]], [0.95, 0.95, 1.05, 1.05]);
  }
  return B.geo();
}

export function makeTreeAssets(uTime) {
  const mk = (tex) => {
    const m = new THREE.MeshLambertMaterial({ map: tex, vertexColors: true, alphaTest: 0.42, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #ifdef USE_INSTANCING
        float ph = instanceMatrix[3][0]*0.21 + instanceMatrix[3][2]*0.17;
        float sw = max(position.y - 2.0, 0.0) * 0.02;
        transformed.x += sin(uTime*1.3 + ph + position.y*0.3) * sw; transformed.z += cos(uTime*1.1 + ph*1.3) * sw;
        #endif`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);');
    };
    return m;
  };
  return {
    dec: decGeo(DEC), con: conGeo(), birch: decGeo(BIRCH), apple: decGeo(APPLE),
    decMat: mk(atlas('leaf')), conMat: mk(atlas('needle')), autMat: mk(atlas('aut')), birchMat: mk(atlas('birch')), appleMat: mk(atlas('apple')),
  };
}
