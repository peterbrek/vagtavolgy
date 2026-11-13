import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from './noise.js';
import { loft, limb } from './geom.js';

export const SEAT = new THREE.Vector3(0, 0.47, 0.03);
const DOWN = new THREE.Vector3(0, -1, 0);
export const HAIR = { barna: '#5b3a22', szoke: '#d9b56a', fekete: '#1b1612', voros: '#a4482a' };

const std = (c, r = 0.7) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
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
    this.m = {
      skin: std('#f0c6a2', 0.6), jacket: std('#1f2f5c', 0.55), breeches: std('#f2efe6', 0.8),
      boots: new THREE.MeshPhysicalMaterial({ color: '#17140f', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 }),
      helmet: new THREE.MeshPhysicalMaterial({ color: '#1d1d22', roughness: 0.35, clearcoat: 0.9, clearcoatRoughness: 0.12 }),
      hair: std('#5b3a22', 0.6), glove: std('#2a2420', 0.6), dark: std('#0c0a09', 0.2), white: std('#f7f5f0', 0.7), lip: std('#c06a64', 0.5),
    };
    const M = this.m;
    const mesh = (g, m, parent, shadow = true) => { const x = new THREE.Mesh(g, m); x.castShadow = shadow; x.receiveShadow = true; parent.add(x); return x; };
    const vloft = (rings, o = {}) => loft(rings.map(([y, rx, rz, z = 0]) => ({ p: [0, y, z], rx, ry: rz })), { up: [0, 0, 1], radial: 18, sub: 3, power: 2.2, ...o });
    const ball = (r, m, parent, [x, y, z], [sx, sy, sz] = [1, 1, 1], seg = 12) => { const g = new THREE.SphereGeometry(r, seg, Math.round(seg * 0.75)); g.scale(sx, sy, sz); const k = mesh(g, m, parent); k.position.set(x, y, z); return k; };
    // medence (lovaglónadrág)
    this.pelvis = new THREE.Group(); this.root.add(this.pelvis);
    mesh(vloft([[-0.1, 0.05, 0.04, -0.01], [-0.078, 0.13, 0.1, -0.012], [-0.02, 0.152, 0.115, -0.012], [0.05, 0.142, 0.1, -0.008], [0.085, 0.126, 0.09, -0.004]]), M.breeches, this.pelvis);
    // törzs (zakó)
    this.torso = new THREE.Group(); this.torso.position.set(0, 0.05, -0.02); this.pelvis.add(this.torso);
    mesh(vloft([[-0.085, 0.157, 0.119, -0.01], [-0.03, 0.155, 0.115, -0.006], [0.06, 0.133, 0.097, 0.0], [0.14, 0.13, 0.095, 0.006], [0.24, 0.15, 0.105, 0.013],
      [0.32, 0.162, 0.1, 0.006], [0.37, 0.168, 0.09, -0.004], [0.405, 0.134, 0.074, -0.008], [0.425, 0.06, 0.05, -0.005]]), M.jacket, this.torso);
    for (const sx of [-1, 1]) ball(0.052, M.jacket, this.torso, [sx * 0.163, 0.368, -0.006], [1, 0.9, 1]);
    { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.038, 0.043, 0.1, 12), M.skin); c.position.y = 0.44; this.torso.add(c); }
    { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.066, 0.06, 16, 1, true), M.white); col.position.y = 0.418; this.torso.add(col); }
    ball(0.05, M.white, this.torso, [0, 0.385, 0.072], [0.9, 1, 0.28]);
    // fej
    this.head = new THREE.Group(); this.head.position.set(0, 0.47, 0); this.torso.add(this.head);
    ball(0.09, M.skin, this.head, [0, 0.082, 0], [0.86, 1.0, 0.93], 18);
    ball(0.056, M.skin, this.head, [0, 0.036, 0.022], [0.95, 0.85, 0.9], 14);
    for (const sx of [-1, 1]) {
      ball(0.017, M.skin, this.head, [sx * 0.077, 0.074, -0.004], [0.5, 1, 0.8], 8);
      ball(0.013, M.white, this.head, [sx * 0.03, 0.088, 0.072], [1, 0.75, 0.45], 8);
      ball(0.0085, M.dark, this.head, [sx * 0.03, 0.088, 0.077], [1, 1, 0.6], 8);
      const br = mesh(new THREE.BoxGeometry(0.026, 0.005, 0.006), M.hair, this.head, false); br.position.set(sx * 0.031, 0.107, 0.076); br.rotation.z = -sx * 0.12;
    }
    ball(0.011, M.skin, this.head, [0, 0.07, 0.085], [0.8, 1.1, 1], 8);
    ball(0.02, this.m.lip, this.head, [0, 0.046, 0.072], [1, 0.3, 0.45], 10);
    // sisak ellenzővel és szíjjal
    { const hg = new THREE.SphereGeometry(0.106, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.55); hg.scale(1, 0.96, 1.08); const h = mesh(hg, M.helmet, this.head); h.position.set(0, 0.09, -0.006);
      const rim = mesh(new THREE.TorusGeometry(0.104, 0.006, 6, 28), M.helmet, this.head); rim.rotation.x = Math.PI / 2; rim.scale.set(1, 1.08, 1); rim.position.set(0, 0.083, -0.006);
      const pk = new THREE.CylinderGeometry(0.075, 0.075, 0.007, 18, 1, false, -Math.PI / 2, Math.PI); pk.scale(1, 1, 0.62);
      const peak = mesh(pk, M.helmet, this.head); peak.position.set(0, 0.093, 0.072); peak.rotation.x = 0.28;
      for (const sx of [-1, 1]) { const st = mesh(new THREE.BoxGeometry(0.007, 0.1, 0.012), M.dark, this.head, false); st.position.set(sx * 0.074, 0.04, 0.02); st.rotation.z = sx * 0.12; }
      const chin = mesh(new THREE.BoxGeometry(0.1, 0.007, 0.014), M.dark, this.head, false); chin.position.set(0, -0.004, 0.035); }
    // haj
    { const hh = new THREE.SphereGeometry(0.094, 16, 10, 0, Math.PI * 2, Math.PI * 0.4, Math.PI * 0.32); const k = mesh(hh, M.hair, this.head); k.position.set(0, 0.078, -0.014); }
    this.pony = new THREE.Group(); this.pony.position.set(0, 0.07, -0.098); this.head.add(this.pony);
    cap(0.024, 0.17, M.hair, this.pony, { sx: 1.2 });
    ball(0.04, M.hair, this.pony, [0, 0, 0]);
    {
      const tex = horse.hairTex; const hm = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.38, side: THREE.DoubleSide, roughness: 0.5 });
      this.hairCardMat = hm; const pos = [], uv = [], nor = [], idx = [];
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI, dx = Math.cos(a), dz = Math.sin(a), b = pos.length / 3;
        for (let q = 0; q <= 3; q++) { const t = q / 3, y = 0.02 - t * 0.26, w = 0.035 + Math.sin(t * Math.PI) * 0.02;
          pos.push(dx * w, y, dz * w, -dx * w, y, -dz * w); nor.push(dx, 0, dz, -dx, 0, -dz); uv.push(0.1, 1 - t, 0.6, 1 - t);
          if (q) { const o = b + (q - 1) * 2; idx.push(o, o + 2, o + 1, o + 1, o + 2, o + 3); } }
      }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);
      const m = new THREE.Mesh(g, hm); m.castShadow = true; this.pony.add(m);
    }
    // karok
    const UA = [[0, 0.05, 0.05], [0.12, 0.05, 0.05], [0.55, 0.043, 0.042], [1, 0.037, 0.036]], FA = [[0, 0.038, 0.037], [0.4, 0.037, 0.034], [0.85, 0.031, 0.028], [1, 0.029, 0.026]];
    this.arms = [];
    for (const s of [-1, 1]) {
      const plane = new THREE.Group(); plane.position.set(s * 0.165, 0.36, 0.0); this.torso.add(plane);
      const up = new THREE.Group(); plane.add(up); mesh(limb(0.28, UA.map(([t, a, b]) => [t, a, b, 0]), 12), M.jacket, up);
      const fo = new THREE.Group(); fo.position.y = -0.27; up.add(fo); mesh(limb(0.26, FA.map(([t, a, b]) => [t, a, b, 0]), 12), M.jacket, fo);
      const hand = new THREE.Group(); hand.position.y = -0.25; fo.add(hand);
      ball(0.033, M.glove, hand, [0, -0.028, 0], [0.75, 1.05, 1.0], 10);
      ball(0.028, M.glove, hand, [0, -0.058, 0.012], [0.8, 0.9, 1.0], 10);
      const th = mesh(new THREE.CapsuleGeometry(0.011, 0.03, 4, 8), M.glove, hand); th.position.set(s * -0.02, -0.035, 0.022); th.rotation.x = 0.6;
      this.arms.push({ s, plane, up, fo, hand });
    }
    // lábak
    const TH = [[0, 0.078, 0.084, 0], [0.12, 0.075, 0.08, 0.005], [0.45, 0.067, 0.07, 0.004], [0.8, 0.056, 0.058, 0], [1, 0.052, 0.054, 0]];
    const BO = [[-0.035, 0.059, 0.063, 0], [0.04, 0.06, 0.064, 0.002], [0.3, 0.054, 0.062, -0.012], [0.7, 0.042, 0.048, -0.004], [1, 0.037, 0.043, 0]];
    const footGeo = loft([{ p: [0, -0.012, -0.048], rx: 0.032, ry: 0.035 }, { p: [0, -0.02, 0.0], rx: 0.038, ry: 0.038 }, { p: [0, -0.032, 0.08], rx: 0.036, ry: 0.026 }, { p: [0, -0.037, 0.13], rx: 0.022, ry: 0.017 }, { p: [0, -0.039, 0.15], rx: 0.006, ry: 0.006 }], { up: [0, 1, 0], radial: 12, sub: 3 });
    this.legs = [];
    for (const s of [-1, 1]) {
      const plane = new THREE.Group(); this.root.add(plane);
      const th = new THREE.Group(); plane.add(th); mesh(limb(0.44, TH, 14), M.breeches, th);
      const kn = new THREE.Group(); kn.position.y = -0.43; th.add(kn); mesh(limb(0.41, BO, 14), M.boots, kn);
      const ft = new THREE.Group(); ft.position.y = -0.4; kn.add(ft);
      mesh(footGeo, M.boots, ft);
      const heel = mesh(new THREE.BoxGeometry(0.05, 0.03, 0.04), M.boots, ft); heel.position.set(0, -0.052, -0.03);
      this.legs.push({ s, plane, th, kn, ft });
    }
    this.lean = 0.1; this.rise = 0; this.time = 0;
    this._v = new THREE.Vector3(); this._w = new THREE.Vector3(); this._h = new THREE.Vector3(); this._f = new THREE.Vector3(); this._d = new THREE.Vector3(); this._p = new THREE.Vector3(); this._k = new THREE.Vector3(); this._fe = new THREE.Vector3(); this._u = new THREE.Vector3(); this._q = new THREE.Quaternion(); this._q2 = new THREE.Quaternion(); this._e = new THREE.Euler();
    this.feetBody = [new THREE.Vector3(), new THREE.Vector3()];
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
