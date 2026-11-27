import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from './noise.js';
import { loft, limb } from './geom.js';
import { flat as flat0 } from './lowpoly.js';
const flat = (c, o = {}) => flat0(c, typeof o === 'number' ? { roughness: o } : o);

export const SEAT = new THREE.Vector3(0, 0.47, 0.03);
const DOWN = new THREE.Vector3(0, -1, 0);
export const HAIR = { barna: '#5b3a22', szoke: '#d9b56a', fekete: '#1b1612', voros: '#a4482a' };

function cap(r, L, mat, parent, { sx = 1, sz = 1, y = null } = {}) {
  const g = new THREE.CapsuleGeometry(r, Math.max(0.01, L - r), 6, 12); g.translate(0, y == null ? -L / 2 : y, 0); g.scale(sx, 1, sz);
  const m = new THREE.Mesh(g, mat); m.castShadow = true; parent.add(m); return m;
}

function ik2(L1, L2, y, z, bendForward) {
  let d = Math.hypot(y, z); const dc = clamp(d, Math.abs(L1 - L2) + 0.02, (L1 + L2) * 0.999);
  y *= dc / d; z *= dc / d; d = dc;
  const base = Math.atan2(-z, -y);
  const a1 = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const t1 = bendForward ? base - a1 : base + a1;
  const ky = -L1 * Math.cos(t1), kz = -L1 * Math.sin(t1);
  const t2 = Math.atan2(-(z - kz), -(y - ky));
  return [t1, t2];
}

