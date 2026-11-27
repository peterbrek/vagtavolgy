import * as THREE from 'three';
import { canvasTexture } from './geom.js';
import { mulberry32, clamp } from './noise.js';
import { mergeStatic } from './props.js';

// Lakóház az istálló mellett: nappali, konyha, fürdőszoba, hálószoba.
// Belül "babaház" nézet: bent a tető eltűnik, a falak alacsonyra vágódnak.
const FLOOR = 0.25, WH = 2.8, T = 0.2, IT = 0.12;
const HX = 5.8, HZ = 4.7; // belső félméretek

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const std = (c, r = 0.6, o = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: r, ...o });

export class House {
  constructor(scene, world, P) {
    this.P = P; const { x, z } = P;
    this.root = new THREE.Group(); this.root.position.set(x, 0, z); scene.add(this.root);
    this.boxes = []; // ütközők (ház-lokális AABB): [x0,z0,x1,z1,magasság]
    this.spots = {};
    this.inside = false;
    const rnd = mulberry32(808);
    const B = (w, h, d, m, px, py, pz, parent) => { const g = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); g.position.set(px, py, pz); g.castShadow = true; g.receiveShadow = true; parent.add(g); return g; };
    const solid = (x0, z0, x1, z1, h = 1.0) => this.boxes.push([Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), h]);

    // ---------- anyagok, textúrák ----------
    const plank = canvasTexture(256, 256, (c, W, H) => {
      for (let i = 0; i < 8; i++) { const l = 40 + rnd() * 10; c.fillStyle = `hsl(28,${42 + rnd() * 10}%,${l}%)`; c.fillRect(0, i * 32, W, 32); c.fillStyle = 'rgba(40,20,8,.45)'; c.fillRect(0, i * 32 + 30, W, 2); const off = rnd() * W; c.fillRect(off, i * 32, 2, 32);
        for (let k = 0; k < 14; k++) { c.strokeStyle = `rgba(60,30,10,${0.08 + rnd() * 0.1})`; c.beginPath(); const y = i * 32 + 3 + rnd() * 26; c.moveTo(0, y); c.bezierCurveTo(W * 0.3, y + rnd() * 4 - 2, W * 0.6, y + rnd() * 4 - 2, W, y); c.stroke(); } }
    });
    plank.wrapS = plank.wrapT = THREE.RepeatWrapping; plank.repeat.set(3, 3);
    const tile = (a, b, n) => { const t = canvasTexture(128, 128, (c, W, H) => { const s = W / n; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { c.fillStyle = (i + j) % 2 ? a : b; c.fillRect(i * s, j * s, s, s); } c.strokeStyle = 'rgba(0,0,0,.18)'; c.lineWidth = 2; for (let i = 0; i <= n; i++) { c.beginPath(); c.moveTo(i * s, 0); c.lineTo(i * s, H); c.stroke(); c.beginPath(); c.moveTo(0, i * s); c.lineTo(W, i * s); c.stroke(); } }); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t; };
    const kitT = tile('#efe8da', '#b7473b', 4); kitT.repeat.set(2.6, 2.6);
    const bathT = tile('#f4f7f8', '#cfe3ea', 6); bathT.repeat.set(2.2, 2.2);
    const roofTex = canvasTexture(128, 128, (c, W, H) => {
      c.fillStyle = '#9a4532'; c.fillRect(0, 0, W, H);
      for (let r = 0; r < 8; r++) for (let k = 0; k < 8; k++) { const o = (r % 2) * 8; c.fillStyle = `hsl(${8 + rnd() * 8},${45 + rnd() * 10}%,${30 + rnd() * 10}%)`; c.fillRect(k * 16 + o - 8, r * 16, 15, 14); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(k * 16 + o - 8, r * 16 + 12, 15, 3); }
    });
    roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping; roofTex.repeat.set(4, 2.2);
    const stoneT = canvasTexture(128, 128, (c, W, H) => { c.fillStyle = '#8b857b'; c.fillRect(0, 0, W, H); for (let r = 0; r < 6; r++) for (let k = 0; k < 4; k++) { const v = 110 + rnd() * 60; c.fillStyle = `rgb(${v},${v * 0.96},${v * 0.9})`; c.fillRect(k * 32 + (r % 2) * 16 - 16 + 2, r * 21 + 2, 28, 18); } });
    const M = this.M = {
      wall: lam('#f3ece0'), wallIn: lam('#f7f1e6'), wood: lam('#6b4428'), dark: lam('#3d2a1c'), trim: lam('#fbf8f2'),
      roof: lam('#ffffff', { map: roofTex }), stone: lam('#ffffff', { map: stoneT }), shutter: lam('#3f7a5a'), door: lam('#2f6b8f'),
      floorW: lam('#ffffff', { map: plank }), floorK: lam('#ffffff', { map: kitT }), floorB: lam('#ffffff', { map: bathT }),
      sofa: std('#5b7fb8', 0.9), cushion: std('#f2d488', 0.9), rug: lam('#b8534a'), rug2: lam('#6c8fb3'), white: std('#f7f7f4', 0.35), steel: std('#c9ccd1', 0.25, { metalness: 0.6 }),
      black: std('#1d1f22', 0.4), counter: lam('#e9e2d2'), cab: lam('#7fa6a0'), bed: lam('#e9dccb'), duvet: std('#e8a5b8', 0.95), pillow: std('#ffffff', 0.9),
      plant: lam('#3f8a3a'), pot: lam('#b5653d'), book: [lam('#b8463a'), lam('#3a6fb8'), lam('#e0b23a'), lam('#4f9a5a'), lam('#7a4fa0')],
      glass: new THREE.MeshStandardMaterial({ color: '#3a4d58', roughness: 0.2, emissive: '#ffb860', emissiveIntensity: 0 }),
      glassIn: new THREE.MeshStandardMaterial({ color: '#2a3a4c', roughness: 0.3, emissive: '#d4e9ff', emissiveIntensity: 1 }),
      lamp: new THREE.MeshStandardMaterial({ color: '#fff3d0', roughness: 0.5, emissive: '#ffd890', emissiveIntensity: 0.15 }),
      water: std('#9fd3ea', 0.1, { transparent: true, opacity: 0.85 }),
      tv: new THREE.MeshBasicMaterial({ color: '#0c0f14' }),
    };
    this.glassMat = M.glass; this.glassInMat = M.glassIn; this.lampMat = M.lamp;

    // ---------- csoportok ----------
    const ext = this.ext = new THREE.Group(); this.root.add(ext);        // alap, tornác, kémény (mindig látszik)
    const walls = this.walls = new THREE.Group(); this.root.add(walls);  // falak (bent levágva)
    const wallItems = this.wallItems = new THREE.Group(); this.root.add(wallItems); // ablakok, képek (bent rejtve)
    const roof = this.roofG = new THREE.Group(); this.root.add(roof);    // tető (bent rejtve)
    const inner = this.inner = new THREE.Group(); this.root.add(inner);  // padló, bútorok
    const dyn = new THREE.Group(); this.root.add(dyn);                   // mozgó / változó elemek

    // alap és padlók
    B(2 * HX + 2 * T + 0.3, FLOOR, 2 * HZ + 2 * T + 0.3, M.stone, 0, FLOOR / 2, 0, ext);
    const floor = (x0, z0, x1, z1, m, rep) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0); const f = new THREE.Mesh(g, m); f.rotation.x = -Math.PI / 2; f.position.set((x0 + x1) / 2, FLOOR + 0.006, (z0 + z1) / 2); f.receiveShadow = true; inner.add(f); };
    const XA = 0.6, XB = 1.4, ZC = -0.6; // belső falak helye
    floor(-HX, ZC, XA, HZ, M.floorW); floor(XA, ZC, HX, HZ, M.floorK); floor(-HX, -HZ, XB, ZC, M.floorW); floor(XB, -HZ, HX, ZC, M.floorB);

    // ---------- falak ----------
    const wall = (x0, z0, x1, z1, th, mat = M.wall) => {
      const len = Math.hypot(x1 - x0, z1 - z0), ax = Math.abs(x1 - x0) > Math.abs(z1 - z0);
      const w = ax ? len : th, d = ax ? th : len;
      B(w, WH, d, mat, (x0 + x1) / 2, FLOOR + WH / 2, (z0 + z1) / 2, walls);
      solid((x0 + x1) / 2 - w / 2, (z0 + z1) / 2 - d / 2, (x0 + x1) / 2 + w / 2, (z0 + z1) / 2 + d / 2, 99);
    };
    const DOOR = [-1.4, -0.3]; // bejárati ajtó (x) az elülső falon
    const ez = HZ + T / 2, ex = HX + T / 2;
    wall(-ex - T / 2, -ez, ex + T / 2, -ez, T); // hátsó
    wall(-ex, -ez, -ex, ez, T); wall(ex, -ez, ex, ez, T); // oldalak
    wall(-ex - T / 2, ez, DOOR[0], ez, T); wall(DOOR[1], ez, ex + T / 2, ez, T); // elöl, ajtónyílással
    B(DOOR[1] - DOOR[0], WH - 2.15, T, M.wall, (DOOR[0] + DOOR[1]) / 2, FLOOR + 2.15 + (WH - 2.15) / 2, ez, walls);
    // belső falak (ajtónyílásokkal)
    const BD = [-2.2, -1.2], BA = [3.0, 3.9], ARCH = [1.0, 2.6];
    wall(-HX, ZC, BD[0], ZC, IT, M.wallIn); wall(BD[1], ZC, BA[0], ZC, IT, M.wallIn); wall(BA[1], ZC, HX, ZC, IT, M.wallIn);
    wall(XA, ZC, XA, ARCH[0], IT, M.wallIn); wall(XA, ARCH[1], XA, HZ, IT, M.wallIn);
    wall(XB, -HZ, XB, ZC, IT, M.wallIn);
    for (const [a, b, zz] of [[BD[0], BD[1], ZC], [BA[0], BA[1], ZC]]) B(b - a, WH - 2.1, IT, M.wallIn, (a + b) / 2, FLOOR + 2.1 + (WH - 2.1) / 2, zz, walls);
    B(IT, WH - 2.2, ARCH[1] - ARCH[0], M.wallIn, XA, FLOOR + 2.2 + (WH - 2.2) / 2, (ARCH[0] + ARCH[1]) / 2, walls);
    // ajtókeretek
    const frame = (a, b, zz, alongX, h, parent = walls) => {
      if (alongX) { B(0.08, h, IT + 0.06, M.wood, a, FLOOR + h / 2, zz, parent); B(0.08, h, IT + 0.06, M.wood, b, FLOOR + h / 2, zz, parent); B(b - a + 0.16, 0.08, IT + 0.06, M.wood, (a + b) / 2, FLOOR + h, zz, parent); }
      else { B(IT + 0.06, h, 0.08, M.wood, zz, FLOOR + h / 2, a, parent); B(IT + 0.06, h, 0.08, M.wood, zz, FLOOR + h / 2, b, parent); B(IT + 0.06, 0.08, b - a + 0.16, M.wood, zz, FLOOR + h, (a + b) / 2, parent); }
    };
    frame(BD[0], BD[1], ZC, true, 2.1); frame(BA[0], BA[1], ZC, true, 2.1); frame(ARCH[0], ARCH[1], XA, false, 2.2);
    frame(DOOR[0], DOOR[1], ez, true, 2.15);
    // favázas díszítés kívül: sarokoszlopok, övpárkány
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B(0.26, WH + 0.05, 0.26, M.wood, sx * (ex + 0.03), FLOOR + WH / 2, sz * (ez + 0.03), walls);
    B(2 * ex + 0.3, 0.14, 0.06, M.wood, 0, FLOOR + 0.95, ez + T / 2 + 0.03, walls); B(2 * ex + 0.3, 0.14, 0.06, M.wood, 0, FLOOR + 0.95, -ez - T / 2 - 0.03, walls);
    // nyitott bejárati ajtó
    { const d = B(DOOR[1] - DOOR[0] - 0.04, 2.1, 0.06, M.door, 0, 0, 0, walls); d.position.set(DOOR[0] + 0.05, FLOOR + 1.05, ez - 0.55); d.rotation.y = Math.PI / 2; }

    // ---------- ablakok (kint és bent is látszanak) ----------
    const win = (px, pz, nx, nz, w = 1.2, h = 1.15, y = 1.05, shutters = true) => {
      const g = new THREE.Group(); g.position.set(px, FLOOR + y + h / 2, pz); g.rotation.y = Math.atan2(nx, nz); wallItems.add(g);
      for (const side of [1, -1]) {
        const o = side * (T / 2 + 0.012);
        B(w, h, 0.02, side > 0 ? M.glass : M.glassIn, 0, 0, o, g);
        B(w + 0.14, 0.09, 0.05, M.trim, 0, h / 2, o, g); B(w + 0.14, 0.09, 0.05, M.trim, 0, -h / 2, o, g);
        B(0.09, h, 0.05, M.trim, w / 2, 0, o, g); B(0.09, h, 0.05, M.trim, -w / 2, 0, o, g);
        B(0.05, h, 0.05, M.trim, 0, 0, o, g); B(w, 0.05, 0.05, M.trim, 0, 0.05, o, g);
      }
      B(w + 0.3, 0.06, 0.22, M.trim, 0, -h / 2 - 0.05, T / 2 + 0.08, g);
      if (shutters) for (const s of [-1, 1]) B(w * 0.42, h + 0.05, 0.04, M.shutter, s * (w / 2 + w * 0.23), 0, T / 2 + 0.05, g);
      if (shutters) { // virágláda
        B(w + 0.1, 0.2, 0.22, M.wood, 0, -h / 2 - 0.2, T / 2 + 0.16, g);
        for (let k = 0; k < 7; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 4), [lam('#e0475a'), lam('#f2c84b'), lam('#ffffff')][k % 3]); f.position.set(-w / 2 + 0.12 + k * (w - 0.24) / 6, -h / 2 - 0.06, T / 2 + 0.16); g.add(f); }
      }
    };
    win(-HX - T / 2, 1.9, -1, 0); win(-HX - T / 2, -2.8, -1, 0);
    win(3.1, ez, 0, 1, 1.4); win(-4.1, ez, 0, 1, 1.2);
    win(HX + T / 2, 1.6, 1, 0, 1.1); win(HX + T / 2, -2.4, 1, 0, 0.7, 0.7, 1.45, false);
    win(-2.6, -ez, 0, -1, 1.3); win(-0.1, -ez, 0, -1, 0.9);

    // ---------- tető, kémény ----------
    const half = HZ + T + 0.55, rise = 2.4, len = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    for (const s of [-1, 1]) { const r = B(2 * HX + 2 * T + 1.0, 0.16, len, M.roof, 0, FLOOR + WH + rise / 2 - 0.05, s * half / 2, roof); r.rotation.x = s * ang; }
    B(2 * HX + 2 * T + 1.05, 0.2, 0.26, lam('#6f2f22'), 0, FLOOR + WH + rise + 0.03, 0, roof);
    const tri = new THREE.Shape(); tri.moveTo(-HZ - T, 0); tri.lineTo(HZ + T, 0); tri.lineTo(0, rise * (HZ + T) / half); tri.closePath();
    for (const s of [-1, 1]) { const tg = new THREE.ExtrudeGeometry(tri, { depth: T, bevelEnabled: false }); tg.rotateY(Math.PI / 2); const m = new THREE.Mesh(tg, M.wall); m.position.set(s * ex - T / 2, FLOOR + WH - 0.01, 0); m.castShadow = true; roof.add(m); }
    B(0.7, 2.2, 0.7, M.stone, 3.6, FLOOR + WH + 1.6, -1.6, roof); B(0.82, 0.12, 0.82, M.dark, 3.6, FLOOR + WH + 2.72, -1.6, roof);
    // tornác előtetővel
    const PZ0 = ez + T / 2, PD = 1.6, PX = [-2.4, 0.7];
    B(PX[1] - PX[0], FLOOR, PD, M.wood, (PX[0] + PX[1]) / 2, FLOOR / 2, PZ0 + PD / 2, ext);
    B(PX[1] - PX[0] - 0.6, 0.12, 0.35, M.wood, (PX[0] + PX[1]) / 2 - 0.0, 0.06, PZ0 + PD + 0.17, ext);
    for (const xx of [PX[0] + 0.1, PX[1] - 0.1]) { B(0.12, 2.35, 0.12, M.wood, xx, FLOOR + 1.17, PZ0 + PD - 0.12, roof); }
    { const pr = B(PX[1] - PX[0] + 0.5, 0.1, PD + 0.4, M.roof, (PX[0] + PX[1]) / 2, FLOOR + 2.45, PZ0 + PD / 2, roof); pr.rotation.x = 0.16; }
    // lámpa az ajtó mellett
    B(0.14, 0.22, 0.14, M.lamp, DOOR[1] + 0.35, FLOOR + 2.0, ez + T / 2 + 0.1, wallItems);
    this.doorOut = new THREE.Vector3((DOOR[0] + DOOR[1]) / 2, 0, PZ0 + PD + 0.8); // ház-lokális, kint
    this.doorIn = new THREE.Vector3((DOOR[0] + DOOR[1]) / 2, FLOOR, ez - 0.75);

    // ---------- bútorok ----------
    const F = (w, h, d, m, px, py, pz, coll = true, parent = inner) => { const b = B(w, h, d, m, px, FLOOR + py, pz, parent); if (coll) solid(px - w / 2, pz - d / 2, px + w / 2, pz + d / 2, FLOOR + py + h / 2); return b; };
    const cyl = (r, h, m, px, py, pz, seg = 14, parent = inner) => { const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, Math.min(seg, 8)), m); c.position.set(px, FLOOR + py, pz); c.castShadow = true; c.receiveShadow = true; parent.add(c); return c; };
    // NAPPALI — kanapé a válaszfalnak háttal, szemben a TV
    const sx0 = -3.9, sz0 = ZC + IT / 2 + 0.46;
    F(2.3, 0.42, 0.92, M.sofa, sx0, 0.21, sz0); F(2.3, 0.5, 0.22, M.sofa, sx0, 0.66, sz0 - 0.35, false); for (const s of [-1, 1]) F(0.22, 0.62, 0.92, M.sofa, sx0 + s * 1.04, 0.31, sz0, false);
    for (const s of [-1, 0, 1]) F(0.66, 0.12, 0.66, M.sofa, sx0 + s * 0.68, 0.47, sz0 + 0.08, false);
    for (const s of [-1, 1]) { const c = F(0.42, 0.4, 0.14, M.cushion, sx0 + s * 0.65, 0.68, sz0 - 0.2, false); c.rotation.x = -0.2; }
    this.spots.sofa = { x: sx0 + 0.3, z: sz0 + 0.05, yaw: 0, kind: 'sit', y: 0.53, label: '🛋️ Leülök a kanapéra' };
    F(1.6, 0.02, 2.2, M.rug, sx0, 0.01, 1.4, false);
    F(1.0, 0.06, 0.55, M.wood, sx0, 0.42, 1.25, true); for (const a of [-1, 1]) for (const b of [-1, 1]) F(0.06, 0.4, 0.06, M.dark, sx0 + a * 0.44, 0.2, 1.25 + b * 0.22, false);
    cyl(0.1, 0.12, M.white, sx0 + 0.2, 0.51, 1.25, 10); // bögre
    F(1.7, 0.5, 0.42, M.wood, sx0, 0.25, HZ - 0.24); // TV-szekrény
    F(1.3, 0.78, 0.06, M.black, sx0, 0.92, HZ - 0.24, false); F(0.3, 0.05, 0.2, M.black, sx0, 0.52, HZ - 0.24, false);
    const tvTex = canvasTexture(256, 160, (c, W, H) => { const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#79b4e8'); g.addColorStop(0.62, '#cfe6f5'); g.addColorStop(0.62, '#6aa84f'); g.addColorStop(1, '#3f7e34'); c.fillStyle = g; c.fillRect(0, 0, W, H);
      c.fillStyle = '#5b3a22'; c.beginPath(); c.ellipse(130, 92, 40, 16, 0, 0, 7); c.fill(); c.fillRect(100, 96, 7, 30); c.fillRect(150, 96, 7, 30); c.fillRect(118, 98, 7, 28); c.fillRect(140, 98, 7, 28);
      c.beginPath(); c.moveTo(160, 86); c.lineTo(188, 56); c.lineTo(200, 62); c.lineTo(176, 96); c.fill(); c.beginPath(); c.ellipse(198, 62, 13, 8, -0.5, 0, 7); c.fill();
      c.fillStyle = '#e8402a'; c.fillRect(60, 100, 6, 30); c.fillRect(210, 100, 6, 30); c.fillStyle = '#fff'; for (let i = 0; i < 4; i++) c.fillRect(66, 104 + i * 7, 144, 3); });
    this.tvOn = new THREE.MeshBasicMaterial({ map: tvTex });
    this.tv = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.7), M.tv); this.tv.position.set(sx0, FLOOR + 0.92, HZ - 0.28); this.tv.rotation.y = Math.PI; dyn.add(this.tv);
    // könyvespolc, állólámpa, növény
    F(0.36, 1.9, 1.1, M.wood, -HX + 0.2, 0.95, 3.4);
    for (let sh = 0; sh < 4; sh++) { F(0.3, 0.03, 1.0, M.dark, -HX + 0.22, 0.35 + sh * 0.45, 3.4, false); for (let k = 0; k < 7; k++) F(0.2, 0.26 + rnd() * 0.08, 0.09, M.book[(k + sh) % 5], -HX + 0.24, 0.5 + sh * 0.45, 3.0 + k * 0.12, false); }
    cyl(0.16, 0.03, M.dark, -HX + 0.35, 0.02, ZC + 0.4); cyl(0.025, 1.55, M.dark, -HX + 0.35, 0.8, ZC + 0.4, 6);
    { const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.3, 8, 1, true), M.lamp); sh.position.set(-HX + 0.35, FLOOR + 1.6, ZC + 0.4); inner.add(sh); }
    solid(-HX, ZC, -HX + 0.55, ZC + 0.6, 2.0);
    const plant = (px, pz, s = 1) => { cyl(0.18 * s, 0.35 * s, M.pot, px, 0.17 * s, pz, 10); for (let k = 0; k < 6; k++) { const l = new THREE.Mesh(new THREE.IcosahedronGeometry(0.2 * s, 0), M.plant); l.position.set(px + Math.cos(k) * 0.13 * s, FLOOR + (0.5 + (k % 3) * 0.14) * s, pz + Math.sin(k * 1.7) * 0.13 * s); l.scale.y = 1.4; inner.add(l); } solid(px - 0.2 * s, pz - 0.2 * s, px + 0.2 * s, pz + 0.2 * s); };
    plant(-HX + 0.35, HZ - 0.35); plant(0.25, HZ - 0.3, 0.8);
    // KONYHA — pult a keleti falon, tűzhely, mosogató, hűtő, étkezőasztal
    const kx = HX - 0.32;
    F(0.62, 0.88, 3.6, M.cab, kx, 0.44, 1.05); F(0.68, 0.05, 3.66, M.counter, kx, 0.9, 1.05, false);
    for (let k = 0; k < 6; k++) F(0.02, 0.7, 0.55, M.trim, kx - 0.32, 0.42, -0.45 + k * 0.6, false);
    F(0.5, 0.03, 0.62, M.black, kx, 0.93, 1.9, false); for (const a of [-1, 1]) for (const b of [-1, 1]) cyl(0.09, 0.01, M.steel, kx + a * 0.12, 0.95, 1.9 + b * 0.15, 12);
    F(0.45, 0.04, 0.6, M.steel, kx, 0.92, 0.5, false); cyl(0.02, 0.3, M.steel, kx + 0.2, 1.05, 0.5, 6);
    F(0.7, 1.85, 0.72, M.white, kx - 0.05, 0.93, 3.45); F(0.03, 0.5, 0.04, M.steel, kx - 0.41, 1.25, 3.2, false); F(0.03, 0.3, 0.04, M.steel, kx - 0.41, 0.6, 3.2, false);
    F(0.4, 0.75, 3.0, M.cab, HX - 0.2, 1.85, 0.75, false, wallItems); // felső szekrény
    this.spots.fridge = { x: kx - 0.95, z: 3.45, yaw: Math.PI / 2, kind: 'stand', label: '🍎 Hűtő' };
    const tx = 2.6, tz = 2.2;
    F(1.5, 0.05, 0.95, M.wood, tx, 0.76, tz); for (const a of [-1, 1]) for (const b of [-1, 1]) F(0.07, 0.74, 0.07, M.dark, tx + a * 0.66, 0.37, tz + b * 0.4, false);
    solid(tx - 0.75, tz - 0.48, tx + 0.75, tz + 0.48);
    const chair = (px, pz, ry) => { const g = new THREE.Group(); g.position.set(px, FLOOR, pz); g.rotation.y = ry; inner.add(g); B(0.44, 0.05, 0.42, M.wood, 0, 0.46, 0, g); B(0.44, 0.5, 0.05, M.wood, 0, 0.73, -0.19, g); for (const a of [-1, 1]) for (const b of [-1, 1]) B(0.04, 0.46, 0.04, M.dark, a * 0.18, 0.23, b * 0.17, g); solid(px - 0.25, pz - 0.25, px + 0.25, pz + 0.25); };
    chair(tx - 0.4, tz - 0.7, 0); chair(tx + 0.4, tz - 0.7, 0); chair(tx - 0.4, tz + 0.7, Math.PI); chair(tx + 0.4, tz + 0.7, Math.PI);
    cyl(0.2, 0.06, M.white, tx, 0.82, tz, 16); for (let k = 0; k < 4; k++) { const a = new THREE.Mesh(new THREE.IcosahedronGeometry(0.055, 0), lam(k % 2 ? '#c8261f' : '#7cb342')); a.position.set(tx + Math.cos(k * 1.6) * 0.08, FLOOR + 0.89, tz + Math.sin(k * 1.6) * 0.08); inner.add(a); }
    F(1.0, 0.02, 1.6, M.rug2, 2.6, 0.01, 2.2, false);
    // FÜRDŐSZOBA — kád, WC, mosdó
    const bx0 = 4.6, bz0 = -HZ + 0.42;
    F(1.9, 0.56, 0.84, M.white, bx0, 0.28, bz0); F(1.66, 0.02, 0.6, M.water, bx0, 0.5, bz0, false);
    cyl(0.03, 0.3, M.steel, bx0 + 0.8, 0.7, bz0 - 0.32, 6);
    this.spots.tub = { x: bx0 + 0.25, z: bz0 + 0.02, yaw: -Math.PI / 2, kind: 'bath', y: 0.18, label: '🛁 Fürdés' };
    { const g = new THREE.Group(); g.position.set(2.0, FLOOR, -HZ + 0.4); inner.add(g); B(0.4, 0.42, 0.5, M.white, 0, 0.21, 0.05, g); B(0.44, 0.06, 0.52, M.white, 0, 0.44, 0.05, g); B(0.44, 0.5, 0.18, M.white, 0, 0.62, -0.2, g); solid(1.78, -HZ, 2.22, -HZ + 0.72); }
    F(0.5, 0.82, 0.7, M.white, HX - 0.27, 0.41, -2.2); cyl(0.17, 0.04, M.steel, HX - 0.27, 0.84, -2.2, 14);
    F(0.04, 0.8, 0.6, lam('#cfe6f2', { emissive: '#203040' }), HX - 0.03, 1.55, -2.2, false, wallItems);
    F(0.9, 0.02, 0.6, M.rug2, 3.4, 0.01, -2.7, false);
    { const tw = F(0.05, 0.6, 0.45, lam('#f08aa4'), XB + 0.09, 1.1, -2.0, false, wallItems); }
    // HÁLÓSZOBA — franciaágy, éjjeliszekrények, szekrény, íróasztal
    const bdx = -3.0, bdz = -HZ + 1.12;
    F(1.7, 0.36, 2.2, M.wood, bdx, 0.18, bdz); F(1.62, 0.18, 2.1, M.bed, bdx, 0.45, bdz, false);
    F(1.7, 1.05, 0.08, M.wood, bdx, 0.52, -HZ + 0.06, false);
    for (const s of [-1, 1]) { const p = F(0.66, 0.14, 0.4, M.pillow, bdx + s * 0.4, 0.6, -HZ + 0.36, false); p.rotation.x = -0.25; }
    F(1.66, 0.1, 1.45, M.duvet, bdx, 0.58, bdz + 0.34, false); F(1.7, 0.4, 0.04, M.duvet, bdx, 0.4, bdz + 1.07, false);
    this.spots.bed = { x: bdx + 0.35, z: bdz + 0.05, yaw: 0, kind: 'lie', y: 0.76, label: '🛏️ Lefekszem' };
    for (const s of [-1, 1]) { F(0.45, 0.5, 0.4, M.wood, bdx + s * 1.15, 0.25, -HZ + 0.25); cyl(0.07, 0.2, M.dark, bdx + s * 1.15, 0.6, -HZ + 0.25, 8); const sh = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.15, 0.18, 7, 1, true), M.lamp); sh.position.set(bdx + s * 1.15, FLOOR + 0.78, -HZ + 0.25); inner.add(sh); }
    F(0.62, 2.1, 1.5, M.wood, -HX + 0.32, 1.05, -1.65); F(0.02, 1.9, 0.02, M.dark, -HX + 0.64, 1.05, -1.65, false);
    F(1.2, 0.05, 0.55, M.wood, 0.4, 0.75, -HZ + 0.3); for (const a of [-1, 1]) F(0.05, 0.73, 0.5, M.wood, 0.4 + a * 0.55, 0.37, -HZ + 0.3, false);
    chair(0.4, -HZ + 0.85, Math.PI);
    F(1.6, 0.02, 1.0, M.rug2, bdx, 0.01, bdz + 1.65, false);
    plant(1.05, -1.0, 0.85);
    // lovas poszter a hálóban és kép a nappaliban
    const poster = (px, py, pz, ry, w, h, draw) => { const t = canvasTexture(256, Math.round(256 * h / w), draw); t.userData.keep = true; const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshLambertMaterial({ map: t })); m.position.set(px, FLOOR + py, pz); m.rotation.y = ry; wallItems.add(m); };
    const horsePic = (bg) => (c, W, H) => { c.fillStyle = bg; c.fillRect(0, 0, W, H); c.fillStyle = '#fff8'; c.beginPath(); c.arc(W * 0.75, H * 0.25, 22, 0, 7); c.fill(); c.fillStyle = '#4d2815'; c.beginPath(); c.ellipse(W * 0.45, H * 0.6, W * 0.22, H * 0.11, 0, 0, 7); c.fill(); c.lineWidth = 9; c.strokeStyle = '#4d2815'; for (const [a, b] of [[0.3, 0.27], [0.36, 0.4], [0.55, 0.5], [0.62, 0.66]]) { c.beginPath(); c.moveTo(W * a, H * 0.66); c.lineTo(W * b, H * 0.9); c.stroke(); } c.beginPath(); c.moveTo(W * 0.62, H * 0.56); c.lineTo(W * 0.76, H * 0.32); c.lineWidth = 18; c.stroke(); c.beginPath(); c.ellipse(W * 0.8, H * 0.33, 22, 12, -0.5, 0, 7); c.fill(); c.fillStyle = '#1b1612'; c.fillRect(W * 0.2, H * 0.55, 18, 40); c.lineWidth = 10; c.strokeStyle = '#6b4a2e'; c.strokeRect(5, 5, W - 10, H - 10); };
    poster(bdx, 1.75, -HZ + 0.01, 0, 1.1, 0.75, horsePic('#f6c7a0'));
    poster(-HX + 0.01, 1.7, 1.2, Math.PI / 2, 1.0, 0.7, horsePic('#a9d3ee'));

    // ---------- fények ----------
    this.light = new THREE.PointLight('#ffd9a0', 0, 13, 1.6); this.light.position.set(-1.0, FLOOR + 2.4, 0.4); this.root.add(this.light);

    // mennyezet (bentről látszik)
    this.ceilMat = new THREE.MeshLambertMaterial({ color: '#f6f1e8', emissive: '#a39d92', emissiveIntensity: 0.8 });
    { const c = new THREE.Mesh(new THREE.PlaneGeometry(2 * HX + 0.1, 2 * HZ + 0.1), this.ceilMat); c.rotation.x = Math.PI / 2; c.position.set(0, FLOOR + WH - 0.02, 0); c.receiveShadow = true; this.root.add(c); this.ceiling = c;
      for (const [cx, cz] of [[-2.6, 2.1], [3.2, 2.1], [-2.4, -2.6], [3.6, -2.6]]) { const l = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.26, 0.06, 8), M.lamp); l.position.set(cx, FLOOR + WH - 0.06, cz); this.root.add(l); } }
    mergeStatic(ext); mergeStatic(walls); mergeStatic(wallItems); mergeStatic(roof); mergeStatic(inner);
    // ütközők a világban: falak és bútorok (be lehet sétálni az ajtón); a ló nem fér be
    for (const [x0, z0, x1, z1, h] of this.boxes) world.addBox(x + (x0 + x1) / 2, z + (z0 + z1) / 2, (x1 - x0) / 2, (z1 - z0) / 2, 0, h);
    world.addBox(x + (DOOR[0] + DOOR[1]) / 2, z + ez + 0.5, 0.75, 0.45, 0, 99).only = 'horse';
    for (const xx of [PX[0] + 0.1, PX[1] - 0.1]) world.addCircle(x + xx, z + PZ0 + PD - 0.12, 0.12, 99);
    this.porch = { x0: PX[0], x1: PX[1], z0: PZ0 - 0.1, z1: PZ0 + PD };
  }

  // világ ↔ ház-lokális (a ház nincs elforgatva)
  toLocal(x, z) { return { x: x - this.P.x, z: z - this.P.z }; }
  toWorld(lx, lz) { return { x: lx + this.P.x, z: lz + this.P.z }; }
  floorY() { return FLOOR; }

  setInside(on) {
    if (this.inside === on) return; this.inside = on;
    // bent a falak és a tető nem vetnek árnyékot, így a szobák világosak maradnak
    for (const g of [this.walls, this.roofG]) g.traverse((o) => { if (o.isMesh) { if (o.userData.cs === undefined) o.userData.cs = o.castShadow; o.castShadow = on ? false : o.userData.cs; } });
  }
  setTV(on) { this.tv.material = on ? this.tvOn : this.M.tv; }
  contains(x, z) { const l = this.toLocal(x, z); return Math.abs(l.x) < HX + 0.02 && Math.abs(l.z) < HZ + 0.02; }
  onFloor(x, z) { const l = this.toLocal(x, z); return (Math.abs(l.x) < HX + T + 0.15 && Math.abs(l.z) < HZ + T + 0.15) || (l.x > this.porch.x0 && l.x < this.porch.x1 && l.z > this.porch.z0 && l.z < this.porch.z1); }
  nearDoorOutside(x, z) { const l = this.toLocal(x, z); return Math.abs(l.x - this.doorOut.x) < 1.0 && l.z > HZ + T && l.z < HZ + T + 3.0; }
  ceilingY() { return FLOOR + WH; }
  nearSpot(x, z, rad = 1.25) {
    const l = this.toLocal(x, z); let best = null, bd = rad;
    for (const k in this.spots) { const s = this.spots[k]; const d = Math.hypot(l.x - s.x, l.z - s.z); if (d < bd) { bd = d; best = { key: k, ...s }; } }
    return best;
  }
}
