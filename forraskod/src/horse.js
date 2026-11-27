import * as THREE from 'three';
import { loft, loftSamples, limb, shell } from './geom.js';
import { flat, faceInfo, hashF, vnoise3 } from './lowpoly.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { clamp, lerp, smoothstep, damp, mulberry32 } from './noise.js';

export const COATS = {
  pej: { name: 'Pej', base: '#4d2815', mane: '#16100c', points: '#1a1410' },
  sarga: { name: 'Sárga', base: '#a1532a', mane: '#7a3716', points: null },
  fekete: { name: 'Fekete', base: '#1e1b1a', mane: '#0d0b0a', points: null },
  szurke: { name: 'Szürke', base: '#dedad2', mane: '#cbc5ba', points: '#a7a198' },
  palomino: { name: 'Palomino', base: '#d1a052', mane: '#f1e7d0', points: null },
  tarka: { name: 'Tarka', base: '#f1ede4', mane: '#3a2a1e', points: null, patch: '#5b3520' },
  almas: { name: 'Almásszürke', base: '#8f8d8a', mane: '#e4e0d8', points: '#4f4c49', patch: '#dcd9d2', dapple: true },
};
export const SADDLES = { barna: '#5a3420', fekete: '#1d1a19', konyak: '#8c4c22' };
export const PALETTE = {
  feher: { name: 'Fehér', c: '#f4f2ec' }, kek: { name: 'Kék', c: '#2f63d6' }, sotetkek: { name: 'Sötétkék', c: '#1f2f5c' },
  rozsaszin: { name: 'Rózsaszín', c: '#f27aaa' }, lila: { name: 'Lila', c: '#8a55d0' }, piros: { name: 'Piros', c: '#d23a33' },
  zold: { name: 'Zöld', c: '#2e9a58' }, turkiz: { name: 'Türkiz', c: '#21b3ae' }, sarga: { name: 'Sárga', c: '#f2c33a' }, fekete: { name: 'Fekete', c: '#222222' },
};

const BODY_Y = 1.2;
const PAST_REST = -0.5, LP = 0.14, HOOF_H = 0.075;

export const GAITS = {
  stand: { speed: 0, f: 0.9, duty: 0.6, lift: 0, off: [0.25, 0.75, 0, 0.5], bob1: 0, bob2: 0, pitch: 0, neck1: 0, neck2: 0, carriage: 0 },
  walk: { speed: 1.8, f: 0.95, duty: 0.62, lift: 0.12, off: [0.25, 0.75, 0, 0.5], bob1: 0, bob2: 0.016, pitch: 0, neck1: 0, neck2: 0.05, carriage: 0.1 },
  trot: { speed: 4.2, f: 1.42, duty: 0.42, lift: 0.21, off: [0, 0.5, 0.5, 0], bob1: 0, bob2: 0.045, pitch: 0.008, neck1: 0, neck2: 0.02, carriage: 0.02 },
  canter: { speed: 7.5, f: 1.72, duty: 0.34, lift: 0.25, off: [0.55, 0.3, 0.3, 0], bob1: 0.06, bob2: 0, pitch: 0.075, neck1: 0.1, neck2: 0, carriage: 0.1 },
  gallop: { speed: 12.5, f: 2.2, duty: 0.27, lift: 0.3, off: [0.57, 0.45, 0.12, 0], bob1: 0.045, bob2: 0, pitch: 0.06, neck1: 0.09, neck2: 0, carriage: 0.24 },
};

// szőrzet-festés részenként: kopás (sár) erőssége, alsó lábrész-e, zokni magassága
const PARTS = {
  body: { bias: 0 }, head: { bias: 0 }, legU: { bias: 0.25 },
  lowF: { bias: 0.55, low: true, sockY: -0.17 }, lowH: { bias: 0.55, low: true, sockY: -0.25 }, past: { bias: 0.75, low: true, sockY: 1 },
};
const WHITE = new THREE.Color('#f2efe8');

