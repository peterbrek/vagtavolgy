import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTexture } from './geom.js';
import { mulberry32, clamp, smoothstep } from './noise.js';
import { STABLE, TIE, ARENA, YARD, WATER, HOME, HALF } from './world.js';

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

  const placeObstacle = (o, x, z, yaw, extra) => {
    const y = world.heightAt(x, z);
    o.g.position.set(x, y, z); o.g.rotation.y = yaw; G.add(o.g);
    const ob = Object.assign({ x, z, y, yaw, f: new THREE.Vector2(Math.sin(yaw), Math.cos(yaw)), a: new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw)), knocked: false, fall: 0 }, o, extra);
    ob.id = P.obstacles.length;
    world.addBox(x, z, o.w / 2, o.d / 2, yaw, o.h, ob);
    if (o.wings) for (const s of [-1, 1]) world.addCircle(x + ob.a.x * s * o.wings, z + ob.a.y * s * o.wings, 0.45, 1.7);
    P.obstacles.push(ob); return ob;
  };

  // pálya-akadályok (az aréna helyi koordinátáiban)
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
  C.forEach(([ax, az, yaw, type, h, ca, cb], i) => {
    const w = toW(ax, az);
    const o = placeObstacle(makeShowJump(type, h, ca, cb, i + 1), w.x, w.z, yaw, { type, course: i + 1, show: true });
    P.course.push(o);
  });
  // kapuk
  const makeGate = (ax, az, yaw, label, color) => {
    const w = toW(ax, az); const g = new THREE.Group(); g.position.set(w.x, 0, w.z); g.rotation.y = yaw; G.add(g);
    const pm = lam('#ffffff');
    for (const [s, c] of [[-1, '#d8312c'], [1, '#ffffff']]) {
      g.add(box(0.12, 2.6, 0.12, pm, s * 3, 1.3, 0));
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.4), lam(c, { side: THREE.DoubleSide })); f.position.set(s * 3 + s * 0.3, 2.35, 0); g.add(f);
    }
    const b = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.55), new THREE.MeshLambertMaterial({ map: textTex(label, { bg: color, fg: '#ffffff', font: 'bold 44px ui-rounded, system-ui' }), side: THREE.DoubleSide }));
    b.position.set(0, 2.45, 0); g.add(b);
    const cord = box(6, 0.03, 0.03, lam('#ffffff'), 0, 2.45, 0); g.add(cord);
    for (const s of [-1, 1]) world.addCircle(w.x + Math.cos(yaw) * s * 3, w.z - Math.sin(yaw) * s * 3, 0.2, 99);
    const gate = { x: w.x, z: w.z, yaw, f: new THREE.Vector2(Math.sin(yaw), Math.cos(yaw)), a: new THREE.Vector2(Math.cos(yaw), -Math.sin(yaw)), hw: 2.9, g };
    P.gates.push(gate); return gate;
  };
  P.startGate = makeGate(-34, -13, Math.PI / 2, 'START', '#2e9a48');
  P.finishGate = makeGate(16, 0, Math.PI / 2, 'CÉL', '#d8312c');

  // terepakadályok az ösvény mentén
  const pts = world.pathPts, N = pts.length;
  const makers = [[makeLog, 'log'], [makeHedge, 'hedge'], [makeWall, 'wall'], [makeRails, 'rails'], [makeLog, 'log'], [makeWall, 'wall'], [makeHedge, 'hedge'], [makeRails, 'rails']];
  let k = 0;
  for (let s = 70; s < N - 50; s += 72) {
    const p = pts[s];
    if (Math.hypot(p.x - HOME.x, p.z - HOME.z) < 95) continue;
    if (world.heightAt(p.x, p.z) < WATER + 0.4) continue;
    if (world.slopeAt(p.x, p.z) > 0.25) continue;
    const a = pts[(s + 3) % N], b = pts[(s - 3 + N) % N];
    const yaw = Math.atan2(a.x - b.x, a.z - b.z);
    const [mk, type] = makers[k % makers.length]; k++;
    const o = placeObstacle(mk(), p.x, p.z, yaw, { type, course: null, show: false });
    // a talajhoz igazítás a lejtőn
    const hl = world.heightAt(p.x + o.a.x * 2, p.z + o.a.y * 2), hr = world.heightAt(p.x - o.a.x * 2, p.z - o.a.y * 2);
    o.g.position.y = Math.min(hl, hr, o.y) + 0.02;
  }

  // ---------- aranypatkók ----------
  {
    const items = [];
    const ok = (x, z) => {
      const h = world.heightAt(x, z);
      return h > WATER + 0.35 && h < 24 && world.slopeAt(x, z) < 0.35 && !world.inArena(x, z, 3) && !world.inYard(x, z, 4) &&
        Math.hypot(x - STABLE.x, z - STABLE.z) > 14 && Math.abs(x) < HALF - 60 && Math.abs(z) < HALF - 60;
    };
    const r = mulberry32(2024);
    let guard = 0;
    for (let i = 0; i < 4 && guard < 500; guard++) { const a = r() * 6.28, d = 45 + r() * 60; const x = HOME.x + Math.cos(a) * d, z = HOME.z + Math.sin(a) * d; if (ok(x, z)) { items.push({ x, z }); i++; } }
    for (let i = 0; i < 9 && guard < 1500; guard++) { const p = pts[Math.floor(r() * N)]; const x = p.x + (r() - 0.5) * 6, z = p.z + (r() - 0.5) * 6; if (ok(x, z) && Math.hypot(x - HOME.x, z - HOME.z) > 90) { items.push({ x, z }); i++; } }
    for (let i = 0; i < 12 && guard < 4000; guard++) { const x = (r() - 0.5) * 520, z = (r() - 0.5) * 520; if (ok(x, z) && Math.hypot(x - HOME.x, z - HOME.z) > 110) { items.push({ x, z }); i++; } }
    items.forEach((it, i) => { it.id = i; it.y = world.heightAt(it.x, it.z) + 1.1; it.taken = false; it.phase = r() * 6; });
    const tg = new THREE.TorusGeometry(0.3, 0.07, 8, 24, Math.PI * 1.45); tg.rotateZ(-Math.PI / 2 - Math.PI * 0.225);
    for (let n = 0; n < 7; n++) { const a = -Math.PI * 0.6 + n * 0.2; }
    const mat = new THREE.MeshStandardMaterial({ color: '#ffc93a', metalness: 0.35, roughness: 0.3, emissive: '#8a5a00', emissiveIntensity: 0.7 });
    const mesh = new THREE.InstancedMesh(tg, mat, items.length); mesh.castShadow = true; mesh.frustumCulled = false;
    G.add(mesh);
    const glowTex = canvasTexture(64, 64, (ctx) => { const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,230,120,0.9)'); g.addColorStop(0.4, 'rgba(255,200,60,0.35)'); g.addColorStop(1, 'rgba(255,200,60,0)'); ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); });
    const glows = items.map((it) => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); s.scale.set(1.5, 1.5, 1); s.position.set(it.x, it.y, it.z); G.add(s); return s; });
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    P.horseshoes = {
      items, mesh, glows,
      update(t, cam) {
        items.forEach((it, i) => {
          const far = cam && Math.abs(it.x - cam.x) + Math.abs(it.z - cam.z) > 160;
          const s = it.taken ? 0 : 1;
          p.set(it.x, it.y + Math.sin(t * 2 + it.phase) * 0.15, it.z); q.setFromAxisAngle(up, t * 1.6 + it.phase); sc.setScalar(s);
          m.compose(p, q, sc); mesh.setMatrixAt(i, m); glows[i].visible = !it.taken && !far; glows[i].position.y = p.y;
        });
        mesh.instanceMatrix.needsUpdate = true;
      },
    };
  }

  // ---------- összevonás ----------
  for (const o of P.obstacles) mergeStatic(o.g);
  for (const g of P.gates) mergeStatic(g.g);
  { const tmp = new THREE.Group(); const kids = G.children.filter((c) => c.isMesh && !c.isInstancedMesh); kids.forEach((k) => tmp.add(k)); mergeStatic(tmp); [...tmp.children].forEach((k) => G.add(k)); }
  G.children.filter((c) => c.isGroup && !P.obstacles.some((o) => o.g === c) && !P.gates.some((g) => g.g === c)).forEach((c) => mergeStatic(c));

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
