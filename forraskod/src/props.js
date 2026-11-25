import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from './geom.js';
import { mulberry32, clamp, smoothstep } from './noise.js';
import { STABLE, TIE, ARENA, YARD, WATER, HOME, HALF, REG, LAKE, WATERFALL_T, inRect } from './world.js';

const lam = (c, o = {}) => new THREE.MeshLambertMaterial({ color: c, ...o });
const box = (w, h, d, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; return m; };

if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h) { this.rect(x, y, w, h); };
function textTex(text, { w = 256, h = 64, bg = '#ffffff', fg = '#2b2b2b', font = 'bold 40px system-ui', border = null, round = 10 } = {}) {
  return canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg; ctx.beginPath(); ctx.roundRect(2, 2, w - 4, h - 4, round); ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 6; ctx.stroke(); }
    ctx.fillStyle = fg; ctx.font = font; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, w / 2, h / 2 + 2);
  });
}

function stripeTex(a, b, n = 6) {
  const t = canvasTexture(128, 8, (ctx, w, h) => { for (let i = 0; i < n; i++) { ctx.fillStyle = i % 2 ? b : a; ctx.fillRect(i * w / n, 0, w / n + 1, h); } });
  return t;
}

// statikus hálók összevonása anyagonként (kevesebb rajzhívás telefonon)
export function mergeStatic(group) {
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const byMat = new Map(); const victims = [];
  group.traverse((o) => {
    if (!o.isMesh || o.isInstancedMesh || o.userData.dynamic || Array.isArray(o.material)) return;
    let a = byMat.get(o.material); if (!a) { a = []; byMat.set(o.material, a); } a.push(o); victims.push(o);
  });
  for (const [mat, list] of byMat) {
    if (list.length < 2) { const i = victims.indexOf(list[0]); victims.splice(i, 1); continue; }
    const geos = list.map((m) => {
      let g = m.geometry.clone(); g.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv, m.matrixWorld));
      if (g.index) g = g.toNonIndexed();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
      if (!mat.map && g.attributes.uv) g.deleteAttribute('uv');
      if (mat.map && !g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      if (!mat.vertexColors && g.attributes.color) g.deleteAttribute('color');
      g.morphAttributes = {};
      return g;
    });
    const merged = mergeGeometries(geos); if (!merged) continue;
    const mesh = new THREE.Mesh(merged, mat);
    mesh.castShadow = list.some((m) => m.castShadow); mesh.receiveShadow = true;
    group.add(mesh);
  }
  for (const v of victims) v.parent.remove(v);
}