export class Horse {
  constructor() {
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group(); this.body.position.y = BODY_Y; this.root.add(this.body);
    this.coatMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.78, envMapIntensity: 0.7 });
    this.mats = { coat: this.coatMat };
    this.maneMat = flat('#111', { roughness: 0.75 });
    this.hoofMat = flat('#2b2520', { roughness: 0.5 });
    this.meshes = []; this.detail = []; this.coatParts = [];
    this.coatP = { base: new THREE.Color('#4d2815'), points: null, patch: null, patchAmt: 0, dapple: 0, blaze: false, socks: false };
    this.dirt = 0;
    const add = (parent, geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); this.meshes.push(m); return m; };
    this._add = add;
    const coat = (parent, geo, part) => { const g = this.prepCoat(geo, part); return add(parent, g, this.coatMat); };

    // ---- törzs ----
    const T = [[-0.845, 1.28, 0.03, 0.03], [-0.80, 1.31, 0.15, 0.2], [-0.72, 1.335, 0.235, 0.27], [-0.58, 1.315, 0.272, 0.3], [-0.38, 1.275, 0.282, 0.315],
      [-0.10, 1.25, 0.296, 0.325], [0.20, 1.258, 0.287, 0.33], [0.45, 1.28, 0.252, 0.322], [0.62, 1.262, 0.216, 0.29], [0.76, 1.222, 0.17, 0.22], [0.835, 1.18, 0.06, 0.08]];
    const TR = T.map(([z, y, rx, ry]) => ({ p: [0, y - BODY_Y, z], rx, ry }));
    const torsoGeo = loft(TR, { radial: 10, sub: 1, power: 2.15 });
    sculpt(torsoGeo, [
      [0.2, 0.17, 0.4, 0.1, 0.17, 0.13, 0.022], [0.2, -0.08, 0.43, 0.1, 0.12, 0.11, 0.026], [0.1, -0.1, 0.66, 0.08, 0.11, 0.08, 0.02],
      [0.21, 0.12, -0.55, 0.14, 0.19, 0.17, 0.03], [0.16, -0.06, -0.74, 0.1, 0.14, 0.08, 0.022], [0.0, 0.37, -0.56, 0.1, 0.06, 0.2, 0.012],
      [0.0, 0.39, 0.4, 0.05, 0.06, 0.12, 0.022], [0.27, 0.02, -0.3, 0.06, 0.1, 0.08, -0.014], [0.0, -0.33, 0.0, 0.16, 0.06, 0.32, 0.015],
      [0.25, 0.05, 0.12, 0.06, 0.18, 0.2, 0.008],
    ]);
    coat(this.body, torsoGeo, 'body'); // a test az első gyerek (légzés)
    this.torsoSmp = loftSamples(TR, { sub: 5 });

    // ---- nyak ----
    this.neck = new THREE.Group(); this.neck.position.set(0, 1.45 - BODY_Y, 0.5); this.body.add(this.neck);
    const NK = [[0.34, 1.35, 0.21, 0.315], [0.55, 1.5, 0.183, 0.268], [0.73, 1.68, 0.153, 0.215], [0.86, 1.85, 0.127, 0.172], [0.94, 1.98, 0.108, 0.138], [0.975, 2.055, 0.09, 0.106]];
    const NR = NK.map(([z, y, rx, ry]) => ({ p: [0, y - 1.45, z - 0.5], rx, ry }));
    coat(this.neck, loft(NR, { radial: 9, sub: 1, power: 2.1 }), 'body');
    this.neckSmp = loftSamples(NR, { sub: 4 });

    // ---- fej ----
    this.head = new THREE.Group(); this.head.position.set(0, 2.065 - 1.45, 0.97 - 0.5); this.neck.add(this.head);
    const D = new THREE.Vector3(0, -0.74, 0.673), U = new THREE.Vector3(0, 0.673, 0.74), HL = 0.575;
    this.headD = D; this.headU = U; this.HL = HL;
    const HR = [[0, 0.056, 0.056], [0.06, 0.102, 0.112], [0.18, 0.12, 0.158], [0.33, 0.114, 0.15], [0.49, 0.098, 0.124], [0.65, 0.087, 0.104], [0.79, 0.084, 0.097], [0.89, 0.088, 0.096], [0.96, 0.078, 0.08], [1.0, 0.046, 0.046]];
    this.headRing = (s) => {
      let i = 0; while (i < HR.length - 2 && HR[i + 1][0] < s) i++;
      const a = HR[i], b = HR[i + 1], t = clamp((s - a[0]) / (b[0] - a[0]), 0, 1);
      const rx = lerp(a[1], b[1], t), ry = lerp(a[2], b[2], t);
      const c = D.clone().multiplyScalar(s * HL).addScaledVector(U, -ry);
      return { c, rx, ry };
    };
    const headGeo = loft(HR.map(([s, rx, ry]) => { const c = D.clone().multiplyScalar(s * HL).addScaledVector(U, -ry); return { p: [c.x, c.y, c.z], rx, ry }; }), { radial: 8, sub: 1, power: 2.2 });
    this.headPt = (sv, v, side, out = 1.0) => { const r = this.headRing(sv); return r.c.clone().addScaledVector(U, r.ry * v * out).add(new THREE.Vector3(-side * r.rx * Math.sqrt(Math.max(0, 1 - v * v)) * out, 0, 0)); };
    {
      const b = (sv, v, side, r, a) => { const p = this.headPt(sv, v, side); return [Math.abs(p.x), p.y, p.z, r, r, r, a]; };
      sculpt(headGeo, [b(0.2, -0.55, 1, 0.07, 0.016), b(0.34, 0.15, 1, 0.05, 0.008), b(0.9, 0.3, 1, 0.03, 0.009), [0, ...this.headPt(0.95, -0.9, 0).toArray().slice(1), 0.035, 0.03, 0.035, 0.012], b(0.24, 0.8, 1, 0.035, 0.007)]);
    }
    coat(this.head, headGeo, 'head');
    // szemek, orrlyukak
    const eyeM = flat('#1a120c', { roughness: 0.3 });
    const place = (g, pos, scl) => { g.applyMatrix4(new THREE.Matrix4().compose(pos, new THREE.Quaternion(), scl)); if (g.index) g = g.toNonIndexed(); g.deleteAttribute('uv'); return g; };
    const eyeParts = [];
    for (const s of [-1, 1]) {
      eyeParts.push(place(new THREE.IcosahedronGeometry(0.03, 0), this.headPt(0.27, 0.56, s, 0.93), new THREE.Vector3(0.7, 0.95, 1.2)));
      eyeParts.push(place(new THREE.IcosahedronGeometry(0.018, 0), this.headPt(0.92, 0.28, s, 0.97), new THREE.Vector3(0.7, 1.3, 0.8)));
    }
    const eyes = add(this.head, mergeGeometries(eyeParts), eyeM, false); this.detail.push(eyes);
    // fülek
    this.ears = [];
    for (const s of [-1, 1]) {
      const eg = new THREE.Group(); eg.position.set(s * 0.055, 0.0, -0.035); eg.rotation.set(0.15, 0, -s * 0.28); this.head.add(eg);
      const cg = new THREE.ConeGeometry(0.038, 0.15, 4); cg.translate(0, 0.075, 0); cg.scale(1, 1, 0.62);
      coat(eg, cg, 'head'); this.ears.push(eg);
    }

    // ---- sörény ----
    this.buildMane();

    // ---- farok ----
    this.tail = [];
    {
      const parent = new THREE.Group(); parent.position.set(0, 1.5 - BODY_Y, -0.81); this.body.add(parent);
      const segs = [
        [0.2, [[0, 0.046, 0.05], [1, 0.04, 0.045]], 0.55, false],
        [0.17, [[0, 0.055, 0.06], [1, 0.085, 0.082]], -0.3, true],
        [0.17, [[0, 0.085, 0.082], [1, 0.096, 0.09]], -0.15, true],
        [0.17, [[0, 0.096, 0.09], [1, 0.082, 0.078]], -0.05, true],
        [0.17, [[0, 0.082, 0.078], [0.65, 0.055, 0.05], [1, 0.012, 0.012]], 0, true],
      ];
      let first = true;
      for (const [L, prof, rest, hair] of segs) {
        const g = first ? parent : new THREE.Group();
        if (!first) { g.position.y = -this.tail[this.tail.length - 1].L * 0.92; this.tail[this.tail.length - 1].g.add(g); }
        if (!hair) coat(g, limb(L, prof.map(([t, a, b]) => [t, a, b, 0]), 7, 1), 'body');
        // szőr: vastagabb, szögletes "tincs"
        const k = hair ? 1.55 : 1.25;
        const hp = prof.map(([t, a, b]) => [t, a * k + 0.01, b * k + 0.01, 0]);
        if (!hair) hp[0] = [0.35, 0.05, 0.05, 0];
        add(g, limb(L * 1.12, hp, 6, 1), this.maneMat);
        g.rotation.x = rest; this.tail.push({ g, L, rest });
        first = false;
      }
    }

    // ---- lábak ----
    const FU = [[0, 0.10, 0.13, 0.02], [0.2, 0.095, 0.125, 0.025], [0.32, 0.085, 0.11, 0.02], [0.5, 0.07, 0.085, 0.012], [0.72, 0.052, 0.062, 0.004], [0.88, 0.047, 0.056, 0.004], [1.0, 0.05, 0.058, 0.004]];
    const FL = [[0, 0.054, 0.062, 0.004], [0.4, 0.038, 0.054, -0.01], [0.75, 0.039, 0.055, -0.01], [1.0, 0.05, 0.058, -0.004]];
    const HU = [[0, 0.125, 0.16, 0.04], [0.22, 0.112, 0.155, 0.05], [0.4, 0.086, 0.12, 0.035], [0.62, 0.062, 0.085, 0.012], [0.82, 0.046, 0.06, -0.008], [1.0, 0.044, 0.066, -0.02]];
    const HLo = [[0, 0.048, 0.072, -0.018], [0.45, 0.037, 0.054, -0.01], [0.8, 0.039, 0.055, -0.01], [1, 0.05, 0.058, -0.004]];
    const PS = [[0, 0.05, 0.056, -0.004], [0.5, 0.043, 0.047, 0], [1.0, 0.05, 0.052, 0]];
    const hoofGeo = new THREE.CylinderGeometry(0.056, 0.072, HOOF_H, 7); hoofGeo.translate(0, -HOOF_H / 2, 0.012);
    const wrapProf = (prof, a, b) => prof.filter(([t]) => t >= a && t <= b).map(([t, rx, ry, dz]) => [t, rx * 1.22 + 0.006, ry * 1.18 + 0.006, dz]);
    // részenként közös (festett) geometria
    const G = {
      FU: this.prepCoat(limb(0.62, FU, 7, 1), 'legU'), HU: this.prepCoat(limb(0.66, HU, 7, 1), 'legU'),
      FL: this.prepCoat(limb(0.30, FL, 7, 1), 'lowF'), HL: this.prepCoat(limb(0.40, HLo, 7, 1), 'lowH'),
      PS: this.prepCoat(limb(LP, PS, 7, 1), 'past'),
    };
    this.legs = [];
    const defs = [
      { n: 'LF', x: 0.165, front: true }, { n: 'RF', x: -0.165, front: true },
      { n: 'LH', x: 0.172, front: false }, { n: 'RH', x: -0.172, front: false },
    ];
    const wrapMat = flat('#ffffff', { roughness: 0.9 });
    for (const d of defs) {
      const L1 = d.front ? 0.62 : 0.66, L2 = d.front ? 0.30 : 0.40;
      const pivot = d.front ? new THREE.Vector3(d.x, 1.112 - BODY_Y, 0.5) : new THREE.Vector3(d.x, 1.16 - BODY_Y, -0.48);
      const upper = new THREE.Group(); upper.position.set(d.x, 0, 0); this.root.add(upper);
      add(upper, d.front ? G.FU : G.HU, this.coatMat);
      const lower = new THREE.Group(); lower.position.y = -L1; upper.add(lower);
      add(lower, d.front ? G.FL : G.HL, this.coatMat);
      const lowProf = d.front ? FL : HLo;
      const wrapGeo = limb(L2, [[0.06, 0.045, 0.056, 0], ...wrapProf(lowProf, 0.1, 0.9), [0.94, 0.05, 0.06, -0.004]], 7, 1);
      const wrap = new THREE.Mesh(wrapGeo, wrapMat.clone()); wrap.castShadow = true; wrap.visible = false; lower.add(wrap);
      const past = new THREE.Group(); past.position.y = -L2; lower.add(past);
      add(past, G.PS, this.coatMat);
      const hoof = new THREE.Group(); hoof.position.y = -LP; hoof.rotation.x = -PAST_REST; past.add(hoof);
      add(hoof, hoofGeo, this.hoofMat);
      this.legs.push({
        ...d, L1, L2, pivot, upper, lower, past, hoof, wrap, pv: new THREE.Vector3(),
        neutralZ: d.front ? 0.53 : -0.75, phase: 0, prevP: 0, stance: true,
      });
    }
    this.legs[2].neutralZ = -0.74; this.legs[3].neutralZ = -0.74;

    this.buildTack();
    this.paintCoat();

    // állapot
    this.phase = 0; this.time = 0;
    this.gp = { ...GAITS.stand, off: [...GAITS.stand.off] };
    this.gait = 'stand';
    this.neckX = 0; this.headX = 0; this.neckY = 0; this.idleT = 0; this.graze = 0; this.grazeT = 0;
    this.tailSwish = 0; this.tailT = 0; this.earT = [0, 0]; this.earTarget = [0, 0];
    this.jumpT = -1; this.bob = 0; this.pitch = 0; this.restLeg = 0;
    this.rnd = mulberry32(77);
    this._m = new THREE.Vector3();
  }

  // szőrzet-geometria előkészítése: lapok adatai + előre számolt zajok a festéshez
  prepCoat(geo, part) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    g.deleteAttribute('uv');
    const fi = faceInfo(g), n = fi.n, P = PARTS[part];
    const r = new Float32Array(n), nd = new Float32Array(n), np = new Float32Array(n), nm = new Float32Array(n);
    for (let f = 0; f < n; f++) {
      const x = fi.cent[f * 3], y = fi.cent[f * 3 + 1], z = fi.cent[f * 3 + 2];
      r[f] = hashF(x * 3.1, y * 2.7, z * 1.9 + (part.length));
      nd[f] = vnoise3(x * 8 + 3, y * 8, z * 8 + 1);
      np[f] = vnoise3(x * 2.1 + 13, y * 2.1 + 13, z * 2.1 + 13) * 0.72 + vnoise3(x * 6.5 + 3, y * 6.5 + 3, z * 6.5 + 3) * 0.28;
      nm[f] = vnoise3(x * 11, y * 11, z * 11) * 0.6 + vnoise3(x * 4, y * 4, z * 4 + 5) * 0.4;
    }
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 9), 3));
    this.coatParts.push({ g, part, P, fi, r, nd, np, nm });
    return g;
  }

  paintCoat() {
    const C = this.coatP, c = new THREE.Color(), dust = new THREE.Color(), D = this.dirt;
    const U = this.headU, D0 = this.headD, HL = this.HL;
    for (const cp of this.coatParts) {
      const { g, part, P, fi, r, nd, np, nm } = cp, col = g.attributes.color.array;
      dust.setRGB(0.19, 0.15, 0.10).lerp(new THREE.Color(0.09, 0.06, 0.035), clamp(P.bias * 1.3, 0, 1));
      for (let f = 0; f < fi.n; f++) {
        const x = fi.cent[f * 3], y = fi.cent[f * 3 + 1], z = fi.cent[f * 3 + 2];
        c.copy(P.low && C.points ? C.points : C.base);
        if (C.dapple && !P.low && nd[f] > 0.66) c.lerp(C.patch, 0.75);
        if (C.patchAmt && np[f] > 0.545) c.copy(C.patch);
        if (C.blaze && part === 'head') {
          const s = (x * D0.x + y * D0.y + z * D0.z) / HL, nu = fi.nrm[f * 3] * U.x + fi.nrm[f * 3 + 1] * U.y + fi.nrm[f * 3 + 2] * U.z;
          const w = lerp(0.045, 0.06, smoothstep(0.75, 0.95, s));
          if (nu > 0.35 && Math.abs(x) < w && s > 0.12 && s < 0.97) c.copy(WHITE);
        }
        if (C.socks && P.low && y < P.sockY) c.copy(WHITE);
        c.multiplyScalar(0.92 + r[f] * 0.16);
        if (D > 0.02) {
          const th = 1 - D * (0.72 + P.bias) + clamp(y, -0.6, 0.5) * 0.7;
          if (nm[f] > th) c.lerp(dust, 0.42 + P.bias * 0.4);
        }
        for (let k = 0; k < 3; k++) { col[f * 9 + k * 3] = c.r; col[f * 9 + k * 3 + 1] = c.g; col[f * 9 + k * 3 + 2] = c.b; }
      }
      g.attributes.color.needsUpdate = true;
    }
  }

  buildMane() {
    // szögletes tincsek a nyak taraján; a hegyük lobog
    const smp = this.neckSmp, n = smp.length, parts = [], wts = [];
    const tuft = (pos, dir, h, r, flat) => {
      const g = new THREE.ConeGeometry(r, h, 4); g.translate(0, h / 2, 0); g.scale(1, 1, flat); g.deleteAttribute('uv');
      const ng = g.toNonIndexed(), p = ng.attributes.position, w = [];
      for (let i = 0; i < p.count; i++) w.push(clamp(p.getY(i) / h, 0, 1));
      ng.applyMatrix4(new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(1, 1, 1)));
      parts.push(ng); wts.push(...w);
    };
    const r = mulberry32(12);
    for (let i = 3; i < n; i += 2) {
      const s = smp[i], t = i / (n - 1);
      const crest = s.p.clone().addScaledVector(s.U, s.ry * 0.9);
      const dir = s.U.clone().addScaledVector(s.T, -0.9).addScaledVector(s.S, 0.55 + r() * 0.2).normalize();
      const h = lerp(0.2, 0.15, t) * (0.85 + r() * 0.3);
      tuft(crest, dir, h, 0.06, 0.55);
    }
    this.maneGeo = mergeGeometries(parts); this.maneGeo.computeVertexNormals();
    this.maneBase = this.maneGeo.attributes.position.array.slice(); this.maneW = new Float32Array(wts);
    const m = new THREE.Mesh(this.maneGeo, this.maneMat); m.castShadow = true; this.neck.add(m); this.meshes.push(m);
    // üstök
    const D = this.headD, U = this.headU, fl = [];
    for (const [sx, len] of [[-0.03, 0.17], [0.0, 0.2], [0.03, 0.16]]) {
      const g = new THREE.ConeGeometry(0.035, len, 4); g.translate(0, len / 2, 0); g.scale(1, 1, 0.5); g.deleteAttribute('uv');
      const dir = D.clone().addScaledVector(U, 0.25).normalize();
      g.applyMatrix4(new THREE.Matrix4().compose(D.clone().multiplyScalar(-0.03).addScaledVector(U, 0.035).add(new THREE.Vector3(sx, 0, 0)), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(1, 1, 1)));
      fl.push(g.toNonIndexed());
    }
    const fm = new THREE.Mesh(mergeGeometries(fl), this.maneMat); this.head.add(fm); this.meshes.push(fm);
  }

  buildTack() {
    const smp = this.torsoSmp;
    const findI = (z) => { let best = 0, bd = 9; smp.forEach((s, i) => { const d = Math.abs(s.p.z - z); if (d < bd) { bd = d; best = i; } }); return best; };
    const P2 = Math.PI / 2;
    this.tack = {};
    const T = this.tack;
    const sm = (c) => flat(c, { roughness: 0.6, side: THREE.DoubleSide });
    // alátét
    T.padMat = flat('#fff', { roughness: 0.9, side: THREE.DoubleSide });
    T.pad = new THREE.Group(); this.body.add(T.pad);
    const padGeo = shell(smp, findI(-0.26), findI(0.44), P2 - 1.3, P2 + 1.3, (u, v) => 0.012 + 0.014 * Math.pow(Math.sin(Math.PI * u), 0.3) * Math.pow(Math.sin(Math.PI * v), 0.3) + 0.028 * smoothstep(0.72, 1, u), { cols: 10 });
    const pm = new THREE.Mesh(padGeo, T.padMat); pm.castShadow = true; T.pad.add(pm);
    // nyereg
    T.saddleMat = sm('#5a3420');
    T.saddle = new THREE.Group(); this.body.add(T.saddle);
    const seat = shell(smp, findI(-0.14), findI(0.3), P2 - 0.78, P2 + 0.78, (u, v) => {
      const e = Math.pow(Math.sin(Math.PI * u), 0.25) * Math.pow(Math.sin(Math.PI * v), 0.25);
      const mid = Math.pow(Math.cos((v - 0.5) * Math.PI), 2);
      return 0.014 + e * (0.03 + mid * (0.075 * smoothstep(0.72, 1, u) + 0.085 * smoothstep(0.3, 0, u)));
    }, { cols: 8 });
    const seatM = new THREE.Mesh(seat, T.saddleMat); seatM.castShadow = true; T.saddle.add(seatM);
    for (const sgn of [-1, 1]) {
      const a0 = sgn > 0 ? P2 + 0.6 : P2 - 1.08, a1 = sgn > 0 ? P2 + 1.08 : P2 - 0.6;
      const flap = shell(smp, findI(0.0), findI(0.3), a0, a1, (u, v) => 0.034 + 0.006 * Math.sin(Math.PI * u), { cols: 3 });
      const f = new THREE.Mesh(flap, T.saddleMat); f.castShadow = true; T.saddle.add(f);
    }
    // heveder
    {
      const zc = 0.24, i = findI(zc), s = smp[i];
      const ring = (dz) => ({ p: [0, s.p.y, zc + dz], rx: s.rx + 0.016, ry: s.ry + 0.016 });
      const gg = loft([ring(-0.035), ring(0.035)], { radial: 10, sub: 1, cap: false, power: 2.15 });
      const gm = new THREE.Mesh(gg, sm('#3a2a20')); T.saddle.add(gm);
    }
    // kengyelek
    T.stirrups = [];
    const ironMat = flat('#c9ccd1', { metalness: 0.6, roughness: 0.35 });
    for (const sgn of [-1, 1]) {
      const iron = new THREE.Group();
      const tg = new THREE.TorusGeometry(0.055, 0.01, 3, 6, Math.PI); iron.add(new THREE.Mesh(tg, ironMat));
      const tread = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.014, 0.05), ironMat); iron.add(tread);
      tg.rotateZ(Math.PI);
      iron.rotation.y = Math.PI / 2;
      const leather = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1, 0.008), T.saddleMat);
      T.saddle.add(iron); T.saddle.add(leather);
      const s = smp[findI(0.18)];
      const attach = new THREE.Vector3(sgn * (s.rx * 0.72 + 0.03), s.p.y + s.ry * 0.62 + 0.03, 0.18);
      T.stirrups.push({ iron, leather, attach, rest: new THREE.Vector3(sgn * 0.37, -0.27, 0.12), up: new THREE.Vector3(sgn * (s.rx * 0.8 + 0.04), s.p.y + 0.18, 0.18) });
    }
    // kantár (a fej koordinátáiban)
    T.bridleMat = flat('#4a2c1b', { roughness: 0.6 });
    T.bridle = new THREE.Group(); this.head.add(T.bridle);
    const strap = (pts, closed = false, r = 0.011) => {
      const c = new THREE.CatmullRomCurve3(pts, closed);
      const m = new THREE.Mesh(new THREE.TubeGeometry(c, pts.length * 2, r, 3, closed), T.bridleMat); m.castShadow = true; T.bridle.add(m); return m;
    };
    const hp = (s, v, side) => this.headPt(s, v, side, 1.09);
    const cheek = (side) => [hp(0.86, -0.42, side), hp(0.62, -0.25, side), hp(0.38, -0.05, side), hp(0.16, 0.18, side), hp(0.04, 0.45, side)];
    strap([...cheek(1), new THREE.Vector3(0, 0.06, -0.05), ...cheek(-1).reverse()]);
    const ringPts = (s, sc, a0, a1, n) => { const out = []; for (let k = 0; k < n; k++) { const a = a0 + (a1 - a0) * k / n; const r = this.headRing(s); out.push(r.c.clone().addScaledVector(this.headU, r.ry * Math.sin(a) * sc).add(new THREE.Vector3(Math.cos(a) * r.rx * sc, 0, 0))); } return out; };
    strap(ringPts(0.66, 1.1, 0, Math.PI * 2, 8), true, 0.013);
    strap(ringPts(0.07, 1.12, -0.2, Math.PI + 0.2, 6), false, 0.01);
    strap([hp(0.1, 0.1, 1), hp(0.2, -0.75, 1), new THREE.Vector3(0, this.headRing(0.18).c.y - 0.16, this.headRing(0.18).c.z - 0.06), hp(0.2, -0.75, -1), hp(0.1, 0.1, -1)]);
    // zabla karikák
    this.bits = [];
    const bitM = flat('#d0d3d8', { metalness: 0.7, roughness: 0.3 });
    for (const side of [1, -1]) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.007, 3, 8), bitM); b.position.copy(hp(0.9, -0.5, side)); b.rotation.y = Math.PI / 2; T.bridle.add(b);
      this.bits.push(b);
    }
    // takaró
    T.blanketMat = flat('#2f63d6', { roughness: 0.9, side: THREE.DoubleSide });
    T.blanket = new THREE.Group(); this.body.add(T.blanket);
    const bl = shell(smp, findI(-0.8), findI(0.62), P2 - 1.62, P2 + 1.62, (u, v) => 0.042 + 0.012 * Math.sin(Math.PI * v), { cols: 12 });
    T.blanket.add(new THREE.Mesh(bl, T.blanketMat));
    T.blanket.children[0].castShadow = true;
    const trim = shell(smp, findI(-0.8), findI(0.62), P2 - 1.66, P2 - 1.5, () => 0.048, { cols: 1 });
    const trim2 = shell(smp, findI(-0.8), findI(0.62), P2 + 1.5, P2 + 1.66, () => 0.048, { cols: 1 });
    T.trimMat = flat('#f4f2ec', { roughness: 0.8, side: THREE.DoubleSide });
    T.blanket.add(new THREE.Mesh(trim, T.trimMat)); T.blanket.add(new THREE.Mesh(trim2, T.trimMat));
  }

  setCoat(key, { blaze = false, socks = false } = {}) {
    const c = COATS[key] || COATS.pej; this.coatKey = key;
    const P = this.coatP;
    P.base = new THREE.Color(c.base); P.points = c.points ? new THREE.Color(c.points) : null;
    P.patch = c.patch ? new THREE.Color(c.patch) : null; P.patchAmt = c.patch && !c.dapple ? 1 : 0; P.dapple = c.dapple ? 1 : 0;
    P.blaze = blaze; P.socks = socks;
    this.paintCoat();
    this.maneMat.color.set(c.mane);
  }
  setDetail(on) { if (this._det === on) return; this._det = on; for (const m of this.detail) m.visible = on; }
  // boxban: a lábak és a farok nem látszanak, árnyékot sem vet (kevesebb rajzhívás)
  setStall(on) { if (this._stall === on) return; this._stall = on; for (const l of this.legs) l.upper.visible = !on; if (this.tail[0]) this.tail[0].g.visible = !on; }
  setShadow(on) { if (this._sh === on) return; this._sh = on; this.root.traverse((o) => { if (!o.isMesh) return; if (o.userData.cs === undefined) o.userData.cs = o.castShadow; o.castShadow = on ? o.userData.cs : false; }); }
  setDirt(d) { if (Math.abs(d - this.dirt) < 0.015 && !(d === 0 && this.dirt !== 0)) return; this.dirt = d; this.paintCoat(); this.coatMat.roughness = 0.72 + d * 0.2; }

  setTack(t) {
    const T = this.tack;
    T.saddle.visible = !!t.saddle; if (t.saddle) T.saddleMat.color.set(SADDLES[t.saddle] || SADDLES.barna);
    T.pad.visible = !!t.pad; if (t.pad) T.padMat.color.set(PALETTE[t.pad]?.c || '#fff');
    T.bridle.visible = !!t.bridle; if (t.bridle) T.bridleMat.color.set(SADDLES[t.bridle] || SADDLES.barna);
    for (const l of this.legs) { l.wrap.visible = !!t.wraps; if (t.wraps) l.wrap.material.color.set(PALETTE[t.wraps]?.c || '#fff'); }
    T.blanket.visible = !!t.blanket; if (t.blanket) T.blanketMat.color.set(PALETTE[t.blanket]?.c || '#2f63d6');
    this.tackState = { ...t };
  }

  // kengyel a lovas lábához (body koordinátákban), vagy felhúzva
  placeStirrups(feet) {
    const T = this.tack;
    T.stirrups.forEach((s, i) => {
      const p = feet ? feet[i] : s.up;
      s.iron.position.copy(p).add(new THREE.Vector3(0, -0.012, 0));
      const mid = s.attach.clone().add(p).multiplyScalar(0.5);
      const len = s.attach.distanceTo(p);
      s.leather.position.copy(mid);
      s.leather.scale.set(1, Math.max(0.01, len - 0.05), 1);
      s.leather.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), s.attach.clone().sub(p).normalize());
    });
  }

  // ---------- animáció ----------
  update(dt, st) {
    this.time += dt;
    const g = GAITS[st.gait] || GAITS.stand;
    const k = 1 - Math.exp(-dt * (st.gait === this.gait ? 6 : 5));
    this.gait = st.gait;
    const gp = this.gp;
    for (const key of ['f', 'duty', 'lift', 'bob1', 'bob2', 'pitch', 'neck1', 'neck2', 'carriage']) gp[key] += (g[key] - gp[key]) * k;
    for (let i = 0; i < 4; i++) { let d = g.off[i] - gp.off[i]; d -= Math.round(d); gp.off[i] = (gp.off[i] + d * k + 1) % 1; }

    const v = Math.max(Math.abs(st.v), Math.abs(st.yawRate || 0) * 0.9);
    const ref = Math.max(g.speed, 1.2);
    let f = gp.f * Math.sqrt(clamp(v / ref, 0.15, 1.6));
    const Smax = 1.15;
    f = Math.max(f, v * gp.duty / Smax);
    if (v < 0.05) f = 0;
    this.phase = (this.phase + f * dt) % 1;
    const S = f > 0 ? v * gp.duty / f : 0;
    const amp = clamp(v / 0.6, 0, 1);
    const ph = this.phase, TAU = Math.PI * 2;

    // test mozgása
    let bob = -gp.bob2 * Math.cos(2 * TAU * (ph - 0.21)) + gp.bob1 * Math.cos(TAU * (ph - 0.9));
    let pitch = gp.pitch * Math.sin(TAU * (ph - 0.35));
    bob *= amp; pitch *= amp;
    let neckT = gp.carriage + (gp.neck1 * Math.sin(TAU * (ph - 0.15)) + gp.neck2 * Math.sin(2 * TAU * ph)) * amp;
    let headT = -neckT * 0.45;

    // ugrás
    const J = st.jumpT;
    let jw = 0;
    if (J >= 0) {
      jw = smoothstep(0, 0.08, J) * (1 - smoothstep(0.9, 1, J));
      const kp = keyInterp([[0, 0], [0.12, -0.36], [0.38, -0.05], [0.6, 0.26], [0.82, 0.08], [1, 0]], J);
      const kn = keyInterp([[0, 0], [0.14, -0.12], [0.45, 0.34], [0.72, 0.12], [1, 0]], J);
      pitch = lerp(pitch, kp, jw); neckT = lerp(neckT, kn, jw); bob *= 1 - jw;
    }
    // legelés, gondozás közbeni fejtartás
    if (st.mode !== 'ride' || v > 0.15 || J >= 0) this.idleT = 0; else this.idleT += dt;
    let wantGraze = st.headDown || 0;
    if (st.mode === 'ride' && v < 0.1 && J < 0) {
      this.grazeT -= dt;
      if (this.grazeT <= 0) { this.grazing = !this.grazing && this.idleT > 5 && this.rnd() < 0.7; this.grazeT = this.grazing ? 4 + this.rnd() * 6 : 3 + this.rnd() * 5; }
      if (this.grazing) wantGraze = 1;
    } else this.grazing = false;
    this.graze = damp(this.graze, wantGraze, 2.2, dt);
    neckT = lerp(neckT, 0.98, this.graze); headT = lerp(headT, 0.42 + Math.sin(this.time * (st.chew ? 9 : 3)) * (st.chew ? 0.04 : 0.03) * this.graze, this.graze);
    if (st.chew && this.graze < 0.3) headT += Math.sin(this.time * 10) * 0.03;
    if (st.nod) headT += Math.sin(this.time * 7) * 0.12 * st.nod;

    this.bob = damp(this.bob, bob, 18, dt); this.pitch = damp(this.pitch, pitch, 14, dt);
    this.body.position.y = BODY_Y + this.bob + Math.sin(this.time * 1.6) * 0.003;
    this.body.rotation.x = this.pitch;
    this.neckX = damp(this.neckX, neckT, 6, dt); this.headX = damp(this.headX, headT, 6, dt);
    this.neck.rotation.x = this.neckX; this.head.rotation.x = this.headX;
    this.neckY = damp(this.neckY, clamp((st.yawRate || 0) * 0.18 + (st.lookYaw || 0), -0.5, 0.5), 4, dt);
    this.neck.rotation.y = this.neckY; this.head.rotation.y = this.neckY * 0.5;
    this.body.rotation.z = 0;
    // légzés
    const br = 1 + Math.sin(this.time * (1.3 + v * 0.3)) * 0.006;
    this.body.children[0].scale.set(br, br, 1);

    // fülek
    this.earT[0] -= dt;
    if (this.earT[0] < 0) { this.earT[0] = 1 + this.rnd() * 3; this.earTarget = [(this.rnd() - 0.4) * 0.6, (this.rnd() - 0.4) * 0.6]; if (st.happy) this.earTarget = [0.25, 0.25]; }
    this.ears.forEach((e, i) => { e.rotation.x = damp(e.rotation.x, 0.15 + this.earTarget[i] - (v > 8 ? 0.35 : 0), 8, dt); });

    // farok
    this.tailT -= dt;
    if (this.tailT < 0 && v < 3) { this.tailT = 2 + this.rnd() * 5; this.tailSwish = 1; }
    this.tailSwish = Math.max(0, this.tailSwish - dt * 0.8);
    const sw = Math.sin(this.time * 6) * this.tailSwish * 0.5;
    const flow = smoothstep(4, 12, v);
    this.tail.forEach((t, i) => {
      const lift = i === 0 ? flow * 0.75 + jw * 0.4 : -t.rest * flow * 0.7 + flow * 0.06;
      t.g.rotation.x = damp(t.g.rotation.x, t.rest + lift + Math.sin(this.time * 3 + i) * 0.03 * (1 + flow * 2), 8, dt);
      t.g.rotation.z = damp(t.g.rotation.z, sw * (0.4 + i * 0.15) + Math.sin(this.time * (8 + v) - i * 0.7) * flow * 0.08, 10, dt);
    });

    // sörény lobogása (a tincsek hegye mozog)
    {
      const pa = this.maneGeo.attributes.position, arr = pa.array, base = this.maneBase, Wt = this.maneW;
      const wind = smoothstep(2, 12, v);
      for (let i = 0; i < Wt.length; i++) {
        const w = Wt[i]; if (w < 0.01) continue;
        const w2 = w * w, fl = Math.sin(this.time * (6 + v * 0.8) + Math.floor(i / 24) * 0.9) * 0.022 * (0.3 + wind) * w;
        arr[i * 3] = base[i * 3] + fl; arr[i * 3 + 1] = base[i * 3 + 1] + wind * 0.05 * w2; arr[i * 3 + 2] = base[i * 3 + 2] - wind * 0.09 * w2 + fl * 0.5;
      }
      pa.needsUpdate = true;
    }

    // lábak
    this.body.updateMatrix();
    const events = [];
    this.legs.forEach((leg, i) => {
      leg.pv.copy(leg.pivot).applyMatrix4(this.body.matrix);
      let p = (ph + gp.off[i]) % 1;
      if (v > 0.05 && p < leg.prevP - 0.5) events.push(i);
      leg.prevP = p;
      let hz, hy, fold;
      if (p < gp.duty) { const u = p / gp.duty; hz = leg.neutralZ + S * (0.5 - u); hy = 0; fold = 0; }
      else { const s = (p - gp.duty) / (1 - gp.duty); const e = s * s * s * (s * (s * 6 - 15) + 10); hz = leg.neutralZ + S * (e - 0.5); hy = gp.lift * Math.sin(Math.PI * s) * amp; fold = Math.sin(Math.PI * Math.min(1, s * 1.15)) * amp; }
      // pihentetett hátsó láb álldogálás közben
      if (i === 2 && st.mode !== 'ride' && v < 0.05 && (st.liftLeg == null || st.liftLeg < 0)) { const r = smoothstep(0, 1, this.restLeg); hz += 0.06 * r; hy += 0.035 * r; fold += 0.45 * r; }
      if (st.liftLeg === i) { const r = smoothstep(0, 1, st.liftAmt || 0); hy = lerp(hy, leg.front ? 0.42 : 0.38, r); hz = lerp(hz, leg.neutralZ + (leg.front ? -0.12 : -0.05), r); fold = lerp(fold, 1.5, r); }
      if (jw > 0) {
        const keys = leg.front
          ? [[0, 0.03, -0.6, 0.2], [0.1, 0.15, -0.55, 1.4], [0.45, 0.18, -0.45, 1.6], [0.66, 0.34, -0.86, 0.35], [0.86, 0.22, -0.96, 0.05], [1, 0.03, -0.98, 0]]
          : [[0, -0.2, -0.96, 0], [0.08, -0.45, -0.92, 0.2], [0.25, -0.35, -0.74, 0.8], [0.45, -0.06, -0.56, 1.3], [0.7, 0.04, -0.78, 0.6], [0.9, -0.05, -0.97, 0.1], [1, -0.25, -0.98, 0]];
        const kz = keyInterp(keys.map((q) => [q[0], q[1]]), J), ky = keyInterp(keys.map((q) => [q[0], q[2]]), J), kf = keyInterp(keys.map((q) => [q[0], q[3]]), J);
        const tz = leg.pv.z + kz, ty = leg.pv.y + ky - HOOF_H - LP * Math.cos(PAST_REST);
        hz = lerp(hz, tz, jw); hy = lerp(hy, ty, jw); fold = lerp(fold, kf, jw);
      }
      this.solveLeg(leg, hy, hz, fold);
    });
    this.restLeg = damp(this.restLeg, st.mode !== 'ride' && v < 0.05 ? 1 : 0, 1.5, dt);
    return events;
  }

  solveLeg(leg, hy, hz, fold) {
    const P = leg.pv;
    const Fy = hy + HOOF_H + LP * Math.cos(PAST_REST), Fz = hz + LP * Math.sin(PAST_REST);
    let dy = Fy - P.y, dz = Fz - P.z; let d = Math.hypot(dy, dz);
    const L1 = leg.L1, L2 = leg.L2;
    const dmax = (L1 + L2) * 0.999, dmin = Math.abs(L1 - L2) + 0.05;
    const dc = clamp(d, dmin, dmax); dy *= dc / d; dz *= dc / d; d = dc;
    const base = Math.atan2(-dz, -dy);
    const a1 = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
    const th1 = leg.front ? base - a1 : base + a1;
    const ky = P.y - L1 * Math.cos(th1), kz = P.z - L1 * Math.sin(th1);
    const th2 = Math.atan2(-(P.z + dz - kz), -(P.y + dy - ky));
    leg.upper.position.set(leg.x, P.y, P.z);
    leg.upper.rotation.x = th1; leg.lower.rotation.x = th2 - th1;
    const thp = PAST_REST + fold * 1.35;
    leg.past.rotation.x = thp - th2;
  }

  // világkoordinátájú pontok a kantárszárhoz
  bitWorld(i, out) { return this.bits[i].getWorldPosition(out); }
}

function keyInterp(keys, t) {
  if (t <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i], b = keys[i + 1];
    if (t <= b[0]) { const u = (t - a[0]) / (b[0] - a[0]); const s = u * u * (3 - 2 * u); return a[1] + (b[1] - a[1]) * s; }
  }
  return keys[keys.length - 1][1];
}

// Gauss-dudorok a test felszínén (izmok), a normális mentén
function sculpt(g, bumps) {
  const p = g.attributes.position, n = g.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let d = 0;
    for (const [bx, by, bz, rx, ry, rz, a] of bumps) {
      const dx = (Math.abs(x) - bx) / rx, dy = (y - by) / ry, dz = (z - bz) / rz;
      d += a * Math.exp(-(dx * dx + dy * dy + dz * dz));
    }
    p.setXYZ(i, x + n.getX(i) * d, y + n.getY(i) * d, z + n.getZ(i) * d);
  }
  g.computeVertexNormals();
}

