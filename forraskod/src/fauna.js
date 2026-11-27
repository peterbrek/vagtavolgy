import * as THREE from 'three';
import { Horse, COATS } from './horse.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { REG, LAKE, WATER, HOME } from './world.js';
import { clamp, lerp, damp, dampAngle, wrapAngle, mulberry32, smoothstep } from './noise.js';

const V3 = THREE.Vector3;
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
const std = (c, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.8, flatShading: true, ...o });
let SHADOW = true;
function mk(geo, mat, parent, [x, y, z] = [0, 0, 0], [sx, sy, sz] = [1, 1, 1]) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = SHADOW; parent.add(m); return m;
}
const gaitOf = (v) => (v < 0.12 ? 'stand' : v < 2.9 ? 'walk' : v < 5.9 ? 'trot' : v < 10.2 ? 'canter' : 'gallop');

// ---------- vadlovak ----------
class WildHorse {
  constructor(scene, def, rnd) {
    this.name = def.name; this.scale = def.scale; this.coat = def.coat;
    const h = this.h = new Horse();
    h.setCoat(def.coat, { blaze: rnd() < 0.5, socks: rnd() < 0.35 }); h.setTack({}); h.setDirt(0.12);
    h.root.scale.setScalar(def.scale); scene.add(h.root);
    this.x = def.x; this.z = def.z; this.yaw = rnd() * 6.28; this.v = 0; this.yawRate = 0; this.gait = 'stand';
    this.tx = this.x; this.tz = this.z; this.want = 0; this.look = 0; this.pitch = 0; this.ox = def.ox; this.oz = def.oz;
  }
}

// ---------- egyszerű állatok (őz, nyúl, birka, kacsa) ----------
class Critter {
  constructor(kind, scene, x, z, rnd, opts = {}) {
    this.kind = kind; this.x = x; this.z = z; this.hx = x; this.hz = z; this.yaw = rnd() * 6.28; this.v = 0; this.ph = rnd() * 6;
    this.t = rnd() * 4; this.state = 'idle'; this.rnd = rnd; this.tx = x; this.tz = z; this.opts = opts;
    const g = this.g = new THREE.Group(); scene.add(g); SHADOW = kind === 'deer' || kind === 'sheep';
    this.body = new THREE.Group(); g.add(this.body); this.legs = [];
    const S = (r, w = 12) => new THREE.SphereGeometry(r, Math.max(5, Math.round(w * 0.55)), Math.max(3, Math.round(w * 0.38)));
    if (kind === 'deer') {
      const coat = std('#9a6a3e'), light = std('#e8dccb'), dark = std('#2a1d14');
      mk(S(1, 14), coat, this.body, [0, 0.98, 0], [0.24, 0.27, 0.58]);
      mk(S(1, 10), light, this.body, [0, 0.86, 0.05], [0.18, 0.16, 0.45]);
      this.neck = new THREE.Group(); this.neck.position.set(0, 1.12, 0.42); this.body.add(this.neck);
      const nk = mk(new THREE.CylinderGeometry(0.07, 0.11, 0.55, 8), coat, this.neck, [0, 0.22, 0.06]); nk.rotation.x = 0.45;
      const hd = new THREE.Group(); hd.position.set(0, 0.48, 0.18); this.neck.add(hd); this.head = hd;
      mk(S(1, 10), coat, hd, [0, 0, 0.04], [0.09, 0.1, 0.16]); mk(S(1, 8), dark, hd, [0, -0.03, 0.2], [0.045, 0.04, 0.05]);
      for (const s of [-1, 1]) { const e = mk(new THREE.ConeGeometry(0.045, 0.16, 6), coat, hd, [s * 0.08, 0.1, -0.04]); e.rotation.z = -s * 0.7; e.scale.set(1, 1, 0.45);
        mk(S(0.018, 6), dark, hd, [s * 0.07, 0.03, 0.08]); }
      if (opts.buck) for (const s of [-1, 1]) { const a = mk(new THREE.CylinderGeometry(0.012, 0.018, 0.28, 5), std('#d9c7a4'), hd, [s * 0.05, 0.2, -0.02]); a.rotation.z = -s * 0.25;
        const t2 = mk(new THREE.CylinderGeometry(0.008, 0.012, 0.12, 5), std('#d9c7a4'), hd, [s * 0.09, 0.27, 0.04]); t2.rotation.x = 0.6; }
      mk(S(0.07, 8), light, this.body, [0, 1.08, -0.58]);
      for (const [lx, lz] of [[0.11, 0.38], [-0.11, 0.38], [0.11, -0.4], [-0.11, -0.4]]) {
        const lg = new THREE.Group(); lg.position.set(lx, 0.9, lz); this.body.add(lg);
        mk(new THREE.CylinderGeometry(0.035, 0.022, 0.86, 6), coat, lg, [0, -0.43, 0]); mk(S(0.03, 6), dark, lg, [0, -0.87, 0.01]);
        this.legs.push(lg);
      }
      this.walk = 1.3; this.run = 9.5; this.fear = 32; this.near = 11;
    } else if (kind === 'rabbit') {
      const fur = std(opts.color || '#8b7158'), white = std('#f4f1ea');
      mk(S(1, 10), fur, this.body, [0, 0.13, 0], [0.11, 0.11, 0.15]);
      const hd = new THREE.Group(); hd.position.set(0, 0.22, 0.12); this.body.add(hd); this.head = hd;
      mk(S(1, 10), fur, hd, [0, 0, 0], [0.07, 0.07, 0.08]);
      for (const s of [-1, 1]) { const e = mk(S(1, 6), fur, hd, [s * 0.03, 0.1, -0.02], [0.022, 0.08, 0.012]); e.rotation.z = -s * 0.15; }
      mk(S(0.04, 6), white, this.body, [0, 0.15, -0.15]);
      this.walk = 0.6; this.run = 5.5; this.fear = 11; this.near = 5; this.hop = true;
    } else if (kind === 'sheep') {
      const wool = std('#f1ede4', { roughness: 1 }), face = std('#2b2520');
      for (const [x, y, z, r] of [[0, 0.62, 0, 0.32], [0, 0.66, 0.22, 0.27], [0, 0.66, -0.22, 0.27], [0.15, 0.58, 0, 0.22], [-0.15, 0.58, 0, 0.22], [0, 0.82, 0, 0.2]]) mk(new THREE.IcosahedronGeometry(r, 0), wool, this.body, [x, y, z]);
      const hd = new THREE.Group(); hd.position.set(0, 0.72, 0.46); this.body.add(hd); this.head = hd;
      mk(S(1, 10), face, hd, [0, 0, 0.04], [0.1, 0.11, 0.15]);
      for (const s of [-1, 1]) { const e = mk(S(1, 6), face, hd, [s * 0.11, 0.04, -0.02], [0.07, 0.025, 0.035]); e.rotation.z = s * 0.3; }
      for (const [lx, lz] of [[0.13, 0.22], [-0.13, 0.22], [0.13, -0.22], [-0.13, -0.22]]) { const lg = new THREE.Group(); lg.position.set(lx, 0.42, lz); this.body.add(lg); mk(new THREE.CylinderGeometry(0.035, 0.03, 0.42, 6), face, lg, [0, -0.21, 0]); this.legs.push(lg); }
      this.walk = 0.7; this.run = 2.8; this.fear = 6; this.near = 3; this.pen = opts.pen;
    } else if (kind === 'duck') {
      const body = std(opts.male ? '#8a7558' : '#9a7c58'), head = std(opts.male ? '#1f6b3a' : '#8a6a48', { roughness: 0.4 }), bill = std('#e8a23a');
      mk(S(1, 10), body, this.body, [0, 0.07, 0], [0.13, 0.09, 0.22]);
      mk(new THREE.ConeGeometry(0.06, 0.12, 6), body, this.body, [0, 0.12, -0.22]).rotation.x = -1.9;
      const hd = new THREE.Group(); hd.position.set(0, 0.22, 0.16); this.body.add(hd); this.head = hd;
      mk(S(0.07, 10), head, hd); const b = mk(new THREE.ConeGeometry(0.03, 0.09, 6), bill, hd, [0, -0.01, 0.09]); b.rotation.x = Math.PI / 2; b.scale.set(1.3, 1, 0.5);
      if (opts.male) mk(new THREE.TorusGeometry(0.05, 0.01, 4, 10), std('#ffffff'), this.body, [0, 0.17, 0.13]).rotation.x = Math.PI / 2;
      this.walk = 0.5; this.run = 1.6; this.fear = 9; this.near = 4; this.swim = true;
    }
    mergeDirect(this.body); if (this.head) mergeDirect(this.head);
  }
}

