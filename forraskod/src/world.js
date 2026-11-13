import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { makeNoise2D, fbm, mulberry32, hash2, clamp, lerp, smoothstep } from './noise.js';
import { canvasTexture } from './geom.js';
import { makeTreeAssets } from './trees.js';

export const SIZE = 700, HALF = 350, SEG = 240, CELL = SIZE / SEG, G = SEG + 1;
export const WATER = -0.9;
export const HOME = { x: 25, z: 0 };
export const STABLE = { x: -20, z: -37, w: 13, d: 9 };
export const TIE = { x: -20, z: -25 };
export const ARENA = { x: 45, z: 15, hw: 42, hd: 24 };
export const LAKE = { x: -175, z: 45, r: 48 };
export const YARD = { x0: -36, x1: -4, z0: -33, z1: -14 };
export const SUN_DIR = new THREE.Vector3(0.55, 0.64, 0.42).normalize();

const nA = makeNoise2D(11), nB = makeNoise2D(23), nC = makeNoise2D(37), nD = makeNoise2D(53), nE = makeNoise2D(71);

const PATH_CTRL = [[-6, 32], [-40, 75], [-70, 132], [-120, 152], [-178, 124], [-242, 62], [-238, -22], [-200, -112],
  [-130, -172], [-50, -214], [40, -200], [122, -150], [200, -108], [236, -20], [222, 82], [170, 162], [92, 212], [22, 182], [-14, 108]];

const COL = {
  grassA: new THREE.Color('#4f7f2c'), grassB: new THREE.Color('#6f9a3a'), dry: new THREE.Color('#a39f55'),
  forest: new THREE.Color('#3d6527'), dirt: new THREE.Color('#8a6c4a'), dirt2: new THREE.Color('#9b7d58'),
  sand: new THREE.Color('#cdbb8c'), mud: new THREE.Color('#6b5f45'), rock: new THREE.Color('#7f7b74'),
  rock2: new THREE.Color('#999389'), snow: new THREE.Color('#f2f4f7'),
};

export class World {
  constructor(scene, quality) {
    this.scene = scene; this.quality = quality;
    this.group = new THREE.Group(); scene.add(this.group);
    this.circles = new Map(); this.boxes = [];
    this.buildPath();
    this.buildHeights();
    this.buildGrids();
    this.buildTerrain();
    this.buildWater();
    this.buildSky();
    this.buildTrees();
  }

  // ---------- ösvény ----------
  buildPath() {
    const pts = PATH_CTRL.map(([x, z]) => new THREE.Vector3(x, 0, z));
    this.pathCurve = new THREE.CatmullRomCurve3(pts, true, 'centripetal');
    const len = this.pathCurve.getLength();
    this.pathLen = len;
    this.pathPts = this.pathCurve.getSpacedPoints(Math.floor(len));
    const R = 2, N = SIZE / R;
    this.pdN = N;
    this.pd = new Float32Array(N * N).fill(99);
    for (const p of this.pathPts) {
      const ci = Math.floor((p.x + HALF) / R), cj = Math.floor((p.z + HALF) / R);
      for (let dj = -5; dj <= 5; dj++) for (let di = -5; di <= 5; di++) {
        const i = ci + di, j = cj + dj; if (i < 0 || j < 0 || i >= N || j >= N) continue;
        const cx = -HALF + (i + 0.5) * R, cz = -HALF + (j + 0.5) * R;
        const d = Math.hypot(cx - p.x, cz - p.z);
        const k = j * N + i; if (d < this.pd[k]) this.pd[k] = d;
      }
    }
  }
  pathDist(x, z) {
    const N = this.pdN; let i = Math.floor((x + HALF) / 2), j = Math.floor((z + HALF) / 2);
    if (i < 0 || j < 0 || i >= N || j >= N) return 99;
    return this.pd[j * N + i];
  }

