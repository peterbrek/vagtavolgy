import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from './geom.js';
import { clamp, damp, wrapAngle } from './noise.js';
import { WATER, HALF } from './world.js';

// Pickup és kétállásos lószállító utánfutó.
// Pickup: origó a hátsó tengely közepén, a talajon; +z előre, +x a bal oldal (ott ül a sofőr).
// Utánfutó: origó a tengely közepén, a talajon; +z a vonófej felé.
export const RIG = {
  wb: 3.1, // tengelytáv
  hitch: 1.4, // vonógömb a hátsó tengely mögött
  L2: 3.3, // vonófej – utánfutó-tengely
  floor: 0.44, back: -2.15, slotX: [0.43, -0.43], slotZ: 0.3,
  rampLen: 1.33,
};
RIG.rampB = Math.asin(RIG.floor / RIG.rampLen);
RIG.rampTipZ = RIG.back - RIG.rampLen * Math.cos(RIG.rampB);
export const PARK = { x: -41, z: -27.5, yaw: 0 };

const C = { tq: '#45ada3', tqd: '#2f8a82', cr: '#f6ecd2', cr2: '#e9dfc4', dk: '#2b2d33', gr: '#8e969c', ch: '#dcd8cc', wd: '#a0714a', br: '#7a4a32', rb: '#4b4642', hy: '#d9b65f', gl: '#34495a', dash: '#3b3a40' };

const tM = new THREE.Matrix4(), tQ = new THREE.Quaternion(), tE = new THREE.Euler(), tS = new THREE.Vector3(), tP = new THREE.Vector3(), tC = new THREE.Color();

// vertex-színes alkatrészgyűjtő: sok kis doboz → egyetlen háló (kevés rajzhívás)
class Kit {
  constructor() { this.list = []; }
  add(geo, color, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    tE.set(rx, ry, rz, 'YXZ'); tQ.setFromEuler(tE); tM.compose(tP.set(x, y, z), tQ, tS.set(1, 1, 1)); g.applyMatrix4(tM);
    tC.set(color); const n = g.attributes.position.count, a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { a[i * 3] = tC.r; a[i * 3 + 1] = tC.g; a[i * 3 + 2] = tC.b; }
    g.setAttribute('color', new THREE.BufferAttribute(a, 3)); this.list.push(g); return g;
  }
  box(w, h, d, color, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.BoxGeometry(w, h, d), color, x, y, z, rx, ry, rz); }
  // lap a (z0,y0)→(z1,y1) szakasz mentén, x irányban w széles
  slab(color, x, z0, y0, z1, y1, w, th) { const len = Math.hypot(z1 - z0, y1 - y0); return this.box(w, th, len, color, x, (y0 + y1) / 2, (z0 + z1) / 2, -Math.atan2(y1 - y0, z1 - z0)); }
  cyl(rt, rb, h, seg, color, x, y, z, rx = 0, ry = 0, rz = 0) { return this.add(new THREE.CylinderGeometry(rt, rb, h, seg), color, x, y, z, rx, ry, rz); }
  geo() { const g = mergeGeometries(this.list); this.list = []; return g; }
  mesh(mat) { const m = new THREE.Mesh(this.geo(), mat); m.castShadow = true; m.receiveShadow = true; return m; }
}
// oldalprofil (z,y pontok) kihúzva x irányban; a külső lap x = 0-n, befelé −x
function sideGeo(pts, holes, th) {
  const s = new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y)));
  for (const h of holes) s.holes.push(new THREE.Path(h.map(([z, y]) => new THREE.Vector2(z, y))));
  const g = new THREE.ExtrudeGeometry(s, { depth: th, bevelEnabled: false, curveSegments: 3 });
  g.rotateY(-Math.PI / 2);
  return g;
}
function wheelGeo(r, w, hub) {
  const k = new Kit();
  k.cyl(r, r, w, 12, C.dk, 0, 0, 0, 0, 0, Math.PI / 2);
  k.cyl(r * 0.56, r * 0.56, w + 0.02, 8, hub, 0, 0, 0, 0, 0, Math.PI / 2);
  k.cyl(r * 0.2, r * 0.2, w + 0.05, 6, C.gr, 0, 0, 0, 0, 0, Math.PI / 2);
  return k.geo();
}
function texPlanes(tex, planes) {
  const geos = planes.map(([w, h, x, y, z, ry]) => { const g = new THREE.PlaneGeometry(w, h); g.rotateY(ry); g.translate(x, y, z); return g; });
  const m = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ map: tex, transparent: true, alphaTest: 0.4, roughness: 0.6 }));
  m.receiveShadow = true; return m;
}