function mergeDirect(group) {
  const by = new Map();
  for (const c of [...group.children]) if (c.isMesh) { let a = by.get(c.material); if (!a) by.set(c.material, a = []); a.push(c); }
  for (const [mat, list] of by) {
    if (list.length < 2) continue;
    const geos = list.map((m) => { m.updateMatrix(); let g = m.geometry.clone().applyMatrix4(m.matrix); if (g.index) g = g.toNonIndexed(); for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k); return g; });
    const merged = new THREE.Mesh(mergeGeometries(geos), mat); merged.castShadow = list[0].castShadow; group.add(merged);
    for (const m of list) group.remove(m);
  }
}

export class Fauna {
  constructor(scene, world, sound) {
    this.scene = scene; this.world = world; this.sound = sound; const rnd = this.rnd = mulberry32(4242);
    // vadló-ménes
    const W = REG.wild;
    const defs = [
      { name: 'Szellő', coat: 'fekete', scale: 1, ox: 0, oz: 0 }, { name: 'Holdfény', coat: 'palomino', scale: 0.97, ox: 6, oz: -4 },
      { name: 'Villám', coat: 'almas', scale: 1.02, ox: -7, oz: 3 }, { name: 'Bogár', coat: 'tarka', scale: 0.95, ox: 4, oz: 7 },
      { name: 'Pici', coat: 'sarga', scale: 0.62, ox: 7.5, oz: -1.5, foal: true },
    ];
    this.wild = defs.map((d) => new WildHorse(scene, { ...d, x: W.x + d.ox, z: W.z + d.oz }, rnd));
    this.wild[4].mother = this.wild[1];
    this.buildFar();
    // mode: 'graze' (a réten), 'follow' (óvatosan követik a lovast), 'return' (hazaindulnak)
    this.herd = { x: W.x, z: W.z, t: 10, flee: 0, fx: 0, fz: 0, curious: null, stillT: 0, mode: 'graze', trust: 0, idle: 0, nerv: 0, cool: 0, trail: [] };
    // állatok
    this.critters = [];
    const spot = (cx, cz, r, ok = () => true) => { for (let g = 0; g < 200; g++) { const a = rnd() * 6.28, d = Math.sqrt(rnd()) * r, x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d; if (world.heightAt(x, z) > WATER + 0.3 && world.slopeAt(x, z) < 0.35 && ok(x, z)) return [x, z]; } return [cx, cz]; };
    const edge = (x, z) => { const f = world.forestAt(x, z); return f > 0.15 && f < 0.75; };
    for (const [cx, cz, n] of [[-140, -150, 3], [320, 40, 3], [-240, 262, 2]]) for (let i = 0; i < n; i++) { const [x, z] = spot(cx, cz, 90, edge); this.critters.push(new Critter('deer', scene, x, z, rnd, { buck: i === 0 })); }
    for (const [cx, cz, n] of [[60, 120, 3], [-60, 200, 3], [150, 380, 2], [-90, -40, 2]]) for (let i = 0; i < n; i++) { const [x, z] = spot(cx, cz, 50, (x2, z2) => world.forestAt(x2, z2) < 0.2); this.critters.push(new Critter('rabbit', scene, x, z, rnd, { color: rnd() < 0.3 ? '#a99a88' : '#8b7158' })); }
    const pen = world.paddock;
    if (pen) for (let i = 0; i < 6; i++) { const x = lerp(pen.x0 + 3, pen.x1 - 3, rnd()), z = lerp(pen.z0 + 3, pen.z1 - 3, rnd()); this.critters.push(new Critter('sheep', scene, x, z, rnd, { pen })); }
    for (let i = 0; i < 6; i++) { const a = rnd() * 6.28, d = LAKE.r * (0.2 + rnd() * 0.45); this.critters.push(new Critter('duck', scene, LAKE.x + Math.cos(a) * d, LAKE.z + Math.sin(a) * d, rnd, { male: i % 2 === 0 })); }
    this.buildBirds(); this.buildButterflies();
    this.events = [];
  }

