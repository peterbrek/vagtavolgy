import * as THREE from 'three';
import { makeNoise2D, fbm, mulberry32, hash2, clamp, lerp, smoothstep } from './noise.js';
import { canvasTexture } from './geom.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { hashF, jitter } from './lowpoly.js';
import { makeTreeAssets } from './trees.js';

export const SIZE = 1000, HALF = 500, SEG = 320, CELL = SIZE / SEG, G = SEG + 1;
export const WATER = -0.9;
export const HOME = { x: 25, z: 0 };
export const STABLE = { x: -20, z: -37, w: 21, d: 7 };
export const HOUSE = { x: 3, z: -38.4, w: 12, d: 9.8 };
export const TIE = { x: -20, z: -25 };
export const ARENA = { x: 45, z: 15, hw: 42, hd: 24 };
export const LAKE = { x: -175, z: 45, r: 48 };
export const YARD = { x0: -36, x1: 11, z0: -33.4, z1: -14 };
export const SUN_DIR = new THREE.Vector3(0.55, 0.64, 0.42).normalize();
export const WORLD_VERSION = 2;

// Tájegységek
export const REG = {
  lavender: { x0: 5, x1: 125, z0: 238, z1: 318 },
  farmYard: { x0: 136, x1: 178, z0: 262, z1: 302 },
  farm: { x: 157, z: 289 },
  orchard: { x0: 184, x1: 242, z0: 236, z1: 298 },
  garden: { x0: 138, x1: 166, z0: 238, z1: 256 },
  ruin: { x: 322, z: 292, r: 15 },
  wild: { x: 195, z: 140, r: 78 },
  xc: { x: 165, z: -15, r: 75 },
  birch: { x: -240, z: 262, r: 100 },
  westwood: { x: -140, z: -150, r: 118 },
  swwood: { x: -350, z: 90, r: 95 },
  rocky: { x: 292, z: -168, r: 85 },
};
const CANYON_CTRL = [[268, -258], [205, -318], [130, -340], [50, -300], [-30, -335], [-110, -305], [-180, -275], [-238, -240], [-296, -203]];
export const WATERFALL_T = 0.74;
const PATH_A = [[-6, 34], [-55, 92], [-115, 128], [-185, 148], [-255, 205], [-240, 300], [-150, 365], [-50, 330], [40, 345], [130, 336], [205, 314], [262, 316], [300, 274], [352, 205], [346, 110], [372, 10], [342, -88], [290, -170]];
const PATH_B = [[-212, -165], [-128, -105], [-62, -38]];

const COL = {
  grassA: new THREE.Color('#6fa846'), grassB: new THREE.Color('#9cc658'), dry: new THREE.Color('#c2b968'),
  forest: new THREE.Color('#4f8c3c'), dirt: new THREE.Color('#d6b983'), dirt2: new THREE.Color('#e2c895'),
  sand: new THREE.Color('#e6d3a0'), mud: new THREE.Color('#8f7c58'), rock: new THREE.Color('#8f8a82'),
  rock2: new THREE.Color('#aaa59b'), snow: new THREE.Color('#f2f4f7'), litter: new THREE.Color('#c0803a'),
  birchG: new THREE.Color('#93c459'), gravel: new THREE.Color('#bdb096'), soil: new THREE.Color('#82684a'),
  strata: [new THREE.Color('#cf9a68'), new THREE.Color('#b47850'), new THREE.Color('#dcb489'), new THREE.Color('#a08a72')],
};

const nA = makeNoise2D(11), nB = makeNoise2D(23), nC = makeNoise2D(37), nD = makeNoise2D(53), nE = makeNoise2D(71);
const dist = (x, z, p) => Math.hypot(x - p.x, z - p.z);
export const rectMask = (x, z, r, blend) => smoothstep(-blend, 0, x - r.x0) * smoothstep(-blend, 0, r.x1 - x) * smoothstep(-blend, 0, z - r.z0) * smoothstep(-blend, 0, r.z1 - z);
export const inRect = (x, z, r, m = 0) => x > r.x0 - m && x < r.x1 + m && z > r.z0 - m && z < r.z1 + m;

// Távolságmező egy görbéhez 2 m-es rácson (opcionálisan a görbe paraméterével)
class Field {
  constructor(pts, reach, withT) {
    const N = this.N = SIZE / 2;
    this.d = new Float32Array(N * N).fill(999); this.t = withT ? new Float32Array(N * N) : null;
    const rc = Math.ceil(reach / 2);
    pts.forEach((p, k) => {
      const tp = k / (pts.length - 1);
      const ci = Math.floor((p.x + HALF) / 2), cj = Math.floor((p.z + HALF) / 2);
      for (let dj = -rc; dj <= rc; dj++) for (let di = -rc; di <= rc; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const cx = -HALF + (i + 0.5) * 2, cz = -HALF + (j + 0.5) * 2;
        const d = Math.hypot(cx - p.x, cz - p.z); const q = j * N + i;
        if (d < this.d[q]) { this.d[q] = d; if (this.t) this.t[q] = tp; }
      }
    });
  }
  idx(x, z) { const i = Math.floor((x + HALF) / 2), j = Math.floor((z + HALF) / 2); return i < 0 || j < 0 || i >= this.N || j >= this.N ? -1 : j * this.N + i; }
  at(x, z) { const q = this.idx(x, z); return q < 0 ? 999 : this.d[q]; }
  tAt(x, z) { const q = this.idx(x, z); return q < 0 || !this.t ? 0 : this.t[q]; }
}

export class World {
  constructor(scene, quality) {
    this.scene = scene; this.quality = quality;
    this.group = new THREE.Group(); scene.add(this.group);
    this.circles = new Map(); this.boxes = [];
    this.buildCurves();
    this.buildHeights();
    this.buildGrids();
    this.buildTerrain();
    this.buildWater();
    this.buildSky();
    this.buildTrees();
    this.buildLavender();
  }