export class Rig {
  constructor(scene, world) {
    this.world = world;
    this.x = PARK.x; this.z = PARK.z; this.yaw = PARK.yaw; this.v = 0; this.steer = 0;
    this.ax = 0; this.az = 0; this.ty = 0; this.lastOv = 0; this.spin = 0; this.tspin = 0; this.rampA = 0; this.rampT = 0;
    this.pitch = 0; this.roll = 0; this.tpitch = 0; this.troll = 0; this.snap = true;
    this.VC = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.72, metalness: 0 });
    this.glass = new THREE.MeshStandardMaterial({ color: '#d8f0f6', transparent: true, opacity: 0.28, roughness: 0.2, depthWrite: false, flatShading: true });
    this.head = new THREE.MeshStandardMaterial({ color: '#fff8e2', emissive: '#ffefbf', emissiveIntensity: 0.35, flatShading: true });
    this.tail = new THREE.MeshStandardMaterial({ color: '#e0453a', emissive: '#c01e14', emissiveIntensity: 0.35, flatShading: true });
    this.buildTruck(); this.buildTrailer();
    scene.add(this.truck); scene.add(this.trailer);
    // ütközők (a világ dobozai közé, menet közben frissülnek)
    this.boxT = world.addBox(0, 0, 1.02, 2.72, 0, 2.1); this.boxT.veh = true;
    this.boxR = world.addBox(0, 0, 1.13, 2.1, 0, 2.95); this.boxR.veh = true;
    this.boxD = world.addBox(0, 0, 0.55, 0.62, 0, 0.95); this.boxD.veh = true;
    this.place(PARK.x, PARK.z, PARK.yaw);
  }

  buildTruck() {
    const g = this.truck = new THREE.Group(); g.rotation.order = 'YXZ';
    const k = new Kit(), gl = new Kit(), hl = new Kit(), tl = new Kit();
    // alváz és karosszéria (oldalprofilból: lekerekített orr, motorháztető)
    k.box(1.5, 0.22, 5.0, C.dk, 0, 0.5, 1.45);
    k.add(sideGeo([[-1.15, 0.6], [3.98, 0.6], [4.13, 0.8], [4.11, 1.06], [3.92, 1.24], [2.4, 1.31], [2.4, 1.16], [-1.15, 1.16]], [], 1.9), C.tq, 0.95);
    for (const s of [-1, 1]) {
      // kerékívek
      for (const z of [0, RIG.wb]) k.add(new THREE.TorusGeometry(0.5, 0.075, 4, 8, Math.PI), C.tqd, s * 0.975, 0.42, z, 0, Math.PI / 2);
      k.box(0.02, 0.05, 5.15, C.cr, s * 0.955, 0.86, 1.45); // díszcsík
      k.box(0.012, 0.46, 0.02, C.tqd, s * 0.956, 0.9, 2.32); k.box(0.012, 0.46, 0.02, C.tqd, s * 0.956, 0.9, 0.93); // ajtóvonal
      k.box(0.03, 0.04, 0.16, C.ch, s * 0.965, 1.07, 1.12); // kilincs
      // fülke: oszlopok
      k.slab(C.cr, s * 0.885, 2.42, 1.16, 2.08, 1.98, 0.07, 0.07);
      k.box(0.07, 0.84, 0.12, C.cr, s * 0.885, 1.58, 0.92);
      // visszapillantó
      k.box(0.03, 0.03, 0.14, C.dk, s * 0.99, 1.34, 2.3, 0, 0, 0); k.box(0.07, 0.13, 0.17, C.cr, s * 1.06, 1.38, 2.28);
      // fényszóró, hátsó lámpa
      hl.cyl(0.12, 0.12, 0.06, 10, '#ffffff', s * 0.66, 1.0, 4.1, Math.PI / 2);
      k.cyl(0.145, 0.145, 0.05, 10, C.ch, s * 0.66, 1.0, 4.075, Math.PI / 2);
      tl.box(0.14, 0.2, 0.04, '#ffffff', s * 0.86, 1.0, -1.17);
      // platófal
      k.box(0.07, 0.28, 2.02, C.tq, s * 0.915, 1.3, -0.14); k.box(0.1, 0.03, 2.02, C.cr, s * 0.915, 1.45, -0.14);
    }
    k.box(1.84, 0.08, 1.26, C.cr, 0, 2.0, 1.47); // tető
    k.box(1.84, 0.22, 0.07, C.tq, 0, 1.27, 0.88); // fülke hátfal alja
    k.box(1.84, 0.06, 0.07, C.cr, 0, 1.94, 0.88);
    gl.box(1.72, 0.58, 0.02, '#ffffff', 0, 1.67, 0.885); // hátsó üveg
    gl.slab('#ffffff', 0, 2.41, 1.18, 2.09, 1.95, 1.72, 0.02); // szélvédő
    // belső: műszerfal, ülés, kormány
    k.box(1.72, 0.18, 0.3, C.dash, 0, 1.27, 2.2);
    k.box(1.66, 0.16, 0.5, C.br, 0, 0.92, 1.24);
    k.slab(C.br, 0, 1.0, 0.96, 0.93, 1.62, 1.66, 0.14);
    k.add(new THREE.TorusGeometry(0.16, 0.025, 4, 12), C.dk, 0.42, 1.33, 1.72, 0.64);
    k.cyl(0.025, 0.025, 0.42, 5, C.dk, 0.42, 1.25, 1.88, 2.2);
    // plató: deszkapadló, szalmabála, vödör
    k.box(1.78, 0.02, 1.96, C.wd, 0, 1.17, -0.14);
    k.box(1.9, 0.28, 0.07, C.tq, 0, 1.3, -1.12); k.box(1.9, 0.03, 0.1, C.cr, 0, 1.45, -1.12);
    k.box(0.92, 0.42, 0.5, C.hy, 0.3, 1.39, -0.62, 0, 0.12); k.box(0.94, 0.03, 0.04, '#8a6a2a', 0.3, 1.39, -0.62 + 0.26, 0, 0.12);
    k.cyl(0.16, 0.13, 0.28, 10, '#2f6fd0', -0.5, 1.32, 0.32);
    // orr: hűtőrács, lökhárító
    k.box(0.96, 0.32, 0.05, C.ch, 0, 0.93, 4.11);
    for (const y of [0.84, 0.93, 1.02]) k.box(0.84, 0.03, 0.02, C.dk, 0, y, 4.14);
    k.box(2.0, 0.16, 0.2, C.ch, 0, 0.62, 4.13);
    // far: lökhárító, vonóhorog, kipufogó
    k.box(2.0, 0.14, 0.16, C.ch, 0, 0.62, -1.2);
    k.box(0.12, 0.1, 0.4, C.dk, 0, 0.5, -1.3); k.add(new THREE.IcosahedronGeometry(0.065, 0), C.ch, 0, 0.6, -RIG.hitch);
    k.cyl(0.04, 0.04, 0.3, 6, C.gr, -0.6, 0.42, -1.22, Math.PI / 2);
    g.add(k.mesh(this.VC));
    const gm = gl.mesh(this.glass); gm.castShadow = false; gm.renderOrder = 2; g.add(gm);
    g.add(hl.mesh(this.head)); g.add(tl.mesh(this.tail));
    // rendszámtábla
    const plate = canvasTexture(256, 64, (x) => { x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(2, 2, 252, 60, 10); x.fill(); x.strokeStyle = '#1d2a55'; x.lineWidth = 5; x.stroke(); x.fillStyle = '#1d3a8a'; x.fillRect(6, 6, 30, 52); x.fillStyle = '#1b1b22'; x.font = 'bold 40px system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('LÓ-001', 146, 34); });
    plate.userData.keep = true;
    g.add(texPlanes(plate, [[0.52, 0.13, 0, 0.62, 4.24, 0], [0.52, 0.13, 0, 1.3, -1.16, Math.PI]]));
    // kerekek (az elsők kormányozhatók)
    const wg = wheelGeo(0.42, 0.3, C.cr);
    this.wheels = []; this.steerG = [];
    for (const z of [0, RIG.wb]) for (const s of [-1, 1]) {
      const sg = new THREE.Group(); sg.position.set(s * 0.85, 0.42, z); g.add(sg);
      const w = new THREE.Mesh(wg, this.VC); w.castShadow = true; sg.add(w); this.wheels.push(w);
      if (z > 0) this.steerG.push(sg);
    }
    // sofőrülés: ide kerül a lovas
    this.seat = new THREE.Group(); this.seat.position.set(0.42, 1.08, 1.24); g.add(this.seat);
  }

  buildTrailer() {
    const g = this.trailer = new THREE.Group(); g.rotation.order = 'YXZ';
    const F = RIG.floor, B = RIG.back;
    const k = new Kit(), tl = new Kit();
    k.box(1.75, 0.1, 3.98, C.rb, 0, F - 0.05, -0.16); // padló
    k.box(1.3, 0.14, 4.1, C.dk, 0, F - 0.17, -0.1); // alváz
    // oldalfalak ablakkal (az ablakon kilátszik a ló feje)
    const prof = [[B, F], [1.83, F], [2.02, 1.05], [1.92, 2.3], [1.55, 2.86], [B, 2.86]];
    const win = [[0.95, 1.98], [1.62, 1.98], [1.62, 2.48], [0.95, 2.48]];
    k.add(sideGeo(prof, [win], 0.05), C.cr, 0.875); k.add(sideGeo(prof, [win], 0.05), C.cr, -0.825);
    // orr
    k.slab(C.cr, 0, 1.83, F, 2.02, 1.05, 1.75, 0.05); k.slab(C.cr, 0, 2.02, 1.05, 1.92, 2.3, 1.75, 0.05); k.slab(C.cr, 0, 1.92, 2.3, 1.55, 2.86, 1.75, 0.05);
    k.slab(C.gl, 0, 2.0, 1.68, 1.958, 2.2, 1.1, 0.03); // első ablak
    k.slab(C.tq, 0, 1.855, F, 2.045, 1.05, 1.77, 0.03);
    // tető
    k.box(1.81, 0.06, 3.72, C.cr2, 0, 2.89, -0.3); k.box(0.5, 0.08, 0.6, C.cr2, 0, 2.96, -0.5);
    for (const s of [-1, 1]) {
      k.box(0.04, 0.05, 3.72, C.tq, s * 0.9, 2.9, -0.3);
      k.box(0.02, 0.4, 3.98, C.tq, s * 0.886, F + 0.2, -0.16); // szoknya
      k.box(0.02, 0.06, 3.95, C.tq, s * 0.886, 1.72, -0.18); // díszcsík
      for (const [z0, z1] of [[0.95, 1.62]]) { k.box(0.03, 0.05, z1 - z0 + 0.1, C.tq, s * 0.885, 1.96, (z0 + z1) / 2); k.box(0.03, 0.05, z1 - z0 + 0.1, C.tq, s * 0.885, 2.5, (z0 + z1) / 2); }
      // sárvédő
      k.box(0.26, 0.05, 1.64, C.tq, s * 1.0, 0.8, 0); k.slab(C.tq, s * 1.0, 0.82, 0.8, 1.0, 0.5, 0.26, 0.05); k.slab(C.tq, s * 1.0, -0.82, 0.8, -1.0, 0.5, 0.26, 0.05);
      // vonórúd
      k.box(0.1, 0.1, 1.43, C.dk, s * 0.275, 0.48, 2.49, 0, Math.atan2(-s * 0.55, 1.32));
      // hátul: oldalra kihajtott felső ajtószárnyak, sarokoszlopok
      k.box(0.04, 0.98, 0.84, C.cr, s * 0.905, 2.3, B + 0.44); k.box(0.045, 0.06, 0.84, C.tq, s * 0.905, 1.86, B + 0.44);
      k.box(0.07, 2.42, 0.07, C.cr2, s * 0.85, F + 1.21, B + 0.035);
      tl.box(0.18, 0.1, 0.05, '#ffffff', s * 0.72, 0.33, B - 0.03);
      // szénaháló elöl
      k.add(new THREE.IcosahedronGeometry(0.17, 0), C.hy, s * 0.62, 1.95, 1.62);
    }
    k.box(1.75, 0.08, 0.07, C.cr2, 0, 2.82, B + 0.035);
    // vonófej, támkerék, szerszámláda
    k.box(0.14, 0.12, 0.4, C.gr, 0, 0.54, RIG.L2 - 0.16); k.box(0.17, 0.09, 0.2, C.dk, 0, 0.62, RIG.L2);
    k.cyl(0.035, 0.035, 0.45, 6, C.gr, 0.22, 0.42, 2.75); k.cyl(0.08, 0.08, 0.05, 8, C.dk, 0.22, 0.1, 2.75, 0, 0, Math.PI / 2);
    k.box(1.0, 0.36, 0.42, C.cr, 0, 0.72, 2.44); k.box(1.03, 0.05, 0.45, C.tq, 0, 0.92, 2.44);
    // belső: válaszfal, mellkorlát
    k.box(0.05, 1.0, 2.5, C.wd, 0, 1.45, 0.05); k.box(1.7, 0.06, 0.06, C.gr, 0, 1.35, 1.55);
    g.add(k.mesh(this.VC)); g.add(tl.mesh(this.tail));
    // felirat az oldalán
    const dec = canvasTexture(512, 128, (x, W, H) => {
      x.clearRect(0, 0, W, H);
      x.font = 'italic 900 76px ui-rounded, system-ui'; x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 10; x.strokeStyle = '#f6ecd2'; x.strokeText('Vágtavölgy', W / 2 + 26, H / 2 + 4); x.fillStyle = '#2f7f78'; x.fillText('Vágtavölgy', W / 2 + 26, H / 2 + 4);
      // patkó
      x.strokeStyle = '#c98a12'; x.lineWidth = 11; x.lineCap = 'round'; x.beginPath(); x.arc(46, 58, 26, Math.PI * 0.85, Math.PI * 2.15); x.stroke();
    });
    dec.userData.keep = true;
    g.add(texPlanes(dec, [[2.0, 0.5, 0.889, 1.3, -0.6, Math.PI / 2], [2.0, 0.5, -0.889, 1.3, -0.6, -Math.PI / 2]]));
    // rámpa (hátsó alsó ajtó): csuklópont a padló hátsó élén
    const rg = this.ramp = new THREE.Group(); rg.position.set(0, F, B); g.add(rg);
    const rk = new Kit();
    rk.box(1.7, 1.33, 0.07, C.cr, 0, 0.665, -0.035); rk.box(1.71, 0.14, 0.072, C.tq, 0, 0.22, -0.035);
    rk.box(1.6, 1.26, 0.01, C.rb, 0, 0.66, 0.004);
    for (let i = 0; i < 7; i++) rk.box(1.58, 0.03, 0.02, C.wd, 0, 0.12 + i * 0.18, 0.014);
    for (const s of [-1, 1]) rk.box(0.06, 0.24, 0.04, C.gr, s * 0.6, 1.08, -0.09);
    rg.add(rk.mesh(this.VC));
    // kerekek (tandem)
    const wg = wheelGeo(0.34, 0.22, C.cr);
    this.twheels = [];
    for (const z of [-0.42, 0.42]) for (const s of [-1, 1]) { const w = new THREE.Mesh(wg, this.VC); w.position.set(s * 1.0, 0.34, z); w.castShadow = true; g.add(w); this.twheels.push(w); }
  }

  // ---------- állapot ----------
  hitchXZ() { return { x: this.x - Math.sin(this.yaw) * RIG.hitch, z: this.z - Math.cos(this.yaw) * RIG.hitch }; }
  place(x, z, yaw, ty = yaw) {
    this.x = x; this.z = z; this.yaw = yaw; this.v = 0; this.steer = 0; this.ty = ty;
    const h = this.hitchXZ(); this.ax = h.x - Math.sin(ty) * RIG.L2; this.az = h.z - Math.cos(ty) * RIG.L2;
    this.lastOv = this.trailerOverlap(); this.snap = true; this.pose(0);
  }
  state() { return { x: +this.x.toFixed(2), z: +this.z.toFixed(2), yaw: +this.yaw.toFixed(3), ty: +this.ty.toFixed(3) }; }
  center() { return { x: this.x + Math.sin(this.yaw) * 1.5, z: this.z + Math.cos(this.yaw) * 1.5 }; }
  // a sofőroldali ajtó előtti pont (a lovas itt száll be/ki)
  doorXZ() { const lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw), fx = Math.sin(this.yaw), fz = Math.cos(this.yaw); return { x: this.x + lx * 1.55 + fx * 1.55, z: this.z + lz * 1.55 + fz * 1.55 }; }
  // utánfutó-lokális pont → világ (vízszintes)
  tLocal(lx, lz) { const fx = Math.sin(this.ty), fz = Math.cos(this.ty); return { x: this.ax + Math.cos(this.ty) * lx + fx * lz, z: this.az - Math.sin(this.ty) * lx + fz * lz }; }
  toTLocal(x, z) { const dx = x - this.ax, dz = z - this.az; return { x: dx * Math.cos(this.ty) - dz * Math.sin(this.ty), z: dx * Math.sin(this.ty) + dz * Math.cos(this.ty) }; }
  rampFoot() { return this.tLocal(0, RIG.rampTipZ - 0.6); }

  trailerOverlap() {
    let s = 0; const W = this.world, fx = Math.sin(this.ty), fz = Math.cos(this.ty), p = { x: 0, z: 0 };
    for (const lz of [-1.5, 0, 1.4]) { p.x = this.ax + fx * lz; p.z = this.az + fz * lz; const ox = p.x, oz = p.z; W.resolve(p, 0.95, 0, 'car'); s += Math.hypot(p.x - ox, p.z - oz); }
    return s;
  }

  // ---------- mozgás (kinematikus kerékpár-modell + húzott utánfutó) ----------
  step(dt, vt, steerT, block) {
    const W = this.world, res = { bump: 0, msg: null };
    const speedUp = this.v * vt >= 0 && Math.abs(vt) > Math.abs(this.v);
    const a = speedUp ? 3.2 : 7.5;
    this.v = this.v < vt ? Math.min(vt, this.v + a * dt) : Math.max(vt, this.v - a * dt);
    this.steer = damp(this.steer, steerT, 6, dt);
    if (Math.abs(this.v) < 1e-3) { this.v = 0; return res; }
    const old = { x: this.x, z: this.z, yaw: this.yaw, ax: this.ax, az: this.az, ty: this.ty };
    const probeOld = this.probe();
    this.yaw = wrapAngle(this.yaw + this.v * Math.tan(this.steer) / RIG.wb * dt);
    this.x += Math.sin(this.yaw) * this.v * dt; this.z += Math.cos(this.yaw) * this.v * dt;
    this.follow();
    // terep: mély víz, meredek fal, a völgy széle (az éppen elöl lévő végén)
    const pr = this.probe(), hN = W.heightAt(pr.x, pr.z), hO = W.heightAt(probeOld.x, probeOld.z);
    const steep = (hN - hO) / Math.max(Math.abs(this.v) * dt, 1e-3);
    if (WATER - hN > 0.55 || Math.abs(pr.x) > HALF - 16 || Math.abs(pr.z) > HALF - 16 || steep > 0.85) {
      Object.assign(this, old); this.v = 0;
      res.msg = WATER - hN > 0.55 ? 'deep' : 'steep'; return res;
    }
    // a pickup ütközése (három kör a hossza mentén)
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), p = { x: 0, z: 0 };
    let pushX = 0, pushZ = 0;
    for (const lz of [-0.5, 1.45, 3.3]) {
      p.x = this.x + fx * lz; p.z = this.z + fz * lz; const ox = p.x, oz = p.z;
      W.resolve(p, 1.0, 0, 'car'); if (block) block(p, 1.0);
      const dx = p.x - ox, dz = p.z - oz;
      if (dx || dz) { this.x += dx; this.z += dz; pushX += dx; pushZ += dz; }
    }
    const pl = Math.hypot(pushX, pushZ);
    if (pl > 1e-4) {
      const head = clamp(-(pushX * fx + pushZ * fz) / pl * Math.sign(this.v), 0, 1);
      if (head > 0.5 && Math.abs(this.v) > 3) res.bump = Math.abs(this.v);
      this.v *= Math.pow(head > 0.5 ? 0.02 : 0.5, dt);
      this.follow();
    }
    // utánfutó: ha beakadna valamibe, nem megyünk tovább
    const ov = this.trailerOverlap();
    if (ov > this.lastOv + 0.03) { Object.assign(this, old); this.v = 0; res.msg = 'trailer'; return res; }
    this.lastOv = ov;
    this.spin += this.v * dt / 0.42; this.tspin += this.v * Math.cos(this.yaw - this.ty) * dt / 0.34;
    return res;
  }
  probe() {
    if (this.v >= 0) return { x: this.x + Math.sin(this.yaw) * 4.3, z: this.z + Math.cos(this.yaw) * 4.3 };
    return { x: this.ax - Math.sin(this.ty) * 2.5, z: this.az - Math.cos(this.ty) * 2.5 };
  }
  // az utánfutó követi a vonógömböt (traktrix), a becsuklás korlátozva
  follow() {
    const h = this.hitchXZ(); let dx = h.x - this.ax, dz = h.z - this.az;
    let ty = Math.atan2(dx, dz); const rel = wrapAngle(ty - this.yaw);
    if (Math.abs(rel) > 1.25) ty = this.yaw + Math.sign(rel) * 1.25;
    this.ty = wrapAngle(ty); this.ax = h.x - Math.sin(this.ty) * RIG.L2; this.az = h.z - Math.cos(this.ty) * RIG.L2;
  }

  // ---------- megjelenítés ----------
  pose(dt, rampOpen = false) {
    const W = this.world, k = this.snap ? 1 : 1 - Math.exp(-dt * 10);
    // pickup a négy keréken
    let fx = Math.sin(this.yaw), fz = Math.cos(this.yaw), lx = Math.cos(this.yaw), lz = -Math.sin(this.yaw);
    const H = (bx, bz, x, z) => W.heightAt(bx + lx * x + fx * z, bz + lz * x + fz * z);
    const rL = H(this.x, this.z, 0.85, 0), rR = H(this.x, this.z, -0.85, 0), fL = H(this.x, this.z, 0.85, RIG.wb), fR = H(this.x, this.z, -0.85, RIG.wb);
    const y0 = Math.max(WATER - 0.4, (rL + rR) / 2);
    this.pitch += (Math.atan2((rL + rR) / 2 - (fL + fR) / 2, RIG.wb) - this.pitch) * k;
    this.roll += (Math.atan2((rL + fL) / 2 - (rR + fR) / 2, 1.7) - this.roll) * k;
    this.yT = this.snap ? y0 : this.yT + (y0 - this.yT) * k;
    this.truck.position.set(this.x, this.yT, this.z); this.truck.rotation.set(this.pitch, this.yaw, this.roll);
    this.truck.updateMatrixWorld(true);
    const ball = this.truck.localToWorld(tP.set(0, 0.6, -RIG.hitch));
    // utánfutó
    fx = Math.sin(this.ty); fz = Math.cos(this.ty); lx = Math.cos(this.ty); lz = -Math.sin(this.ty);
    const tL = (H(this.ax, this.az, 1.0, 0.42) + H(this.ax, this.az, 1.0, -0.42)) / 2, tR = (H(this.ax, this.az, -1.0, 0.42) + H(this.ax, this.az, -1.0, -0.42)) / 2;
    const ty0 = Math.max(WATER - 0.4, (tL + tR) / 2);
    this.tyT = this.snap ? ty0 : this.tyT + (ty0 - this.tyT) * k;
    this.tpitch = Math.atan2(this.tyT + 0.6 - ball.y, RIG.L2);
    this.troll += (Math.atan2(tL - tR, 2.0) - this.troll) * k;
    this.trailer.position.set(this.ax, this.tyT, this.az); this.trailer.rotation.set(this.tpitch, this.ty, this.troll);
    // kerekek, kormány, rámpa
    for (const w of this.wheels) w.rotation.x = this.spin;
    for (const s of this.steerG) s.rotation.y = this.steer;
    for (const w of this.twheels) w.rotation.x = this.tspin;
    this.rampA = this.snap ? (rampOpen ? 1 : 0) : damp(this.rampA, rampOpen ? 1 : 0, 2.6, dt);
    this.ramp.rotation.x = -this.rampA * (Math.PI / 2 + RIG.rampB);
    this.trailer.updateMatrixWorld(true);
    this.snap = false;
    // ütközők követik
    const setB = (b, x, z, yaw) => { b.x = x; b.z = z; b.yaw = yaw; b.c = Math.cos(yaw); b.s = Math.sin(yaw); };
    setB(this.boxT, this.x + Math.sin(this.yaw) * 1.5, this.z + Math.cos(this.yaw) * 1.5, this.yaw);
    setB(this.boxR, this.ax - fx * 0.14, this.az - fz * 0.14, this.ty);
    setB(this.boxD, this.ax + fx * 2.65, this.az + fz * 2.65, this.ty);
  }
  setNight(n) { this.head.emissiveIntensity = 0.35 + n * 2.6; this.tail.emissiveIntensity = 0.35 + n * 1.4; }
  setVisible(on) { this.truck.visible = on; this.trailer.visible = on; }
}