  rawHeight(x, z) {
    let h0 = fbm(nA, x * 0.0035, z * 0.0035, 4) * 15;
    let h = 1.4 + (h0 > 0 ? h0 : h0 * 0.12) + fbm(nB, x * 0.018, z * 0.018, 3) * 1.5;
    const de = Math.max(Math.abs(x), Math.abs(z));
    const m = smoothstep(232, 345, de);
    h += m * m * (48 + 26 * nC(x * 0.012, z * 0.012)) + m * 6 * nE(x * 0.05, z * 0.05);
    const dh = Math.hypot(x - HOME.x, z - HOME.z);
    h = lerp(0, h, smoothstep(88, 140, dh));
    const dl0 = Math.hypot(x - LAKE.x, z - LAKE.z);
    h = lerp(Math.min(h, 1.2), h, smoothstep(LAKE.r + 25, LAKE.r + 90, dl0));
    const dl = dl0 + nD(x * 0.03, z * 0.03) * 7;
    h = lerp(-3.6, h, smoothstep(LAKE.r * 0.4, LAKE.r + 26, dl));
    const pd = this.pathDist(x, z);
    h -= 0.14 * (1 - smoothstep(0.5, 3, pd));
    return h;
  }

  buildHeights() {
    this.H = new Float32Array(G * G);
    for (let j = 0; j < G; j++) for (let i = 0; i < G; i++)
      this.H[j * G + i] = this.rawHeight(-HALF + i * CELL, -HALF + j * CELL);
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
    let f = smoothstep(0.08, 0.34, fbm(nD, x * 0.006 + 40, z * 0.006 - 20, 3));
    f *= smoothstep(105, 150, Math.hypot(x - HOME.x, z - HOME.z));
    return f;
  }

