import * as THREE from 'three';
import { clamp, damp, lerp, smoothstep } from './noise.js';

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
      hair: std('#5b3a22', 0.6), glove: std('#2a2420', 0.6), dark: std('#0c0a09', 0.2), white: std('#f7f5f0', 0.7),
    };
    const M = this.m;
    this.pelvis = new THREE.Group(); this.root.add(this.pelvis);
    { const g = new THREE.SphereGeometry(1, 16, 12); g.scale(0.15, 0.095, 0.13); const m = new THREE.Mesh(g, M.breeches); m.castShadow = true; this.pelvis.add(m); }
    this.torso = new THREE.Group(); this.torso.position.set(0, 0.05, -0.02); this.pelvis.add(this.torso);
    cap(0.125, 0.28, M.jacket, this.torso, { sx: 1.18, sz: 0.82, y: 0.19 });
    { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.045, 0.1, 10), M.skin); c.position.y = 0.43; this.torso.add(c); }
    { const col = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.07, 0.06, 14, 1, true), M.white); col.position.y = 0.415; this.torso.add(col); }
    // fej
    this.head = new THREE.Group(); this.head.position.set(0, 0.47, 0); this.torso.add(this.head);
    { const h = new THREE.Mesh(new THREE.SphereGeometry(0.092, 16, 12), M.skin); h.position.y = 0.075; h.scale.set(0.95, 1.05, 1); h.castShadow = true; this.head.add(h); }
    { const hg = new THREE.SphereGeometry(0.108, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.56); const h = new THREE.Mesh(hg, M.helmet); h.position.set(0, 0.085, -0.008); h.castShadow = true; this.head.add(h);
      const vis = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 6, -0.9, 1.8, Math.PI * 0.45, Math.PI * 0.1), M.helmet); vis.position.set(0, 0.085, 0.012); vis.scale.set(1, 1, 1.15); this.head.add(vis);
      const strapL = new THREE.Mesh(new THREE.BoxGeometry(0.008, 0.11, 0.012), M.dark); strapL.position.set(0.085, 0.03, 0.02); this.head.add(strapL);
      const strapR = strapL.clone(); strapR.position.x = -0.085; this.head.add(strapR); }
    for (const s of [-1, 1]) {
      const w = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 6), M.white); w.scale.set(1, 0.8, 0.5); w.position.set(s * 0.033, 0.083, 0.083); this.head.add(w);
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.009, 8, 6), M.dark); e.position.set(s * 0.033, 0.083, 0.09); this.head.add(e);
      const br = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.005, 0.006), M.hair); br.position.set(s * 0.034, 0.104, 0.088); br.rotation.z = -s * 0.15; this.head.add(br);
    }
    { const n = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 6), M.skin); n.scale.set(0.8, 1, 1); n.position.set(0, 0.063, 0.093); this.head.add(n); }
    this.pony = new THREE.Group(); this.pony.position.set(0, 0.06, -0.1); this.head.add(this.pony);
    cap(0.026, 0.18, M.hair, this.pony, { sx: 1.2 });
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
    { const b = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), M.hair); b.position.set(0, 0.0, 0.0); this.pony.add(b); }
    { const hh = new THREE.Mesh(new THREE.SphereGeometry(0.096, 14, 10, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.3), M.hair); hh.position.set(0, 0.075, -0.012); this.head.add(hh); }
    // karok
    this.arms = [];
    for (const s of [-1, 1]) {
      const plane = new THREE.Group(); plane.position.set(s * 0.165, 0.36, 0.0); this.torso.add(plane);
      const up = new THREE.Group(); plane.add(up); cap(0.043, 0.27, M.jacket, up);
      const fo = new THREE.Group(); fo.position.y = -0.27; up.add(fo); cap(0.037, 0.25, M.jacket, fo);
      const hand = new THREE.Group(); hand.position.y = -0.25; fo.add(hand);
      { const h = new THREE.Mesh(new THREE.SphereGeometry(0.04, 10, 8), M.glove); h.scale.set(0.8, 1.1, 1); h.position.y = -0.02; hand.add(h); }
      this.arms.push({ s, plane, up, fo, hand });
    }
    // lábak
    this.legs = [];
    for (const s of [-1, 1]) {
      const plane = new THREE.Group(); this.root.add(plane);
      const th = new THREE.Group(); plane.add(th); cap(0.07, 0.43, M.breeches, th, { sz: 1.05 });
      const kn = new THREE.Group(); kn.position.y = -0.43; th.add(kn); cap(0.056, 0.4, M.boots, kn);
      const ft = new THREE.Group(); ft.position.y = -0.4; kn.add(ft);
      { const b = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.07, 0.21), M.boots); b.position.set(0, -0.015, 0.045); b.castShadow = true; ft.add(b); }
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
      this.feetBody[i].set(rest.x, rest.y, rest.z);
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