  // ---------- görbék: szurdok, patak, ösvény ----------
  buildCurves() {
    const V = (x, z) => new THREE.Vector3(x, 0, z);
    this.canyonCurve = new THREE.CatmullRomCurve3(CANYON_CTRL.map(([x, z]) => V(x, z)), false, 'centripetal');
    const cl = this.canyonCurve.getLength();
    this.canyonPts = this.canyonCurve.getSpacedPoints(Math.floor(cl / 2));
    this.canyon = new Field(this.canyonPts, 104, true);
    const nrm = (t) => { const tg = this.canyonCurve.getTangentAt(clamp(t, 0, 1)); return V(-tg.z, tg.x).normalize(); };
    this.canyonNormal = nrm;
    const cpt = (t, off) => this.canyonCurve.getPointAt(t).addScaledVector(nrm(t), off);
    this.canyonAt = cpt;
    // vízesés és tó a szurdokban (északi fal)
    this.pool = cpt(WATERFALL_T, 4.2);
    // patak: a medencéből a szurdokon át nyugatra, majd délre a tóba
    const creekCtrl = [this.pool, cpt(0.8, 4), cpt(0.87, 4), cpt(0.94, 4.5), cpt(1.0, 5), V(-312, -170), V(-288, -110), V(-246, -52), V(-204, -8), V(-188, 10)];
    this.creekCurve = new THREE.CatmullRomCurve3(creekCtrl, false, 'centripetal');
    this.creekPts = this.creekCurve.getSpacedPoints(Math.floor(this.creekCurve.getLength()));
    this.creek = new Field(this.creekPts, 10, true);
    // ösvény: körút, a szurdokon a déli oldalon át
    const canyonPath = []; for (let k = 0; k <= 16; k++) { const t = k / 16; canyonPath.push(cpt(t, -4)); }
    const pts = [...PATH_A.map(([x, z]) => V(x, z)), ...canyonPath, ...PATH_B.map(([x, z]) => V(x, z))];
    this.pathCurve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const len = this.pathCurve.getLength();
    this.pathLen = len;
    this.pathPts = this.pathCurve.getSpacedPoints(Math.floor(len));
    this.path = new Field(this.pathPts, 10, false);
    this.pdN = this.path.N;
  }
  pathDist(x, z) { return this.path.at(x, z); }
  creekDist(x, z) { return this.creek.at(x, z); }
  canyonDist(x, z) { return this.canyon.at(x, z); }
  autumnAt(x, z) { return smoothstep(250, 300, x) * (1 - smoothstep(165, 205, Math.abs(z))); }
  birchAt(x, z) { return 1 - smoothstep(REG.birch.r * 0.45, REG.birch.r, dist(x, z, REG.birch)); }
  rockyAt(x, z) { return 1 - smoothstep(REG.rocky.r * 0.35, REG.rocky.r, dist(x, z, REG.rocky)); }
  inLavender(x, z, m = 0) { return inRect(x, z, REG.lavender, m); }

  rawHeight(x, z) {
    const h0 = fbm(nA, x * 0.0035, z * 0.0035, 4) * 15;
    let h = 1.4 + (h0 > 0 ? h0 : h0 * 0.12) + fbm(nB, x * 0.018, z * 0.018, 3) * 1.5;
    const de = Math.max(Math.abs(x), Math.abs(z));
    const m = smoothstep(415, 495, de);
    h += m * m * (48 + 26 * nC(x * 0.012, z * 0.012)) + m * 6 * nE(x * 0.05, z * 0.05);
    // szurdok: két gerinc között, meredek sziklafalakkal
    const dC = this.canyon.at(x, z);
    if (dC < 110) {
      const tC = this.canyon.tAt(x, z);
      const ends = smoothstep(0, 0.09, tC) * smoothstep(1, 0.91, tC);
      const ridge = (1 - smoothstep(28, 100, dC)) * ends;
      h += ridge * (17 + 6 * nC(x * 0.02, z * 0.02) + 3 * nE(x * 0.06, z * 0.06));
      const floorH = 0.9 + Math.max(0, h0) * 0.22 + 0.25 * nE(x * 0.05, z * 0.05);
      h = lerp(h, floorH, 1 - smoothstep(9.5, 16.5, dC));
      const dp = dist(x, z, this.pool);
      if (dp < 8) h = lerp(floorH - 0.8, h, smoothstep(3, 7.5, dp));
    }
    // várrom-domb lapos tetővel
    const dR = dist(x, z, REG.ruin);
    if (dR < 90) { h += 19 * (1 - smoothstep(14, 80, dR)); h = lerp(22.5, h, smoothstep(12, 19, dR)); }
    // sziklás fennsík
    const dK = dist(x, z, REG.rocky);
    if (dK < 110) h += (1 - smoothstep(25, 105, dK)) * (5 + 4 * nE(x * 0.03, z * 0.03) + 2 * nB(x * 0.09, z * 0.09));
    // otthon és tanya: sík
    h = lerp(0, h, smoothstep(88, 140, dist(x, z, HOME)));
    const farm = Math.max(rectMask(x, z, { x0: 0, x1: 246, z0: 232, z1: 322 }, 30), 0);
    if (farm > 0) h = lerp(h, 1.6 + 0.3 * nB(x * 0.02, z * 0.02), farm);
    // tó
    const dl0 = dist(x, z, LAKE);
    h = lerp(Math.min(h, 1.2), h, smoothstep(LAKE.r + 25, LAKE.r + 90, dl0));
    const dl = dl0 + nD(x * 0.03, z * 0.03) * 7;
    h = lerp(-3.6, h, smoothstep(LAKE.r * 0.4, LAKE.r + 26, dl));
    // patakmeder
    const dk = this.creek.at(x, z);
    if (dk < 6) h -= 0.7 * (1 - smoothstep(1.3, 3.4, dk));
    // ösvény
    const pd = this.path.at(x, z);
    h -= 0.14 * (1 - smoothstep(0.5, 3, pd));
    return h;
  }