  groundColor(x, z, h, slope, out) {
    const n1 = nB(x * 0.035, z * 0.035) * 0.5 + 0.5, n2 = nC(x * 0.008 + 10, z * 0.008) * 0.5 + 0.5;
    out.copy(COL.grassA).lerp(COL.grassB, n1);
    out.lerp(COL.dry, smoothstep(0.62, 0.9, n2) * 0.55);
    out.lerp(COL.forest, this.forestAt(x, z) * 0.75);
    if (h < WATER + 0.7) out.lerp(COL.sand, smoothstep(WATER + 0.7, WATER + 0.15, h));
    if (h < WATER - 0.2) out.lerp(COL.mud, smoothstep(WATER - 0.2, WATER - 1.2, h));
    out.lerp(n1 > 0.5 ? COL.rock : COL.rock2, smoothstep(0.42, 0.72, slope) * 0.9);
    out.lerp(COL.rock, smoothstep(26, 34, h));
    out.lerp(COL.snow, smoothstep(50, 58, h + n2 * 6));
    const pd = this.pathDist(x, z);
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
      d *= smoothstep(1.8, 3.2, this.pd[k]);
      d *= smoothstep(WATER + 0.25, WATER + 0.7, h);
      d *= 1 - smoothstep(0.45, 0.65, sl);
      d *= 1 - smoothstep(22, 28, h);
      if (this.inArena(x, z, 1.5) || this.inYard(x, z, 0.5)) d = 0;
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
    const detail = canvasTexture(256, 256, (ctx, w, h) => {
      const img = ctx.createImageData(w, h); const r = mulberry32(5);
      for (let i = 0; i < w * h; i++) { const v = 200 + r() * 55; img.data[i * 4] = v; img.data[i * 4 + 1] = v; img.data[i * 4 + 2] = v; img.data[i * 4 + 3] = 255; }
      ctx.putImageData(img, 0, 0);
      for (let i = 0; i < 900; i++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '255,255,235' : '60,70,40'},${0.05 + r() * 0.08})`; const s = 1 + r() * 4; ctx.fillRect(r() * w, r() * h, s, s * (0.5 + r())); }
    });
    detail.wrapS = detail.wrapT = THREE.RepeatWrapping;
    detail.anisotropy = 4;
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
    this.terrain = new THREE.Mesh(g, mat);
    this.terrain.receiveShadow = true;
    this.group.add(this.terrain);
  }

  // ---------- víz ----------
  buildWater() {
    const geo = new THREE.CircleGeometry(LAKE.r + 40, 64); geo.rotateX(-Math.PI / 2);
    this.waterUniforms = {
      uTime: { value: 0 }, uSun: { value: SUN_DIR }, uDeep: { value: new THREE.Color('#1d4f6e') },
      uShallow: { value: new THREE.Color('#4f8f8c') }, uSky: { value: new THREE.Color('#b8d6ee') },
      uLake: { value: new THREE.Vector3(LAKE.x, LAKE.z, LAKE.r) },
    };
    const mat = new THREE.ShaderMaterial({
      transparent: true, fog: true, depthWrite: false,
      uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, this.waterUniforms]),
      vertexShader: `varying vec3 vW;
        #include <fog_pars_vertex>
        void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vec4 mvPosition = viewMatrix*w; gl_Position = projectionMatrix*mvPosition;
        #include <fog_vertex>
        }`,
      fragmentShader: `uniform float uTime; uniform vec3 uSun, uDeep, uShallow, uSky, uLake; varying vec3 vW;
        #include <fog_pars_fragment>
        float wh(vec2 p){ float t=uTime; return sin(p.x*0.6+t*1.3)*0.5+sin(p.y*0.7-t*1.1)*0.5+sin((p.x+p.y)*1.6+t*2.3)*0.25+sin((p.x-p.y)*2.9-t*2.9)*0.12+sin(p.x*5.1+p.y*3.3+t*4.0)*0.05; }
        void main(){
          vec2 p = vW.xz; float e = 0.15;
          float h0 = wh(p); vec3 n = normalize(vec3(-(wh(p+vec2(e,0.))-h0)/e*0.08, 1.0, -(wh(p+vec2(0.,e))-h0)/e*0.08));
          vec3 v = normalize(cameraPosition - vW);
          float fr = pow(1.0 - max(dot(n, v), 0.0), 4.0);
          float dc = distance(p, uLake.xy); float deep = smoothstep(uLake.z*0.95, uLake.z*0.35, dc);
          vec3 col = mix(uShallow, uDeep, deep);
          col = mix(col, uSky, 0.12 + fr*0.75);
          float sp = pow(max(dot(reflect(-uSun, n), v), 0.0), 180.0);
          col += vec3(1.0,0.95,0.85)*sp*2.5;
          float a = clamp(0.62 + deep*0.3 + fr*0.3, 0.0, 0.97);
          gl_FragColor = vec4(col, a);
          #include <colorspace_fragment>
          #include <fog_fragment>
        }`,
    });
    for (const k in this.waterUniforms) mat.uniforms[k] = this.waterUniforms[k];
    this.water = new THREE.Mesh(geo, mat);
    this.water.position.set(LAKE.x, WATER, LAKE.z);
    this.water.renderOrder = 2;
    this.group.add(this.water);
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
    const cloudTex = (seed) => canvasTexture(256, 128, (ctx, w, h) => {
      const r = mulberry32(seed);
      const puffs = [];
      for (let i = 0; i < 22; i++) { const t = r(); puffs.push([w * (0.15 + t * 0.7), h * (0.62 - Math.sin(t * Math.PI) * (0.18 + r() * 0.16)), 14 + Math.sin(t * Math.PI) * (16 + r() * 18)]); }
      for (const [x, y, rad] of puffs) { const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.72, 'rgba(255,255,255,0.92)'); g.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill(); }
      ctx.globalCompositeOperation = 'source-atop';
      const sh = ctx.createLinearGradient(0, h * 0.3, 0, h * 0.8); sh.addColorStop(0, 'rgba(255,250,240,0)'); sh.addColorStop(1, 'rgba(150,165,190,0.55)');
      ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'source-over';
    });
    const ctexs = [cloudTex(9), cloudTex(19), cloudTex(29)];
    const r = mulberry32(17);
    this.clouds = new THREE.Group();
    for (let i = 0; i < 18; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: ctexs[i % 3], fog: false, depthWrite: false, transparent: true, opacity: 0.85 + r() * 0.15 }));
      const a = r() * Math.PI * 2, d = 260 + r() * 420;
      sp.position.set(Math.cos(a) * d, 120 + r() * 100, Math.sin(a) * d);
      const sc = 130 + r() * 150; sp.scale.set(sc, sc * 0.5, 1);
      this.clouds.add(sp);
    }
    this.scene.add(this.clouds);
  }

  // ---------- fák, sziklák ----------
  buildTrees() {
    const trunkC = new THREE.Color('#5a3d26'), trunkC2 = new THREE.Color('#7a5a3e');
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
    // szikla
    const rk = new THREE.IcosahedronGeometry(1, 1);
    const rockGeo = colorize(jitter(prep(rk), 0.45, 3), new THREE.Color('#8d8880'), 0.12, 21);
    rockGeo.scale(1, 0.62, 1); rockGeo.computeVertexNormals();

    this.treeUniforms = { uTime: { value: 0 } };
    const TA = makeTreeAssets(this.treeUniforms.uTime);
    const conGeo = TA.con, decGeo = TA.dec;
    const rockMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

    const CH = 87.5, NC = Math.ceil(SIZE / CH);
    const chunks = [];
    for (let i = 0; i < NC * NC; i++) chunks.push({ con: [], dec: [], rock: [] });
    const chunkOf = (x, z) => clamp(Math.floor((z + HALF) / CH), 0, NC - 1) * NC + clamp(Math.floor((x + HALF) / CH), 0, NC - 1);
    const rnd = mulberry32(99);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const blocked = (x, z, r) => this.pathDist(x, z) < 3.2 + r || this.inArena(x, z, 6) || this.inYard(x, z, 6) ||
      Math.hypot(x - STABLE.x, z - STABLE.z) < 16 || Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.r + 4 || Math.abs(x) > HALF - 4 || Math.abs(z) > HALF - 4;
    const addTree = (x, z, type, sc) => {
      const h = this.heightAt(x, z);
      p.set(x, h - 0.15, z); q.setFromAxisAngle(up, rnd() * Math.PI * 2); s.set(sc * (0.9 + rnd() * 0.2), sc, sc * (0.9 + rnd() * 0.2));
      m.compose(p, q, s);
      const tint = 0.85 + rnd() * 0.3;
      chunks[chunkOf(x, z)][type].push({ m: m.clone(), c: new THREE.Color(tint, tint * (0.95 + rnd() * 0.1), tint * 0.9) });
      this.addCircle(x, z, 0.38 * sc, 50);
    };
    const step = 7;
    for (let gz = -HALF; gz < HALF; gz += step) for (let gx = -HALF; gx < HALF; gx += step) {
      const x = gx + rnd() * step, z = gz + rnd() * step;
      const f = this.forestAt(x, z), h = this.heightAt(x, z);
      const sl = this.slopeAt(x, z);
      let pr = f * 0.72 + 0.02;
      if (h > 30) pr *= 0.4; if (h > 40) pr = 0;
      if (sl > 0.6) pr *= 0.2;
      if (rnd() < pr && !blocked(x, z, 1)) {
        if (h < WATER + 0.6) continue;
        const conP = 0.25 + smoothstep(4, 18, h) * 0.6;
        addTree(x, z, rnd() < conP ? 'con' : 'dec', 0.75 + rnd() * 0.65);
      } else if (rnd() < 0.012 + smoothstep(0.35, 0.8, sl) * 0.12 + smoothstep(20, 35, h) * 0.05 && !blocked(x, z, 1.5) && h > WATER + 0.2) {
        const sc = (0.35 + rnd() * 1.1) * (h > 20 ? 2.2 : 1);
        p.set(x, h - sc * 0.15, z); q.setFromEuler(new THREE.Euler(rnd() * 0.3, rnd() * 6.28, rnd() * 0.3)); s.set(sc * (0.8 + rnd() * 0.5), sc, sc * (0.8 + rnd() * 0.5));
        m.compose(p, q, s);
        chunks[chunkOf(x, z)].rock.push({ m: m.clone(), c: new THREE.Color(1, 1, 1).multiplyScalar(0.85 + rnd() * 0.25) });
        if (sc > 0.7) this.addCircle(x, z, sc * 0.85, sc * 0.6);
      }
    }
    // néhány fa a tanya körül
    const deco = [[-48, -12], [-52, -40], [-5, -55], [14, -48], [-38, -62], [96, 52], [104, -22], [70, 58], [-60, 25], [-30, 60], [118, 18], [60, -40], [30, 60], [-70, -20], [85, -35]];
    for (const [x, z] of deco) if (!blocked(x, z, 1)) addTree(x, z, rnd() < 0.3 ? 'con' : 'dec', 0.9 + rnd() * 0.4);

    this.chunks = [];
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      const cx = -HALF + (i % NC + 0.5) * CH, cz = -HALF + (Math.floor(i / NC) + 0.5) * CH;
      for (const [type, geo, mat, shadow] of [['con', conGeo, TA.conMat, true], ['dec', decGeo, TA.decMat, true], ['rock', rockGeo, rockMat, true]]) {
        const list = c[type]; if (!list.length) continue;
        const im = new THREE.InstancedMesh(geo, mat, list.length);
        list.forEach((it, k) => { im.setMatrixAt(k, it.m); im.setColorAt(k, it.c); });
        im.computeBoundingSphere();
        im.castShadow = shadow; im.receiveShadow = type === 'rock';
        this.group.add(im);
        this.chunks.push({ mesh: im, x: cx, z: cz });
      }
    }
  }

  updateChunks(cam) {
    for (const c of this.chunks) {
      const d = Math.hypot(c.x - cam.x, c.z - cam.z);
      c.mesh.visible = d < 560;
    }
  }

  // ---------- ütközők ----------
  addCircle(x, z, r, h = 99) {
    const c = { x, z, r, h };
    const i0 = Math.floor((x - r) / 8), i1 = Math.floor((x + r) / 8), j0 = Math.floor((z - r) / 8), j1 = Math.floor((z + r) / 8);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = i * 4096 + j; let a = this.circles.get(k); if (!a) { a = []; this.circles.set(k, a); } a.push(c);
    }
  }
  addBox(x, z, hw, hd, yaw, h, data = null) {
    const b = { x, z, hw, hd, yaw, c: Math.cos(yaw), s: Math.sin(yaw), h, data, br: Math.hypot(hw, hd) };
    this.boxes.push(b); return b;
  }
  // kör (p,r) kitolása az akadályokból; lift = a ló pillanatnyi magassága ugrás közben
  resolve(p, r, lift) {
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
      if (lift > (b.data ? b.h - 0.3 : b.h)) continue;
      // helyi tengelyek: a = keresztben (hw), f = hosszában (hd)
      const la = dx * b.c - dz * b.s, lf = dx * b.s + dz * b.c;
      const ca = clamp(la, -b.hw, b.hw), cf = clamp(lf, -b.hd, b.hd);
      let ea = la - ca, ef = lf - cf; let d = Math.hypot(ea, ef);
      if (d >= r) continue;
      if (d < 1e-4) { // belül: a legközelebbi oldalra
        const pa = b.hw - Math.abs(la), pf = b.hd - Math.abs(lf);
        if (pa < pf) { ea = Math.sign(la) || 1; ef = 0; d = 0; const na = Math.sign(la) * (b.hw + r); const nf = lf; p.x = b.x + na * b.c + nf * b.s; p.z = b.z - na * b.s + nf * b.c; }
        else { const nf = (Math.sign(lf) || 1) * (b.hd + r); p.x = b.x + la * b.c + nf * b.s; p.z = b.z - la * b.s + nf * b.c; }
        hit = true; continue;
      }
      const k = r / d; const na = ca + ea * k, nf = cf + ef * k;
      p.x = b.x + na * b.c + nf * b.s; p.z = b.z - na * b.s + nf * b.c; hit = true;
    }
    return hit;
  }

  // ---------- minitérkép ----------
  renderMap(size = 320) {
    const cv = document.createElement('canvas'); cv.width = cv.height = size;
    const ctx = cv.getContext('2d'); const img = ctx.createImageData(size, size); const c = new THREE.Color();
    for (let j = 0; j < size; j++) for (let i = 0; i < size; i++) {
      const x = -HALF + (i + 0.5) / size * SIZE, z = -HALF + (j + 0.5) / size * SIZE;
      const h = this.heightAt(x, z);
      this.gridColor(x, z, c);
      let r = c.r, g = c.g, b = c.b;
      const f = this.forestAt(x, z); r *= 1 - f * 0.35; g *= 1 - f * 0.25; b *= 1 - f * 0.35;
      if (h < WATER) { const t = clamp((WATER - h) / 1.5, 0.4, 1); r = lerp(r, 0.12, t); g = lerp(g, 0.32, t); b = lerp(b, 0.55, t); }
      if (this.inArena(x, z)) { r = 0.75; g = 0.62; b = 0.42; }
      if (this.inYard(x, z)) { r = 0.5; g = 0.45; b = 0.38; }
      const shade = clamp(1 + (this.heightAt(x - 2, z - 2) - h) * 0.12, 0.7, 1.3);
      const k = (j * size + i) * 4;
      img.data[k] = Math.pow(clamp(r * shade, 0, 1), 1 / 2.2) * 255; img.data[k + 1] = Math.pow(clamp(g * shade, 0, 1), 1 / 2.2) * 255;
      img.data[k + 2] = Math.pow(clamp(b * shade, 0, 1), 1 / 2.2) * 255; img.data[k + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const sx = (x) => (x + HALF) / SIZE * size;
    ctx.fillStyle = '#8a3b2a'; ctx.fillRect(sx(STABLE.x - STABLE.w / 2), sx(STABLE.z - STABLE.d / 2), STABLE.w / SIZE * size, STABLE.d / SIZE * size);
    return cv;
  }
}
