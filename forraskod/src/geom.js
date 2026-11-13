import * as THREE from 'three';

function cr(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

// Gyűrűk (középpont + két sugár) mentén sima, zárt testet húz ki.
// rings: [{p:[x,y,z], rx, ry}], rx az oldalirány, ry a "fel" irány sugara.
export function loftSamples(rings, { up = [0, 1, 0], sub = 4 } = {}) {
  const n = rings.length, out = [];
  for (let i = 0; i < n - 1; i++) {
    const r0 = rings[Math.max(0, i - 1)], r1 = rings[i], r2 = rings[i + 1], r3 = rings[Math.min(n - 1, i + 2)];
    for (let s = 0; s < sub; s++) {
      const t = s / sub;
      out.push({
        p: new THREE.Vector3(cr(r0.p[0], r1.p[0], r2.p[0], r3.p[0], t), cr(r0.p[1], r1.p[1], r2.p[1], r3.p[1], t), cr(r0.p[2], r1.p[2], r2.p[2], r3.p[2], t)),
        rx: Math.max(0.002, cr(r0.rx, r1.rx, r2.rx, r3.rx, t)),
        ry: Math.max(0.002, cr(r0.ry, r1.ry, r2.ry, r3.ry, t)),
      });
    }
  }
  const L = rings[n - 1];
  out.push({ p: new THREE.Vector3(...L.p), rx: L.rx, ry: L.ry });
  const upV = new THREE.Vector3(...up);
  for (let i = 0; i < out.length; i++) {
    const a = out[Math.max(0, i - 1)].p, b = out[Math.min(out.length - 1, i + 1)].p;
    const T = b.clone().sub(a).normalize();
    const S = new THREE.Vector3().crossVectors(T, upV).normalize();
    const U = new THREE.Vector3().crossVectors(S, T).normalize();
    out[i].T = T; out[i].S = S; out[i].U = U;
  }
  return out;
}

export function loft(rings, opts = {}) {
  const { radial = 18, power = 2, cap = true } = opts;
  const smp = loftSamples(rings, opts);
  const pos = [], idx = [];
  const e = 2 / power;
  for (const s of smp) {
    for (let j = 0; j < radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const c = Math.cos(a), sn = Math.sin(a);
      const cx = Math.sign(c) * Math.pow(Math.abs(c), e), sy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
      pos.push(s.p.x + s.S.x * s.rx * cx + s.U.x * s.ry * sy,
        s.p.y + s.S.y * s.rx * cx + s.U.y * s.ry * sy,
        s.p.z + s.S.z * s.rx * cx + s.U.z * s.ry * sy);
    }
  }
  const R = radial, N = smp.length;
  for (let i = 0; i < N - 1; i++) {
    for (let j = 0; j < R; j++) {
      const a00 = i * R + j, a01 = i * R + (j + 1) % R, a10 = (i + 1) * R + j, a11 = (i + 1) * R + (j + 1) % R;
      idx.push(a00, a10, a01, a01, a10, a11);
    }
  }
  if (cap) {
    const c0 = pos.length / 3; const p0 = smp[0].p; pos.push(p0.x, p0.y, p0.z);
    for (let j = 0; j < R; j++) idx.push(c0, j, (j + 1) % R);
    const c1 = pos.length / 3; const p1 = smp[N - 1].p; pos.push(p1.x, p1.y, p1.z);
    const b = (N - 1) * R;
    for (let j = 0; j < R; j++) idx.push(c1, b + (j + 1) % R, b + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  g.userData.samples = smp;
  return g;
}

// Végtagszakasz a csuklópontból lefelé (-y), profile: [t, rx, ry, dz]
export function limb(L, profile, radial = 12) {
  const rings = profile.map(([t, rx, ry, dz = 0]) => ({ p: [0, -t * L, dz], rx, ry }));
  return loft(rings, { up: [0, 0, 1], radial, sub: 3 });
}

// Felület, ami egy loft-test palástját követi (nyereg, alátét, takaró).
// smp: loftSamples, iFrom..iTo minta-tartomány, a0..a1 szögtartomány (0 = oldal, PI/2 = teteje),
// off(u, v) kifelé eltolás, u: 0..1 hosszában, v: 0..1 szögben.
export function shell(smp, iFrom, iTo, a0, a1, off, { cols = 16, power = 2, rows } = {}) {
  const pos = [], idx = [];
  const e = 2 / power;
  const list = smp.slice(iFrom, iTo + 1);
  const nr = list.length;
  for (let i = 0; i < nr; i++) {
    const s = list[i];
    for (let j = 0; j <= cols; j++) {
      const v = j / cols, a = a0 + (a1 - a0) * v;
      const c = Math.cos(a), sn = Math.sin(a);
      const cx = Math.sign(c) * Math.pow(Math.abs(c), e), sy = Math.sign(sn) * Math.pow(Math.abs(sn), e);
      const o = off(i / (nr - 1), v);
      const nx = s.S.x * cx * (s.rx + o) + s.U.x * sy * (s.ry + o);
      const ny = s.S.y * cx * (s.rx + o) + s.U.y * sy * (s.ry + o);
      const nz = s.S.z * cx * (s.rx + o) + s.U.z * sy * (s.ry + o);
      pos.push(s.p.x + nx, s.p.y + ny, s.p.z + nz);
    }
  }
  const C = cols + 1;
  for (let i = 0; i < nr - 1; i++) for (let j = 0; j < cols; j++) {
    const a00 = i * C + j, a01 = i * C + j + 1, a10 = (i + 1) * C + j, a11 = (i + 1) * C + j + 1;
    idx.push(a00, a10, a01, a01, a10, a11);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Gyorsan frissíthető vékony cső (kantárszár) – minden képkockán új pontokkal.
export class DynTube {
  constructor(segments, radius, material, radial = 5) {
    this.seg = segments; this.r = radius; this.rad = radial;
    const nv = (segments + 1) * radial;
    this.geo = new THREE.BufferGeometry();
    this.pos = new Float32Array(nv * 3);
    this.nor = new Float32Array(nv * 3);
    this.geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    this.geo.setAttribute('normal', new THREE.BufferAttribute(this.nor, 3));
    const idx = [];
    for (let i = 0; i < segments; i++) for (let j = 0; j < radial; j++) {
      const a = i * radial + j, b = i * radial + (j + 1) % radial, c = (i + 1) * radial + j, d = (i + 1) * radial + (j + 1) % radial;
      idx.push(a, c, b, b, c, d);
    }
    this.geo.setIndex(idx);
    this.mesh = new THREE.Mesh(this.geo, material);
    this.mesh.frustumCulled = false;
    this._t = new THREE.Vector3(); this._s = new THREE.Vector3(); this._u = new THREE.Vector3();
    this._up = new THREE.Vector3(0, 1, 0);
  }
  update(points) {
    const { seg, rad, r, pos, nor } = this;
    for (let i = 0; i <= seg; i++) {
      const p = points[i];
      const a = points[Math.max(0, i - 1)], b = points[Math.min(seg, i + 1)];
      this._t.subVectors(b, a).normalize();
      this._s.crossVectors(this._t, this._up);
      if (this._s.lengthSq() < 1e-6) this._s.set(1, 0, 0);
      this._s.normalize();
      this._u.crossVectors(this._s, this._t);
      for (let j = 0; j < rad; j++) {
        const an = (j / rad) * Math.PI * 2, c = Math.cos(an), s = Math.sin(an);
        const nx = this._s.x * c + this._u.x * s, ny = this._s.y * c + this._u.y * s, nz = this._s.z * c + this._u.z * s;
        const k = (i * rad + j) * 3;
        pos[k] = p.x + nx * r; pos[k + 1] = p.y + ny * r; pos[k + 2] = p.z + nz * r;
        nor[k] = nx; nor[k + 1] = ny; nor[k + 2] = nz;
      }
    }
    this.geo.attributes.position.needsUpdate = true;
    this.geo.attributes.normal.needsUpdate = true;
  }
}

// Kis 3D zaj GLSL-ben a szőrzet, a foltok és a sár rajzolásához.
export const GLSL_NOISE = `
vec3 hash33(vec3 p){ p = fract(p*vec3(0.1031,0.1030,0.0973)); p += dot(p, p.yxz+33.33); return fract((p.xxy+p.yxx)*p.zyx); }
float worley(vec3 p){ vec3 i = floor(p), f = fract(p); float d = 1.0;
  for (int x=-1;x<=1;x++) for (int y=-1;y<=1;y++) for (int z=-1;z<=1;z++){ vec3 g = vec3(float(x),float(y),float(z)); vec3 o = hash33(i+g); d = min(d, length(g+o-f)); }
  return d; }
float hash31(vec3 p){ p = fract(p*0.3183099 + 0.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float vnoise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash31(i+vec3(0,0,0)),hash31(i+vec3(1,0,0)),f.x), mix(hash31(i+vec3(0,1,0)),hash31(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash31(i+vec3(0,0,1)),hash31(i+vec3(1,0,1)),f.x), mix(hash31(i+vec3(0,1,1)),hash31(i+vec3(1,1,1)),f.x),f.y),f.z); }
`;

export function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d'); draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