  // távoli LOD: egyetlen összevont, álló ló-modell példányosítva (1 rajzhívás az egész ménesre)
  buildFar() {
    const h = this.wild[0].h, root = h.root, keep = { p: root.position.clone(), r: root.rotation.clone(), s: root.scale.clone() };
    root.position.set(0, 0, 0); root.rotation.set(0, 0, 0); root.scale.setScalar(1);
    for (let i = 0; i < 4; i++) h.update(0.05, { gait: 'stand', v: 0, yawRate: 0, jumpT: -1, mode: 'ride', lookYaw: 0 });
    root.updateMatrixWorld(true);
    const coatMats = new Set(Object.values(h.mats)), shown = (o) => { for (let q = o; q; q = q.parent) { if (!q.visible) return false; if (q === root) return true; } return true; };
    const geos = [], col = new THREE.Color();
    root.traverse((m) => {
      if (!m.isMesh || !shown(m) || m.material === h.hairMat) return;
      const coat = coatMats.has(m.material);
      if (!coat && m.material !== h.hoofMat) return;
      let g = m.geometry.clone(); if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
      g.applyMatrix4(m.matrixWorld);
      col.set(coat ? '#ffffff' : '#3a332c'); const n = g.attributes.position.count, c = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
      g.setAttribute('color', new THREE.BufferAttribute(c, 3)); geos.push(g);
    });
    root.position.copy(keep.p); root.rotation.copy(keep.r); root.scale.copy(keep.s);
    const far = this.far = new THREE.InstancedMesh(mergeGeometries(geos), new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }), this.wild.length);
    far.frustumCulled = false; far.castShadow = false; this.scene.add(far);
    const z = new THREE.Matrix4().makeScale(0, 0, 0);
    this.wild.forEach((w, i) => { const c = COATS[w.coat]; far.setColorAt(i, new THREE.Color(c.patch && w.coat === 'tarka' ? '#c9b9a6' : c.base)); far.setMatrixAt(i, z); });
  }

  buildBirds() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.18, -0.5, 0, -0.05, 0, 0, -0.12, 0, 0, 0.18, 0, 0, -0.12, 0.5, 0, -0.05, 0, 0, 0.18, 0, -0.04, -0.15, 0, 0.02, -0.05], 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ color: '#2b2a2e', side: THREE.DoubleSide });
    this.birdU = { uTime: { value: 0 } };
    mat.onBeforeCompile = (sh) => { sh.uniforms.uTime = this.birdU.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y += abs(position.x) * sin(uTime*11.0 + float(gl_InstanceID)*1.7) * 0.9;'); };
    this.flocks = [{ cx: LAKE.x, cz: LAKE.z, h: 32, r: 45, n: 10, s: 0.35 }, { cx: 120, cz: 120, h: 42, r: 60, n: 9, s: -0.28 }, { cx: 0, cz: -300, h: 55, r: 70, n: 1, s: 0.18, eagle: true }];
    const n = this.flocks.reduce((a, f) => a + f.n, 0);
    this.birds = new THREE.InstancedMesh(g, mat, n); this.birds.frustumCulled = false; this.scene.add(this.birds);
    this.birdOff = []; for (let i = 0; i < n; i++) this.birdOff.push([this.rnd() * 6.28, (this.rnd() - 0.5) * 10, (this.rnd() - 0.5) * 6, 0.8 + this.rnd() * 0.4]);
  }
  buildButterflies() {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.05, -0.09, 0, 0.07, -0.08, 0, -0.06, 0, 0, 0.05, -0.08, 0, -0.06, 0, 0, -0.05, 0, 0, 0.05, 0, 0, -0.05, 0.08, 0, -0.06, 0, 0, 0.05, 0.08, 0, -0.06, 0.09, 0, 0.07], 3));
    g.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ side: THREE.DoubleSide });
    this.bfU = { uTime: { value: 0 } };
    mat.onBeforeCompile = (sh) => { sh.uniforms.uTime = this.bfU.uTime; sh.vertexShader = 'uniform float uTime;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n transformed.y += abs(position.x) * (0.5 + 0.5*sin(uTime*17.0 + float(gl_InstanceID)*2.3)) * 1.4;'); };
    const N = 30; this.bf = new THREE.InstancedMesh(g, mat, N); this.bf.frustumCulled = false; this.scene.add(this.bf);
    const cols = ['#ffffff', '#f6d743', '#6d9cf0', '#f08a3a', '#d87ad8'].map((c) => new THREE.Color(c));
    const L = REG.lavender, homes = [];
    for (let i = 0; i < N; i++) {
      const lav = i < 16; const hx = lav ? lerp(L.x0, L.x1, this.rnd()) : [40, -60, 150, -240][i % 4] + (this.rnd() - 0.5) * 40, hz = lav ? lerp(L.z0, L.z1, this.rnd()) : [375, 200, 215, 262][i % 4] + (this.rnd() - 0.5) * 40;
      homes.push({ hx, hz, ph: this.rnd() * 6.28, sp: 0.5 + this.rnd() * 0.6 }); this.bf.setColorAt(i, cols[i % cols.length]);
    }
    this.bfHomes = homes;
  }

  // ---------- frissítés ----------
  update(dt, time, ctx) {
    const W = this.world, ev = this.events; ev.length = 0;
    const px = ctx.px, pz = ctx.pz, pv = ctx.pv;
    this.updateHerd(dt, time, ctx);
    for (const c of this.critters) this.updateCritter(c, dt, time, ctx);
    // madarak
    this.birdU.uTime.value = time; const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new V3(), s = new V3();
    let k = 0;
    for (const f of this.flocks) for (let i = 0; i < f.n; i++, k++) {
      const [ph, dh, dr, sc] = this.birdOff[k], a = time * f.s + ph * (f.eagle ? 0 : 0.18) + i * 0.12;
      const r = f.r + dr * 3 + Math.sin(time * 0.7 + ph) * 4;
      p.set(f.cx + Math.cos(a) * r, (f.eagle ? W.heightAt(f.cx, f.cz) + 0 : 0) + f.h + dh + Math.sin(time + ph) * 2, f.cz + Math.sin(a) * r);
      if (f.eagle) p.y = 58;
      q.setFromAxisAngle(new V3(0, 1, 0), -a + (f.s > 0 ? 0 : Math.PI)); s.setScalar(f.eagle ? 3.2 : sc);
      m.compose(p, q, s); this.birds.setMatrixAt(k, m);
    }
    this.birds.instanceMatrix.needsUpdate = true;
    // pillangók (csak a közelben láthatók)
    this.bfU.uTime.value = time;
    this.bfHomes.forEach((b, i) => {
      const near = Math.abs(b.hx - px) + Math.abs(b.hz - pz) < 120;
      const t = time * b.sp + b.ph;
      p.set(b.hx + Math.sin(t * 0.9) * 3 + Math.sin(t * 2.3) * 0.8, W.heightAt(b.hx, b.hz) + 0.7 + Math.sin(t * 3.1) * 0.35 + 0.3, b.hz + Math.cos(t * 0.7) * 3);
      q.setFromAxisAngle(new V3(0, 1, 0), t * 0.9 + Math.PI / 2); s.setScalar(near ? 1.6 : 0);
      m.compose(p, q, s); this.bf.setMatrixAt(i, m);
    });
    this.bf.instanceMatrix.needsUpdate = true;
    return ev;
  }

  placeHorse(w, dt) {
    const W = this.world, h = w.h, fx = Math.sin(w.yaw), fz = Math.cos(w.yaw), sc = w.scale;
    const hf = W.heightAt(w.x + fx * 0.8 * sc, w.z + fz * 0.8 * sc), hb = W.heightAt(w.x - fx * 0.75 * sc, w.z - fz * 0.75 * sc);
    w.pitch = damp(w.pitch, Math.atan2(hb - hf, 1.55 * sc), 8, dt);
    h.root.position.set(w.x, Math.max(W.heightAt(w.x, w.z), (hf + hb) / 2 - 0.02), w.z);
    h.root.rotation.set(w.pitch, w.yaw, clamp(-w.yawRate * w.v * 0.03, -0.15, 0.15));
  }

  // a lovas nyomvonalán d méterrel hátrébb lévő pont (és a haladási irány)
  trailPoint(d, px, pz) {
    const T = this.herd.trail; let ax = px, az = pz;
    for (let i = T.length - 1; i >= 0; i--) {
      const b = T[i], sx = b.x - ax, sz = b.z - az, l = Math.hypot(sx, sz);
      if (l >= d && l > 1e-3) { const k = d / l; return { x: ax + sx * k, z: az + sz * k, dx: -sx / l, dz: -sz / l }; }
      d -= l; ax = b.x; az = b.z;
    }
    return null;
  }

  goHome(time, why) {
    const H = this.herd, Wr = REG.wild, rnd = this.rnd;
    H.mode = 'return'; H.cool = time + 12; H.trust = 0; H.curious = null; H.stillT = 0;
    // a lovas nyomvonalán visszafelé mennek (így megkerülik a kerítéseket, épületeket), onnan egyenesen haza
    H.back = H.trail.length > 1 ? H.trail.slice() : null; H.bi = -1; H.trail = [];
    const a = rnd() * 6.28, d = rnd() * Wr.r * 0.3; H.x = Wr.x + Math.cos(a) * d; H.z = Wr.z + Math.sin(a) * d; H.t = 40;
    if (why) this.events.push({ type: 'home', why });
  }

  updateHerd(dt, time, ctx) {
    const H = this.herd, Wr = REG.wild, W = this.world, rnd = this.rnd;
    const who = ctx.who || ctx.mode;
    const dP = Math.hypot(ctx.px - H.x, ctx.pz - H.z);
    const anyNear = this.wild.some((w) => Math.hypot(w.x - ctx.px, w.z - ctx.pz) < 170);
    // ijedés
    let closest = 999; for (const w of this.wild) closest = Math.min(closest, Math.hypot(w.x - ctx.px, w.z - ctx.pz));
    // csak a közvetlen közelükbe vágtató lovastól (vagy száguldó autótól) ijednek meg, és nem futnak messzire
    const scared = who === 'drive' ? closest < 24 && ctx.pv > 2.5 : ctx.mode === 'ride' && (closest < 16 && ctx.pv > 6.2 || closest < 6 && ctx.pv > 3.2 && !H.curious);
    if (H.flee <= 0 && scared) {
      H.flee = 4.5 + rnd() * 2; let ax = H.x - ctx.px, az = H.z - ctx.pz; const l = Math.hypot(ax, az) || 1; ax /= l; az /= l;
      const wasF = H.mode === 'follow';
      if (wasF) { const hp = this.herdPos(); ax = hp.x - ctx.px; az = hp.z - ctx.pz; const l2 = Math.hypot(ax, az) || 1; ax /= l2; az /= l2; H.x = hp.x; H.z = hp.z; }
      let tx = H.x + ax * (wasF ? 22 : 38), tz = H.z + az * (wasF ? 22 : 38);
      const dc = Math.hypot(tx - Wr.x, tz - Wr.z), lim = Wr.r * 0.55; if (dc > lim && !wasF) { tx = Wr.x + (tx - Wr.x) / dc * lim - az * 18; tz = Wr.z + (tz - Wr.z) / dc * lim + ax * 18; }
      H.x = tx; H.z = tz; H.curious = null; H.t = Math.min(H.t, 12);
      if (wasF) { this.goHome(time, null); H.cool = time + 15; H.x = tx; H.z = tz; H.flee = 3.5; }
      H.trust = 0;
      this.sound.neigh(clamp(1 - closest / 90, 0, 1)); this.events.push({ type: 'flee' });
    }
    H.flee -= dt;
    // követés: ha a lovas lépésben, lassan közelít, a ménes óvatosan utána indul
    const slowWho = who === 'ride' || who === 'foot';
    if (H.mode !== 'follow') {
      const slowNear = slowWho && H.flee <= 0 && closest < 26 && ctx.pv > 0.3 && ctx.pv < 3.0 && time > H.cool;
      if (slowNear) H.trust += dt; else H.trust = Math.max(0, H.trust - dt * (ctx.pv >= 3.0 ? 3 : 0.5));
      if (H.trust > 4) {
        H.mode = 'follow'; H.trust = 0; H.idle = 0; H.nerv = 0; H.trail = [{ x: ctx.px, z: ctx.pz }];
        const dd = (w) => Math.hypot(w.x - ctx.px, w.z - ctx.pz);
        this.wild.filter((w) => !w.mother).sort((a, b) => dd(a) - dd(b)).forEach((w, k) => { w.rank = k; w.lat = [0, 1.5, -1.5, 0.8, -0.8][k] || 0; });
        this.events.push({ type: 'follow' });
      }
    }
    if (H.mode === 'follow') {
      const T = H.trail, last = T[T.length - 1];
      if (Math.hypot(ctx.px - last.x, ctx.pz - last.z) > 1.5) { T.push({ x: ctx.px, z: ctx.pz }); if (T.length > 400) T.shift(); }
      const moving = ctx.pv > 0.3 && slowWho;
      H.idle = moving ? 0 : H.idle + dt;
      if (ctx.pv > 3.2 && slowWho) H.nerv += dt; else H.nerv = Math.max(0, H.nerv - dt * 0.5);
      if (H.nerv > 1.5) this.goHome(time, 'fast');
      else if (H.idle > 45) this.goHome(time, 'idle');
      else if (closest > 45 || (who === 'drive' && ctx.pv > 1)) this.goHome(time, 'far');
    } else if (H.mode === 'return') {
      const B = H.back;
      if (B && H.flee <= 0) {
        if (H.bi < 0) { const hp = this.herdPos(); let bd = 1e9; B.forEach((p, i) => { const d = Math.hypot(p.x - hp.x, p.z - hp.z); if (d < bd) { bd = d; H.bi = i; } }); H.lx = B[H.bi].x; H.lz = B[H.bi].z; }
        // vezetőpont halad visszafelé a nyomon, de megvárja a lemaradókat
        let far = 0; for (const w of this.wild) far = Math.max(far, Math.hypot(w.x - H.lx, w.z - H.lz));
        let step = far < 14 ? 3.4 * dt : 0;
        while (step > 0 && H.bi > 0) { const p = B[H.bi - 1], dx = p.x - H.lx, dz = p.z - H.lz, l = Math.hypot(dx, dz); if (l <= step) { H.lx = p.x; H.lz = p.z; H.bi--; step -= l; } else { H.lx += dx / l * step; H.lz += dz / l * step; step = 0; } }
        if (H.bi === 0 && far < 14) H.back = null;
      }
      const hp = this.herdPos(); if (!H.back && Math.hypot(hp.x - Wr.x, hp.z - Wr.z) < Wr.r * 0.55) H.mode = 'graze';
    }
    // vándorlás
    H.t -= dt;
    if (H.t <= 0 && H.flee <= 0 && H.mode === 'graze') { H.t = 25 + rnd() * 25; const a = rnd() * 6.28, d = rnd() * Wr.r * 0.38; H.x = Wr.x + Math.cos(a) * d; H.z = Wr.z + Math.sin(a) * d; }
    // kíváncsiság
    if (ctx.mode === 'ride' && ctx.pv < 0.3 && closest < 20 && H.flee <= 0 && H.mode !== 'return') H.stillT += dt; else if (ctx.pv > 1.2 || ctx.mode !== 'ride' || closest > 30 || H.mode === 'return') { H.stillT = 0; H.curious = null; }
    // ha a lovas közeledik, a ménes nyerítéssel jelez
    if (dP < 150 && !this.heard) { this.heard = true; this.sound.neigh(0.35); this.events.push({ type: 'near' }); }
    if (dP > 260) this.heard = false;
    if (H.stillT > 3 && !H.curious) { let best = null, bd = 99; for (const w of this.wild) { if (w.mother) continue; const d = Math.hypot(w.x - ctx.px, w.z - ctx.pz); if (d < bd) { bd = d; best = w; } } H.curious = best; if (best) this.events.push({ type: 'curious', name: best.name }); }
    for (const w of this.wild) {
      let tx = H.x + w.ox, tz = H.z + w.oz;
      const follow = H.mode === 'follow' && H.flee <= 0;
      const backT = H.mode === 'return' && H.back && H.flee <= 0;
      if (w.mother && !follow) { tx = w.mother.x + 2.2; tz = w.mother.z + 1.8; }
      if (backT && !w.mother) { tx = H.lx + w.ox * 0.35; tz = H.lz + w.oz * 0.35; }
      else if (follow && H.curious !== w) {
        // a lovas nyomában, óvatos távolságban, egymás mögött (a csikó az anyja mögött)
        const m = w.mother, want = 7 + ((m ? m.rank : w.rank) || 0) * 3.4 + (m ? 2.6 : 0), tp = this.trailPoint(want, ctx.px, ctx.pz), lat = m ? (m.lat || 0) + 0.9 : (w.lat || 0);
        if (tp) { tx = tp.x - tp.dz * lat; tz = tp.z + tp.dx * lat; }
        else { const ax = w.x - ctx.px, az = w.z - ctx.pz, l = Math.hypot(ax, az) || 1; tx = ctx.px + ax / l * want; tz = ctx.pz + az / l * want; }
        const ex = tx - ctx.px, ez = tz - ctx.pz, el = Math.hypot(ex, ez);
        if (el < 5.5) { if (el < 0.01) { tx = w.x; tz = w.z; } else { tx = ctx.px + ex / el * 5.5; tz = ctx.pz + ez / el * 5.5; } }
      }
      if (H.curious === w) { const ax = w.x - ctx.px, az = w.z - ctx.pz, l = Math.hypot(ax, az) || 1; tx = ctx.px + ax / l * 3.6; tz = ctx.pz + az / l * 3.6; }
      const dx = tx - w.x, dz = tz - w.z, d = Math.hypot(dx, dz);
      let vt = 0;
      if (H.flee > 0) vt = d > 3 ? (w.mother ? 9.5 : 11.5) : 0;
      else if (follow && H.curious !== w) vt = d < 1.2 ? 0 : d < 7 ? clamp(0.45 + d * 0.32, 0.6, Math.max(ctx.pv + 0.7, 1.9)) : d < 16 ? 2.7 : 4.6;
      else if (backT) vt = d < 1.5 ? 0 : d < 6 ? 2.2 : 4.2;
      else if (d > 22) vt = 4.2; else if (d > 2.5) vt = H.curious === w ? 1.4 : 1.7;
      if (w.mother && d > 6 && H.flee <= 0 && !follow && !backT) vt = 4.2;
      const desired = d > 0.5 ? Math.atan2(dx, dz) : w.yaw;
      const diff = wrapAngle(desired - w.yaw), tr = lerp(2.0, 0.9, clamp(w.v / 11, 0, 1));
      w.yawRate = damp(w.yawRate, vt > 0 ? clamp(diff * 2.5, -tr, tr) : 0, 6, dt);
      w.yaw = wrapAngle(w.yaw + w.yawRate * dt);
      if (Math.abs(diff) > 1.4) vt = Math.min(vt, 1.6);
      w.v = w.v < vt ? Math.min(vt, w.v + (2.5 + w.v * 0.15) * dt) : Math.max(vt, w.v - 5 * dt);
      w.x += Math.sin(w.yaw) * w.v * dt; w.z += Math.cos(w.yaw) * w.v * dt;
      // egymástól és a játékostól távol
      for (const o of this.wild) if (o !== w) { const ex = w.x - o.x, ez = w.z - o.z, ed = Math.hypot(ex, ez), md = 2.2 * (w.scale + o.scale) / 2; if (ed < md && ed > 0.01) { w.x += ex / ed * (md - ed) * 0.5; w.z += ez / ed * (md - ed) * 0.5; } }
      const pr = who === 'drive' ? 3.6 : 2.6, ep = Math.hypot(w.x - ctx.px, w.z - ctx.pz); if (ep < pr && ep > 0.01) { w.x += (w.x - ctx.px) / ep * (pr - ep); w.z += (w.z - ctx.pz) / ep * (pr - ep); }
      // saját lovak, épületek, kerítések, fák, autó: a vadlovak kikerülik őket
      if (ctx.others) for (const o of ctx.others) { const ex = w.x - o.x, ez = w.z - o.z, ed = Math.hypot(ex, ez); if (ed < 2.3 && ed > 0.01) { w.x += ex / ed * (2.3 - ed); w.z += ez / ed * (2.3 - ed); } }
      if (H.mode !== 'graze' || ep < 60) { const p = this._p || (this._p = { x: 0, z: 0 }); p.x = w.x; p.z = w.z; W.resolve(p, 0.5 * w.scale, 0); w.x = p.x; w.z = p.z; }
      w.gait = gaitOf(w.v);
      const dc = Math.hypot(w.x - ctx.cx, w.z - ctx.cz), vis = dc < 105, farVis = !vis && dc < 280, i = this.wild.indexOf(w);
      w.h.root.visible = vis;
      if (farVis || w.farOn) { w.farOn = farVis; if (farVis) { this.placeHorse(w, dt); w.h.root.updateMatrix(); this.far.setMatrixAt(i, w.h.root.matrix); } else this.far.setMatrixAt(i, ZERO); this.far.instanceMatrix.needsUpdate = true; }
      if (!vis) continue;
      w.h.setDetail(dc < 45);
      const sh = dc < 40; if (w.shadow !== sh) { w.shadow = sh; for (const m of w.h.meshes) m.castShadow = sh; }
      this.placeHorse(w, dt);
      const look = H.curious === w || (ctx.pv < 0.5 && ep < 15) ? clamp(wrapAngle(Math.atan2(ctx.px - w.x, ctx.pz - w.z) - w.yaw) * 0.5, -0.5, 0.5) : 0;
      const evs = w.h.update(dt, { gait: w.gait, v: w.v, yawRate: w.yawRate, jumpT: -1, mode: 'ride', lookYaw: look });
      if (evs.length && ep < 40 && w.v > 0.5) this.sound.hoof('grass', w.v, clamp(1 - ep / 40, 0, 1) * 0.5);
    }
    this.herdNear = anyNear;
  }

  updateCritter(c, dt, time, ctx) {
    const W = this.world, rnd = this.rnd;
    const dp = Math.hypot(c.x - ctx.px, c.z - ctx.pz);
    const vis = Math.hypot(c.x - ctx.cx, c.z - ctx.cz) < ({ deer: 110, sheep: 70, duck: 70, rabbit: 45 })[c.kind];
    c.g.visible = vis; if (!vis && c.state !== 'flee') return;
    c.t -= dt;
    if (c.kind !== 'sheep' && (ctx.mode === 'ride' || ctx.mode === 'drive') && c.state !== 'flee' && (dp < c.fear && ctx.pv > 2.5 || dp < c.near)) {
      c.state = 'flee'; c.t = c.kind === 'deer' ? 6 : 2.5;
      let ax = c.x - ctx.px, az = c.z - ctx.pz; const l = Math.hypot(ax, az) || 1; const d = c.kind === 'deer' ? 55 : c.kind === 'duck' ? 12 : 14;
      c.tx = c.x + ax / l * d + (rnd() - 0.5) * 10; c.tz = c.z + az / l * d + (rnd() - 0.5) * 10;
      if (c.swim) { const dl = Math.hypot(c.tx - LAKE.x, c.tz - LAKE.z); if (dl > LAKE.r * 0.7) { c.tx = LAKE.x + (c.tx - LAKE.x) / dl * LAKE.r * 0.6; c.tz = LAKE.z + (c.tz - LAKE.z) / dl * LAKE.r * 0.6; } this.sound.quack(clamp(1 - dp / 50, 0, 1)); }
    }
    if (c.state !== 'flee' && c.t <= 0) {
      c.t = 3 + rnd() * 7;
      if (rnd() < 0.5) c.state = 'idle';
      else {
        c.state = 'walk'; const a = rnd() * 6.28, d = c.kind === 'deer' ? 12 : c.swim ? 10 : 5;
        c.tx = c.x + Math.cos(a) * d; c.tz = c.z + Math.sin(a) * d;
        const hd = Math.hypot(c.tx - c.hx, c.tz - c.hz), maxR = c.kind === 'deer' ? 45 : c.swim ? 24 : 25;
        if (hd > maxR) { c.tx = c.hx + (c.tx - c.hx) / hd * maxR * 0.5; c.tz = c.hz + (c.tz - c.hz) / hd * maxR * 0.5; }
        if (c.pen) { c.tx = clamp(c.tx, c.pen.x0 + 2, c.pen.x1 - 2); c.tz = clamp(c.tz, c.pen.z0 + 2, c.pen.z1 - 2); }
        if (c.swim) { const dl = Math.hypot(c.tx - LAKE.x, c.tz - LAKE.z); if (dl > LAKE.r * 0.7) { c.tx = LAKE.x + (c.tx - LAKE.x) / dl * LAKE.r * 0.6; c.tz = LAKE.z + (c.tz - LAKE.z) / dl * LAKE.r * 0.6; } }
      }
    }
    if (c.state === 'flee' && c.t <= 0) { c.state = 'idle'; c.t = 2 + rnd() * 3; c.hx = c.x; c.hz = c.z; }
    let vt = 0;
    const dx = c.tx - c.x, dz = c.tz - c.z, d = Math.hypot(dx, dz);
    if (c.state === 'walk') vt = d > 0.4 ? c.walk : 0; else if (c.state === 'flee') vt = d > 0.6 ? c.run : 0;
    if (vt > 0) c.yaw = dampAngle(c.yaw, Math.atan2(dx, dz), c.state === 'flee' ? 6 : 3, dt);
    c.v = damp(c.v, vt, c.state === 'flee' ? 4 : 3, dt);
    const nx = c.x + Math.sin(c.yaw) * c.v * dt, nz = c.z + Math.cos(c.yaw) * c.v * dt;
    const h = W.heightAt(nx, nz);
    if (c.swim || (h > WATER + 0.2 && Math.abs(nx) < 470 && Math.abs(nz) < 470 && W.slopeAt(nx, nz) < 0.55)) { c.x = nx; c.z = nz; } else { c.state = 'idle'; c.t = 1; }
    c.ph += dt * (c.v * (c.kind === 'deer' ? 1.6 : 2.6) + 0.01);
    // megjelenítés
    let y = c.swim ? WATER + 0.02 + Math.sin(time * 2 + c.ph) * 0.015 : W.heightAt(c.x, c.z);
    let pitch = 0;
    if (c.hop && c.v > 0.2) y += Math.abs(Math.sin(c.ph * 2.2)) * (c.state === 'flee' ? 0.35 : 0.12);
    if (c.kind === 'deer') {
      const run = c.v > 4, sw = run ? 0.9 : 0.45;
      c.legs.forEach((l, i) => { const off = run ? (i < 2 ? 0 : Math.PI * 0.9) : [0, Math.PI, Math.PI, 0][i]; l.rotation.x = Math.sin(c.ph * 2 + off) * sw * clamp(c.v, 0, 1); });
      if (run) { y += Math.max(0, Math.sin(c.ph * 2)) * 0.35; pitch = Math.sin(c.ph * 2 + 0.8) * 0.15; }
      c.neck.rotation.x = damp(c.neck.rotation.x, c.state === 'idle' && Math.sin(time * 0.3 + c.hx) > 0 ? 1.4 : run ? 0.25 : 0, 3, dt);
    } else if (c.kind === 'sheep') {
      c.legs.forEach((l, i) => { l.rotation.x = Math.sin(c.ph * 3 + [0, Math.PI, Math.PI, 0][i]) * 0.5 * clamp(c.v * 2, 0, 1); });
      c.head.rotation.x = damp(c.head.rotation.x, c.v < 0.1 ? 0.9 : 0, 3, dt);
      if (dp < 25 && rnd() < dt * 0.05) this.sound.bleat(clamp(1 - dp / 30, 0, 1));
    } else if (c.kind === 'rabbit') {
      c.head.rotation.x = c.v < 0.1 ? 0.3 + Math.sin(time * 6 + c.hx) * 0.05 : -0.1;
    } else if (c.kind === 'duck') {
      c.head.rotation.x = Math.sin(time * 1.3 + c.hx) * 0.2; if (dp < 30 && rnd() < dt * 0.04) this.sound.quack(clamp(1 - dp / 40, 0, 1) * 0.6);
    }
    c.g.position.set(c.x, y, c.z); c.g.rotation.set(pitch, c.yaw, 0, 'YXZ');
  }

  herdPos() { let x = 0, z = 0; for (const w of this.wild) { x += w.x; z += w.z; } return { x: x / this.wild.length, z: z / this.wild.length }; }
  nearestWild(x, z) {
    let best = null, bd = 99;
    for (const w of this.wild) { const d = Math.hypot(w.x - x, w.z - z); if (d < bd) { bd = d; best = w; } }
    return best ? { w: best, d: bd } : null;
  }
}