export function buildProps(world, scene) {
  const P = { obstacles: [], course: [], gates: [], group: new THREE.Group() };
  scene.add(P.group);
  const G = P.group;
  const rnd = mulberry32(404);

  // ---------- istálló ----------
  {
    const { x: sx, z: sz, w, d } = STABLE, front = sz + d / 2, wh = 3.7;
    const wallM = lam('#efe4cf'), woodM = lam('#5e3c24'), darkM = lam('#2a2018', { side: THREE.BackSide });
    const st = new THREE.Group(); G.add(st);
    st.add(box(w, wh, 0.3, wallM, sx, wh / 2, sz - d / 2 + 0.15));
    st.add(box(0.3, wh, d, wallM, sx - w / 2 + 0.15, wh / 2, sz));
    st.add(box(0.3, wh, d, wallM, sx + w / 2 - 0.15, wh / 2, sz));
    const fw = (w - 3.4) / 2;
    st.add(box(fw, wh, 0.3, wallM, sx - 1.7 - fw / 2, wh / 2, front - 0.15));
    st.add(box(fw, wh, 0.3, wallM, sx + 1.7 + fw / 2, wh / 2, front - 0.15));
    st.add(box(3.4, wh - 3.0, 0.3, wallM, sx, 3.0 + (wh - 3.0) / 2, front - 0.15));
    const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 0.62, wh - 0.02, d - 0.62), darkM); inner.position.set(sx, wh / 2, sz); st.add(inner);
    // belső boksz-sejtetés
    for (const ox of [-3.2, 3.2]) st.add(box(0.12, 1.4, 3.5, lam('#6e4a2c'), sx + ox, 0.7, sz + 0.5));
    // sötét lábazat
    const baseM = lam('#8c8475');
    st.add(box(w + 0.06, 0.55, 0.32, baseM, sx, 0.27, sz - d / 2 + 0.15));
    st.add(box(0.32, 0.55, d + 0.06, baseM, sx - w / 2 + 0.15, 0.27, sz));
    st.add(box(0.32, 0.55, d + 0.06, baseM, sx + w / 2 - 0.15, 0.27, sz));
    st.add(box(fw + 0.03, 0.55, 0.32, baseM, sx - 1.7 - fw / 2, 0.27, front - 0.15));
    st.add(box(fw + 0.03, 0.55, 0.32, baseM, sx + 1.7 + fw / 2, 0.27, front - 0.15));
    // gerendák
    for (const [cx, cz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) st.add(box(0.36, wh, 0.36, woodM, sx + cx * (w / 2 - 0.1), wh / 2, sz + cz * (d / 2 - 0.1)));
    st.add(box(0.3, 3.0, 0.42, woodM, sx - 1.85, 1.5, front)); st.add(box(0.3, 3.0, 0.42, woodM, sx + 1.85, 1.5, front));
    st.add(box(4.0, 0.34, 0.42, woodM, sx, 3.15, front));
    // tolóajtók X-merevítéssel
    const doorM = lam('#7b3426'), trimM = lam('#f4efe6');
    for (const s of [-1, 1]) {
      const dg = new THREE.Group(); dg.position.set(sx + s * 2.75, 1.45, front + 0.14); st.add(dg);
      dg.add(box(1.75, 2.9, 0.1, doorM));
      const diag = Math.atan2(2.6, 1.5);
      for (const r of [diag, -diag]) { const b = box(3.0, 0.12, 0.04, trimM, 0, 0, 0.06); b.rotation.z = r; dg.add(b); }
      dg.add(box(1.75, 0.12, 0.04, trimM, 0, 1.39, 0.06)); dg.add(box(1.75, 0.12, 0.04, trimM, 0, -1.39, 0.06));
      dg.add(box(0.12, 2.9, 0.04, trimM, 0.82, 0, 0.06)); dg.add(box(0.12, 2.9, 0.04, trimM, -0.82, 0, 0.06));
    }
    // ablakok
    const glassM = lam('#2c3a42'), frameM = lam('#f7f3ea');
    for (const s of [-1, 1]) for (const oz of [-2.2, 2.2]) {
      const x = sx + s * (w / 2 + 0.01);
      st.add(box(0.06, 0.9, 1.2, glassM, x, 2.1, sz + oz));
      st.add(box(0.1, 1.06, 0.1, frameM, x, 2.1, sz + oz - 0.6)); st.add(box(0.1, 1.06, 0.1, frameM, x, 2.1, sz + oz + 0.6));
      st.add(box(0.1, 0.1, 1.3, frameM, x, 2.6, sz + oz)); st.add(box(0.1, 0.1, 1.3, frameM, x, 1.6, sz + oz));
      st.add(box(0.1, 0.06, 1.2, frameM, x, 2.1, sz + oz));
    }
    for (const s of [-1, 1]) {
      const x = sx + s * 4.3;
      st.add(box(1.0, 0.8, 0.06, glassM, x, 2.2, front + 0.01));
      st.add(box(1.14, 0.1, 0.1, frameM, x, 2.62, front + 0.02)); st.add(box(1.14, 0.1, 0.1, frameM, x, 1.78, front + 0.02));
      st.add(box(0.1, 0.9, 0.1, frameM, x - 0.55, 2.2, front + 0.02)); st.add(box(0.1, 0.9, 0.1, frameM, x + 0.55, 2.2, front + 0.02));
      st.add(box(0.06, 0.8, 0.04, frameM, x, 2.2, front + 0.04));
    }
    // tető
    const roofTex = canvasTexture(128, 128, (ctx, W, H) => {
      ctx.fillStyle = '#9a4532'; ctx.fillRect(0, 0, W, H);
      for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
        const o = (r % 2) * 8; ctx.fillStyle = `hsl(${10 + rnd() * 8},${45 + rnd() * 10}%,${33 + rnd() * 10}%)`;
        ctx.fillRect(c * 16 + o - 8, r * 16, 15, 14);
        ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fillRect(c * 16 + o - 8, r * 16 + 12, 15, 3);
      }
    });
    roofTex.wrapS = roofTex.wrapT = THREE.RepeatWrapping; roofTex.repeat.set(5, 2.5);
    const roofM = lam('#ffffff', { map: roofTex });
    const half = d / 2 + 0.6, rise = 2.4, len = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    for (const s of [-1, 1]) {
      const r = box(w + 1.0, 0.16, len, roofM, sx, wh - 0.28 + rise / 2, sz + s * half / 2);
      r.rotation.x = s * ang; st.add(r);
    }
    st.add(box(w + 1.05, 0.2, 0.26, lam('#6f2f22'), sx, wh - 0.28 + rise + 0.05, sz));
    const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rise * (d / 2) / half + 0.05); tri.closePath();
    for (const s of [-1, 1]) {
      const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.3, bevelEnabled: false }); tg.rotateY(Math.PI / 2);
      const m = new THREE.Mesh(tg, wallM); m.position.set(sx + s * (w / 2 - 0.15) - 0.15, wh - 0.02, sz); m.castShadow = true; st.add(m);
    }
    // tábla
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), new THREE.MeshLambertMaterial({ map: textTex('ISTÁLLÓ', { bg: '#5e3c24', fg: '#f6e7c8', font: 'bold 46px ui-rounded, system-ui' }) }));
    sign.position.set(sx, 3.55, front + 0.23); st.add(sign);
    world.addBox(sx, sz, w / 2 + 0.1, d / 2 + 0.1, 0, 99);
    // udvar
    const gravel = canvasTexture(128, 128, (ctx, W, H) => {
      ctx.fillStyle = '#a69882'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 1400; i++) { const v = 120 + rnd() * 110; ctx.fillStyle = `rgb(${v},${v * 0.93},${v * 0.82})`; ctx.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 2.5, 1 + rnd() * 2); }
    });
    gravel.wrapS = gravel.wrapT = THREE.RepeatWrapping; gravel.repeat.set((YARD.x1 - YARD.x0) / 3, (YARD.z1 - YARD.z0) / 3);
    const yard = new THREE.Mesh(new THREE.PlaneGeometry(YARD.x1 - YARD.x0, YARD.z1 - YARD.z0), lam('#ffffff', { map: gravel }));
    yard.rotation.x = -Math.PI / 2; yard.position.set((YARD.x0 + YARD.x1) / 2, 0.035, (YARD.z0 + YARD.z1) / 2); yard.receiveShadow = true; G.add(yard);
    // kikötőoszlop (a ló feje mögött, hogy ne takarja a kamerát)
    const px = TIE.x + 2.1, pz = TIE.z - 1.1;
    st.add(box(0.18, 1.4, 0.18, woodM, px, 0.7, pz));
    { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 6, 12), new THREE.MeshStandardMaterial({ color: '#9a9ea5', metalness: 0.7, roughness: 0.3 })); ring.position.set(px, 1.15, pz + 0.1); st.add(ring); }
    world.addCircle(px, pz, 0.2, 99);
    P.tiePost = new THREE.Vector3(px, 1.15, pz + 0.1);
    // itató
    const tx = TIE.x + 1.0, tz = TIE.z + 4.2;
    st.add(box(2.2, 0.62, 0.8, lam('#7a7f86'), tx, 0.31, tz));
    const tw = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 0.6), lam('#3d7a8f', { emissive: '#0d2a35' })); tw.rotation.x = -Math.PI / 2; tw.position.set(tx, 0.58, tz); st.add(tw);
    world.addBox(tx, tz, 1.1, 0.4, 0, 99);
    P.trough = new THREE.Vector3(tx, 0, tz);
    // nyeregláda
    st.add(box(1.1, 0.55, 0.6, lam('#2f558f'), sx + 4.4, 0.28, front + 0.7));
    st.add(box(1.14, 0.08, 0.64, lam('#d9b25a'), sx + 4.4, 0.58, front + 0.7));
    world.addBox(sx + 4.4, front + 0.7, 0.55, 0.3, 0, 99);
    // szalmabálák
    const hayTex = canvasTexture(64, 64, (ctx, W, H) => {
      ctx.fillStyle = '#d6b35c'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 260; i++) { ctx.strokeStyle = `rgba(${rnd() < 0.5 ? '120,90,30' : '255,235,160'},0.45)`; ctx.beginPath(); const x = rnd() * W, y = rnd() * H; ctx.moveTo(x, y); ctx.lineTo(x + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 4); ctx.stroke(); }
      ctx.fillStyle = 'rgba(90,60,20,0.6)'; ctx.fillRect(W * 0.3, 0, 2, H); ctx.fillRect(W * 0.7, 0, 2, H);
    });
    const hayM = lam('#ffffff', { map: hayTex });
    P.hayMat = hayM;
    const bx = sx - w / 2 - 1.6, bz = front - 2;
    [[0, 0.25, 0], [0, 0.25, 0.55], [0, 0.25, -0.55], [0, 0.72, 0.28], [0, 0.72, -0.28], [0, 1.19, 0]].forEach(([x, y, z]) => {
      const b = box(1.05, 0.46, 0.52, hayM, bx + x, y, bz + z); b.rotation.y = 0.02 * (rnd() - 0.5); st.add(b);
    });
    world.addBox(bx, bz, 0.6, 0.9, 0, 99);
    // körbálák a réten
    const rbM = lam('#cfae5c', { map: hayTex });
    for (const [x, z, a] of [[-58, -6, 0.3], [-61, -9.5, 1.1], [70, -32, 0.6], [-30, 48, 2.0]]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16), rbM); c.rotation.z = Math.PI / 2; c.rotation.y = a;
      c.position.set(x, 0.74, z); c.castShadow = true; c.receiveShadow = true; G.add(c); world.addCircle(x, z, 0.85, 1.4);
    }
  }

  // ---------- díjugrató pálya ----------
  const toW = (ax, az) => ({ x: ARENA.x + ax, z: ARENA.z + az });
  {
    const sand = canvasTexture(256, 256, (ctx, W, H) => {
      ctx.fillStyle = '#d5bf92'; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i < 3000; i++) { const v = 170 + rnd() * 70; ctx.fillStyle = `rgba(${v},${v * 0.88},${v * 0.68},0.5)`; ctx.fillRect(rnd() * W, rnd() * H, 1.5, 1.5); }
      ctx.strokeStyle = 'rgba(150,120,80,0.18)'; ctx.lineWidth = 2;
      for (let y = 4; y < H; y += 9) { ctx.beginPath(); ctx.moveTo(0, y); for (let x = 0; x <= W; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.05 + y) * 1.5); ctx.stroke(); }
    });
    sand.wrapS = sand.wrapT = THREE.RepeatWrapping; sand.repeat.set(ARENA.hw / 4, ARENA.hd / 4);
    const pl = new THREE.Mesh(new THREE.PlaneGeometry(ARENA.hw * 2, ARENA.hd * 2), lam('#ffffff', { map: sand }));
    pl.rotation.x = -Math.PI / 2; pl.position.set(ARENA.x, 0.04, ARENA.z); pl.receiveShadow = true; G.add(pl);
    // kerítés
    const postM = lam('#f4f4f0'), railM = lam('#ffffff');
    const fence = (x0, z0, x1, z1) => {
      const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 4));
      const yaw = Math.atan2(x1 - x0, z1 - z0);
      for (let i = 0; i <= n; i++) { const t = i / n; G.add(box(0.14, 1.25, 0.14, postM, x0 + (x1 - x0) * t, 0.62, z0 + (z1 - z0) * t)); }
      for (const y of [0.55, 1.08]) { const r = box(0.07, 0.12, len, railM, (x0 + x1) / 2, y, (z0 + z1) / 2); r.rotation.y = yaw; G.add(r); }
      world.addBox((x0 + x1) / 2, (z0 + z1) / 2, 0.12, len / 2, yaw, 1.15);
    };
    const X0 = ARENA.x - ARENA.hw, X1 = ARENA.x + ARENA.hw, Z0 = ARENA.z - ARENA.hd, Z1 = ARENA.z + ARENA.hd, gap = 4.5;
    fence(X0, Z0, X1, Z0); fence(X0, Z1, X1, Z1);
    fence(X0, Z0, X0, ARENA.z - gap); fence(X0, ARENA.z + gap, X0, Z1);
    fence(X1, Z0, X1, ARENA.z - gap); fence(X1, ARENA.z + gap, X1, Z1);
    // virágládák a kerítésnél
    const fbM = lam('#6b4a2e'); const flM = [lam('#e8508a'), lam('#f7d84a'), lam('#ffffff'), lam('#9b6be0')];
    for (let i = 0; i < 10; i++) {
      const x = X0 + 6 + i * 8, z = Z1 + 0.8;
      G.add(box(1.4, 0.35, 0.45, fbM, x, 0.18, z));
      for (let k = 0; k < 6; k++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 4), flM[(i + k) % 4]); f.position.set(x - 0.55 + k * 0.22, 0.45 + rnd() * 0.08, z + (rnd() - 0.5) * 0.2); G.add(f); }
    }
    // bírói torony
    const jx = ARENA.x, jz = Z1 + 5;
    G.add(box(3.2, 2.6, 2.6, lam('#f1ece2'), jx, 1.3, jz));
    G.add(box(3.6, 0.2, 3.0, lam('#2e5b8f'), jx, 2.7, jz));
    G.add(box(2.6, 0.9, 0.06, lam('#2c3a42'), jx, 1.8, jz - 1.31));
    world.addBox(jx, jz, 1.7, 1.4, 0, 99);
    const banner = new THREE.Mesh(new THREE.PlaneGeometry(6, 0.9), lam('#ffffff', { map: textTex('VÁGTAVÖLGYI LOVASKUPA', { w: 512, h: 76, bg: '#2e5b8f', fg: '#ffffff', font: 'bold 38px ui-rounded, system-ui' }), side: THREE.DoubleSide }));
    banner.position.set(ARENA.x - 20, 1.0, Z1 + 0.25); banner.rotation.y = Math.PI; G.add(banner);
  }

  // ---------- akadályok ----------
  const poleTexCache = {};
  const makeShowJump = (type, h, ca, cb, num) => {
    const g = new THREE.Group(); const poles = [];
    const key = ca + cb; const tex = poleTexCache[key] || (poleTexCache[key] = stripeTex(ca, cb, 8));
    const poleM = lam('#ffffff', { map: tex });
    const wingM = lam('#ffffff'), wingC = lam(ca);
    const W = 3.6, d = type === 'oxer' ? 1.0 : 0.25;
    const zs = type === 'oxer' ? [-0.5, 0.5] : [0];
    for (const s of [-1, 1]) for (const z of zs) {
      g.add(box(0.12, h + 0.45, 0.14, wingM, s * 1.92, (h + 0.45) / 2, z));
      const wg = box(0.08, h + 0.25, 0.75, wingC, s * 2.35, (h + 0.25) / 2, z); g.add(wg);
      g.add(box(0.1, 0.1, 0.8, wingM, s * 2.35, h + 0.25, z));
    }
    const pg = new THREE.CylinderGeometry(0.055, 0.055, W, 10); pg.rotateZ(Math.PI / 2);
    const addPole = (y, z) => { const p = new THREE.Mesh(pg, poleM); p.position.set(0, y, z); p.castShadow = true; p.userData.rest = p.position.clone(); p.userData.dynamic = true; g.add(p); poles.push(p); return p; };
    if (type === 'oxer') { addPole(h - 0.08, -0.5); addPole((h - 0.08) * 0.55, -0.5); addPole(h, 0.5); addPole(h * 0.55, 0.5); }
    else { addPole(h, 0); addPole(h * 0.62, 0); addPole(h * 0.3, 0); }
    // zászlók: jobb oldalt piros, bal oldalt fehér (a lovas szemszögéből)
    for (const [s, c] of [[-1, '#d8312c'], [1, '#ffffff']]) {
      const z0 = zs[0];
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.28), lam(c, { side: THREE.DoubleSide })); f.position.set(s * 1.92 + s * 0.21, h + 0.55, z0); g.add(f);
      g.add(box(0.03, 0.5, 0.03, wingM, s * 1.92, h + 0.5, z0));
    }
    if (num) {
      const nb = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: canvasTexture(128, 128, (ctx) => {
        ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(64, 64, 60, 0, 7); ctx.fill(); ctx.strokeStyle = '#2e5b8f'; ctx.lineWidth = 8; ctx.stroke();
        ctx.fillStyle = '#2e5b8f'; ctx.font = 'bold 80px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(num), 64, 70);
      }), transparent: true }));
      nb.rotation.y = Math.PI; nb.position.set(-2.35, h + 0.62, zs[0] - 0.42); g.add(nb);
    }
    return { g, poles, w: W, d: d + 0.25, h, wings: 2.4 };
  };

  const makeLog = () => {
    const g = new THREE.Group();
    const bark = canvasTexture(128, 64, (ctx, W, H) => { ctx.fillStyle = '#6a4a33'; ctx.fillRect(0, 0, W, H); for (let i = 0; i < 70; i++) { ctx.strokeStyle = `rgba(${rnd() < 0.5 ? '40,25,15' : '140,110,80'},0.5)`; ctx.lineWidth = 1 + rnd() * 2; const y = rnd() * H; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + (rnd() - 0.5) * 6); ctx.stroke(); } });
    const ring = canvasTexture(64, 64, (ctx) => { ctx.fillStyle = '#c9a774'; ctx.fillRect(0, 0, 64, 64); ctx.strokeStyle = 'rgba(120,80,40,0.6)'; for (let r = 4; r < 32; r += 4) { ctx.beginPath(); ctx.arc(32, 32, r, 0, 7); ctx.stroke(); } });
    const r = 0.37, L = 4.4;
    const c = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 1.08, L, 14), [lam('#ffffff', { map: bark }), lam('#ffffff', { map: ring }), lam('#ffffff', { map: ring })]);
    c.rotation.z = Math.PI / 2; c.position.y = r; c.castShadow = true; c.receiveShadow = true; g.add(c);
    return { g, poles: [], w: L, d: r * 2, h: r * 2 };
  };
  const makeHedge = () => {
    const g = new THREE.Group(); const parts = [];
    const b = new THREE.BoxGeometry(4.4, 0.8, 0.95); b.translate(0, 0.4, 0); parts.push(b.toNonIndexed());
    for (let i = 0; i < 9; i++) { const s = new THREE.IcosahedronGeometry(0.45 + rnd() * 0.12, 0); s.scale(1, 0.7, 1); s.translate(-2.0 + i * 0.5, 0.88 + rnd() * 0.06, (rnd() - 0.5) * 0.3); parts.push(s); }
    for (const p of parts) p.deleteAttribute('uv');
    const m = new THREE.Mesh(mergeGeometries(parts), lam('#3f6e2c', { flatShading: true })); m.castShadow = true; m.receiveShadow = true; g.add(m);
    return { g, poles: [], w: 4.4, d: 1.0, h: 1.05 };
  };
  const makeWall = () => {
    const g = new THREE.Group(); const parts = []; const c = new THREE.Color();
    for (let row = 0; row < 3; row++) for (let i = 0; i < 9; i++) {
      const w = 0.42 + rnd() * 0.18, h = 0.26, x = -2.1 + i * 0.5 + (row % 2) * 0.22 + (rnd() - 0.5) * 0.06;
      if (x > 2.15) continue;
      const b = new THREE.BoxGeometry(w, h, 0.7 - row * 0.05); b.translate(x, 0.13 + row * 0.27, (rnd() - 0.5) * 0.04);
      const nb = b.toNonIndexed(); nb.deleteAttribute('uv');
      c.setHSL(0.08, 0.06, 0.42 + rnd() * 0.18);
      const col = new Float32Array(nb.attributes.position.count * 3); for (let k = 0; k < col.length; k += 3) { col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
      nb.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(nb);
    }
    const m = new THREE.Mesh(mergeGeometries(parts), lam('#ffffff', { vertexColors: true, flatShading: true })); m.castShadow = true; m.receiveShadow = true; g.add(m);
    return { g, poles: [], w: 4.4, d: 0.75, h: 0.82 };
  };
  const makeRails = () => {
    const g = new THREE.Group(); const wood = lam('#7a5a3c');
    for (const s of [-1, 1]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.11, 1.3, 8), wood); p.position.set(s * 2.1, 0.65, 0); p.castShadow = true; g.add(p); }
    for (const y of [0.5, 0.95]) { const r = new THREE.Mesh(new THREE.CylinderGeometry(0.085, 0.09, 4.5, 8), wood); r.rotation.z = Math.PI / 2; r.position.set(0, y, 0); r.castShadow = true; g.add(r); }
    return { g, poles: [], w: 4.3, d: 0.3, h: 1.0 };
  };


  // ---------- új akadálytípusok ----------
  const woodM = lam('#8a6440'), darkWood = lam('#5d4027'), redM = lam('#a8402e');
  const stoneTex = canvasTexture(128, 128, (ctx, W, H) => {
    ctx.fillStyle = '#6f6a62'; ctx.fillRect(0, 0, W, H);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 5; c++) {
      const o = (r % 2) * 13; ctx.fillStyle = `hsl(${30 + rnd() * 20},${6 + rnd() * 8}%,${44 + rnd() * 18}%)`;
      ctx.fillRect(c * 26 + o - 13 + 1, r * 16 + 1, 24, 14);
    }
  });
  stoneTex.wrapS = stoneTex.wrapT = THREE.RepeatWrapping;
  const stoneM = lam('#ffffff', { map: stoneTex });
  const makeCoop = () => { // tyúkól (A-alakú)
    const g = new THREE.Group(); const sh = new THREE.Shape(); sh.moveTo(-0.65, 0); sh.lineTo(0.65, 0); sh.lineTo(0, 0.95); sh.closePath();
    const eg = new THREE.ExtrudeGeometry(sh, { depth: 3.8, bevelEnabled: false }); eg.translate(0, 0, -1.9); eg.rotateY(Math.PI / 2);
    const m = new THREE.Mesh(eg, woodM); m.castShadow = true; m.receiveShadow = true; g.add(m);
    for (const x of [-1.6, -0.5, 0.6, 1.7]) g.add(box(0.06, 0.02, 1.2, darkWood, x, 0.5, 0));
    return { g, poles: [], w: 3.8, d: 1.3, h: 0.95 };
  };
  const makeBarrels = () => {
    const g = new THREE.Group(); const bm = lam('#7a4e2c'), ring = lam('#3a3a3a');
    for (const x of [-1.25, 0, 1.25]) {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 1.15, 14), bm); c.rotation.x = Math.PI / 2; c.position.set(x, 0.38, 0); c.castShadow = true; g.add(c);
      for (const z of [-0.4, 0.4]) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.385, 0.02, 4, 16), ring); t.position.set(x, 0.38, z); g.add(t); }
    }
    return { g, poles: [], w: 3.8, d: 1.15, h: 0.78 };
  };
  const makeBales = () => {
    const g = new THREE.Group();
    for (const [x, y] of [[-1.05, 0.25], [0, 0.25], [1.05, 0.25], [-0.52, 0.71], [0.52, 0.71]]) { const b = box(1.0, 0.46, 0.55, P.hayMat, x, y, 0); g.add(b); }
    return { g, poles: [], w: 3.2, d: 0.6, h: 0.94 };
  };
  const makeFarmGate = () => {
    const g = new THREE.Group();
    for (const x of [-2, 2]) g.add(box(0.16, 1.35, 0.16, darkWood, x, 0.67, 0));
    for (const y of [0.3, 0.6, 0.9]) g.add(box(3.9, 0.1, 0.06, woodM, 0, y, 0));
    const d = box(4.3, 0.1, 0.06, woodM, 0, 0.6, 0.01); d.rotation.z = Math.atan2(0.6, 3.9); g.add(d);
    return { g, poles: [], w: 4.1, d: 0.25, h: 0.95 };
  };
  const makeFallenTree = () => {
    const g = new THREE.Group(); const bark = lam('#5f4330');
    const t = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.46, 5.4, 12), bark); t.rotation.z = Math.PI / 2; t.position.y = 0.42; t.castShadow = true; g.add(t);
    for (const [x, a, l] of [[1.6, 0.7, 1.2], [-1.2, -0.9, 1.0], [0.4, 2.2, 0.9]]) { const b = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.1, l, 6), bark); b.position.set(x, 0.6, 0); b.rotation.set(a, 0, 0.5); b.castShadow = true; g.add(b); }
    const root = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.6, 0.3, 10), bark); root.rotation.z = Math.PI / 2; root.position.set(-2.8, 0.55, 0); g.add(root);
    return { g, poles: [], w: 5.0, d: 0.9, h: 0.88 };
  };
  const makeRockWall = () => {
    const g = new THREE.Group(); const parts = []; const c = new THREE.Color();
    for (let i = 0; i < 9; i++) {
      const sgeo = new THREE.DodecahedronGeometry(0.34 + rnd() * 0.12, 0); sgeo.scale(1.1, 0.8 + rnd() * 0.4, 0.9); sgeo.translate(-1.9 + i * 0.47, 0.32 + rnd() * 0.12, (rnd() - 0.5) * 0.2);
      const nb = sgeo.toNonIndexed(); nb.deleteAttribute('uv'); c.setHSL(0.07, 0.12, 0.42 + rnd() * 0.15);
      const col = new Float32Array(nb.attributes.position.count * 3); for (let k = 0; k < col.length; k += 3) { col[k] = c.r; col[k + 1] = c.g; col[k + 2] = c.b; }
      nb.setAttribute('color', new THREE.BufferAttribute(col, 3)); parts.push(nb);
    }
    const m = new THREE.Mesh(mergeGeometries(parts), lam('#ffffff', { vertexColors: true, flatShading: true })); m.castShadow = true; m.receiveShadow = true; g.add(m);
    return { g, poles: [], w: 4.2, d: 0.8, h: 0.8 };
  };
  const numberBoard = (num, color = '#d8312c') => {
    const g = new THREE.Group();
    g.add(box(0.08, 1.5, 0.08, lam('#f4f4f0'), 0, 0.75, 0));
    const nb = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.5), new THREE.MeshBasicMaterial({ map: canvasTexture(128, 128, (ctx) => {
      ctx.fillStyle = color; ctx.beginPath(); ctx.roundRect(4, 4, 120, 120, 18); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.font = 'bold 76px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(num), 64, 70);
    }) }));
    nb.rotation.y = Math.PI; nb.position.set(0, 1.35, -0.05); g.add(nb);
    return g;
  };
  const placeObstacle = (o, x, z, yaw, extra) => {
    const y = world.heightAt(x, z);
    o.g.position.set(x, y, z); o.g.rotation.y = yaw; G.add(o.g);
    const ob = Object.assign({ x, z, y, yaw, f: new THREE.Vector2(Math.sin(yaw), Math.cos(yaw)), a: new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw)), knocked: false, fall: 0 }, o, extra);
    ob.id = P.obstacles.length;
    world.addBox(x, z, o.w / 2, o.d / 2, yaw, o.h, ob);
    if (o.wings) for (const s of [-1, 1]) world.addCircle(x + ob.a.x * s * o.wings, z + ob.a.y * s * o.wings, 0.45, 1.7);
    const hl = world.heightAt(x + ob.a.x * o.w * 0.45, z + ob.a.y * o.w * 0.45), hr = world.heightAt(x - ob.a.x * o.w * 0.45, z - ob.a.y * o.w * 0.45);
    if (!o.show) o.g.position.y = Math.min(hl, hr, y) + 0.02;
    P.obstacles.push(ob); return ob;
  };
  const makeGate = (x, z, yaw, label, color) => {
    const g = new THREE.Group(); g.position.set(x, world.heightAt(x, z), z); g.rotation.y = yaw; G.add(g);
    const pm = lam('#ffffff');
    for (const [s, c] of [[-1, '#d8312c'], [1, '#ffffff']]) {
      g.add(box(0.12, 2.6, 0.12, pm, s * 3, 1.3, 0));
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), lam(c, { side: THREE.DoubleSide })); f.position.set(s * 3 + s * 0.3, 2.35, 0); g.add(f);
    }
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.55), new THREE.MeshLambertMaterial({ map: textTex(label, { bg: color, fg: '#ffffff', font: 'bold 44px ui-rounded, system-ui' }), side: THREE.DoubleSide }));
    b.position.set(0, 2.45, 0); g.add(b);
    g.add(box(6, 0.03, 0.03, lam('#ffffff'), 0, 2.45, 0));
    for (const s of [-1, 1]) world.addCircle(x + Math.cos(yaw) * s * 3, z - Math.sin(yaw) * s * 3, 0.2, 99);
    const gate = { x, z, yaw, f: new THREE.Vector2(Math.sin(yaw), Math.cos(yaw)), a: new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw)), hw: 2.9, g };
    P.gates.push(gate); return gate;
  };

  // ---------- díjugrató pálya (aréna) ----------
  const C = [
    [-20, -13, Math.PI / 2, 'vertical', 0.8, '#d8312c', '#ffffff'],
    [0, -13, Math.PI / 2, 'oxer', 0.9, '#2e6fd8', '#ffffff'],
    [20, -13, Math.PI / 2, 'vertical', 1.0, '#2e9a48', '#ffffff'],
    [33, 0, 0, 'vertical', 0.9, '#f2c230', '#2e5b8f'],
    [12, 13, -Math.PI / 2, 'vertical', 1.0, '#f08a24', '#ffffff'],
    [-6, 13, -Math.PI / 2, 'oxer', 1.0, '#8a4fd0', '#ffffff'],
    [-24, 13, -Math.PI / 2, 'vertical', 1.1, '#d8312c', '#2e5b8f'],
    [-10, 0, Math.PI / 2, 'oxer', 1.1, '#2e9a48', '#f2c230'],
  ];
  const dijJumps = C.map(([ax, az, yaw, type, h, ca, cb], i) => { const w = toW(ax, az); return placeObstacle(makeShowJump(type, h, ca, cb, i + 1), w.x, w.z, yaw, { type, course: 'dij', num: i + 1, show: true }); });
  const sw = toW(-34, -13), fw = toW(16, 0);
  P.courses = [{ key: 'dij', name: 'Díjugratás', jumps: dijJumps, start: makeGate(sw.x, sw.z, Math.PI / 2, 'START', '#2e9a48'), finish: makeGate(fw.x, fw.z, Math.PI / 2, 'CÉL', '#d8312c'),
    inside: (x, z) => world.inArena(x, z, 3), x: ARENA.x, z: ARENA.z }];

  // ---------- terepugrató pálya ----------
  {
    const X = REG.xc, rx = 56, rz = 44;
    const pt = (th) => ({ x: X.x + Math.cos(th) * rx, z: X.z + Math.sin(th) * rz, yaw: Math.atan2(-rx * Math.sin(th), rz * Math.cos(th)) });
    const kinds = [makeLog, makeHedge, makeCoop, makeBales, makeRails, makeBarrels, makeWall, makeFarmGate, makeFallenTree, makeHedge];
    const jumps = kinds.map((mk, i) => {
      const th = (24 + i * 31.5) * Math.PI / 180, q = pt(th); const o = mk();
      const nb = numberBoard(i + 1, '#e0602a'); nb.position.set(-(o.w / 2 + 0.5), 0, 0); o.g.add(nb);
      for (const [s, c] of [[-1, '#d8312c'], [1, '#ffffff']]) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.45, 0.3), lam(c, { side: THREE.DoubleSide })); f.position.set(s * (o.w / 2 + 0.25) + s * 0.22, 1.2, 0); o.g.add(f); o.g.add(box(0.04, 1.3, 0.04, lam('#ffffff'), s * (o.w / 2 + 0.25), 0.65, 0)); }
      return placeObstacle(o, q.x, q.z, q.yaw, { type: 'xc', course: 'terep', num: i + 1, show: false });
    });
    const s0 = pt(4 * Math.PI / 180), f0 = pt(345 * Math.PI / 180);
    P.courses.push({ key: 'terep', name: 'Terepugratás', jumps, start: makeGate(s0.x, s0.z, s0.yaw, 'START', '#2e9a48'), finish: makeGate(f0.x, f0.z, f0.yaw, 'CÉL', '#d8312c'),
      inside: (x, z) => Math.hypot(x - X.x, z - X.z) < X.r + 25, x: X.x, z: X.z });
  }
  P.course = P.courses[0].jumps; P.startGate = P.courses[0].start; P.finishGate = P.courses[0].finish;

  // ---------- terepakadályok az ösvény mentén (tájegységhez illő típus) ----------
  const pts = world.pathPts, N = pts.length;
  const placed = [];
  const near = (x, z, r) => placed.some((q) => Math.hypot(q.x - x, q.z - z) < r);
  let k = 0;
  for (let s = 60; s < N - 40; s += 56) {
    const p = pts[s];
    if (Math.hypot(p.x - HOME.x, p.z - HOME.z) < 100 || world.heightAt(p.x, p.z) < WATER + 0.4 || world.slopeAt(p.x, p.z) > 0.24) continue;
    if (world.creekDist(p.x, p.z) < 9 || Math.hypot(p.x - REG.ruin.x, p.z - REG.ruin.z) < 26 || inRect(p.x, p.z, REG.farmYard, 8) || near(p.x, p.z, 30)) continue;
    const a = pts[(s + 3) % N], b = pts[(s - 3 + N) % N];
    const yaw = Math.atan2(a.x - b.x, a.z - b.z);
    let set;
    if (world.canyonDist(p.x, p.z) < 14) set = [makeRockWall, makeLog, makeFallenTree];
    else if (world.forestAt(p.x, p.z) > 0.35) set = [makeFallenTree, makeLog, makeRails];
    else if (inRect(p.x, p.z, { x0: -20, x1: 260, z0: 220, z1: 380 })) set = [makeBales, makeCoop, makeFarmGate, makeBarrels];
    else if (world.rockyAt(p.x, p.z) > 0.2) set = [makeRockWall, makeWall];
    else set = [makeHedge, makeRails, makeWall, makeLog, makeCoop, makeBarrels];
    const mk = set[k++ % set.length];
    placeObstacle(mk(), p.x, p.z, yaw, { type: 'path', course: null, show: false });
    placed.push({ x: p.x, z: p.z });
  }
  // kidőlt fák az erdőkben, ösvényen kívül
  {
    const r = mulberry32(808); let n = 0, guard = 0;
    while (n < 34 && guard++ < 6000) {
      const x = (r() - 0.5) * 860, z = (r() - 0.5) * 860;
      if (world.forestAt(x, z) < 0.45 || world.pathDist(x, z) < 8 || world.slopeAt(x, z) > 0.2 || world.heightAt(x, z) < WATER + 0.5 || near(x, z, 25)) continue;
      if (world.treeSpots.some((t) => Math.abs(t.x - x) < 4.5 && Math.abs(t.z - z) < 4.5)) continue;
      placeObstacle(makeFallenTree(), x, z, r() * Math.PI, { type: 'wild', course: null, show: false });
      placed.push({ x, z }); n++;
    }
  }

  // ---------- tanya: ház, csűr, kerítések, kút, birkakarám ----------
  const building = (x, z, yaw, { w, d, h, rise, wall = '#f1e9d8', roof = '#a8402e', door = '#7b4a2a' }) => {
    const g = new THREE.Group(); g.position.set(x, world.heightAt(x, z) - 0.05, z); g.rotation.y = yaw; G.add(g);
    g.add(box(w, h, d, lam(wall), 0, h / 2, 0));
    g.add(box(w + 0.08, 0.5, d + 0.08, lam('#8c8475'), 0, 0.25, 0));
    const half = d / 2 + 0.5, len = Math.hypot(half, rise), ang = Math.atan2(rise, half);
    for (const sg of [-1, 1]) { const r = box(w + 0.8, 0.14, len, lam(roof), 0, h + rise / 2 - 0.05, sg * half / 2); r.rotation.x = sg * ang; g.add(r); }
    const tri = new THREE.Shape(); tri.moveTo(-d / 2, 0); tri.lineTo(d / 2, 0); tri.lineTo(0, rise * (d / 2) / half); tri.closePath();
    for (const sg of [-1, 1]) { const tg = new THREE.ExtrudeGeometry(tri, { depth: 0.2, bevelEnabled: false }); tg.rotateY(Math.PI / 2); const m = new THREE.Mesh(tg, lam(wall)); m.position.set(sg * (w / 2 - 0.1) - 0.1, h, 0); g.add(m); }
    g.add(box(1.1, 2.1, 0.08, lam(door), 0, 1.05, d / 2 + 0.03));
    for (const xo of [-w / 2 + 1.4, w / 2 - 1.4]) { g.add(box(1.0, 0.9, 0.06, lam('#2c3a42'), xo, h * 0.6, d / 2 + 0.02)); g.add(box(0.3, 0.95, 0.07, lam('#3f7a4a'), xo - 0.68, h * 0.6, d / 2 + 0.03)); g.add(box(0.3, 0.95, 0.07, lam('#3f7a4a'), xo + 0.68, h * 0.6, d / 2 + 0.03)); }
    world.addBox(x, z, w / 2 + 0.2, d / 2 + 0.2, yaw, 99);
    return g;
  };
  { const hg = building(REG.farm.x, REG.farm.z, Math.PI, { w: 10, d: 6.5, h: 3.2, rise: 2.3 }); hg.add(box(0.7, 1.6, 0.7, lam('#8c4a3a'), 2.5, 5.3, -1)); }
  building(REG.farm.x + 13, REG.farm.z - 10, -Math.PI / 2, { w: 9, d: 7, h: 4, rise: 2.8, wall: '#9a4d36', roof: '#5f5a55', door: '#5d3b25' });
  const fenceLine = (pts2, { h = 1.0, color = '#8a6440', gaps = [] } = {}) => {
    const pm = lam(color);
    for (let i = 0; i < pts2.length - 1; i++) {
      if (gaps.includes(i)) continue;
      const [x0, z0] = pts2[i], [x1, z1] = pts2[i + 1], len = Math.hypot(x1 - x0, z1 - z0), yaw = Math.atan2(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 2.6));
      for (let k2 = 0; k2 <= n; k2++) { const t = k2 / n, x = x0 + (x1 - x0) * t, z = z0 + (z1 - z0) * t; G.add(box(0.13, h + 0.2, 0.13, pm, x, world.heightAt(x, z) + (h + 0.2) / 2 - 0.05, z)); }
      for (let k2 = 0; k2 < n; k2++) {
        const ta = k2 / n, tb = (k2 + 1) / n, xa = x0 + (x1 - x0) * ta, za = z0 + (z1 - z0) * ta, xb = x0 + (x1 - x0) * tb, zb = z0 + (z1 - z0) * tb;
        const ya = world.heightAt(xa, za), yb = world.heightAt(xb, zb), sl = Math.hypot(xb - xa, zb - za);
        for (const y of [h * 0.45, h * 0.92]) { const r = box(0.06, 0.1, sl, pm, (xa + xb) / 2, (ya + yb) / 2 + y, (za + zb) / 2); r.rotation.y = yaw; r.rotation.x = -Math.atan2(yb - ya, sl); G.add(r); }
      }
      world.addBox((x0 + x1) / 2, (z0 + z1) / 2, 0.12, len / 2, yaw, h + 0.05);
    }
  };
  const O = REG.orchard, GD = REG.garden;
  fenceLine([[O.x0, O.z0], [O.x1, O.z0], [O.x1, O.z1], [O.x0, O.z1], [O.x0, O.z0]], { h: 0.95, gaps: [3] });
  fenceLine([[GD.x0, GD.z0], [GD.x1, GD.z0], [GD.x1, GD.z1], [GD.x0, GD.z1], [GD.x0, GD.z0]], { h: 0.8, color: '#e9e2d0', gaps: [2] });
  P.paddock = { x0: 92, x1: 132, z0: 200, z1: 230 };
  { const K = P.paddock; fenceLine([[K.x0, K.z0], [K.x1, K.z0], [K.x1, K.z1], [K.x0, K.z1], [K.x0, K.z0]], { h: 1.0, color: '#f2efe6' }); }
  { const wx = REG.farm.x - 9, wz = REG.farm.z - 6, wy = world.heightAt(wx, wz); // kút
    const wl = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.8, 0.8, 16, 1, true), stoneM); wl.position.set(wx, wy + 0.4, wz); wl.castShadow = true; G.add(wl);
    for (const s2 of [-1, 1]) G.add(box(0.1, 1.7, 0.1, darkWood, wx + s2 * 0.7, wy + 0.85, wz));
    const rf = box(1.8, 0.08, 1.2, lam('#a8402e'), wx, wy + 1.8, wz); rf.rotation.z = 0.0; G.add(rf); world.addCircle(wx, wz, 0.9, 99); }
  for (const [x, z, a] of [[REG.farm.x + 6, REG.farm.z + 8, 0.2], [REG.farm.x + 8.5, REG.farm.z + 7.2, 1.3], [130, 270, 0.7]]) {
    const c = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.75, 1.2, 16), lam('#cfae5c', { map: P.hayMat.map })); c.rotation.z = Math.PI / 2; c.rotation.y = a;
    c.position.set(x, world.heightAt(x, z) + 0.74, z); c.castShadow = true; G.add(c); world.addCircle(x, z, 0.85, 1.4);
  }
  // útjelző tábla az otthon szélén
  { const sx = -16, sz = 46, sy = world.heightAt(sx, sz); G.add(box(0.14, 2.4, 0.14, darkWood, sx, sy + 1.2, sz)); world.addCircle(sx, sz, 0.15, 99);
    [['Szurdok és vízesés', 0.6, 2.1], ['Tó és nyírfás', 2.2, 1.7], ['Tanya és várrom', -0.9, 1.3]].forEach(([t, yaw, y]) => {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 0.32), new THREE.MeshLambertMaterial({ map: textTex(t, { w: 384, h: 80, bg: '#7a5232', fg: '#fbefd6', font: 'bold 34px ui-rounded, system-ui' }), side: THREE.DoubleSide }));
      b.position.set(sx + Math.sin(yaw) * 0.7, sy + y, sz + Math.cos(yaw) * 0.7); b.rotation.y = yaw + Math.PI / 2; G.add(b); }); }

  // ---------- várrom ----------
  {
    const R = REG.ruin, ry = world.ruinTop, ruinG = new THREE.Group(); ruinG.position.set(R.x, ry - 0.1, R.z); G.add(ruinG);
    const seg = 14, rad = 12.5;
    for (let i = 0; i < seg; i++) {
      if (i === 9 || i === 10) continue; // kapu a délnyugati oldalon
      const a0 = i / seg * Math.PI * 2, a1 = (i + 1) / seg * Math.PI * 2, am = (a0 + a1) / 2;
      const len = 2 * rad * Math.sin(Math.PI / seg) + 0.2, h = 2.2 + Math.abs(Math.sin(i * 2.3)) * 3.2 + (i % 4 === 0 ? 1.2 : 0);
      const wall = box(len, h, 1.1, stoneM, Math.cos(am) * rad, h / 2, Math.sin(am) * rad); wall.rotation.y = -am + Math.PI / 2; ruinG.add(wall);
      if (h > 3) for (let c2 = -1; c2 <= 1; c2 += 2) { const cr = box(0.6, 0.6, 1.1, stoneM, Math.cos(am) * rad + Math.cos(am + Math.PI / 2) * c2 * 0.9, h + 0.3, Math.sin(am) * rad + Math.sin(am + Math.PI / 2) * c2 * 0.9); cr.rotation.y = -am + Math.PI / 2; ruinG.add(cr); }
      world.addBox(R.x + Math.cos(am) * rad, R.z + Math.sin(am) * rad, len / 2, 0.6, -am + Math.PI / 2, 99);
    }
    const tw = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 10, 16, 1, true), stoneM); tw.position.set(-4, 5, -4); tw.castShadow = true; ruinG.add(tw);
    for (let i = 0; i < 8; i++) { if (i === 3) continue; const a = i / 8 * Math.PI * 2; ruinG.add(box(1.0, 0.9, 0.7, stoneM, -4 + Math.cos(a) * 3.1, 10.4, -4 + Math.sin(a) * 3.1)); }
    world.addCircle(R.x - 4, R.z - 4, 3.6, 99);
    for (const [x, z, s3] of [[3, 4, 0.7], [5, -2, 0.5], [-1, 6, 0.6], [7, 3, 0.45]]) { const rb = new THREE.Mesh(new THREE.DodecahedronGeometry(s3, 0), stoneM); rb.position.set(x, s3 * 0.5, z); rb.rotation.set(rnd(), rnd(), rnd()); rb.castShadow = true; ruinG.add(rb); world.addCircle(R.x + x, R.z + z, s3, s3 * 0.8); }
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8), lam('#d8312c', { side: THREE.DoubleSide })); flag.position.set(-4 + 0.7, 12.6, -4); flag.userData.dynamic = true; ruinG.add(flag); ruinG.add(box(0.07, 2.6, 0.07, darkWood, -4, 11.6, -4));
    P.flag = flag;
  }

  // ---------- gyűjtenivalók ----------
  const okSpot = (x, z) => { const h = world.heightAt(x, z); return h > WATER + 0.35 && world.slopeAt(x, z) < 0.38 && !world.inArena(x, z, 3) && !world.inYard(x, z, 4) && world.creekDist(x, z) > 3 && Math.abs(x) < HALF - 70 && Math.abs(z) < HALF - 70; };
  const freeOfTrees = (x, z) => !world.treeSpots.some((t) => Math.abs(t.x - x) < 2 && Math.abs(t.z - z) < 2);
  // aranypatkók
  {
    const items = [], r = mulberry32(2026);
    const fixed = [[REG.ruin.x + 2, REG.ruin.z + 2], [world.waterfallBase.x + 7 * world.canyonNormal(WATERFALL_T).x, world.waterfallBase.z - 3], [65, 278], [REG.wild.x, REG.wild.z], [REG.xc.x, REG.xc.z], [REG.birch.x, REG.birch.z], [REG.rocky.x + 10, REG.rocky.z]];
    for (const [x, z] of fixed) if (okSpot(x, z)) items.push({ x, z });
    const cp = world.canyonAt(0.45, 2); items.push({ x: cp.x, z: cp.z });
    let guard = 0;
    for (let i = 0; i < 5 && guard < 600; guard++) { const a = r() * 6.28, d = 50 + r() * 60; const x = HOME.x + Math.cos(a) * d, z = HOME.z + Math.sin(a) * d; if (okSpot(x, z) && freeOfTrees(x, z)) { items.push({ x, z }); i++; } }
    for (let i = 0; i < 13 && guard < 2500; guard++) { const p = pts[Math.floor(r() * N)]; const x = p.x + (r() - 0.5) * 6, z = p.z + (r() - 0.5) * 6; if (okSpot(x, z) && freeOfTrees(x, z) && Math.hypot(x - HOME.x, z - HOME.z) > 100 && !items.some((q) => Math.hypot(q.x - x, q.z - z) < 40)) { items.push({ x, z }); i++; } }
    while (items.length < 40 && guard < 9000) { guard++; const x = (r() - 0.5) * 820, z = (r() - 0.5) * 820; if (okSpot(x, z) && freeOfTrees(x, z) && Math.hypot(x - HOME.x, z - HOME.z) > 110 && !items.some((q) => Math.hypot(q.x - x, q.z - z) < 45)) items.push({ x, z }); }
    items.forEach((it, i) => { it.id = i; it.y = world.heightAt(it.x, it.z) + 1.1; it.taken = false; it.phase = r() * 6; });
    const tg = new THREE.TorusGeometry(0.3, 0.07, 8, 24, Math.PI * 1.45); tg.rotateZ(-Math.PI / 2 - Math.PI * 0.225);
    const mat = new THREE.MeshStandardMaterial({ color: '#ffc93a', metalness: 0.35, roughness: 0.3, emissive: '#8a5a00', emissiveIntensity: 0.7 });
    const mesh = new THREE.InstancedMesh(tg, mat, items.length); mesh.castShadow = true; mesh.frustumCulled = false;
    G.add(mesh);
    const glowTex = canvasTexture(64, 64, (ctx) => { const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,230,120,0.9)'); g.addColorStop(0.4, 'rgba(255,200,60,0.35)'); g.addColorStop(1, 'rgba(255,200,60,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); });
    P.glowTex = glowTex;
    const glows = items.map((it) => { const s2 = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s2.scale.set(1.5, 1.5, 1); s2.position.set(it.x, it.y, it.z); G.add(s2); return s2; });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    P.horseshoes = {
      items, mesh, glows,
      update(t, cam) {
        items.forEach((it, i) => {
          const far = cam && Math.abs(it.x - cam.x) + Math.abs(it.z - cam.z) > 160;
          p.set(it.x, it.y + Math.sin(t * 2 + it.phase) * 0.15, it.z); q.setFromAxisAngle(up, t * 1.6 + it.phase); sc.setScalar(it.taken ? 0 : 1);
          m.compose(p, q, sc); mesh.setMatrixAt(i, m); glows[i].visible = !it.taken && !far; glows[i].position.y = p.y;
        });
        mesh.instanceMatrix.needsUpdate = true;
      },
    };
  }
  // ritka virágok
  P.FLOWERS = {
    pipacs: { name: 'Pipacs', petal: '#e2312b', center: '#2a1a10' },
    buzavirag: { name: 'Búzavirág', petal: '#3f6fe0', center: '#26305c' },
    harangvirag: { name: 'Harangvirág', petal: '#9a6ae0', center: '#f2e6a0', bell: true },
    gyongyvirag: { name: 'Gyöngyvirág', petal: '#fbfbf4', center: '#e8e8c8', bell: true },
    gyopar: { name: 'Havasi gyopár', petal: '#eef0e6', center: '#d9c25a', star: true },
    tavirozsa: { name: 'Tavirózsa', petal: '#f6b3cf', center: '#f2d34a', lily: true },
  };
  {
    const r = mulberry32(5150), items = [];
    const pick = (fn, n) => { let g2 = 0, got = 0; while (got < n && g2++ < 4000) { const pnt = fn(); if (pnt && !items.some((q) => Math.hypot(q.x - pnt.x, q.z - pnt.z) < 25)) { items.push(pnt); got++; } } };
    const around = (c, rad, sp, extra = () => true) => () => { const a = r() * 6.28, d = Math.sqrt(r()) * rad; const x = c.x + Math.cos(a) * d, z = c.z + Math.sin(a) * d; return okSpot(x, z) && freeOfTrees(x, z) && extra(x, z) ? { x, z, sp } : null; };
    pick(around({ x: 40, z: 375 }, 70, 'pipacs', (x, z) => !world.inLavender(x, z, 2)), 3);
    pick(around({ x: 150, z: 215 }, 60, 'buzavirag', (x, z) => !inRect(x, z, P.paddock, 2) && !world.inLavender(x, z, 2)), 3);
    pick(around(REG.birch, 85, 'harangvirag'), 3);
    pick(around(REG.westwood, 95, 'gyongyvirag'), 3);
    pick(() => { const t = 0.15 + r() * 0.7, side = r() < 0.5 ? -1 : 1, q = world.canyonAt(t, side * (26 + r() * 30)); return okSpot(q.x, q.z) && freeOfTrees(q.x, q.z) && world.heightAt(q.x, q.z) > 12 ? { x: q.x, z: q.z, sp: 'gyopar' } : null; }, 3);
    pick(() => { const a = r() * 6.28, d = LAKE.r * (0.62 + r() * 0.3); const x = LAKE.x + Math.cos(a) * d, z = LAKE.z + Math.sin(a) * d; const h = world.heightAt(x, z); return h < WATER - 0.15 && h > WATER - 1.05 ? { x, z, sp: 'tavirozsa' } : null; }, 3);
    items.forEach((it, i) => {
      const F = P.FLOWERS[it.sp], g = new THREE.Group(); it.id = i; it.taken = false;
      const pm = lam(F.petal, { emissive: F.petal, emissiveIntensity: 0.12 }), cm = lam(F.center), stem = lam('#4f7a32');
      if (F.lily) {
        const pad = new THREE.Mesh(new THREE.CircleGeometry(0.55, 18, 0.3, Math.PI * 2 - 0.4), lam('#3f7a3a', { side: THREE.DoubleSide })); pad.rotation.x = -Math.PI / 2; g.add(pad);
        for (let k2 = 0; k2 < 8; k2++) { const a = k2 / 8 * 6.28, pe = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), pm); pe.scale.set(1.6, 0.5, 0.7); pe.position.set(Math.cos(a) * 0.14, 0.1, Math.sin(a) * 0.14); pe.rotation.y = -a; g.add(pe); }
        const ce = new THREE.Mesh(new THREE.SphereGeometry(0.07, 8, 6), cm); ce.position.y = 0.14; g.add(ce);
        it.y = WATER + 0.02;
      } else {
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.02, 0.6, 5), stem); st.position.y = 0.3; g.add(st);
        for (const s2 of [-1, 1]) { const lf = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 4), stem); lf.scale.set(1.8, 0.3, 0.6); lf.position.set(s2 * 0.09, 0.2, 0); lf.rotation.z = s2 * 0.5; g.add(lf); }
        const head = new THREE.Group(); head.position.y = 0.62; g.add(head);
        if (F.bell) for (let k2 = 0; k2 < 4; k2++) { const b2 = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6, 0, 6.28, 0, 2.2), pm); b2.position.set(0.05 + k2 * 0.04, -0.05 - k2 * 0.06, 0); b2.rotation.x = Math.PI; head.add(b2); }
        else { const n2 = F.star ? 7 : 5; for (let k2 = 0; k2 < n2; k2++) { const a = k2 / n2 * 6.28, pe = new THREE.Mesh(new THREE.SphereGeometry(0.09, 8, 6), pm); pe.scale.set(F.star ? 1.4 : 1.1, 0.35, F.star ? 0.45 : 0.85); pe.position.set(Math.cos(a) * 0.1, 0, Math.sin(a) * 0.1); pe.rotation.y = -a; head.add(pe); }
          const ce = new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), cm); ce.position.y = 0.03; head.add(ce); }
        it.y = world.heightAt(it.x, it.z);
      }
      g.position.set(it.x, it.y, it.z); g.scale.setScalar(1.35); G.add(g); it.g = g;
      const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: P.glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, color: F.petal, opacity: 0.55 })); gl.scale.set(1.3, 1.3, 1); gl.position.set(it.x, it.y + 0.8, it.z); G.add(gl); it.glow = gl;
    });
    P.flowers = items;
  }
  // alma és répa (újranövő készlet)
  {
    const appleG = new THREE.SphereGeometry(0.11, 10, 8), appleM = new THREE.MeshStandardMaterial({ color: '#c8261f', roughness: 0.35 });
    const r = mulberry32(77);
    P.apples = world.appleTrees.filter(() => r() < 0.7).slice(0, 10).map((t, i) => {
      const a = r() * 6.28, x = t.x + Math.cos(a) * 1.6, z = t.z + Math.sin(a) * 1.6; const m2 = new THREE.Mesh(appleG, appleM); m2.position.set(x, world.heightAt(x, z) + 0.1, z); m2.castShadow = true; G.add(m2);
      return { id: i, x, z, mesh: m2, taken: false, back: 0, kind: 'alma' };
    });
    const carrotG = mergeGeometries([(() => { const c2 = new THREE.ConeGeometry(0.06, 0.18, 8); c2.rotateX(Math.PI); c2.translate(0, 0.05, 0); c2.deleteAttribute('uv'); return c2; })()]);
    const leafG = new THREE.ConeGeometry(0.09, 0.22, 5); leafG.translate(0, 0.25, 0);
    const cm = lam('#ee7d22'), lm = lam('#3f8a3a');
    const GD2 = REG.garden; P.carrots = [];
    for (let i = 0; i < 10; i++) {
      const x = GD2.x0 + 3 + (i % 5) * 5, z = GD2.z0 + 5 + Math.floor(i / 5) * 8;
      const g = new THREE.Group(); g.add(new THREE.Mesh(carrotG, cm)); g.add(new THREE.Mesh(leafG, lm)); g.position.set(x, world.heightAt(x, z), z); G.add(g);
      P.carrots.push({ id: i, x, z, mesh: g, taken: false, back: 0, kind: 'repa' });
    }
    // veteményes sorok
    for (let zz = GD2.z0 + 3; zz < GD2.z1 - 2; zz += 2.2) { const row = box(GD2.x1 - GD2.x0 - 4, 0.12, 0.7, lam('#5e4a35'), (GD2.x0 + GD2.x1) / 2, world.heightAt((GD2.x0 + GD2.x1) / 2, zz) + 0.03, zz); row.castShadow = false; G.add(row); }
  }
  // felfedezhető helyek
  {
    const wf = world.waterfallBase, cm2 = world.canyonAt(0.42, 0);
    P.landmarks = [
      { key: 'to', name: 'Tópart', x: LAKE.x, z: LAKE.z, r: LAKE.r + 14 },
      { key: 'vizeses', name: 'Vízesés', x: wf.x, z: wf.z, r: 16 },
      { key: 'szurdok', name: 'Szurdok', x: cm2.x, z: cm2.z, r: 20 },
      { key: 'varrom', name: 'Várrom', x: REG.ruin.x, z: REG.ruin.z, r: 16 },
      { key: 'levendula', name: 'Levendulamező', x: (REG.lavender.x0 + REG.lavender.x1) / 2, z: (REG.lavender.z0 + REG.lavender.z1) / 2, r: 55 },
      { key: 'tanya', name: 'Tanya', x: REG.farm.x, z: REG.farm.z, r: 18 },
      { key: 'almas', name: 'Almáskert', x: (REG.orchard.x0 + REG.orchard.x1) / 2, z: (REG.orchard.z0 + REG.orchard.z1) / 2, r: 30 },
      { key: 'oszi', name: 'Őszi erdő', x: 330, z: 0, r: 45 },
      { key: 'nyirfas', name: 'Nyírfás', x: REG.birch.x, z: REG.birch.z, r: 45 },
      { key: 'fennsik', name: 'Sziklás fennsík', x: REG.rocky.x, z: REG.rocky.z, r: 40 },
      { key: 'vadlovak', name: 'Vadlovak rétje', x: REG.wild.x, z: REG.wild.z, r: 55 },
      { key: 'terep', name: 'Terepugrató pálya', x: REG.xc.x, z: REG.xc.z, r: 40 },
    ];
  }
  P.cull = (cam) => {
    const vis = (x, z, r) => Math.abs(x - cam.x) + Math.abs(z - cam.z) < r;
    for (const o of P.obstacles) o.g.visible = vis(o.x, o.z, o.show ? 400 : 300);
    for (const g of P.gates) g.g.visible = vis(g.x, g.z, 320);
    for (const f of P.flowers) if (!f.taken) f.g.visible = vis(f.x, f.z, 160);
  };
  P.collectUpdate = (t, cam) => {
    for (const f of P.flowers) { if (f.taken) f.g.visible = false; f.glow.visible = !f.taken && Math.abs(f.x - cam.x) + Math.abs(f.z - cam.z) < 120; f.glow.material.opacity = 0.35 + Math.sin(t * 3 + f.id) * 0.2; f.g.rotation.y = Math.sin(t * 0.8 + f.id) * 0.3; }
    for (const a of [...P.apples, ...P.carrots]) { if (a.taken && t > a.back) a.taken = false; a.mesh.visible = !a.taken; }
    if (P.flag) P.flag.rotation.y = Math.sin(t * 2.2) * 0.25;
  };

  // ---------- összevonás ----------
  for (const o of P.obstacles) mergeStatic(o.g);
  for (const g of P.gates) mergeStatic(g.g);
  const keep = new Set([...P.flowers.map((f) => f.g), ...P.apples.map((a) => a.mesh), ...P.carrots.map((c) => c.mesh), P.flag]);
  { const tmp = new THREE.Group(); const kids = G.children.filter((c) => c.isMesh && !c.isInstancedMesh && !keep.has(c)); kids.forEach((k) => tmp.add(k)); mergeStatic(tmp); [...tmp.children].forEach((k) => G.add(k)); }
  G.children.filter((c) => c.isGroup && !keep.has(c) && !P.obstacles.some((o) => o.g === c) && !P.gates.some((g) => g.g === c)).forEach((c) => mergeStatic(c));

  // ---------- akadályok animációja ----------
  P.update = (dt) => {
    for (const o of P.obstacles) {
      if (!o.poles.length) continue;
      if (o.knocked && o.fall < 1) {
        o.fall = Math.min(1, o.fall + dt * 2.2);
        const p = o.poles[o.knockIdx]; const t = o.fall * o.fall;
        p.position.y = THREE.MathUtils.lerp(p.userData.rest.y, 0.06, t);
        p.position.z = p.userData.rest.z + t * 0.6;
        p.rotation.y = t * 0.25;
      }
    }
  };
  P.knock = (o) => {
    if (!o.poles.length || o.knocked) return;
    o.knocked = true; o.fall = 0;
    let top = 0; o.poles.forEach((p, i) => { if (p.userData.rest.y > o.poles[top].userData.rest.y) top = i; });
    o.knockIdx = top;
  };
  P.resetPoles = () => {
    for (const o of P.obstacles) { o.knocked = false; o.fall = 0; for (const p of o.poles) { p.position.copy(p.userData.rest); p.rotation.set(0, 0, 0); } }
  };
  return P;
}