export class Rider {
  constructor(horse) {
    this.horse = horse;
    this.root = new THREE.Group(); this.root.position.copy(SEAT); horse.body.add(this.root);
    const skin = flat('#f4cfae', { roughness: 0.8, emissive: '#7a3b22', emissiveIntensity: 0.16 });
    this.m = {
      skin, jacket: flat('#1f2f5c', 0.7), breeches: flat('#f2efe6', { roughness: 0.85 }), boots: flat('#1b1713', { roughness: 0.45 }),
      helmet: flat('#1d1d22', { roughness: 0.45 }), hair: flat('#5b3a22', { roughness: 0.7 }), glove: flat('#2a2420', { roughness: 0.7 }),
      dark: flat('#1a1210', { roughness: 0.4 }), white: flat('#f7f5f0', { roughness: 0.7 }), lip: flat('#d0706a', { roughness: 0.6 }), blush: flat('#f0a093', { roughness: 0.8 }),
    };
    const M = this.m;
    const mesh = (g, m, parent, shadow = true) => { const x = new THREE.Mesh(g, m); x.castShadow = shadow; x.receiveShadow = true; parent.add(x); return x; };
    const vloft = (rings, o = {}) => loft(rings.map(([y, rx, rz, z = 0]) => ({ p: [0, y, z], rx, ry: rz })), { up: [0, 0, 1], radial: 8, sub: 1, power: 2.2, ...o });
    const ball = (r, m, parent, [x, y, z], [sx, sy, sz] = [1, 1, 1], det = 0) => { const g = new THREE.IcosahedronGeometry(r, det); g.scale(sx, sy, sz); const k = mesh(g, m, parent); k.position.set(x, y, z); return k; };
    // medence (lovaglónadrág)
    this.pelvis = new THREE.Group(); this.root.add(this.pelvis);
    mesh(vloft([[-0.1, 0.05, 0.04, -0.01], [-0.078, 0.13, 0.1, -0.012], [-0.02, 0.152, 0.115, -0.012], [0.05, 0.142, 0.1, -0.008], [0.085, 0.126, 0.09, -0.004]]), M.breeches, this.pelvis);
    // törzs (zakó)
    this.torso = new THREE.Group(); this.torso.position.set(0, 0.05, -0.02); this.pelvis.add(this.torso);
    mesh(vloft([[-0.085, 0.157, 0.119, -0.01], [0.06, 0.133, 0.097, 0.0], [0.24, 0.15, 0.105, 0.013],
      [0.34, 0.165, 0.098, 0.004], [0.405, 0.134, 0.074, -0.008], [0.425, 0.06, 0.05, -0.005]]), M.jacket, this.torso);
    for (const sx of [-1, 1]) ball(0.055, M.jacket, this.torso, [sx * 0.163, 0.368, -0.006], [1, 0.9, 1]);
    { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.043, 0.1, 6), M.skin); c.position.y = 0.44; this.torso.add(c); }
    { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.068, 0.06, 8, 1, true), M.white); col.position.y = 0.418; this.torso.add(col); }
    // fej (kicsit nagyobb, kedvesebb arányok)
    this.head = new THREE.Group(); this.head.position.set(0, 0.47, 0); this.torso.add(this.head);
    const HG = new THREE.Group(); HG.scale.setScalar(1.08); HG.position.y = -0.004; this.head.add(HG);
    ball(0.095, M.skin, HG, [0, 0.07, 0.004], [0.9, 1.05, 0.95], 1);
    for (const sx of [-1, 1]) {
      ball(0.018, M.skin, HG, [sx * 0.08, 0.07, -0.004], [0.5, 1, 0.8]);
      ball(0.013, M.dark, HG, [sx * 0.032, 0.074, 0.087], [0.8, 1.25, 0.6]);
      ball(0.013, M.blush, HG, [sx * 0.05, 0.05, 0.076], [1, 0.55, 0.4]);
      const br = mesh(new THREE.BoxGeometry(0.024, 0.005, 0.006), M.hair, HG, false); br.position.set(sx * 0.032, 0.094, 0.088); br.rotation.z = -sx * 0.12;
    }
    ball(0.01, M.skin, HG, [0, 0.058, 0.094], [0.8, 1.0, 1]);
    { const mo = mesh(new THREE.BoxGeometry(0.022, 0.005, 0.006), M.lip, HG, false); mo.position.set(0, 0.037, 0.086); }
    // sisak ellenzővel és szíjjal
    { const hl = new THREE.Group(); hl.position.y = 0.012; HG.add(hl); this.helmetG = hl;
      const hg = new THREE.SphereGeometry(0.108, 10, 4, 0, Math.PI * 2, 0, Math.PI * 0.55); hg.scale(1, 0.96, 1.08); const h = mesh(hg, M.helmet, hl); h.position.set(0, 0.09, -0.006);
      const rim = mesh(new THREE.TorusGeometry(0.105, 0.008, 3, 10), M.helmet, hl); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.08, 1); rim.position.set(0, 0.083, -0.006);
      const pk = new THREE.CylinderGeometry(0.075, 0.075, 0.009, 7, 1, false, -Math.PI / 2, Math.PI); pk.scale(1, 1, 0.62);
      const peak = mesh(pk, M.helmet, hl); peak.position.set(0, 0.093, 0.074); peak.rotation.x = 0.28;
      for (const sx of [-1, 1]) { const st = mesh(new THREE.BoxGeometry(0.008, 0.1, 0.012), M.dark, hl, false); st.position.set(sx * 0.074, 0.04, 0.02); st.rotation.z = sx * 0.12; }
      const chin = mesh(new THREE.BoxGeometry(0.09, 0.006, 0.01), M.dark, hl, false); chin.position.set(0, -0.018, 0.03); }
    // haj a fej tetején (sisak nélkül látszik)
    { const tg = new THREE.SphereGeometry(0.098, 9, 4, 0, Math.PI * 2, 0, Math.PI * 0.5); tg.scale(0.93, 1.0, 1.04); const t = mesh(tg, M.hair, HG); t.position.set(0, 0.086, -0.01); t.rotation.x = -0.25; t.visible = false; this.hairTop = t;
      const fr = new THREE.SphereGeometry(0.095, 7, 2, Math.PI * 0.15, Math.PI * 0.7, Math.PI * 0.3, Math.PI * 0.12); const f = mesh(fr, M.hair, HG); f.position.set(0, 0.088, 0.0); f.rotation.y = Math.PI; f.visible = false; this.hairFringe = f; }
    // haj
    { const hh = new THREE.SphereGeometry(0.096, 9, 4, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.32); const k = mesh(hh, M.hair, HG); k.position.set(0, 0.078, -0.014); }
    this.pony = new THREE.Group(); this.pony.position.set(0, 0.075, -0.106); this.head.add(this.pony);
    ball(0.04, M.hair, this.pony, [0, 0, 0], [1.1, 1, 1]);
    mesh(limb(0.27, [[0, 0.04, 0.034, 0], [0.3, 0.048, 0.04, 0.004], [0.7, 0.034, 0.03, 0.006], [1, 0.008, 0.008, 0]], 6, 1), M.hair, this.pony);
    // karok
    const UA = [[0, 0.052, 0.052], [0.5, 0.045, 0.044], [1, 0.039, 0.038]], FA = [[0, 0.04, 0.039], [0.5, 0.037, 0.034], [1, 0.03, 0.027]];
    this.arms = [];
    for (const s of [-1, 1]) {
      const plane = new THREE.Group(); plane.position.set(s * 0.165, 0.36, 0.0); this.torso.add(plane);
      const up = new THREE.Group(); plane.add(up); mesh(limb(0.28, UA.map(([t, a, b]) => [t, a, b, 0]), 6, 1), M.jacket, up);
      const fo = new THREE.Group(); fo.position.y = -0.27; up.add(fo); mesh(limb(0.26, FA.map(([t, a, b]) => [t, a, b, 0]), 6, 1), M.jacket, fo);
      const hand = new THREE.Group(); hand.position.y = -0.25; fo.add(hand);
      ball(0.035, M.glove, hand, [0, -0.03, 0], [0.75, 1.1, 1.0]);
      ball(0.03, M.glove, hand, [0, -0.06, 0.012], [0.8, 0.9, 1.0]);
      const th = mesh(new THREE.BoxGeometry(0.02, 0.045, 0.02), M.glove, hand); th.position.set(s * -0.02, -0.035, 0.022); th.rotation.x = 0.6;
      this.arms.push({ s, plane, up, fo, hand });
    }
    // lábak
    const TH = [[0, 0.08, 0.086, 0], [0.4, 0.069, 0.072, 0.004], [0.8, 0.057, 0.059, 0], [1, 0.053, 0.055, 0]];
    const BO = [[-0.035, 0.061, 0.065, 0], [0.3, 0.056, 0.064, -0.012], [0.7, 0.044, 0.05, -0.004], [1, 0.039, 0.045, 0]];
    const footGeo = loft([{ p: [0, -0.012, -0.048], rx: 0.034, ry: 0.036 }, { p: [0, -0.022, 0.02], rx: 0.04, ry: 0.036 }, { p: [0, -0.034, 0.1], rx: 0.034, ry: 0.024 }, { p: [0, -0.039, 0.15], rx: 0.008, ry: 0.008 }], { up: [0, 1, 0], radial: 6, sub: 1 });
    this.legs = [];
    for (const s of [-1, 1]) {
      const plane = new THREE.Group(); this.root.add(plane);
      const th = new THREE.Group(); plane.add(th); mesh(limb(0.44, TH, 7, 1), M.breeches, th);
      const kn = new THREE.Group(); kn.position.y = -0.43; th.add(kn); mesh(limb(0.41, BO, 7, 1), M.boots, kn);
      const ft = new THREE.Group(); ft.position.y = -0.4; kn.add(ft);
      mesh(footGeo, M.boots, ft);
      const heel = mesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), M.boots, ft); heel.position.set(0, -0.052, -0.03);
      this.legs.push({ s, plane, th, kn, ft });
    }
    this.lean = 0.1; this.rise = 0; this.time = 0;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._h = new THREE.Vector3(); this._f = new THREE.Vector3(); this._d = new THREE.Vector3(); this._p = new THREE.Vector3(); this._k = new THREE.Vector3(); this._fe = new THREE.Vector3(); this._u = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._e = new THREE.Euler();
    this.feetBody = [new THREE.Vector3(), new THREE.Vector3()];
  }

  attach(horse) {
    this.horse = horse; horse.body.add(this.root); this.root.position.copy(SEAT); this.root.rotation.set(0, 0, 0); this.setHelmet(true);
  }
  detach(parent) { parent.add(this.root); this.root.position.set(0, 0, 0); this.root.rotation.set(0, 0, 0); }
  setHelmet(on) { this.helmetG.visible = on; this.hairTop.visible = !on; this.hairFringe.visible = !on; }

  // kétcsontos láb IK a gyökér koordinátáiban: H csípő, F boka, pole a térd iránya
  legTo(L, H, F, pole, footPitch = 0) {
    const L1 = 0.43, L2 = 0.41;
    const dv = this._d.subVectors(F, H); let d = dv.length(); dv.normalize();
    d = clamp(d, 0.2, (L1 + L2) * 0.995);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    const pl = this._p.copy(pole).normalize(); pl.addScaledVector(dv, -pl.dot(dv)).normalize();
    const K = this._k.copy(H).addScaledVector(dv, a).addScaledVector(pl, h);
    const Fe = this._fe.copy(H).addScaledVector(dv, d);
    L.plane.position.copy(H); L.plane.rotation.set(0, 0, 0); L.th.rotation.set(0, 0, 0); L.kn.rotation.set(0, 0, 0);
    const qT = L.th.quaternion.setFromUnitVectors(DOWN, this._u.subVectors(K, H).normalize());
    const qS = this._q.setFromUnitVectors(DOWN, this._u.subVectors(Fe, K).normalize());
    L.kn.quaternion.copy(qT).invert().multiply(qS);
    L.ft.quaternion.copy(qS).invert().multiply(this._q2.setFromEuler(this._e.set(footPitch, 0, 0)));
  }

  // gyalog: séta, futás, ülés, fekvés, fürdés
  updateFoot(dt, st) {
    this.time += dt;
    const TAU = Math.PI * 2, v = st.v || 0, pose = st.pose || 'stand';
    this.wph = this.wph || 0;
    const run = v > 2.6, duty = run ? 0.38 : 0.6;
    const S = run ? clamp(0.55 + v * 0.14, 0.8, 1.25) : clamp(0.22 + v * 0.34, 0.3, 0.78);
    const amp = pose === 'stand' ? smoothstep(0.04, 0.45, v) : 0;
    if (amp > 0) this.wph = (this.wph + dt * v * duty / S) % 1;
    const lift = run ? 0.2 : 0.09, hipY = -0.03;
    const feetZ = [0, 0];
    this.pelvis.rotation.set(0, 0, 0); this.torso.rotation.set(0, 0, 0); this.head.rotation.set(0, 0, 0);
    let bob = 0;
    if (pose === 'stand') {
      bob = (run ? 0.045 : 0.02) * Math.cos(2 * TAU * this.wph) * amp - (run ? 0.05 : 0.0) * amp;
      this.pelvis.position.set(0, bob, 0);
      this.pelvis.rotation.y = Math.sin(TAU * this.wph) * 0.08 * amp;
      this.torso.rotation.x = (run ? 0.2 : 0.05) * amp + 0.02;
      this.torso.rotation.y = -Math.sin(TAU * this.wph) * 0.14 * amp;
      this.head.rotation.x = -this.torso.rotation.x * 0.7;
      this.legs.forEach((L, i) => {
        const p = (this.wph + i * 0.5) % 1; let z, y;
        if (p < duty) { const t = p / duty; z = S / 2 - t * S; y = 0; }
        else { const t = (p - duty) / (1 - duty); z = -S / 2 + (0.5 - 0.5 * Math.cos(Math.PI * t)) * S; y = Math.sin(Math.PI * t) * lift; }
        feetZ[i] = z * amp;
        const F = this._f.set(L.s * 0.11, hipY - 0.835 + y * amp - bob, z * amp);
        const H = this._h.set(L.s * 0.11, hipY, 0);
        this.legTo(L, H, F, this._v.set(L.s * 0.08, 0, 1), (y > 0.02 ? -0.25 : 0) * amp);
      });
      this.arms.forEach((A, i) => {
        const sw = amp * (run ? 0.9 : 0.42) * (feetZ[i] / Math.max(S / 2, 0.01));
        A.plane.rotation.set(0, 0, A.s * 0.1);
        A.up.rotation.set(sw, 0, 0); A.fo.rotation.set(-(run ? 1.4 : 0.3) - Math.max(0, -sw) * 0.4, 0, 0);
      });
      this.pony.rotation.x = 0.25 + Math.sin(this.time * 9) * 0.05 * amp + (run ? 0.25 : 0);
    } else if (pose === 'sit' || pose === 'bath') {
      const bath = pose === 'bath';
      this.pelvis.position.set(0, 0, 0);
      this.torso.rotation.x = bath ? -0.42 : -0.08; this.head.rotation.x = bath ? 0.3 : 0.05;
      this.legs.forEach((L) => {
        const H = this._h.set(L.s * 0.11, hipY, 0);
        const F = bath ? this._f.set(L.s * 0.13, hipY - 0.16, 0.8) : this._f.set(L.s * 0.14, hipY - 0.42, 0.47);
        this.legTo(L, H, F, this._v.set(L.s * 0.1, 1, 0.3), bath ? -0.6 : 0);
      });
      this.arms.forEach((A) => { A.plane.rotation.set(0, 0, A.s * (bath ? 0.5 : 0.12)); A.up.rotation.set(bath ? 0.2 : -0.45, 0, 0); A.fo.rotation.set(bath ? -0.4 : -0.85, 0, 0); });
      this.pony.rotation.x = bath ? 1.2 : 0.2;
    } else if (pose === 'lie') {
      this.pelvis.position.set(0, 0, 0); this.head.rotation.x = 0.12;
      this.legs.forEach((L) => { const H = this._h.set(L.s * 0.11, hipY, 0); const F = this._f.set(L.s * 0.13, hipY - 0.82, 0.02); this.legTo(L, H, F, this._v.set(0, 0, 1), -1.1); });
      this.arms.forEach((A) => { A.plane.rotation.set(0, 0, A.s * 0.16); A.up.rotation.set(0.05, 0, 0); A.fo.rotation.set(-0.15, 0, 0); });
      this.pony.rotation.x = 1.5;
    }
    this.feetBody[0].set(0, 0, 0); this.feetBody[1].set(0, 0, 0);
  }

  setLook({ jacket, helmet, hair }) {
    if (jacket) this.m.jacket.color.set(jacket);
    if (helmet) this.m.helmet.color.set(helmet);
    if (hair) { this.m.hair.color.set(HAIR[hair] || hair); if (this.hairCardMat) this.hairCardMat.color.set(HAIR[hair] || hair); }
  }

  update(dt, st) {
    this.time += dt;
    const ph = this.horse.phase, TAU = Math.PI * 2, g = st.gait;
    const amp = clamp(st.v / 1.5, 0, 1);
    let leanT = { stand: 0.05, walk: 0.1, trot: 0.2, canter: 0.24, gallop: 0.66 }[g] ?? 0.1;
    let riseT = 0, riseZ = 0;
    if (g === 'trot') riseT = 0.075 * (0.5 - 0.5 * Math.cos(TAU * (ph - 0.12))) * amp;
    if (g === 'gallop') riseT = 0.1;
    if (g === 'canter') riseT = 0.012 * Math.sin(TAU * (ph - 0.4));
    const jw = st.jumpT >= 0 ? Math.sin(Math.PI * clamp(st.jumpT, 0, 1)) : 0;
    leanT = lerp(leanT, 0.85, jw); riseT = lerp(riseT, 0.14, jw);
    this.lean = damp(this.lean, leanT, 6, dt);
    this.rise = g === 'trot' ? lerp(this.rise, riseT, 1 - Math.exp(-dt * 25)) : damp(this.rise, riseT, 8, dt);
    riseZ = this.lean * 0.1;
    this.pelvis.position.set(0, this.rise, riseZ);
    this.pelvis.rotation.set(0, 0, 0); this.torso.rotation.set(0, 0, 0);
    this.pelvis.rotation.x = g === 'canter' ? Math.sin(TAU * (ph - 0.35)) * 0.07 * amp : 0;
    this.pelvis.rotation.z = g === 'walk' ? Math.sin(TAU * ph) * 0.03 * amp : 0;
    this.torso.rotation.x = this.lean;
    this.head.rotation.x = -this.lean * 0.75 + (st.lookDown || 0);
    this.head.rotation.y = damp(this.head.rotation.y, clamp((st.yawRate || 0) * 0.25, -0.5, 0.5), 4, dt);
    this.pony.rotation.x = 0.35 + this.lean * 0.4 + Math.sin(this.time * 7 + ph * TAU) * 0.08 * amp + smoothstep(6, 12, st.v) * 0.5;

    // lábak – kengyelhez (3D két-csontos IK, a térd kifelé-előre néz)
    const stir = this.horse.tack.stirrups;
    this.legs.forEach((L, i) => {
      const rest = stir[i].rest;
      const H = this._h.set(L.s * 0.12, this.rise - 0.03, riseZ);
      const F = this._f.set(rest.x - SEAT.x, rest.y - SEAT.y, rest.z - SEAT.z);
      const L1 = 0.43, L2 = 0.41;
      const dv = this._d.subVectors(F, H); let d = dv.length(); dv.normalize();
      d = clamp(d, 0.2, (L1 + L2) * 0.995);
      const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
      const pole = this._p.set(L.s * 0.85, 0.1, 1).normalize();
      pole.addScaledVector(dv, -pole.dot(dv)).normalize();
      const K = this._k.copy(H).addScaledVector(dv, a).addScaledVector(pole, h);
      const Fe = this._fe.copy(H).addScaledVector(dv, d);
      L.plane.position.copy(H); L.plane.rotation.set(0, 0, 0);
      L.th.rotation.set(0, 0, 0); L.kn.rotation.set(0, 0, 0);
      const qT = L.th.quaternion.setFromUnitVectors(DOWN, this._u.subVectors(K, H).normalize());
      const qS = this._q.setFromUnitVectors(DOWN, this._u.subVectors(Fe, K).normalize());
      L.kn.quaternion.copy(qT).invert().multiply(qS);
      L.ft.quaternion.copy(qS).invert().multiply(this._q2.setFromEuler(this._e.set(-0.12, 0, 0)));
      this.feetBody[i].set(rest.x, rest.y - 0.058, rest.z + 0.05);
    });

    // karok – kantárhoz
    this.root.updateMatrixWorld(true);
    const handZ = lerp(0.36, 0.6, smoothstep(0.2, 0.8, this.lean)), handY = lerp(0.5, 0.56, smoothstep(0.2, 0.8, this.lean));
    this.arms.forEach((A) => {
      const tgt = this._w.set(A.s * 0.1, handY + (st.handsUp || 0), handZ);
      this.horse.body.localToWorld(tgt);
      this.torso.worldToLocal(tgt);
      const vx = tgt.x - A.plane.position.x, vy = tgt.y - A.plane.position.y, vz = tgt.z - A.plane.position.z;
      A.plane.rotation.z = Math.atan2(vx, -vy);
      const [t1, t2] = ik2(0.27, 0.25, -Math.hypot(vx, vy), vz, false);
      A.up.rotation.x = t1; A.fo.rotation.x = t2 - t1;
    });
  }

  handWorld(i, out) { return this.arms[i].hand.getWorldPosition(out); }
}
