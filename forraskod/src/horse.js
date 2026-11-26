import * as THREE from 'three';
import { loft, limb, shell, GLSL_NOISE } from './geom.js';
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

function coatMaterial(dirtBias, streak = [55, 28, 12], extra = {}) {
  const u = {
    uBase: { value: new THREE.Color() }, uPatch: { value: new THREE.Color() }, uPatchAmt: { value: 0 }, uDapple: { value: 0 },
    uStreak: { value: new THREE.Vector3(...streak) },
    uDirt: { value: 0 }, uDirtBias: { value: dirtBias }, uBlaze: { value: 0 }, uSock: { value: 0 }, uSockY: { value: -1 },
    uFace: { value: new THREE.Vector3(0, 1, 0) }, uFaceD: { value: new THREE.Vector3(0, 0, 1) }, uSeed: { value: Math.random() * 10 },
  };
  const m = new THREE.MeshPhysicalMaterial({ roughness: 0.52, metalness: 0.0, clearcoat: 0.25, clearcoatRoughness: 0.38, sheen: 0.55, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ffffff'), envMapIntensity: 0.9, ...extra });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, u);
    sh.vertexShader = 'varying vec3 vObj;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vObj = position;');
    sh.fragmentShader = `varying vec3 vObj; uniform vec3 uBase, uPatch, uFace, uFaceD, uStreak; uniform float uPatchAmt, uDapple, uDirt, uDirtBias, uBlaze, uSock, uSockY, uSeed;\n${GLSL_NOISE}\n` +
      sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', `
        vec3 c = uBase;
        float dn = vnoise(vObj*5.0 + uSeed);
        c *= 0.9 + 0.17*dn + 0.05*vnoise(vObj*23.0);
        c *= 0.93 + 0.1*vnoise(vObj*uStreak + 7.0);
        if (uDapple > 0.5) { float w = worley(vObj*17.0 + 3.0); float dp = smoothstep(0.62, 0.3, w); float big = smoothstep(0.35, 0.65, vnoise(vObj*2.5 + 9.0));
          c = mix(c, uPatch, clamp(dp*0.85 + big*0.35, 0.0, 1.0)); }
        if (uPatchAmt > 0.5) { float pn = vnoise(vObj*2.1 + 13.0)*0.72 + vnoise(vObj*6.5 + 3.0)*0.28; c = mix(c, uPatch, smoothstep(0.52, 0.57, pn)); }
        if (uBlaze > 0.5) { float fd = dot(vObj, uFace); float al = dot(vObj, uFaceD);
          float wdt = mix(0.055, 0.03, smoothstep(0.08, 0.28, al)) + 0.014*smoothstep(0.36, 0.52, al);
          float bz = smoothstep(wdt, wdt - 0.01, abs(vObj.x)) * smoothstep(-0.05, -0.02, fd) * smoothstep(0.04, 0.08, al) * smoothstep(0.6, 0.5, al);
          c = mix(c, vec3(0.93), bz); }
        if (uSock > 0.5) { c = mix(c, vec3(0.93), smoothstep(uSockY + 0.02, uSockY - 0.02, vObj.y)); }
        float dd = vnoise(vObj*24.0)*0.55 + vnoise(vObj*61.0)*0.3 + vnoise(vObj*7.0)*0.15;
        float th = 1.0 - uDirt*(0.72 + uDirtBias) + clamp(vObj.y, -0.6, 0.5)*0.7;
        float dm = smoothstep(th, th + 0.12, dd) * step(0.02, uDirt);
        vec3 dust = mix(vec3(0.19, 0.15, 0.10), vec3(0.09, 0.06, 0.035), clamp(uDirtBias*1.3, 0.0, 1.0));
        c = mix(c, dust, dm*(0.32 + uDirtBias*0.5));
        vec4 diffuseColor = vec4(c, opacity);`);
  };
  m.userData.u = u;
  return m;
}

const lam = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.75, ...o });

export class Horse {
  constructor() {
    this.root = new THREE.Group(); this.root.rotation.order = 'YXZ';
    this.body = new THREE.Group(); this.body.position.y = BODY_Y; this.root.add(this.body);
    this.mats = {
      body: coatMaterial(0.0), head: coatMaterial(0.0, [40, 34, 34]), legU: coatMaterial(0.25, [55, 12, 55]),
      lowF: coatMaterial(0.55, [60, 10, 60]), lowH: coatMaterial(0.55, [60, 10, 60]), past: coatMaterial(0.75, [60, 10, 60]),
    };
    this.mats.lowF.userData.u.uSockY.value = -0.17; this.mats.lowH.userData.u.uSockY.value = -0.25; this.mats.past.userData.u.uSockY.value = 1;
    this.maneMat = new THREE.MeshStandardMaterial({ color: '#111', roughness: 0.7, side: THREE.DoubleSide });
    this.hairTex = hairTexture();
    this.hairMat = new THREE.MeshStandardMaterial({ color: '#111', map: this.hairTex, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.55, envMapIntensity: 1.2 });
    this.hoofMat = new THREE.MeshPhysicalMaterial({ color: '#2b2520', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.3 });
    this.meshes = []; this.detail = [];
    const add = (parent, geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = true; parent.add(m); this.meshes.push(m); return m; };
    this._add = add;

    // ---- törzs ----
    const T = [[-0.845, 1.28, 0.03, 0.03], [-0.80, 1.31, 0.15, 0.2], [-0.72, 1.335, 0.235, 0.27], [-0.58, 1.315, 0.272, 0.3], [-0.38, 1.275, 0.282, 0.315],
      [-0.10, 1.25, 0.296, 0.325], [0.20, 1.258, 0.287, 0.33], [0.45, 1.28, 0.252, 0.322], [0.62, 1.262, 0.216, 0.29], [0.76, 1.222, 0.17, 0.22], [0.835, 1.18, 0.06, 0.08]];
    this.torsoGeo = loft(T.map(([z, y, rx, ry]) => ({ p: [0, y - BODY_Y, z], rx, ry })), { radial: 28, sub: 5, power: 2.15 });
    sculpt(this.torsoGeo, [
      // x, y, z, rx, ry, rz, mélység (a test koordinátáiban, x tükrözve)
      [0.2, 0.17, 0.4, 0.1, 0.17, 0.13, 0.022], [0.2, -0.08, 0.43, 0.1, 0.12, 0.11, 0.026], [0.1, -0.1, 0.66, 0.08, 0.11, 0.08, 0.02],
      [0.21, 0.12, -0.55, 0.14, 0.19, 0.17, 0.03], [0.16, -0.06, -0.74, 0.1, 0.14, 0.08, 0.022], [0.0, 0.37, -0.56, 0.1, 0.06, 0.2, 0.012],
      [0.0, 0.39, 0.4, 0.05, 0.06, 0.12, 0.022], [0.27, 0.02, -0.3, 0.06, 0.1, 0.08, -0.014], [0.0, -0.33, 0.0, 0.16, 0.06, 0.32, 0.015],
      [0.25, 0.05, 0.12, 0.06, 0.18, 0.2, 0.008],
    ]);
    add(this.body, this.torsoGeo, this.mats.body);
    this.torsoSmp = this.torsoGeo.userData.samples;

    // ---- nyak ----
    this.neck = new THREE.Group(); this.neck.position.set(0, 1.45 - BODY_Y, 0.5); this.body.add(this.neck);
    const NK = [[0.34, 1.35, 0.21, 0.315], [0.55, 1.5, 0.183, 0.268], [0.73, 1.68, 0.153, 0.215], [0.86, 1.85, 0.127, 0.172], [0.94, 1.98, 0.108, 0.138], [0.975, 2.055, 0.09, 0.106]];
    const neckGeo = loft(NK.map(([z, y, rx, ry]) => ({ p: [0, y - 1.45, z - 0.5], rx, ry })), { radial: 18, sub: 4, power: 2.1 });
    add(this.neck, neckGeo, this.mats.body);
    this.neckSmp = neckGeo.userData.samples;

    // ---- fej ----
    this.head = new THREE.Group(); this.head.position.set(0, 2.065 - 1.45, 0.97 - 0.5); this.neck.add(this.head);
    const D = new THREE.Vector3(0, -0.74, 0.673), U = new THREE.Vector3(0, 0.673, 0.74), HL = 0.575;
    this.headD = D; this.headU = U;
    const HR = [[0, 0.056, 0.056], [0.06, 0.102, 0.112], [0.18, 0.12, 0.158], [0.33, 0.114, 0.15], [0.49, 0.098, 0.124], [0.65, 0.087, 0.104], [0.79, 0.084, 0.097], [0.89, 0.088, 0.096], [0.96, 0.078, 0.08], [1.0, 0.046, 0.046]];
    this.headRing = (s) => { // interpolált gyűrű az s helyen
      let i = 0; while (i < HR.length - 2 && HR[i + 1][0] < s) i++;
      const a = HR[i], b = HR[i + 1], t = clamp((s - a[0]) / (b[0] - a[0]), 0, 1);
      const rx = lerp(a[1], b[1], t), ry = lerp(a[2], b[2], t);
      const c = D.clone().multiplyScalar(s * HL).addScaledVector(U, -ry);
      return { c, rx, ry };
    };
    const headGeo = loft(HR.map(([s, rx, ry]) => { const c = D.clone().multiplyScalar(s * HL).addScaledVector(U, -ry); return { p: [c.x, c.y, c.z], rx, ry }; }), { radial: 18, sub: 3, power: 2.2 });
    // pofa formázása: állkapocs, pofacsont, orrlyuk, áll
    this.headPt = (sv, v, side, out = 1.0) => { const r = this.headRing(sv); return r.c.clone().addScaledVector(U, r.ry * v * out).add(new THREE.Vector3(-side * r.rx * Math.sqrt(Math.max(0, 1 - v * v)) * out, 0, 0)); };
    {
      const b = (sv, v, side, r, a) => { const p = this.headPt(sv, v, side); return [Math.abs(p.x), p.y, p.z, r, r, r, a]; };
      sculpt(headGeo, [b(0.2, -0.55, 1, 0.07, 0.016), b(0.34, 0.15, 1, 0.05, 0.008), b(0.9, 0.3, 1, 0.03, 0.009), [0, ...this.headPt(0.95, -0.9, 0).toArray().slice(1), 0.035, 0.03, 0.035, 0.012], b(0.24, 0.8, 1, 0.035, 0.007)]);
    }
    const eyeM = new THREE.MeshPhysicalMaterial({ color: '#120a06', roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.6 });
    // szem, szemhéj, orrlyuk – a fej hálójába / egy közös hálóba olvasztva (kevesebb rajzhívás)
    const place = (g, pos, scl, rotY = 0) => { const m = new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), scl); g.applyMatrix4(m); if (g.index) g = g.toNonIndexed(); g.deleteAttribute('uv'); return g; };
    const eyeParts = [], lidParts = [];
    for (const s of [-1, 1]) {
      const ep = this.headPt(0.27, 0.56, s, 0.92);
      eyeParts.push(place(new THREE.SphereGeometry(0.03, 14, 12), ep, new THREE.Vector3(0.75, 0.95, 1.2)));
      lidParts.push(place(new THREE.TorusGeometry(0.03, 0.007, 6, 16), ep, new THREE.Vector3(1, 0.95, 1.2), Math.PI / 2 + s * 0.25));
      eyeParts.push(place(new THREE.SphereGeometry(0.019, 8, 6), this.headPt(0.92, 0.28, s, 0.95), new THREE.Vector3(0.7, 1.3, 0.8)));
    }
    const headAll = mergeGeometries([headGeo.toNonIndexed(), ...lidParts]);
    add(this.head, headAll, this.mats.head);
    const eyes = add(this.head, mergeGeometries(eyeParts), eyeM, false); this.detail.push(eyes);
    // fülek
    this.ears = [];
    for (const s of [-1, 1]) {
      const eg = new THREE.Group(); eg.position.set(s * 0.055, 0.0, -0.035); eg.rotation.set(0.15, 0, -s * 0.28); this.head.add(eg);
      const cg = new THREE.ConeGeometry(0.036, 0.15, 8); cg.translate(0, 0.075, 0); cg.scale(1, 1, 0.62);
      add(eg, cg, this.mats.head); this.ears.push(eg);
    }

    // ---- sörény ----
    this.buildMane();

    // ---- farok ----
    this.tail = [];
    {
      let parent = new THREE.Group(); parent.position.set(0, 1.5 - BODY_Y, -0.81); this.body.add(parent);
      const segs = [
        [0.2, [[0, 0.046, 0.05], [1, 0.04, 0.045]], 0.55, this.mats.body],
        [0.17, [[0, 0.055, 0.06], [1, 0.085, 0.082]], -0.3, this.maneMat],
        [0.17, [[0, 0.085, 0.082], [1, 0.096, 0.09]], -0.15, this.maneMat],
        [0.17, [[0, 0.096, 0.09], [1, 0.082, 0.078]], -0.05, this.maneMat],
        [0.17, [[0, 0.082, 0.078], [0.65, 0.055, 0.05], [1, 0.012, 0.012]], 0, this.maneMat],
      ];
      let first = true;
      for (const [L, prof, rest, mat] of segs) {
        const g = first ? parent : new THREE.Group();
        if (!first) { g.position.y = -this.tail[this.tail.length - 1].L * 0.92; this.tail[this.tail.length - 1].g.add(g); }
        const isHair = mat === this.maneMat;
        if (!isHair) add(g, limb(L, prof.map(([t, a, b]) => [t, a, b, 0]), 10), mat);
        // szőrkártyák a tengely körül
        {
          const C = new Cards(), idx = this.tail.length, K = 6;
          const rad = (t) => { let i = 0; while (i < prof.length - 2 && prof[i + 1][0] < t) i++; const a = prof[i], b = prof[i + 1]; return lerp(a[1], b[1], clamp((t - a[0]) / (b[0] - a[0]), 0, 1)); };
          for (let c = 0; c < K; c++) {
            const an = (c / K) * Math.PI + (idx % 2) * 0.25 + 0.1; const dir = new THREE.Vector3(Math.cos(an), 0, Math.sin(an)), nd = dir.clone().negate();
            const rows = [];
            for (let q = 0; q <= 3; q++) {
              const tt = q / 3, y = 0.03 - tt * L * 1.15;
              const hw = isHair ? rad(tt) * 1.75 + 0.012 : 0.03 + tt * 0.03;
              const ctr = new THREE.Vector3(0, y, 0);
              const v = idx === 0 ? 1 - tt * 0.08 : 0.92 - ((idx - 1) + tt) / 4 * 0.9;
              rows.push({ l: ctr.clone().addScaledVector(dir, hw), r: ctr.clone().addScaledVector(dir, -hw), nl: dir, nr: nd, ul: 0.05 + c * 0.07, ur: 0.55 + c * 0.07, v, w: 0 });
            }
            C.strip(rows);
          }
          const tc = new THREE.Mesh(C.geo(), this.hairMat); tc.castShadow = true; g.add(tc); this.meshes.push(tc);
        }
        g.rotation.x = rest; this.tail.push({ g, L, rest });
        first = false;
      }
    }

    // ---- lábak ----
    const FU = [[0, 0.10, 0.13, 0.02], [0.2, 0.095, 0.125, 0.025], [0.32, 0.085, 0.11, 0.02], [0.5, 0.07, 0.085, 0.012], [0.72, 0.052, 0.062, 0.004], [0.88, 0.047, 0.056, 0.004], [0.97, 0.052, 0.06, 0.006], [1.0, 0.05, 0.058, 0.004]];
    const FL = [[0, 0.054, 0.062, 0.004], [0.1, 0.046, 0.056, 0], [0.4, 0.038, 0.054, -0.01], [0.75, 0.039, 0.055, -0.01], [0.92, 0.049, 0.06, -0.006], [1.0, 0.05, 0.058, -0.004]];
    const HU = [[0, 0.125, 0.16, 0.04], [0.22, 0.112, 0.155, 0.05], [0.4, 0.086, 0.12, 0.035], [0.62, 0.062, 0.085, 0.012], [0.82, 0.046, 0.06, -0.008], [0.94, 0.045, 0.07, -0.022], [1.0, 0.044, 0.066, -0.02]];
    const HLo = [[0, 0.048, 0.072, -0.018], [0.1, 0.042, 0.06, -0.006], [0.45, 0.037, 0.054, -0.01], [0.8, 0.039, 0.055, -0.01], [0.94, 0.049, 0.06, -0.006], [1, 0.05, 0.058, -0.004]];
    const PS = [[0, 0.05, 0.056, -0.004], [0.4, 0.042, 0.046, 0], [0.85, 0.047, 0.05, 0], [1.0, 0.05, 0.052, 0]];
    const hoofGeo = new THREE.CylinderGeometry(0.056, 0.072, HOOF_H, 16); hoofGeo.translate(0, -HOOF_H / 2, 0.012);
    const pastGeo = limb(LP, PS, 10);
    const wrapProf = (prof, a, b) => prof.filter(([t]) => t >= a && t <= b).map(([t, rx, ry, dz]) => [t, rx * 1.22 + 0.006, ry * 1.18 + 0.006, dz]);
    this.legs = [];
    const defs = [
      { n: 'LF', x: 0.165, front: true }, { n: 'RF', x: -0.165, front: true },
      { n: 'LH', x: 0.172, front: false }, { n: 'RH', x: -0.172, front: false },
    ];
    for (const d of defs) {
      const L1 = d.front ? 0.62 : 0.66, L2 = d.front ? 0.30 : 0.40;
      const pivot = d.front ? new THREE.Vector3(d.x, 1.112 - BODY_Y, 0.5) : new THREE.Vector3(d.x, 1.16 - BODY_Y, -0.48);
      const upper = new THREE.Group(); upper.position.set(d.x, 0, 0); this.root.add(upper);
      add(upper, limb(L1, d.front ? FU : HU, 14), this.mats.legU);
      const lower = new THREE.Group(); lower.position.y = -L1; upper.add(lower);
      add(lower, limb(L2, d.front ? FL : HLo, 12), d.front ? this.mats.lowF : this.mats.lowH);
      const lowProf = (d.front ? FL : HLo).map(([t, a, b, c]) => [t, a, b, c]);
      const wrapGeo = limb(L2, [[0.06, 0.045, 0.056, 0], ...wrapProf(lowProf, 0.1, 0.9), [0.94, 0.05, 0.06, -0.004]], 12);
      const wrap = new THREE.Mesh(wrapGeo, new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.9 })); wrap.castShadow = true; wrap.visible = false; lower.add(wrap);
      const past = new THREE.Group(); past.position.y = -L2; lower.add(past);
      add(past, pastGeo, this.mats.past);
      const hoof = new THREE.Group(); hoof.position.y = -LP; hoof.rotation.x = -PAST_REST; past.add(hoof);
      add(hoof, hoofGeo, this.hoofMat);
      this.legs.push({
        ...d, L1, L2, pivot, upper, lower, past, hoof, wrap, pv: new THREE.Vector3(),
        neutralZ: d.front ? 0.53 : -0.75, phase: 0, prevP: 0, stance: true,
      });
    }
    this.legs[2].neutralZ = -0.74; this.legs[3].neutralZ = -0.74;

    this.buildTack();

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

  buildMane() {
    const smp = this.neckSmp, n = smp.length;
    const i0 = 2, i1 = n - 1;
    const cols = i1 - i0 + 1;
    const pos = [], idx = [];
    this.maneBase = [];
    for (const layer of [0, 1]) {
      for (let i = i0; i <= i1; i++) {
        const s = smp[i]; const t = (i - i0) / (cols - 1);
        const crest = s.p.clone().addScaledVector(s.U, s.ry * 0.98);
        const hang = lerp(0.1, 0.19, Math.sin(t * Math.PI * 0.9 + 0.2)) * (layer ? 0.85 : 1);
        const top = crest.clone().addScaledVector(s.U, 0.02 + layer * 0.01).addScaledVector(s.S, -0.012 + layer * 0.02);
        const bot = crest.clone().addScaledVector(s.S, 0.07 + layer * 0.02).addScaledVector(s.U, -0.02).add(new THREE.Vector3(0, -hang, 0));
        pos.push(top.x, top.y, top.z, bot.x, bot.y, bot.z);
        this.maneBase.push(top, bot);
      }
      const base = layer * cols * 2;
      for (let i = 0; i < cols - 1; i++) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 2, a + 1, a + 3); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    this.maneGeo = g;
    const m = new THREE.Mesh(g, this.maneMat); m.castShadow = true; this.neck.add(m);
    // szálas sörény
    const C = new Cards(), r = mulberry32(12), down = new THREE.Vector3(0, -1, 0);
    for (let i = i0; i <= i1; i++) for (let layer = 0; layer < 3; layer++) {
      const sm = smp[i], t = (i - i0) / (cols - 1);
      const crest = sm.p.clone().addScaledVector(sm.U, sm.ry * 0.96);
      const L = lerp(0.12, 0.24, Math.sin(t * Math.PI * 0.9 + 0.2)) * (0.75 + r() * 0.45) * (layer === 2 ? 0.6 : 1);
      const nrm = sm.S.clone().multiplyScalar(0.75).addScaledVector(sm.U, 0.55).normalize();
      const u0 = r() * 0.5, rows = [];
      for (let k = 0; k <= 3; k++) {
        const tt = k / 3;
        const c = crest.clone().addScaledVector(sm.U, 0.022 * (1 - tt) + layer * 0.006).addScaledVector(sm.S, 0.01 + (0.07 + layer * 0.012) * tt + (layer === 2 ? -0.03 : 0))
          .addScaledVector(down, L * tt).addScaledVector(sm.T, -0.035 * tt + (r() - 0.5) * 0.01);
        const w = 0.06 * (1 - 0.3 * tt);
        rows.push({ l: c.clone().addScaledVector(sm.T, -w / 2), r: c.clone().addScaledVector(sm.T, w / 2), nl: nrm, nr: nrm, ul: u0, ur: u0 + 0.5, v: 1 - tt * 0.98, w: tt });
      }
      C.strip(rows);
    }
    this.maneCards = C.geo(); this.maneCardBase = this.maneCards.attributes.position.array.slice(); this.maneCardW = C.w;
    const mc = new THREE.Mesh(this.maneCards, this.hairMat); mc.castShadow = true; this.neck.add(mc); this.detail.push(mc);
    // üstök
    const D = this.headD, U = this.headU;
    const fp = (t, o) => D.clone().multiplyScalar(t).addScaledVector(U, o).toArray();
    const fl = loft([
      { p: fp(-0.03, 0.03), rx: 0.03, ry: 0.012 },
      { p: fp(0.06, 0.024), rx: 0.045, ry: 0.012 },
      { p: fp(0.15, 0.02), rx: 0.04, ry: 0.01 },
      { p: fp(0.22, 0.016), rx: 0.012, ry: 0.006 },
    ], { up: [0, 1, 0], radial: 10, sub: 3 });
    const fm = new THREE.Mesh(fl, this.maneMat); this.head.add(fm);
    {
      const C = new Cards(), S = new THREE.Vector3(1, 0, 0);
      for (const [off, len] of [[-0.022, 0.2], [0.0, 0.25], [0.022, 0.19]]) {
        const rows = [];
        for (let k = 0; k <= 3; k++) {
          const tt = k / 3, c = D.clone().multiplyScalar(-0.03 + len * tt).addScaledVector(U, 0.03 - 0.008 * tt).addScaledVector(S, off * (1 + tt));
          const w = 0.05 * (1 - 0.4 * tt);
          rows.push({ l: c.clone().addScaledVector(S, -w / 2), r: c.clone().addScaledVector(S, w / 2), nl: U, nr: U, ul: 0.1, ur: 0.6, v: 1 - tt * 0.97, w: tt });
        }
        C.strip(rows);
      }
      const fc = new THREE.Mesh(C.geo(), this.hairMat); this.head.add(fc); this.detail.push(fc);
    }
  }

  buildTack() {
    const smp = this.torsoSmp;
    const findI = (z) => { let best = 0, bd = 9; smp.forEach((s, i) => { const d = Math.abs(s.p.z - z); if (d < bd) { bd = d; best = i; } }); return best; };
    const P2 = Math.PI / 2;
    this.tack = {};
    const T = this.tack;
    const sm = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.45, clearcoat: 0.35, clearcoatRoughness: 0.35, side: THREE.DoubleSide });
    // alátét
    T.padMat = new THREE.MeshStandardMaterial({ color: '#fff', roughness: 0.9, side: THREE.DoubleSide });
    T.pad = new THREE.Group(); this.body.add(T.pad);
    const padGeo = shell(smp, findI(-0.26), findI(0.44), P2 - 1.3, P2 + 1.3, (u, v) => 0.01 + 0.014 * Math.pow(Math.sin(Math.PI * u), 0.3) * Math.pow(Math.sin(Math.PI * v), 0.3) + 0.028 * smoothstep(0.72, 1, u), { cols: 22 });
    const pm = new THREE.Mesh(padGeo, T.padMat); pm.castShadow = true; T.pad.add(pm);
    // nyereg
    T.saddleMat = sm('#5a3420');
    T.saddle = new THREE.Group(); this.body.add(T.saddle);
    const seat = shell(smp, findI(-0.14), findI(0.3), P2 - 0.78, P2 + 0.78, (u, v) => {
      const e = Math.pow(Math.sin(Math.PI * u), 0.25) * Math.pow(Math.sin(Math.PI * v), 0.25);
      const mid = Math.pow(Math.cos((v - 0.5) * Math.PI), 2);
      return 0.012 + e * (0.03 + mid * (0.075 * smoothstep(0.72, 1, u) + 0.085 * smoothstep(0.3, 0, u)));
    }, { cols: 18 });
    const seatM = new THREE.Mesh(seat, T.saddleMat); seatM.castShadow = true; T.saddle.add(seatM);
    for (const sgn of [-1, 1]) {
      const a0 = sgn > 0 ? P2 + 0.6 : P2 - 1.08, a1 = sgn > 0 ? P2 + 1.08 : P2 - 0.6;
      const flap = shell(smp, findI(0.0), findI(0.3), a0, a1, (u, v) => 0.032 + 0.006 * Math.sin(Math.PI * u), { cols: 8 });
      const f = new THREE.Mesh(flap, T.saddleMat); f.castShadow = true; T.saddle.add(f);
    }
    // heveder
    {
      const zc = 0.24, i = findI(zc), s = smp[i];
      const ring = (dz) => ({ p: [0, s.p.y, zc + dz], rx: s.rx + 0.014, ry: s.ry + 0.014 });
      const gg = loft([ring(-0.035), ring(0.035)], { radial: 26, sub: 1, cap: false, power: 2.15 });
      const gm = new THREE.Mesh(gg, sm('#3a2a20')); T.saddle.add(gm);
    }
    // kengyelek
    T.stirrups = [];
    const ironMat = new THREE.MeshStandardMaterial({ color: '#c9ccd1', metalness: 0.7, roughness: 0.3 });
    for (const sgn of [-1, 1]) {
      const iron = new THREE.Group();
      const tg = new THREE.TorusGeometry(0.055, 0.008, 6, 14, Math.PI); iron.add(new THREE.Mesh(tg, ironMat));
      const tread = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.05), ironMat); tread.position.y = -0.0; iron.add(tread);
      tg.rotateZ(Math.PI); tg.translate(0, 0.0, 0);
      iron.rotation.y = Math.PI / 2;
      const leather = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1, 0.006), T.saddleMat);
      T.saddle.add(iron); T.saddle.add(leather);
      const s = smp[findI(0.18)];
      const attach = new THREE.Vector3(sgn * (s.rx * 0.72 + 0.03), s.p.y + s.ry * 0.62 + 0.03, 0.18);
      T.stirrups.push({ iron, leather, attach, rest: new THREE.Vector3(sgn * 0.37, -0.27, 0.12), up: new THREE.Vector3(sgn * (s.rx * 0.8 + 0.04), s.p.y + 0.18, 0.18) });
    }
    // kantár (a fej koordinátáiban)
    T.bridleMat = new THREE.MeshStandardMaterial({ color: '#4a2c1b', roughness: 0.6 });
    T.bridle = new THREE.Group(); this.head.add(T.bridle);
    const strap = (pts, closed = false, r = 0.0095) => {
      const c = new THREE.CatmullRomCurve3(pts, closed);
      const m = new THREE.Mesh(new THREE.TubeGeometry(c, pts.length * 6, r, 5, closed), T.bridleMat); m.castShadow = true; T.bridle.add(m); return m;
    };
    const hp = (s, v, side) => this.headPt(s, v, side, 1.07);
    // arcszíj + fejtető
    const cheek = (side) => [hp(0.86, -0.42, side), hp(0.62, -0.25, side), hp(0.38, -0.05, side), hp(0.16, 0.18, side), hp(0.04, 0.45, side)];
    strap([...cheek(1), new THREE.Vector3(0, 0.06, -0.05), ...cheek(-1).reverse()]);
    // orrszíj
    const nb2 = []; for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; const v = Math.sin(a); const r = this.headRing(0.66); nb2.push(r.c.clone().addScaledVector(this.headU, r.ry * v * 1.08).add(new THREE.Vector3(Math.cos(a) * r.rx * 1.08, 0, 0))); }
    strap(nb2, true, 0.012);
    // homlokszíj
    const bb = []; for (let k = 0; k <= 8; k++) { const a = -0.2 + (k / 8) * (Math.PI + 0.4); const r = this.headRing(0.07); bb.push(r.c.clone().addScaledVector(this.headU, r.ry * Math.sin(a) * 1.1).add(new THREE.Vector3(Math.cos(a) * r.rx * 1.12, 0, 0))); }
    strap(bb, false, 0.009);
    // torokszíj
    strap([hp(0.1, 0.1, 1), hp(0.2, -0.75, 1), new THREE.Vector3(0, this.headRing(0.18).c.y - 0.16, this.headRing(0.18).c.z - 0.06), hp(0.2, -0.75, -1), hp(0.1, 0.1, -1)]);
    // zabla karikák
    this.bits = [];
    const bitM = new THREE.MeshStandardMaterial({ color: '#d0d3d8', metalness: 0.8, roughness: 0.25 });
    for (const side of [1, -1]) {
      const b = new THREE.Mesh(new THREE.TorusGeometry(0.03, 0.006, 6, 14), bitM); b.position.copy(hp(0.9, -0.5, side)); b.rotation.y = Math.PI / 2; T.bridle.add(b);
      this.bits.push(b);
    }
    // fásli: a lábaknál (this.legs[].wrap)
    // takaró
    T.blanketMat = new THREE.MeshStandardMaterial({ color: '#2f63d6', roughness: 0.85, side: THREE.DoubleSide });
    T.blanket = new THREE.Group(); this.body.add(T.blanket);
    const bl = shell(smp, findI(-0.8), findI(0.62), P2 - 1.62, P2 + 1.62, (u, v) => 0.038 + 0.012 * Math.sin(Math.PI * v), { cols: 26 });
    T.blanket.add(new THREE.Mesh(bl, T.blanketMat));
    T.blanket.children[0].castShadow = true;
    const trim = shell(smp, findI(-0.8), findI(0.62), P2 - 1.66, P2 - 1.5, () => 0.044, { cols: 2 });
    const trim2 = shell(smp, findI(-0.8), findI(0.62), P2 + 1.5, P2 + 1.66, () => 0.044, { cols: 2 });
    T.trimMat = new THREE.MeshStandardMaterial({ color: '#f4f2ec', roughness: 0.8, side: THREE.DoubleSide });
    T.blanket.add(new THREE.Mesh(trim, T.trimMat)); T.blanket.add(new THREE.Mesh(trim2, T.trimMat));
  }

  setCoat(key, { blaze = false, socks = false } = {}) {
    const c = COATS[key] || COATS.pej; this.coatKey = key;
    for (const k in this.mats) {
      const u = this.mats[k].userData.u;
      const pts = (k === 'lowF' || k === 'lowH' || k === 'past') && c.points;
      u.uBase.value.set(pts ? c.points : c.base);
      u.uPatchAmt.value = c.patch && !c.dapple ? 1 : 0; if (c.patch) u.uPatch.value.set(c.patch);
      u.uDapple.value = c.dapple && !(k === 'lowF' || k === 'lowH' || k === 'past') ? 1 : 0;
      this.mats[k].sheenColor.set(pts ? c.points : c.base).lerp(new THREE.Color('#ffffff'), 0.55);
      u.uSock.value = socks && (k === 'lowF' || k === 'lowH' || k === 'past') ? 1 : 0;
    }
    this.mats.head.userData.u.uBlaze.value = blaze ? 1 : 0;
    this.maneMat.color.set(c.mane).multiplyScalar(0.8); this.hairMat.color.set(c.mane);
  }
  setDetail(on) { if (this._det === on) return; this._det = on; for (const m of this.detail) m.visible = on; }
  // boxban: a lábak és a farok nem látszanak, árnyékot sem vet (kevesebb rajzhívás)
  setStall(on) { if (this._stall === on) return; this._stall = on; for (const l of this.legs) l.upper.visible = !on; if (this.tail[0]) this.tail[0].g.visible = !on; }
  setShadow(on) { if (this._sh === on) return; this._sh = on; this.root.traverse((o) => { if (!o.isMesh) return; if (o.userData.cs === undefined) o.userData.cs = o.castShadow; o.castShadow = on ? o.userData.cs : false; }); }
  setDirt(d) { for (const k in this.mats) { const m = this.mats[k]; m.userData.u.uDirt.value = d; m.clearcoat = 0.02 + 0.24 * (1 - d); m.sheen = 0.15 + 0.4 * (1 - d); m.roughness = 0.5 + d * 0.25; } }

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

    // sörény lobogása
    {
      const pa = this.maneGeo.attributes.position, base = this.maneBase;
      const wind = smoothstep(2, 12, v);
      for (let i = 0; i < base.length; i += 2) {
        const b = base[i + 1]; const ii = i / 2;
        const fl = Math.sin(this.time * (6 + v * 0.8) + ii * 0.9) * 0.02 * (0.3 + wind);
        pa.setXYZ(i + 1, b.x + fl, b.y + wind * 0.06, b.z - wind * 0.09 + fl);
      }
      pa.needsUpdate = true;
      const ca = this.maneCards.attributes.position, cb = this.maneCardBase, cw = this.maneCardW;
      for (let i = 0; i < cw.length; i++) {
        const w = cw[i], w2 = w * w, ph = this.time * (5 + v * 0.8) + i * 0.37;
        const fl = Math.sin(ph) * 0.018 * (0.3 + wind) * w;
        ca.array[i * 3] = cb[i * 3] + fl; ca.array[i * 3 + 1] = cb[i * 3 + 1] + wind * 0.07 * w2; ca.array[i * 3 + 2] = cb[i * 3 + 2] - wind * 0.11 * w2 + fl * 0.5;
      }
      ca.needsUpdate = true;
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

// szálas szőrtextúra a sörényhez és a farokhoz (átlátszó háttér)
function hairTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const x = c.getContext('2d');
  const r = mulberry32(31);
  for (let i = 0; i < 120; i++) {
    const sx = r() * 64, len = 256 * (0.5 + r() * 0.5), w = 0.7 + r() * 1.7, a = 0.55 + r() * 0.45, sh = 175 + Math.floor(r() * 80);
    const g = x.createLinearGradient(0, 0, 0, len);
    g.addColorStop(0, `rgba(${sh},${sh},${sh},${a})`); g.addColorStop(0.75, `rgba(${sh},${sh},${sh},${a * 0.9})`); g.addColorStop(1, `rgba(${sh},${sh},${sh},0)`);
    x.strokeStyle = g; x.lineWidth = w; x.beginPath(); x.moveTo(sx, 0);
    x.quadraticCurveTo(sx + (r() - 0.5) * 16, len * 0.5, sx + (r() - 0.5) * 12, len); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// kártyák (négyszögcsíkok) gyűjtője: sorok bal/jobb pontokkal
class Cards {
  constructor() { this.pos = []; this.nor = []; this.uv = []; this.idx = []; this.w = []; }
  strip(rows) { // rows: [{l, r, nl, nr, ul, ur, v, w}]
    const b = this.pos.length / 3;
    rows.forEach((q, k) => {
      this.pos.push(q.l.x, q.l.y, q.l.z, q.r.x, q.r.y, q.r.z);
      this.nor.push(q.nl.x, q.nl.y, q.nl.z, q.nr.x, q.nr.y, q.nr.z);
      this.uv.push(q.ul, q.v, q.ur, q.v); this.w.push(q.w, q.w);
      if (k > 0) { const a = b + (k - 1) * 2; this.idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    });
  }
  geo() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uv, 2)); g.setIndex(this.idx); return g;
  }
}