  buildHeights() {
    this.H = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++)
      this.H[j * G + i] = this.rawHeight(-HALF + i * CELL, -HALF + j * CELL);
    this.ruinTop = this.heightAt(REG.ruin.x, REG.ruin.z);
  }

  heightAt(x, z) {
    const fx = (x + HALF) / CELL, fz = (z + HALF) / CELL;
    let i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0) i = 0; if (j < 0) j = 0; if (i > SEG - 1) i = SEG - 1; if (j > SEG - 1) j = SEG - 1;
    const u = clamp(fx - i, 0, 1), v = clamp(fz - j, 0, 1), H = this.H;
    const h00 = H[j * G + i], h10 = H[j * G + i + 1], h01 = H[(j + 1) * G + i], h11 = H[(j + 1) * G + i + 1];
    if (u + v <= 1) return h00 + (h10 - h00) * u + (h01 - h00) * v;
    return h11 + (h01 - h11) * (1 - u) + (h10 - h11) * (1 - v);
  }
  slopeAt(x, z) {
    const e = 1.5;
    const dx = this.heightAt(x + e, z) - this.heightAt(x - e, z), dz = this.heightAt(x, z + e) - this.heightAt(x, z - e);
    return Math.hypot(dx, dz) / (2 * e);
  }
  inArena(x, z, m = 0) { return Math.abs(x - ARENA.x) < ARENA.hw + m && Math.abs(z - ARENA.z) < ARENA.hd + m; }
  inYard(x, z, m = 0) { return x > YARD.x0 - m && x < YARD.x1 + m && z > YARD.z0 - m && z < YARD.z1 + m; }

  forestAt(x, z) {
    let f = smoothstep(0.08, 0.34, fbm(nD, x * 0.006 + 40, z * 0.006 - 20, 3)) * 0.55;
    f += 0.95 * (1 - smoothstep(REG.westwood.r * 0.5, REG.westwood.r, dist(x, z, REG.westwood)));
    f += 0.95 * (1 - smoothstep(REG.swwood.r * 0.45, REG.swwood.r, dist(x, z, REG.swwood)));
    f += 0.85 * this.autumnAt(x, z);
    f += 0.6 * this.birchAt(x, z);
    const dC = this.canyon.at(x, z);
    if (dC < 100) f += 0.3 * (1 - smoothstep(40, 100, dC)) * smoothstep(17, 24, dC);
    f = clamp(f, 0, 1);
    f *= smoothstep(105, 150, dist(x, z, HOME));
    f *= smoothstep(REG.xc.r, REG.xc.r + 18, dist(x, z, REG.xc));
    f *= smoothstep(REG.wild.r, REG.wild.r + 20, dist(x, z, REG.wild));
    f *= 1 - rectMask(x, z, { x0: 0, x1: 246, z0: 232, z1: 322 }, 20);
    f *= smoothstep(28, 40, dist(x, z, REG.ruin));
    f *= smoothstep(6, 12, this.creek.at(x, z));
    f *= smoothstep(13, 18, dC);
    return f;
  }

  groundColor(x, z, h, slope, out) {
    const n1 = nB(x * 0.035, z * 0.035) * 0.5 + 0.5, n2 = nC(x * 0.008 + 10, z * 0.008) * 0.5 + 0.5;
    out.copy(COL.grassA).lerp(COL.grassB, n1);
    out.lerp(COL.dry, smoothstep(0.62, 0.9, n2) * 0.55);
    out.lerp(COL.birchG, this.birchAt(x, z) * 0.5);
    const f = this.forestAt(x, z);
    out.lerp(COL.forest, f * 0.75);
    out.lerp(COL.litter, f * this.autumnAt(x, z) * 0.45);
    if (h < WATER + 0.7) out.lerp(COL.sand, smoothstep(WATER + 0.7, WATER + 0.15, h));
    if (h < WATER - 0.2) out.lerp(COL.mud, smoothstep(WATER - 0.2, WATER - 1.2, h));
    const dC = this.canyon.at(x, z);
    if (dC < 26) {
      out.lerp(COL.gravel, (1 - smoothstep(6, 11, dC)) * 0.45);
      const k = Math.floor(((h * 0.7 + nE(x * 0.05, z * 0.05) * 1.2) % 4 + 4) % 4);
      out.lerp(COL.strata[k], smoothstep(0.38, 0.7, slope) * smoothstep(26, 14, dC));
    }
    out.lerp(n1 > 0.5 ? COL.rock : COL.rock2, smoothstep(0.42, 0.72, slope) * 0.9 * (dC < 22 ? 0.3 : 1));
    out.lerp(COL.rock2, this.rockyAt(x, z) * smoothstep(0.55, 0.75, nE(x * 0.04, z * 0.04)) * 0.8);
    out.lerp(COL.rock, smoothstep(26, 34, h) * (dist(x, z, REG.ruin) < 30 ? 0 : 1));
    out.lerp(COL.snow, smoothstep(50, 58, h + n2 * 6));
    if (this.inLavender(x, z, 1)) out.lerp(COL.soil, 0.55);
    if (inRect(x, z, REG.garden, 1)) out.lerp(COL.soil, 0.85);
    if (inRect(x, z, REG.farmYard, 0)) out.lerp(COL.dirt2, 0.6);
    const dk = this.creek.at(x, z);
    if (dk < 3) out.lerp(COL.mud, (1 - smoothstep(1.5, 3, dk)) * 0.7);
    const pd = this.path.at(x, z);
    if (pd < 4) out.lerp(n1 > 0.45 ? COL.dirt : COL.dirt2, (1 - smoothstep(1.3, 3.3, pd)) * 0.95);
    return out;
  }

  // 2 m-es rácsok: talajszín, fűsűrűség
  buildGrids() {
    const N = this.pdN, c = new THREE.Color();
    this.gc = new Float32Array(N * N * 3);
    this.gd = new Float32Array(N * N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = -HALF + (i + 0.5) * 2, z = -HALF + (j + 0.5) * 2;
      const h = this.heightAt(x, z), sl = this.slopeAt(x, z);
      this.groundColor(x, z, h, sl, c);
      const k = j * N + i;
      this.gc[k * 3] = c.r; this.gc[k * 3 + 1] = c.g; this.gc[k * 3 + 2] = c.b;
      let d = 0.55 + 0.45 * smoothstep(-0.3, 0.5, nE(x * 0.02, z * 0.02));
      d *= 1 - this.forestAt(x, z) * 0.55;
      d *= smoothstep(1.8, 3.2, this.path.d[k]);
      d *= smoothstep(WATER + 0.25, WATER + 0.7, h);
      d *= 1 - smoothstep(0.45, 0.65, sl);
      d *= 1 - smoothstep(22, 28, h) * (dist(x, z, REG.ruin) < 30 ? 0 : 1);
      d *= smoothstep(1.8, 3.0, this.creek.d[k]);
      if (this.canyon.d[k] < 10) d *= 0.35;
      if (Math.abs(x - HOUSE.x) < HOUSE.w / 2 + 1.2 && Math.abs(z - HOUSE.z) < HOUSE.d / 2 + 2.4) d = 0;
      if (Math.abs(x - STABLE.x) < STABLE.w / 2 + 1.5 && Math.abs(z - STABLE.z) < STABLE.d / 2 + 2.2) d = 0;
      if (this.inArena(x, z, 1.5) || this.inYard(x, z, 0.5) || this.inLavender(x, z, 0.5) || inRect(x, z, REG.garden, 0.5) || inRect(x, z, REG.farmYard)) d = 0;
      this.gd[k] = d;
    }
  }
  gridColor(x, z, out) {
    const N = this.pdN; let i = clamp(Math.floor((x + HALF) / 2), 0, N - 1), j = clamp(Math.floor((z + HALF) / 2), 0, N - 1);
    const k = (j * N + i) * 3; return out.setRGB(this.gc[k], this.gc[k + 1], this.gc[k + 2]);
  }
  grassDensity(x, z) {
    const N = this.pdN; const i = Math.floor((x + HALF) / 2), j = Math.floor((z + HALF) / 2);
    if (i < 0 || j < 0 || i >= N || j >= N) return 0;
    return this.gd[j * N + i];
  }

  // ---------- terep ----------
  buildTerrain() {
    const pos = new Float32Array(G * G * 3), col = new Float32Array(G * G * 3), uv = new Float32Array(G * G * 2);
    const c = new THREE.Color();
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
      const k = j * G + i, x = -HALF + i * CELL, z = -HALF + j * CELL, h = this.H[k];
      pos[k * 3] = x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = z;
      this.groundColor(x, z, h, this.slopeAt(x, z), c);
      col[k * 3] = c.r; col[k * 3 + 1] = c.g; col[k * 3 + 2] = c.b;
      uv[k * 2] = x / 5; uv[k * 2 + 1] = z / 5;
    }
    const idx = new Uint32Array(SEG * SEG * 6); let n = 0;
    for (let j = 0; j < SEG; j++) for (let i = 0; i < SEG; i++) {
      const A = j * G + i, B = (j + 1) * G + i, C = j * G + i + 1, D = (j + 1) * G + i + 1;
      idx[n++] = A; idx[n++] = B; idx[n++] = C; idx[n++] = C; idx[n++] = B; idx[n++] = D;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(new THREE.BufferAttribute(idx, 1));
    g.computeVertexNormals();
    g.deleteAttribute('uv');
    // lapos árnyalás + laponként enyhén eltérő szín (a rács háromszögei szerint)
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
    mat.onBeforeCompile = (sh) => {
      sh.vertexShader = 'varying vec3 vTW;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vTW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      sh.fragmentShader = 'varying vec3 vTW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        { vec2 gq = (vTW.xz + ${HALF.toFixed(1)}) / ${CELL.toFixed(5)}; vec2 ci = floor(gq); vec2 fq = fract(gq); float tri = step(1.0, fq.x + fq.y);
          float rq = fract(sin(dot(ci + vec2(tri * 0.37, tri * 0.71), vec2(12.9898, 78.233))) * 43758.5453);
          diffuseColor.rgb *= 0.92 + rq * 0.16; }`);
    };
    this.terrain = new THREE.Mesh(g, mat);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
  }

  // ---------- víz: tó, patak, medence, vízesés ----------
  waterMaterial(lake) {
    const u = {
      uTime: this.waterUniforms.uTime, uSun: { value: SUN_DIR }, uDeep: { value: new THREE.Color('#2f84a8') },
      uShallow: { value: new THREE.Color(lake ? '#5cc0c2' : '#6cc8c8') }, uSky: { value: new THREE.Color('#cfe6f2') },
      uLake: { value: lake ? new THREE.Vector3(LAKE.x, LAKE.z, LAKE.r) : new THREE.Vector3(9999, 9999, 1) },
      uIce: { value: 0 }, uLight: this.waterLight || (this.waterLight = { value: new THREE.Color(1, 1, 1) }),
    };
    // low-poly víz: hullámzó, szögletes lapok, lapos árnyalással
    const mat = new THREE.ShaderMaterial({
      transparent: true, fog: true, depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, u]),
      vertexShader: `uniform float uTime, uIce; varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix*vec4(position,1.0); float t = uTime;
          w.y += (sin(w.x*0.33 + t*1.1) + sin(w.z*0.41 - t*0.9) + 0.6*sin((w.x + w.z)*0.85 + t*1.7)) * 0.05 * (1.0 - uIce);
          vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime, uIce; uniform vec3 uSun, uDeep, uShallow, uSky, uLake, uLight; varying vec3 vW;
        #include <fog_pars_fragment>
        void main(){
          vec3 n = normalize(cross(dFdx(vW), dFdy(vW))); if (n.y < 0.0) n = -n;
          vec3 v = normalize(cameraPosition - vW);
          float fr = pow(1.0 - max(dot(n, v), 0.0), 3.0);
          float dc = distance(vW.xz, uLake.xy); float deep = smoothstep(uLake.z*0.95, uLake.z*0.3, dc);
          vec3 col = mix(uShallow, uDeep, deep);
          col = mix(col, uSky, 0.08 + fr*0.45);
          col *= 0.82 + 0.3*max(dot(n, uSun), 0.0);
          float sp = pow(max(dot(reflect(-uSun, n), v), 0.0), 40.0);
          col += vec3(1.0,0.96,0.86)*sp*0.55*(1.0-uIce);
          float a = clamp(0.78 + deep*0.17 + fr*0.2, 0.0, 0.97);
          if (uIce > 0.0) { float cr = step(0.93, fract(sin(dot(floor(vW.xz*0.45), vec2(12.9898,78.233)))*43758.5453));
            vec3 ice = mix(vec3(0.74,0.86,0.93), vec3(0.93,0.96,0.99), smoothstep(uLake.z*0.95, uLake.z*0.6, dc)*0.5 + fr*0.4) * (0.94 + 0.08*max(dot(n, uSun), 0.0)) - cr*0.08;
            col = mix(col, ice, uIce); a = mix(a, 0.97, uIce); }
          col *= uLight;
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    for (const k in u) mat.uniforms[k] = u[k];
    return mat;
  }
  // szabálytalan háromszögekből álló kör alakú vízfelület
  waterDisk(R, cell) {
    const n = Math.ceil((2 * R) / cell), r = mulberry32(Math.round(R * 7)), pos = [], idx = [];
    for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) {
      let x = -R + i * cell, z = -R + j * cell;
      if (i > 0 && i < n && j > 0 && j < n) { x += (r() - 0.5) * cell * 0.6; z += (r() - 0.5) * cell * 0.6; }
      pos.push(x, 0, z);
    }
    const W = n + 1, in_ = (k) => Math.hypot(pos[k * 3], pos[k * 3 + 2]) < R + cell * 0.7;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const A = j * W + i, B = (j + 1) * W + i, C = j * W + i + 1, D = (j + 1) * W + i + 1;
      if ((i + j) % 2) { if (in_(A) && in_(B) && in_(C)) idx.push(A, B, C); if (in_(C) && in_(B) && in_(D)) idx.push(C, B, D); }
      else { if (in_(A) && in_(B) && in_(D)) idx.push(A, B, D); if (in_(A) && in_(D) && in_(C)) idx.push(A, D, C); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeBoundingSphere();
    return g;
  }
  buildWater() {
    this.waterUniforms = { uTime: { value: 0 } };
    this.water = new THREE.Mesh(this.waterDisk(LAKE.r + 40, 3.2), this.waterMaterial(true)); this.lakeMat = this.water.material;
    this.water.position.set(LAKE.x, WATER, LAKE.z); this.water.renderOrder = 2;
    this.group.add(this.water);
    // patak: három csúcs széles szalag a meder fölött
    const cm = this.waterMaterial(false);
    const pos = [], idx = [], pts = this.creekPts, W = 2.3;
    let lastY = 99;
    pts.forEach((p, i) => {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
      const tx = b.x - a.x, tz = b.z - a.z, l = Math.hypot(tx, tz) || 1, nx = -tz / l, nz = tx / l;
      let y = this.heightAt(p.x, p.z) + 0.42; y = Math.min(y, lastY + 0.05); lastY = y;
      if (Math.hypot(p.x - LAKE.x, p.z - LAKE.z) < LAKE.r + 4) y = Math.max(WATER, y);
      const off = (i % 2 ? 0.35 : -0.35);
      pos.push(p.x + nx * W, y, p.z + nz * W, p.x + nx * off, y, p.z + nz * off, p.x - nx * W, y, p.z - nz * W);
      if (i > 0) { const o = (i - 1) * 3; idx.push(o, o + 3, o + 1, o + 1, o + 3, o + 4, o + 1, o + 4, o + 2, o + 2, o + 4, o + 5); }
    });
    const cg = new THREE.BufferGeometry(); cg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); cg.setIndex(idx); cg.computeBoundingSphere();
    const creek = new THREE.Mesh(cg, cm); creek.renderOrder = 2; this.group.add(creek);
    // medence
    const pool = new THREE.Mesh(this.waterDisk(6.2, 1.6), cm); pool.position.set(this.pool.x, this.heightAt(this.pool.x, this.pool.z) + 0.75, this.pool.z); pool.renderOrder = 2; this.group.add(pool);
    this.poolY = pool.position.y;
    // vízesés a sziklafalon
    const t = WATERFALL_T, n = this.canyonNormal(t), c0 = this.canyonCurve.getPointAt(t), side = new THREE.Vector3(-n.z, 0, n.x);
    const wpos = [], wuv = [], widx = [], S = 18;
    for (let k = 0; k <= S; k++) {
      const f = k / S, off = lerp(19.5, 6.0, f);
      const cx = c0.x + n.x * off, cz = c0.z + n.z * off;
      let y = this.heightAt(cx, cz) + 0.45; if (k === S) y = this.poolY + 0.05;
      const w = lerp(1.6, 2.6, f);
      wpos.push(cx + side.x * w, y, cz + side.z * w, cx - side.x * w, y, cz - side.z * w); wuv.push(0, 1 - f, 1, 1 - f);
      if (k > 0) { const o = (k - 1) * 2; widx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); }
    }
    const wg = new THREE.BufferGeometry(); wg.setAttribute('position', new THREE.Float32BufferAttribute(wpos, 3)); wg.setAttribute('uv', new THREE.Float32BufferAttribute(wuv, 2)); wg.setIndex(widx);
    const wm = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: true,
      uniforms: { ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uTime: { value: 0 } }]), uLight: this.waterLight },
      vertexShader: `varying vec2 vUv;
        #include <fog_pars_vertex>
        void main(){ vUv = uv; vec4 mvPosition = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; uniform vec3 uLight; varying vec2 vUv;
        #include <fog_pars_fragment>
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
        float n2(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          float s = n2(vec2(vUv.x*14.0, vUv.y*5.0 + uTime*3.2))*0.6 + n2(vec2(vUv.x*30.0, vUv.y*11.0 + uTime*5.0))*0.4;
          vec3 col = mix(vec3(0.62,0.8,0.9), vec3(1.0), smoothstep(0.35, 0.8, s));
          float a = (0.55 + 0.4*s) * smoothstep(0.0, 0.22, vUv.x) * smoothstep(1.0, 0.78, vUv.x);
          gl_FragColor = vec4(col * uLight, a);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    this.fallUniform = wm.uniforms.uTime;
    const fall = new THREE.Mesh(wg, wm); fall.renderOrder = 3; this.group.add(fall);
    this.waterfallBase = new THREE.Vector3(c0.x + n.x * 6.5, this.poolY, c0.z + n.z * 6.5);
    this.waterfallTop = new THREE.Vector3(c0.x + n.x * 19.5, this.heightAt(c0.x + n.x * 19.5, c0.z + n.z * 19.5), c0.z + n.z * 19.5);
  }

  // ---------- ég, felhők ----------
  buildSky() {
    this.horizon = new THREE.Color('#cfe2ee');
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { top: { value: new THREE.Color('#3f7fd0') }, hor: { value: this.horizon }, gnd: { value: new THREE.Color('#9fb3a6') }, sunDir: { value: SUN_DIR } },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `varying vec3 vDir; uniform vec3 top, hor, gnd, sunDir;
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(hor, top, pow(clamp(h,0.0,1.0), 0.5));
          col = mix(col, gnd, smoothstep(0.0, -0.12, h));
          float s = max(dot(d, sunDir), 0.0);
          col += vec3(1.0,0.82,0.55)*pow(s, 6.0)*0.22 + vec3(1.0,0.96,0.88)*smoothstep(0.9993, 0.9997, s)*4.0;
          gl_FragColor = vec4(col,1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), mat);
    this.sky.frustumCulled = false; this.sky.renderOrder = -1;
    this.scene.add(this.sky);
    // low-poly felhők: lapított ikozaéder-csomók
    const r = mulberry32(17);
    this.cloudMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: 0.35, flatShading: true, fog: false });
    this.clouds = new THREE.Group(); const all = [];
    for (let i = 0; i < 22; i++) {
      const parts = [], n = 4 + Math.floor(r() * 3), sc = 13 + r() * 10;
      for (let k = 0; k < n; k++) {
        const g = new THREE.IcosahedronGeometry(sc * (0.75 + r() * 0.55) * (k === 0 || k === n - 1 ? 0.75 : 1), 0);
        g.scale(1, 0.58, 0.85); g.rotateY(r() * 3); g.translate((k - (n - 1) / 2) * sc * 1.15 + (r() - 0.5) * sc * 0.4, (r() - 0.3) * sc * 0.35, (r() - 0.5) * sc * 0.6);
        parts.push(g.index ? g.toNonIndexed() : g);
      }
      const cg = mergeGeometries(parts);
      const a = r() * Math.PI * 2, d = 300 + r() * 420;
      cg.rotateY(-a + Math.PI / 2 + (r() - 0.5) * 0.6); cg.translate(Math.cos(a) * d, 120 + r() * 100, Math.sin(a) * d);
      all.push(cg);
    }
    const cm = new THREE.Mesh(mergeGeometries(all), this.cloudMat); cm.frustumCulled = false; this.clouds.add(cm);
    this.scene.add(this.clouds);
  }

  // ---------- fák, sziklák ----------
  buildTrees() {
    const colorize = (g, c, vary = 0, seed = 1) => {
      const n = g.attributes.position.count, arr = new Float32Array(n * 3), r = mulberry32(seed), tmp = new THREE.Color();
      for (let i = 0; i < n; i++) { tmp.copy(c).multiplyScalar(1 - vary + r() * vary * 2); arr[i * 3] = tmp.r; arr[i * 3 + 1] = tmp.g; arr[i * 3 + 2] = tmp.b; }
      g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
    };
    const jitter = (g, amt, seed) => {
      const p = g.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        const h = hash2(Math.round(x * 97 + seed), Math.round(y * 89 + z * 61));
        const h2 = hash2(Math.round(z * 73 - seed), Math.round(x * 51 + y * 37));
        p.setXYZ(i, x * (1 + (h - 0.5) * amt), y + (h2 - 0.5) * amt * 0.8, z * (1 + (h2 - 0.5) * amt));
      }
      return g;
    };
    const prep = (g) => { const ng = g.index ? g.toNonIndexed() : g; ng.deleteAttribute('uv'); return ng; };
    const rk = new THREE.IcosahedronGeometry(1, 1);
    const rockGeo = colorize(jitter(prep(rk), 0.45, 3), new THREE.Color('#8d8880'), 0.12, 21);
    rockGeo.scale(1, 0.62, 1); rockGeo.computeVertexNormals();

    this.treeUniforms = { uTime: { value: 0 } };
    const TA = makeTreeAssets(this.treeUniforms.uTime); this.treeAssets = TA;
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }); this.rockMat = rockMat;
    const TYPES = { con: [TA.con, TA.conMat], dec: [TA.dec, TA.decMat], aut: [TA.dec, TA.autMat], birch: [TA.birch, TA.birchMat], apple: [TA.apple, TA.appleMat], rock: [rockGeo, rockMat] };

    const CH = 125, NC = Math.ceil(SIZE / CH);
    const chunks = [];
    for (let i = 0; i < NC * NC; i++) { const o = {}; for (const k in TYPES) o[k] = []; chunks.push(o); }
    const chunkOf = (x, z) => clamp(Math.floor((z + HALF) / CH), 0, NC - 1) * NC + clamp(Math.floor((x + HALF) / CH), 0, NC - 1);
    const rnd = mulberry32(99);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const blocked = (x, z, r) => this.path.at(x, z) < 3.2 + r || this.inArena(x, z, 6) || this.inYard(x, z, 6) ||
      dist(x, z, STABLE) < 18 || dist(x, z, HOUSE) < 16 || dist(x, z, LAKE) < LAKE.r + 4 || Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4 ||
      this.creek.at(x, z) < 4 + r || dist(x, z, this.pool) < 9 || this.inLavender(x, z, 4) || inRect(x, z, REG.farmYard, 6) || inRect(x, z, REG.garden, 4) || inRect(x, z, REG.orchard, 3);
    this.treeSpots = [];
    // ritkás erdő: a törzsek között mindig marad hely egy lónak
    const tg = new Map(), TG = 10;
    const crowded = (x, z, d) => {
      const i0 = Math.floor((x - d) / TG), i1 = Math.floor((x + d) / TG), j0 = Math.floor((z - d) / TG), j1 = Math.floor((z + d) / TG);
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) { const a = tg.get(i * 4096 + j); if (a) for (const t of a) if (Math.hypot(t.x - x, t.z - z) < d + t.sp) return true; }
      return false;
    };
    const addTree = (x, z, type, sc) => {
      { const k = Math.floor(x / TG) * 4096 + Math.floor(z / TG); let a = tg.get(k); if (!a) tg.set(k, a = []); a.push({ x, z, sp: type === 'con' ? 4.3 : type === 'birch' ? 3.0 : 3.6 }); }
      const h = this.heightAt(x, z);
      p.set(x, h - 0.15, z); q.setFromAxisAngle(up, rnd() * Math.PI * 2); s.set(sc * (0.9 + rnd() * 0.2), sc, sc * (0.9 + rnd() * 0.2));
      m.compose(p, q, s);
      const tint = 0.85 + rnd() * 0.3;
      chunks[chunkOf(x, z)][type].push({ m: m.clone(), c: new THREE.Color(tint, tint * (0.95 + rnd() * 0.1), tint * 0.9) });
      this.addCircle(x, z, (type === 'birch' ? 0.28 : 0.38) * sc, 50).dg = true;
      this.treeSpots.push({ x, z, type });
    };
    const addRock = (x, z, sc) => {
      const h = this.heightAt(x, z);
      p.set(x, h - sc * 0.15, z); q.setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * 6.28, rnd() * 0.3)); s.set(sc * (0.8 + rnd() * 0.5), sc, sc * (0.8 + rnd() * 0.5));
      m.compose(p, q, s);
      chunks[chunkOf(x, z)].rock.push({ m: m.clone(), c: new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rnd() * 0.25) });
      if (sc > 0.7) this.addCircle(x, z, sc * 0.85, sc * 0.6).dg = true;
    };
    const step = 7;
    for (let gz = -HALF; gz < HALF; gz += step) for (let gx = -HALF; gx < HALF; gx += step) {
      const x = gx + rnd() * step, z = gz + rnd() * step;
      const f = this.forestAt(x, z), h = this.heightAt(x, z);
      const sl = this.slopeAt(x, z);
      let pr = f * 0.5 + 0.012;
      if (h > 32) pr *= 0.4; if (h > 42) pr = 0;
      if (sl > 0.6) pr *= 0.2;
      if (rnd() < pr && !blocked(x, z, 1)) {
        if (h < WATER + 0.6) continue;
        const bi = this.birchAt(x, z), au = this.autumnAt(x, z);
        let type;
        if (rnd() < bi * 0.85) type = 'birch';
        else if (rnd() < au * 0.82) type = 'aut';
        else type = rnd() < 0.25 + smoothstep(4, 18, h) * 0.6 ? 'con' : 'dec';
        if (crowded(x, z, type === 'con' ? 4.3 : type === 'birch' ? 3.0 : 3.6)) continue;
        addTree(x, z, type, 0.8 + rnd() * 0.65);
      } else {
        const rk = this.rockyAt(x, z), dC = this.canyon.at(x, z);
        const prr = 0.01 + smoothstep(0.35, 0.8, sl) * 0.12 + smoothstep(20, 35, h) * 0.05 + rk * 0.16 + (dC > 7 && dC < 14 ? 0.08 : 0);
        if (rnd() < prr && !blocked(x, z, 1.5) && h > WATER + 0.2 && dist(x, z, REG.ruin) > 24) {
          addRock(x, z, (0.35 + rnd() * 1.1) * (h > 20 || rk > 0.5 ? 1.9 : 1));
        }
      }
    }
    // almáskert sorokban
    const O = REG.orchard;
    this.appleTrees = [];
    for (let x = O.x0 + 5; x < O.x1 - 2; x += 9) for (let z = O.z0 + 5; z < O.z1 - 2; z += 9) {
      const jx = x + (rnd() - 0.5) * 1.2, jz = z + (rnd() - 0.5) * 1.2;
      addTree(jx, jz, 'apple', 0.9 + rnd() * 0.25); this.appleTrees.push({ x: jx, z: jz });
    }
    // néhány fa a tanya körül
    const deco = [[-48, -12], [-52, -40], [-5, -55], [14, -48], [-38, -62], [96, 52], [104, -22], [70, 58], [-60, 25], [-30, 60], [60, -40], [30, 60], [-70, -20], [130, 300], [180, 310], [-10, 230]];
    for (const [x, z] of deco) if (!blocked(x, z, 1)) addTree(x, z, rnd() < 0.3 ? 'con' : 'dec', 0.9 + rnd() * 0.4);

    this.chunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const cx = -HALF + (i % NC + 0.5) * CH, cz = -HALF + (Math.floor(i / NC) + 0.5) * CH;
      for (const type in TYPES) {
        const list = c[type]; if (!list.length) continue;
        const [geo, mat] = TYPES[type];
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((it, k) => { im.setMatrixAt(k, it.m); im.setColorAt(k, it.c); });
        im.computeBoundingSphere();
        im.castShadow = false; im.receiveShadow = type === 'rock';
        this.group.add(im);
        this.chunks.push({ mesh: im, x: cx, z: cz });
      }
    }
    // árnyékvető proxyk: csak a közeli fák, csak az árnyéktérképbe (1-es réteg)
    this.allTrees = {}; for (const type in TYPES) this.allTrees[type] = [];
    chunks.forEach((c) => { for (const type in TYPES) for (const it of c[type]) this.allTrees[type].push(it.m); });
    this.shadowProxies = {};
    for (const type in TYPES) {
      const [geo, mat] = TYPES[type];
      const im = new THREE.InstancedMesh(geo, mat, 420); im.count = 0; im.castShadow = true; im.frustumCulled = false; im.layers.set(1);
      this.group.add(im); this.shadowProxies[type] = im;
    }
    this._lastShadow = new THREE.Vector2(1e9, 1e9);
  }

  updateShadowProxies(x, z) {
    if (Math.hypot(x - this._lastShadow.x, z - this._lastShadow.y) < 6) return;
    this._lastShadow.set(x, z);
    const tmp = new THREE.Vector3();
    for (const type in this.shadowProxies) {
      const im = this.shadowProxies[type]; let n = 0;
      for (const m of this.allTrees[type]) {
        const e = m.elements, dx = e[12] - x, dz = e[14] - z;
        if (dx * dx + dz * dz < 48 * 48 && n < 420) im.setMatrixAt(n++, m);
      }
      im.count = n; im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- levendulamező ----------
  buildLavender() {
    // low-poly levendulabokor: szürkészöld halom, lila virágtüskékkel
    const r = mulberry32(61), parts = [];
    const paint = (g, hex, vary, leafY) => {
      g = g.index ? g.toNonIndexed() : g; g.deleteAttribute('uv');
      const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
      for (let f = 0; f < p.count / 3; f++) { c.set(hex).multiplyScalar(1 - vary + hashF(p.getX(f * 3), p.getY(f * 3), p.getZ(f * 3)) * vary * 2); for (let k = 0; k < 3; k++) { const i = f * 3 + k; col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; } }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); return g;
    };
    const mound = new THREE.IcosahedronGeometry(0.42, 0); mound.scale(1, 0.62, 1); mound.translate(0, 0.2, 0); jitter(mound, 0.08, 3);
    parts.push(paint(mound, '#6f8f5a', 0.1));
    for (let k = 0; k < 6; k++) {
      const a = k / 6 * 6.28 + r() * 0.5, d = 0.12 + r() * 0.16, h = 0.34 + r() * 0.16;
      const sp = new THREE.ConeGeometry(0.06, h, 4); sp.translate(0, h / 2, 0); sp.rotateZ((r() - 0.5) * 0.4); sp.rotateX((r() - 0.5) * 0.4);
      sp.translate(Math.cos(a) * d, 0.34, Math.sin(a) * d);
      parts.push(paint(sp, r() < 0.5 ? '#8a5cc8' : '#9d6fd6', 0.08));
    }
    const g = mergeGeometries(parts); g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }); this.lavenderMat = mat;
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTime = this.treeUniforms.uTime;
      sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        float ph = instanceMatrix[3][0]*0.4 + instanceMatrix[3][2]*0.3; transformed.x += sin(uTime*2.0 + ph) * max(position.y - 0.3, 0.0) * 0.12;`);
    };
    const L = REG.lavender, items = [], rnd = mulberry32(62);
    for (let z = L.z0 + 2; z < L.z1 - 1; z += 2.9) for (let x = L.x0 + 1.5; x < L.x1 - 1; x += 1.6) {
      if (this.path.at(x, z) < 3) continue;
      items.push([x + (rnd() - 0.5) * 0.3, z + (rnd() - 0.5) * 0.3, 0.85 + rnd() * 0.35]);
    }
    const im = new THREE.InstancedMesh(g, mat, items.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    items.forEach(([x, z, s], k) => { q.setFromAxisAngle(up, rnd() * 3); m.compose(new THREE.Vector3(x, this.heightAt(x, z) - 0.05, z), q, new THREE.Vector3(s, s * (0.9 + rnd() * 0.25), s)); im.setMatrixAt(k, m); });
    im.computeBoundingSphere(); im.receiveShadow = true;
    this.group.add(im);
  }

  updateChunks(cam) {
    for (const c of this.chunks) {
      const d = Math.hypot(c.x - cam.x, c.z - cam.z);
      c.mesh.visible = d < 410;
    }
  }

  // ---------- ütközők ----------
  addCircle(x, z, r, h = 99) {
    const c = { x, z, r, h };
    const i0 = Math.floor((x - r) / 8), i1 = Math.floor((x + r) / 8), j0 = Math.floor((z - r) / 8), j1 = Math.floor((z + r) / 8);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = i * 4096 + j; let a = this.circles.get(k); if (!a) { a = []; this.circles.set(k, a); } a.push(c);
    }
    return c;
  }
  addBox(x, z, hw, hd, yaw, h, data = null) {
    const b = { x, z, hw, hd, yaw, c: Math.cos(yaw), s: Math.sin(yaw), h, data, br: Math.hypot(hw, hd) };
    this.boxes.push(b); return b;
  }
  // kör (p,r) kitolása az akadályokból; lift = a ló pillanatnyi magassága ugrás közben
  // fa/szikla a haladási irányban → merre érdemes kikerülni (-1..1, jobbra pozitív)
  dodge(x, z, fx, fz, look, body) {
    const rx = fz, rz = -fx; let best = 0, bw = 0;
    const i0 = Math.floor((x - look) / 8), i1 = Math.floor((x + look) / 8), j0 = Math.floor((z - look) / 8), j1 = Math.floor((z + look) / 8);
    const seen = this._seenD || (this._seenD = new Set()); seen.clear();
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const a = this.circles.get(i * 4096 + j); if (!a) continue;
      for (const c of a) {
        if (seen.has(c) || !c.dg) continue; seen.add(c);
        const dx = c.x - x, dz = c.z - z, al = dx * fx + dz * fz; if (al < 0.6 || al > look) continue;
        const lat = dx * rx + dz * rz, clr = c.r + body;
        if (Math.abs(lat) >= clr) continue;
        const w = (1 - Math.abs(lat) / clr) * (1 - al / look);
        if (w > bw) { bw = w; best = (lat > 0 ? -1 : 1) * w; }
      }
    }
    return best;
  }
  // kamera-szakasz: az első fal/épület metszése (0..1), y magasságban
  segmentHit(ax, az, bx, bz, y, pad = 0.2) {
    let best = 1; const mx = Math.min(ax, bx), Mx = Math.max(ax, bx), mz = Math.min(az, bz), Mz = Math.max(az, bz);
    for (const b of this.boxes) {
      if (b.only === 'horse' || b.h + 0.05 < y) continue;
      if (b.x + b.br + pad < mx || b.x - b.br - pad > Mx || b.z + b.br + pad < mz || b.z - b.br - pad > Mz) continue;
      const tl = (px, pz) => { const dx = px - b.x, dz = pz - b.z; return [dx * b.c - dz * b.s, dx * b.s + dz * b.c]; };
      const [a0, f0] = tl(ax, az), [a1, f1] = tl(bx, bz);
      let t0 = 0, t1 = 1; const da = a1 - a0, df = f1 - f0, ha = b.hw + pad, hf = b.hd + pad;
      const slab = (o, d, h) => { if (Math.abs(d) < 1e-9) return o >= -h && o <= h; let u0 = (-h - o) / d, u1 = (h - o) / d; if (u0 > u1) [u0, u1] = [u1, u0]; t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); return t0 <= t1; };
      if (slab(a0, da, ha) && slab(f0, df, hf) && t0 < best) best = t0;
    }
    return best;
  }
  resolve(p, r, lift, who = 'horse') {
    let hit = false;
    const i = Math.floor(p.x / 8), j = Math.floor(p.z / 8);
    const seen = this._seen || (this._seen = new Set()); seen.clear();
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const a = this.circles.get((i + di) * 4096 + (j + dj)); if (!a) continue;
      for (const c of a) {
        if (seen.has(c)) continue; seen.add(c);
        if (lift > c.h) continue;
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), m = r + c.r;
        if (d < m && d > 1e-4) { p.x = c.x + dx / d * m; p.z = c.z + dz / d * m; hit = true; }
      }
    }
    for (const b of this.boxes) {
      const dx = p.x - b.x, dz = p.z - b.z;
      if (Math.abs(dx) > b.br + r || Math.abs(dz) > b.br + r) continue;
      if (b.only && b.only !== who) continue;
      if (lift > (b.data ? b.h - 0.3 : b.h)) continue;
      const la = dx * b.c - dz * b.s, lf = dx * b.s + dz * b.c;
      const ca = clamp(la, -b.hw, b.hw), cf = clamp(lf, -b.hd, b.hd);
      let ea = la - ca, ef = lf - cf; let d = Math.hypot(ea, ef);
      if (d >= r) continue;
      if (d < 1e-4) {
        const pa = b.hw - Math.abs(la), pf = b.hd - Math.abs(lf);
        if (pa < pf) { const na = (Math.sign(la) || 1) * (b.hw + r); p.x = b.x + na * b.c + lf * b.s; p.z = b.z - na * b.s + lf * b.c; }
        else { const nf = (Math.sign(lf) || 1) * (b.hd + r); p.x = b.x + la * b.c + nf * b.s; p.z = b.z - la * b.s + nf * b.c; }
        hit = true; continue;
      }
      const k = r / d; const na = ca + ea * k, nf = cf + ef * k;
      p.x = b.x + na * b.c + nf * b.s; p.z = b.z - na * b.s + nf * b.c; hit = true;
    }
    return hit;
  }

  // ---------- térkép ----------
  renderMap(size = 512) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d'); const img = ctx.createImageData(size, size); const c = new THREE.Color();
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = -HALF + (i + 0.5) / size * SIZE, z = -HALF + (j + 0.5) / size * SIZE;
      const h = this.heightAt(x, z);
      this.gridColor(x, z, c);
      let r = c.r, g = c.g, b = c.b;
      const f = this.forestAt(x, z); r *= 1 - f * 0.35; g *= 1 - f * 0.25; b *= 1 - f * 0.35;
      if (h < WATER || this.creek.at(x, z) < 1.9 || dist(x, z, this.pool) < 6) { const t = h < WATER ? clamp((WATER - h) / 1.5, 0.4, 1) : 0.75; r = lerp(r, 0.12, t); g = lerp(g, 0.32, t); b = lerp(b, 0.55, t); }
      if (this.inArena(x, z)) { r = 0.75; g = 0.62; b = 0.42; }
      if (this.inYard(x, z)) { r = 0.5; g = 0.45; b = 0.38; }
      if (this.inLavender(x, z) && (Math.floor((z - REG.lavender.z0) / 2.9) % 1 === 0)) { r = lerp(r, 0.42, 0.6); g = lerp(g, 0.28, 0.6); b = lerp(b, 0.62, 0.6); }
      const shade = clamp(1 + (this.heightAt(x - 2, z - 2) - h) * 0.12, 0.65, 1.35);
      const k = (j * size + i) * 4;
      img.data[k] = Math.pow(clamp(r * shade, 0, 1), 1 / 2.2) * 255; img.data[k + 1] = Math.pow(clamp(g * shade, 0, 1), 1 / 2.2) * 255;
      img.data[k + 2] = Math.pow(clamp(b * shade, 0, 1), 1 / 2.2) * 255; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const sx = (x) => (x + HALF) / SIZE * size;
    ctx.fillStyle = '#8a3b2a'; ctx.fillRect(sx(STABLE.x - STABLE.w / 2), sx(STABLE.z - STABLE.d / 2), STABLE.w / SIZE * size, STABLE.d / SIZE * size);
    ctx.fillStyle = '#a5503a'; ctx.fillRect(sx(HOUSE.x - HOUSE.w / 2), sx(HOUSE.z - HOUSE.d / 2), HOUSE.w / SIZE * size, HOUSE.d / SIZE * size);
    ctx.fillStyle = '#9a3b2a'; ctx.fillRect(sx(REG.farm.x - 6), sx(REG.farm.z - 4), 12 / SIZE * size, 8 / SIZE * size);
    ctx.fillStyle = '#7d776c'; ctx.beginPath(); ctx.arc(sx(REG.ruin.x), sx(REG.ruin.z), 14 / SIZE * size, 0, 7); ctx.fill();
    return cv;
  }
}
