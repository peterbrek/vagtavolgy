import * as THREE from 'three';
import { World, TIE, STABLE, HOUSE, ARENA, WATER, HOME, SUN_DIR, HALF, SIZE, LAKE, REG, WORLD_VERSION, inRect } from './world.js';
import { House } from './house.js';
import { Env, SEASONS, TOD_PRESETS } from './env.js';
import { Fauna } from './fauna.js';
import { buildProps } from './props.js';
import { Grass } from './grass.js';
import { Horse, COATS, SADDLES, PALETTE } from './horse.js';
import { Rider, HAIR } from './rider.js';
import { Sound } from './audio.js';
import { DynTube, canvasTexture } from './geom.js';
import { lowpolyfy } from './lowpoly.js';
import { Post } from './post.js';
import { clamp, lerp, smoothstep, damp, dampAngle, wrapAngle } from './noise.js';

const $ = (id) => document.getElementById(id);
const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const TAU = Math.PI * 2;

// ---------- ikonok ----------
const ICON = {
  coin: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#f2c33a" stroke="#c98a12" stroke-width="2"/><circle cx="12" cy="12" r="5.8" fill="none" stroke="#c98a12" stroke-width="1.6" opacity=".7"/></svg>',
  shoe: '<svg viewBox="0 0 24 24"><path d="M6 20C3 14 3 7 8 4c2.5-1.4 5.5-1.4 8 0 5 3 5 10 2 16" fill="none" stroke="#e0a417" stroke-width="3.8" stroke-linecap="round"/><g fill="#7a5200"><circle cx="6.2" cy="13" r=".95"/><circle cx="7.6" cy="8" r=".95"/><circle cx="17.8" cy="13" r=".95"/><circle cx="16.4" cy="8" r=".95"/></g></svg>',
  hoof: '<svg viewBox="0 0 24 24"><path d="M6 20C3 14 3 7 8 4c2.5-1.4 5.5-1.4 8 0 5 3 5 10 2 16" fill="none" stroke="#8b8f96" stroke-width="3.8" stroke-linecap="round"/><path d="M15 3l5-2" stroke="#6b4a2e" stroke-width="2.4" stroke-linecap="round"/></svg>',
  brush: '<svg viewBox="0 0 48 48"><rect x="7" y="13" width="34" height="15" rx="7" fill="#8a5a33"/><g stroke="#3b2a1d" stroke-width="2.6" stroke-linecap="round"><path d="M12 29v8M17 29v9M22 29v9M27 29v9M32 29v9M37 29v8"/></g><rect x="12" y="9" width="24" height="6" rx="3" fill="#b07a4a"/></svg>',
};
document.querySelectorAll('.ico-coin').forEach((e) => (e.innerHTML = ICON.coin));
document.querySelectorAll('.ico-shoe').forEach((e) => (e.innerHTML = ICON.shoe));
$('brushCur').innerHTML = ICON.brush;

// ---------- mentés ----------
const KEY = 'vagtavolgy.v1';
const MAX_HORSES = 6;
const TACK0 = () => ({ saddle: null, pad: null, bridle: null, wraps: null, blanket: 'kek' });
const STATS0 = () => ({ food: 55, water: 45, clean: 30, mood: 70 });
const newHorseData = (name = 'Csillag', coat = 'pej', o = {}) => ({ id: Math.floor(Math.random() * 1e9), name, coat, blaze: true, socks: false, tack: TACK0(), stats: STATS0(), loc: 'stall', x: 0, z: 0, yaw: 0, ...o });
const DEFAULT = () => ({
  horses: [newHorseData()], cur: 0,
  rider: { jacket: '#1f2f5c', helmet: '#1d1d22', hair: 'barna' },
  coins: 15, shoes: [], best: {}, cleanJumps: 0, sound: true, quality: isTouch ? 'normal' : 'szep',
  inv: { alma: 0, repa: 0 }, flowers: [], found: [], friends: [], worldV: WORLD_VERSION,
  tod: 10, todAuto: false, season: 'nyar', day: 1, fridgeDay: 0,
  tut: { fed: false, water: false, brush: false, tack: false, done: false, ride: false },
});
// S.name, S.tack, S.stats ... mindig az éppen választott lóra mutat
const HORSE_KEYS = ['name', 'coat', 'blaze', 'socks', 'tack', 'stats'];
function linkCur(S) {
  for (const k of HORSE_KEYS) Object.defineProperty(S, k, { get() { return S.horses[S.cur][k]; }, set(v) { S.horses[S.cur][k] = v; }, enumerable: false, configurable: true });
  return S;
}
let S = null;
function load() { try { const s = localStorage.getItem(KEY); if (!s) return null; const d = DEFAULT(), o = JSON.parse(s);
  if (!o.horses) o.horses = [newHorseData(o.name || 'Csillag', o.coat || 'pej', { blaze: o.blaze !== false, socks: !!o.socks, tack: o.tack || TACK0(), stats: o.stats || STATS0() })];
  for (const k of HORSE_KEYS) delete o[k];
  const r = { ...d, ...o, rider: { ...d.rider, ...o.rider }, tut: { ...d.tut, ...o.tut }, inv: { ...d.inv, ...(o.inv || {}) } };
  r.horses = r.horses.slice(0, MAX_HORSES).map((h) => ({ ...newHorseData(), ...h, tack: { ...TACK0(), ...h.tack }, stats: { ...STATS0(), ...h.stats } }));
  for (const h of r.horses) if (h.loc !== 'out') h.loc = 'stall';
  r.cur = clamp(r.cur | 0, 0, r.horses.length - 1);
  if (r.best && r.best.faults !== undefined) r.best = { dij: r.best }; if (!r.best) r.best = {};
  if (r.worldV !== WORLD_VERSION) { r.shoes = []; r.flowers = []; r.found = []; r.worldV = WORLD_VERSION; r.newWorld = true; }
  return linkCur(r); } catch (e) { console.error(e); return null; } }
function save() { if (!S) return; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }

// ---------- állapot ----------
const SPEED = { stand: 0, walk: 1.8, trot: 4.2, canter: 7.5, gallop: 12.5 };
const GAIT_HU = { stand: 'Áll', walk: 'Lépés', trot: 'Ügetés', canter: 'Vágta', gallop: 'Galopp' };
const R = {
  mode: 'loading', x: TIE.x, z: TIE.z, yaw: Math.PI / 2, v: 0, yawRate: 0, gait: 'stand', energy: 100, tired: false,
  lift: 0, pitch: 0, roll: 0, jump: { active: false, t: 0, dur: 0.85, h: 1, o: null, queued: null }, refuse: 0,
  px: TIE.x, pz: TIE.z, drink: 0, course: { active: false, next: 1, t0: 0, faults: 0, refusals: 0, out: 0 },
  cool: new Map(), msgCool: {}, careAct: null, brush: false, lastPet: 0,
  pose: null, lead: -1, fade: 0,
};
const input = { jx: 0, jy: 0, m: 0, gallop: false, jump: false, keys: {} };
const cam = { yaw: Math.PI, pitch: 0.3, dist: 6, target: new THREE.Vector3(TIE.x, 1.3, TIE.z), user: 9, shake: 0 };

let fauna, post, renderer, scene, camera, world, props, grass, horse, rider, sound, sun, hemi, mapCanvas, arrow, house, env, walker, reinMat;
const herd = []; // a saját lovak: { h: Horse, reins, ... } – S.horses-szal azonos sorrendben
let parts = {}, time = 0, hudT = 0, saveT = 0, birdT = 5, autoQ = { t: 0, n: 0, acc: 0 }, pixelRatio = 1;
const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpV3 = new THREE.Vector3();

// ---------- részecskék ----------
class Particles {
  constructor(scene, tex, cap = 240, additive = false) {
    this.cap = cap; this.i = 0;
    this.pos = new Float32Array(cap * 3); this.col = new Float32Array(cap * 3); this.size = new Float32Array(cap); this.alpha = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3); this.life = new Float32Array(cap); this.max = new Float32Array(cap).fill(1); this.grav = new Float32Array(cap); this.s0 = new Float32Array(cap); this.grow = new Float32Array(cap);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3)); g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1));
    this.u = { map: { value: tex }, uScale: { value: 400 } };
    this.mat = new THREE.ShaderMaterial({
      uniforms: this.u, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
      vertexShader: 'attribute vec3 aColor; attribute float aSize, aAlpha; varying vec3 vC; varying float vA; uniform float uScale; void main(){ vC=aColor; vA=aAlpha; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_PointSize = aSize*uScale/max(-mv.z,0.1); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform sampler2D map; varying vec3 vC; varying float vA; void main(){ vec4 t = texture2D(map, gl_PointCoord); if (t.a*vA < 0.01) discard; gl_FragColor = vec4(vC*t.rgb, t.a*vA);\n#include <colorspace_fragment>\n}',
    });
    this.points = new THREE.Points(g, this.mat); this.points.frustumCulled = false; this.points.renderOrder = 5; scene.add(this.points);
  }
  emit(p, vx, vy, vz, life, size, color, grav = -2, grow = 1) {
    const i = this.i = (this.i + 1) % this.cap;
    this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.s0[i] = size; this.grav[i] = grav; this.grow[i] = grow;
    const c = color; this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
  }
  update(dt) {
    for (let i = 0; i < this.cap; i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const t = 1 - this.life[i] / this.max[i];
      this.vel[i * 3 + 1] += this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.alpha[i] = this.life[i] > 0 ? Math.min(1, t * 6) * (1 - t) : 0; this.size[i] = this.s0[i] * (1 + this.grow[i] * t);
    }
    const a = this.points.geometry.attributes; a.position.needsUpdate = a.aAlpha.needsUpdate = a.aSize.needsUpdate = a.aColor.needsUpdate = true;
  }
}

// ---------- indítás ----------
function init() {
  S = load();
  renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true, powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.1, 1200);
  const q = (S && S.quality) || (isTouch ? 'normal' : 'szep');
  world = new World(scene, q);
  scene.fog = new THREE.Fog(world.horizon, 80, 440);
  scene.background = world.horizon;
  hemi = new THREE.HemisphereLight('#d9e9ff', '#6f7d48', 1.15); scene.add(hemi);
  sun = new THREE.DirectionalLight('#ffe8c4', 3.1); sun.castShadow = true;
  {
    // környezeti tükröződés az égboltból (fényes szőr, bőr, fém)
    const pm = new THREE.PMREMGenerator(renderer); const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), world.sky.material.clone()));
    scene.environment = pm.fromScene(es, 0.04).texture; scene.environmentIntensity = 0.55; pm.dispose();
  }
  post = new Post(renderer, scene, camera);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03; sun.shadow.camera.layers.enable(1);
  scene.add(sun); scene.add(sun.target);
  props = buildProps(world, scene);
  grass = new Grass(world, scene, 'high'); grass.setQuality(q);
  house = new House(scene, world, HOUSE);
  reinMat = new THREE.MeshStandardMaterial({ color: '#4a2c1b', roughness: 0.6 });
  syncHerd();
  horse = herd[S ? S.cur : 0].h;
  rider = new Rider(horse);
  walker = new THREE.Group(); scene.add(walker);
  sound = new Sound();
  world.paddock = props.paddock;
  fauna = new Fauna(scene, world, sound);
  env = new Env({ renderer, scene, world, sun, hemi, props, house, grass, fauna });
  if (S) env.setSeason(S.season);
  // részecske-textúrák
  const dot = canvasTexture(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.5, 'rgba(255,255,255,.5)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); });
  const heart = canvasTexture(64, 64, (c) => { c.fillStyle = '#fff'; c.beginPath(); c.moveTo(32, 54); c.bezierCurveTo(4, 34, 8, 8, 32, 20); c.bezierCurveTo(56, 8, 60, 34, 32, 54); c.fill(); });
  const star = canvasTexture(64, 64, (c) => { const g = c.createRadialGradient(32, 32, 0, 32, 32, 30); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.2, 'rgba(255,255,255,.8)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.fillRect(0, 0, 64, 64); c.fillStyle = '#fff'; c.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 6 : 30; c.lineTo(32 + Math.cos(a) * r, 32 + Math.sin(a) * r); } c.fill(); });
  parts.dust = new Particles(scene, dot, 260);
  parts.heart = new Particles(scene, heart, 60);
  parts.star = new Particles(scene, star, 120, true);
  // következő akadály nyíl
  arrow = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.65, 16), new THREE.MeshStandardMaterial({ color: '#ff8a2a', emissive: '#c24a00', emissiveIntensity: 0.6 }));
  arrow.rotation.x = Math.PI; arrow.visible = false; scene.add(arrow);
  lowpolyfy(scene); // low-poly stílus: lapos árnyalás, egyszínű felületek
  mapCanvas = world.renderMap(400);
  applyQuality(q);
  if (S) applyLook(); else { horse.setCoat('pej', { blaze: true }); horse.setTack(TACK0()); rider.setLook(DEFAULT().rider); }
  placeHorseAtTie();
  setupInput();
  setupUI();
  addEventListener('resize', onResize); onResize();
  if (S && S.newWorld) { delete S.newWorld; setTimeout(() => toast('A völgy kibővült: szurdok, vízesés, várrom, tanya és vadlovak várnak!', 'gold'), 1500); }
  window.__vv = { info: () => JSON.stringify(renderer.info.render) + JSON.stringify(renderer.info.memory), R, S: () => S, input, cam, horse: () => horse, herd, rider, world, house, env: () => env, dismount, mountHorse, enterHouse, exitHouse, addHorse, chooseHorse, toStall, sitOn, standUp, sleep, setTod, setSeason, foot: (x, z, y) => goFoot(x, z, y), saveNow: () => save(), props, enterCare, mount, setMode: (m) => (R.mode = m), startNew, sound, placeHorse, closeModal, fauna: () => fauna, step: (n, d = 1 / 30, r = true) => { for (let i = 0; i < n; i++) update(d); if (r) post.render(); }, render: () => post.render(), camera, renderer: () => renderer };
  // első kép
  update(0.016); post.render();
  $('loading').style.opacity = '0'; setTimeout(() => $('loading').classList.add('hide'), 500);
  showTitle();
  requestAnimationFrame(frame);
}

function applyQuality(q) {
  const dpr = window.devicePixelRatio || 1;
  pixelRatio = q === 'gyors' ? 1 : q === 'normal' ? Math.min(dpr, 1.6) : Math.min(dpr, 2.2);
  renderer.setPixelRatio(pixelRatio);
  if (grass) grass.setQuality(q);
  if (post) post.setQuality(q);
  const ms = q === 'gyors' ? 1024 : 2048;
  if (sun.shadow.mapSize.x !== ms) { sun.shadow.mapSize.set(ms, ms); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  const e = q === 'gyors' ? 22 : 30; const c = sun.shadow.camera; c.left = -e; c.right = e; c.top = e; c.bottom = -e; c.near = 10; c.far = 200; c.updateProjectionMatrix();
  onResize();
}
function onResize() {
  if (!renderer) return;
  renderer.setSize(innerWidth, innerHeight, false);
  if (post) post.resize();
  camera.aspect = innerWidth / innerHeight; camera.fov = innerWidth < innerHeight ? 62 : 55; camera.updateProjectionMatrix();
  const sc = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  for (const k in parts) parts[k].u.uScale.value = sc;
  if (env) env.pU.uScale.value = sc;
}

function applyLook() {
  props.horseshoes.items.forEach((it) => (it.taken = S.shoes.includes(it.id)));
  props.flowers.forEach((f) => (f.taken = S.flowers.includes(f.id)));
  syncHerd();
  rider.setLook(S.rider);
  $('hname').textContent = S.name; $('careName').textContent = S.name;
}
// saját lovak: Horse példányok létrehozása / frissítése a mentés alapján
function horseLook(i) {
  const d = S.horses[i], e = herd[i]; if (!e) return;
  e.h.setCoat(d.coat, { blaze: d.blaze, socks: d.socks }); e.h.setTack(d.tack); e.h.setDirt(dirtOf(d.stats.clean)); e.sig = d.coat + d.blaze + d.socks;
}
function syncHerd() {
  const n = S ? S.horses.length : 1;
  while (herd.length < n) {
    const h = new Horse(); scene.add(h.root);
    const rs = [new DynTube(10, 0.008, reinMat), new DynTube(10, 0.008, reinMat)]; rs.forEach((r) => scene.add(r.mesh));
    herd.push({ h, reins: rs, idle: Math.random() * 10, look: 0, lookT: 0, v: 0, gait: 'stand' });
  }
  while (herd.length > n) { const e = herd.pop(); scene.remove(e.h.root); e.reins.forEach((r) => scene.remove(r.mesh)); }
  if (!S) return;
  for (let i = 0; i < n; i++) { horseLook(i); }
  for (let i = 0; i < 6; i++) props.setPlate(i, S.horses[i] ? S.horses[i].name : null);
  if (rider && horse !== herd[S.cur].h) { horse = herd[S.cur].h; if (R.mode === 'ride') rider.attach(horse); }
}
const dirtOf = (c) => clamp((85 - c) / 85, 0, 1) * 0.95;

function placeHorseAtTie() { placeHorse(TIE.x, TIE.z, Math.PI / 2); }
const TITLE_SPOT = { x: -30, z: 8, yaw: -2.3 };
function placeHorse(x, z, yaw) { R.x = x; R.z = z; R.yaw = yaw; R.v = 0; R.lift = 0; R.jump.active = false; R.jump.queued = null; R.px = R.x; R.pz = R.z; R.yawRate = 0; }

// ---------- bemenet ----------
function setupInput() {
  const zone = $('joyzone'), base = $('joybase'), knob = $('joyknob');
  let joyId = null, cx = 0, cy = 0; const RAD = 58;
  const rest = () => { base.style.left = `calc(100% - 96px - env(safe-area-inset-right,0px))`; base.style.top = `calc(100% - 112px - env(safe-area-inset-bottom,0px))`; knob.style.transform = ''; };
  rest();
  zone.addEventListener('pointerdown', (e) => {
    if (joyId !== null) return; joyId = e.pointerId; zone.setPointerCapture(e.pointerId);
    const r = zone.getBoundingClientRect(); cx = clamp(e.clientX, r.left + 20, r.right - 70); cy = clamp(e.clientY, r.top + 20, r.bottom - 70);
    base.style.left = (cx - r.left) + 'px'; base.style.top = (cy - r.top) + 'px'; zone.classList.remove('idle'); move(e); e.preventDefault();
    sound.init();
  });
  const move = (e) => {
    if (e.pointerId !== joyId) return;
    let dx = e.clientX - cx, dy = e.clientY - cy; const d = Math.hypot(dx, dy);
    if (d > RAD) { dx *= RAD / d; dy *= RAD / d; }
    knob.style.transform = `translate(${dx}px,${dy}px)`;
    input.jx = dx / RAD; input.jy = -dy / RAD; input.m = Math.min(1, d / RAD);
  };
  zone.addEventListener('pointermove', move);
  const up = (e) => { if (e.pointerId !== joyId) return; joyId = null; input.jx = input.jy = input.m = 0; zone.classList.add('idle'); rest(); };
  zone.addEventListener('pointerup', up); zone.addEventListener('pointercancel', up);

  const hold = (el, on, off) => {
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); el.classList.add('on'); on(); sound.init(); });
    const u = () => { el.classList.remove('on'); off && off(); };
    el.addEventListener('pointerup', u); el.addEventListener('pointercancel', u); el.addEventListener('lostpointercapture', u);
  };
  hold($('btnGallop'), () => (input.gallop = true), () => (input.gallop = false));
  hold($('btnJump'), () => (input.jump = true));

  // kamera húzás + gondozás
  const cv = renderer.domElement; const ptrs = new Map();
  cv.addEventListener('pointerdown', (e) => {
    sound.init();
    const p = { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now(), brushing: false };
    if (R.mode === 'care' && R.brush) { const h = hitHorse(e.clientX, e.clientY); if (h) { p.brushing = true; showBrush(e.clientX, e.clientY); } }
    ptrs.set(e.pointerId, p); cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
    if (p.brushing) { brushAt(e.clientX, e.clientY, Math.hypot(dx, dy)); return; }
    if (ptrs.size === 2 && R.mode !== 'ride') { // csípés: zoom
      const arr = [...ptrs.values()]; const d = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
      if (p.pd) cam.zoom = clamp((cam.zoom || 1) * (p.pd / d), 0.6, 1.6); p.pd = d; return;
    }
    cam.yaw -= dx * 0.0065; cam.pitch = clamp(cam.pitch + dy * 0.004, -0.05, 1.1); cam.user = 0;
  });
  const end = (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return; ptrs.delete(e.pointerId);
    $('brushCur').classList.add('hide');
    const moved = Math.hypot(e.clientX - p.sx, e.clientY - p.sy);
    if (R.mode === 'care' && !p.brushing && moved < 10 && performance.now() - p.t < 400) { const h = hitHorse(e.clientX, e.clientY); if (h) pet(h.point); }
  };
  cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);
  // billentyűzet (gépen teszteléshez)
  addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    input.keys[e.code] = true;
    if (e.code === 'Space') { input.jump = true; e.preventDefault(); }
    if (e.code === 'Digit1') input.kGait = 0.4; if (e.code === 'Digit2') input.kGait = 0.7; if (e.code === 'Digit3') input.kGait = 1;
    sound.init();
  });
  addEventListener('keyup', (e) => { input.keys[e.code] = false; });
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  addEventListener('pagehide', save);
  document.addEventListener('gesturestart', (e) => e.preventDefault());
  document.addEventListener('dblclick', (e) => e.preventDefault());
}

function readKeys() {
  const k = input.keys; let x = 0, y = 0;
  if (k.KeyW || k.ArrowUp) y += 1; if (k.KeyS || k.ArrowDown) y -= 1; if (k.KeyA || k.ArrowLeft) x -= 1; if (k.KeyD || k.ArrowRight) x += 1;
  if (x || y) { const d = Math.hypot(x, y); const m = input.kGait || 0.7; return { jx: x / d * m, jy: y / d * m, m, gallop: !!(k.ShiftLeft || k.ShiftRight) }; }
  return null;
}

// ---------- lovaglás ----------
const groundY = (x, z) => (house && house.onFloor(x, z)) ? house.floorY() : world.heightAt(x, z) + (world.inArena(x, z) ? 0.04 : world.inYard(x, z) ? 0.035 : 0);
function gaitFor(v, prev) {
  const order = ['stand', 'walk', 'trot', 'canter', 'gallop'], th = [0.12, 2.9, 5.9, 10.2];
  let i = 0; while (i < 4 && v >= th[i]) i++;
  const pi = order.indexOf(prev);
  if (Math.abs(i - pi) === 1 && Math.abs(v - th[Math.min(i, pi)]) < 0.2) return prev;
  return order[i];
}
const jumpDur = (v) => clamp(0.95 - v * 0.013, 0.74, 0.92);

function aheadOf(o) {
  const fx = Math.sin(R.yaw), fz = Math.cos(R.yaw);
  const dx = R.x - o.x, dz = R.z - o.z;
  const cosA = fx * o.f.x + fz * o.f.y; if (Math.abs(cosA) < 0.35) return null;
  const sg = Math.sign(cosA), lf = dx * o.f.x + dz * o.f.y, la = dx * o.a.x + dz * o.a.y;
  const dist = -lf * sg;
  const lat = la + (fx * o.a.x + fz * o.a.y) * (Math.max(dist, 0) / Math.abs(cosA));
  return { o, dist, lat, sg };
}
function obstacleLoose() {
  let best = null;
  for (const o of props.obstacles) {
    if (Math.abs(R.x - o.x) > 16 || Math.abs(R.z - o.z) > 16) continue;
    const q = aheadOf(o); if (!q) continue;
    const fx = Math.sin(R.yaw), fz = Math.cos(R.yaw), cosA = Math.abs(fx * o.f.x + fz * o.f.y);
    const laNow = (R.x - o.x) * o.a.x + (R.z - o.z) * o.a.y;
    if (cosA < 0.45 || q.dist < 0.8 || q.dist > 14 || Math.abs(laNow) > o.w / 2 + 2.5 || Math.abs(q.lat) > o.w / 2 + 6) continue;
    if (!best || q.dist < best.dist) best = q;
  }
  return best;
}
function obstacleAhead() {
  let best = null; const fx = Math.sin(R.yaw), fz = Math.cos(R.yaw);
  for (const o of props.obstacles) {
    const dx = R.x - o.x, dz = R.z - o.z; if (Math.abs(dx) > 20 || Math.abs(dz) > 20) continue;
    const cosA = fx * o.f.x + fz * o.f.y; if (Math.abs(cosA) < 0.5) continue;
    const sg = Math.sign(cosA), lf = dx * o.f.x + dz * o.f.y, la = dx * o.a.x + dz * o.a.y;
    const dist = -lf * sg; if (dist < -0.3 || dist > 15) continue;
    const lat = la + (fx * o.a.x + fz * o.a.y) * (Math.max(dist, 0) / Math.abs(cosA));
    if (Math.abs(lat) > o.w / 2 + 0.25) continue;
    if (!best || dist < best.dist) best = { o, dist, sg };
  }
  return best;
}

function takeoff(o, dist) {
  const dur = jumpDur(R.v);
  let H = o ? Math.max(o.h + 0.32, 1.05) : 1.25;
  if (o) {
    const tc = clamp(dist / (Math.max(R.v, 4) * dur), 0.05, 0.95);
    const need = (o.h + 0.02) / (4 * tc * (1 - tc));
    if (need > H) H = Math.min(need, o.h + 0.6);
  }
  R.jump = { active: true, t: 0, dur, h: H, o, queued: null };
  R.v = Math.max(R.v, 4.2);
  R.energy = Math.max(0, R.energy - 4);
  sound.burst({ f: 500, q: 0.7, dur: 0.25, vol: 0.18 });
}

function refuse(o) {
  dbg('refuse ' + o.id + ' c' + o.course + ' v' + R.v.toFixed(1));
  R.v = 0; R.refuse = 1.1; R.jump.queued = null;
  const back = 0.6; R.x -= Math.sin(R.yaw) * back; R.z -= Math.cos(R.yaw) * back;
  sound.snort(); S.stats.mood = Math.max(0, S.stats.mood - 3);
  toast('A lovad megtorpant! Nyomd meg időben az Ugrás gombot.', 'bad');
  if (R.course.active && o.course === R.course.key && o.num === R.course.next) {
    R.course.faults += 4; R.course.refusals++;
    if (R.course.refusals >= 3) { endCourse(false); toast('Harmadik megtorpanás – kiestél. Próbáld újra!', 'bad'); }
  }
}

function onClear(o, dirOk, lift) {
  if (o.lastCross && time - o.lastCross < 1.5) return; o.lastCross = time;
  dbg('clear ' + o.id + ' c' + o.course + ' dir' + dirOk + ' lift' + lift.toFixed(2) + ' h' + o.h);
  const clean = lift >= o.h - 0.03;
  const now = time;
  if (clean) {
    S.cleanJumps++;
    for (let i = 0; i < 10; i++) parts.star.emit(tmpV.set(R.x, groundY(R.x, R.z) + 1.4, R.z), (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3, 0.9, 0.2, new THREE.Color('#ffe08a'), -1, 0);
    if (!R.course.active || o.course !== R.course.key) {
      const last = R.cool.get(o.id) || -99;
      if (now - last > 15) { R.cool.set(o.id, now); addCoins(1); toast('Szép ugrás! +1 érme', 'good'); }
      else toast('Szép ugrás!', 'good');
    }
  } else {
    if (o.poles.length) { props.knock(o); sound.pole(); }
    else sound.thud();
    if (!R.course.active) toast(o.poles.length ? 'Leverte a rudat! Kicsit korábban ugorj.' : 'Hozzáért, de átjutott.', 'bad');
  }
  if (R.course.active && o.course === R.course.key) {
    if (o.num === R.course.next && dirOk) {
      if (!clean) { R.course.faults += 4; toast('Leverés: +4 hibapont', 'bad'); }
      else toast(`${o.num}. akadály – tiszta!`, 'good');
      R.course.next++; R.course.refusals = 0;
      if (R.course.next > R.course.c.jumps.length) toast('Most lovagolj át a CÉL kapun!', 'good');
    } else if (o.num !== R.course.next) toast(`Ez nem a soron következő! Most a(z) ${R.course.next}. jön.`);
  }
}

function crossGate(g, dx0, dz0, dx1, dz1) {
  const l0 = dx0 * g.f.x + dz0 * g.f.y, l1 = dx1 * g.f.x + dz1 * g.f.y;
  const la = dx1 * g.a.x + dz1 * g.a.y;
  return l0 < 0 && l1 >= 0 && Math.abs(la) < g.hw;
}

function startCourse(c) {
  props.resetPoles();
  R.course = { active: true, key: c.key, c, next: 1, t0: time, faults: 0, refusals: 0, out: 0 };
  $('course').classList.remove('hide');
  toast(`${c.name}: rajt! Ugord át az akadályokat sorban, 1-től ${c.jumps.length}-ig.`, 'good');
  sound.success();
}
function endCourse(finished) {
  const c = R.course; c.active = false; $('course').classList.add('hide'); arrow.visible = false;
  if (!finished) return;
  const t = time - c.t0;
  const clean = c.faults === 0;
  const reward = clean ? 25 : 10;
  addCoins(reward);
  let rec = false;
  const b = S.best[c.key];
  if (!b || c.faults < b.faults || (c.faults === b.faults && t < b.time)) { S.best[c.key] = { faults: c.faults, time: t }; rec = true; }
  const B = S.best[c.key];
  sound.success(); if (clean) setTimeout(() => sound.neigh(), 600);
  modal(`<h2>${clean ? '🏆 Hibátlan kör!' : '🎉 Célba értél!'}</h2>
    <div class="res"><div><b>${t.toFixed(1)} mp</b>idő</div><div><b>${c.faults}</b>hibapont</div><div><b>+${reward}</b>érme</div></div>
    <p><b>${c.c.name}</b> · ${rec ? '⭐ Új egyéni csúcs!' : `Legjobb: ${B.faults} hibapont, ${B.time.toFixed(1)} mp`}</p>
    <p style="color:#666;font-size:14px">A rajtkapun újra átlovagolva újrakezdheted.</p>
    <button class="big" data-close>Szuper!</button>`);
  save();
}

function rideUpdate(dt) {
  const k = readKeys();
  let jx = input.jx, jy = input.jy, m = input.m, gal = input.gallop;
  if (k) { jx = k.jx; jy = k.jy; m = k.m; gal = gal || k.gallop; }
  let gaitT = 'stand', desired = R.yaw;
  if (R.drink > 0) { m = 0; }
  if (m > 0.12) {
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
    desired = input.absYaw != null ? input.absYaw : Math.atan2(fx * jy + rx * jx, fz * jy + rz * jx);
    gaitT = m < 0.5 ? 'walk' : m < 0.88 ? 'trot' : 'canter';
    if (gal && m > 0.3) gaitT = 'gallop';
  }
  if (R.jump.queued && m > 0.12) {
    const o = R.jump.queued, q = aheadOf(o);
    if (q) { const tx = o.x + o.f.x * q.sg * 2.5, tz = o.z + o.f.y * q.sg * 2.5; desired = Math.atan2(tx - R.x, tz - R.z); }
  } else if (m > 0.12 && R.v > 1.2 && !R.jump.active) {
    // fák kerülgetése: a ló magától kitér a törzsek elől
    const dg = world.dodge(R.x, R.z, Math.sin(R.yaw), Math.cos(R.yaw), 2.2 + R.v * 0.42, 1.25);
    R.dodge = damp(R.dodge || 0, dg, 10, dt);
  } else R.dodge = damp(R.dodge || 0, 0, 10, dt);
  if (Math.abs(R.dodge || 0) > 0.01 && !R.jump.queued) desired = R.yaw + clamp(wrapAngle(desired - R.yaw) + R.dodge * 0.95, -1.4, 1.4);
  if (gaitT === 'gallop' && (R.tired || R.energy < 6)) { gaitT = 'canter'; if (!R.tired) { R.tired = true; toast('A lovad elfáradt – pihentesd lépésben!', 'bad'); } }
  if (R.tired && R.energy > 40) R.tired = false;
  if (R.refuse > 0) { R.refuse -= dt; gaitT = 'stand'; R.v = 0; }

  const diff = wrapAngle(desired - R.yaw);
  const tr = lerp(2.3, 0.85, clamp((R.v - 1) / 11, 0, 1));
  const want = m > 0.12 && R.refuse <= 0 ? clamp(diff * 3.2, -tr, tr) : 0;
  R.yawRate = damp(R.yawRate, want * (R.jump.active ? 0.25 : 1), 9, dt);
  R.yaw = wrapAngle(R.yaw + R.yawRate * dt);
  let vt = SPEED[gaitT];
  if (Math.abs(diff) > 1.5 && m > 0.12) vt = Math.min(vt, 1.7);
  const fx = Math.sin(R.yaw), fz = Math.cos(R.yaw);
  const hC = world.heightAt(R.x, R.z);
  const slope = (world.heightAt(R.x + fx * 1.5, R.z + fz * 1.5) - hC) / 1.5;
  vt *= clamp(1 - slope * 1.5, 0.35, 1.12);
  const depth = WATER - hC; if (depth > 0) vt *= clamp(1 - depth * 0.55, 0.3, 1);
  if (!R.jump.active) { const a = vt > R.v ? 2.6 + R.v * 0.12 : 6.5; R.v = R.v < vt ? Math.min(vt, R.v + a * dt) : Math.max(vt, R.v - a * dt); }
  R.gait = gaitFor(R.v, R.gait);

  // ugrás
  const ahead = obstacleAhead();
  if (input.jump) {
    input.jump = false;
    if (!R.jump.active && R.refuse <= 0) {
      dbg('press v' + R.v.toFixed(1) + ' ' + (ahead ? 'o' + ahead.o.id + ' d' + ahead.dist.toFixed(1) : 'none') + ' x' + R.x.toFixed(1) + ' z' + R.z.toFixed(1) + ' yaw' + R.yaw.toFixed(2));
      const loose = ahead || obstacleLoose();
      if (R.v < 2.6) toast(loose ? 'Ügetésből vagy vágtából tudsz ugratni!' : 'Gyorsíts ügetésre vagy vágtára az ugráshoz!');
      else if (loose) {
        const dTake = Math.max(R.v, 4.2) * jumpDur(R.v) * 0.5;
        if (loose.dist > dTake + 0.25 || !ahead) R.jump.queued = loose.o;
        else if (loose.dist - loose.o.d / 2 > 0.15) takeoff(loose.o, loose.dist);
      } else takeoff(null, 0);
    }
  }
  if (!R.jump.active && R.jump.queued) {
    const q = aheadOf(R.jump.queued);
    const laNow = q ? (R.x - q.o.x) * q.o.a.x + (R.z - q.o.z) * q.o.a.y : 99;
    if (!q || q.dist < -0.3 || q.dist > 16 || Math.abs(laNow) > q.o.w / 2 + 3) R.jump.queued = null;
    else if (Math.abs(q.lat) > q.o.w / 2 - 0.3) { /* még igazodik */ }
    else {
      const dTake = Math.max(R.v, 4.2) * jumpDur(R.v) * 0.5;
      if (q.dist <= dTake + 0.05) {
        if ((S.stats.mood < 22 && Math.random() < 0.35) || R.energy < 3) refuse(q.o); else takeoff(q.o, q.dist);
      }
    }
  }
  if (!R.jump.active && ahead && R.v > 1.2 && R.refuse <= 0 && !R.jump.queued && ahead.dist - ahead.o.d / 2 < 1.55) refuse(ahead.o);
  if (R.jump.active) {
    R.jump.t += dt / R.jump.dur;
    const t = Math.min(R.jump.t, 1);
    R.lift = R.jump.h * 4 * t * (1 - t);
    if (R.jump.t >= 1) {
      R.jump.active = false; R.lift = 0; sound.thud(); cam.shake = 0.12;
      for (let i = 0; i < 10; i++) parts.dust.emit(tmpV.set(R.x + (Math.random() - 0.5), groundY(R.x, R.z) + 0.1, R.z + (Math.random() - 0.5)), (Math.random() - 0.5) * 2, Math.random() * 1.2, (Math.random() - 0.5) * 2, 1.0, 0.5, dustColor(R.x, R.z), -0.5, 2);
    }
  }

  // mozgás
  let nx = R.x + fx * R.v * dt, nz = R.z + fz * R.v * dt;
  const hN = world.heightAt(nx, nz);
  const steep = (hN - hC) / Math.max(R.v * dt, 1e-3);
  if (hN < WATER - 1.25 || Math.abs(nx) > HALF - 18 || Math.abs(nz) > HALF - 18 || (steep > 1.05 && R.v > 0.1)) {
    nx = R.x; nz = R.z; if (!R.jump.active) R.v *= 0.3;
    if (hN < WATER - 1.25) msgOnce('deep', 'Ott már túl mély a víz!');
    else msgOnce('steep', 'Arra túl meredek.');
  }
  // ütközés két körrel (mar, far)
  for (const [off, r] of [[0.78, 0.42], [-0.62, 0.42]]) {
    const p = { x: nx + fx * off, z: nz + fz * off }, ox = p.x, oz = p.z;
    const hw = world.resolve(p, r, R.lift), hh = R.lift < 0.3 && pushFromHorses(p, r, S.cur);
    if (hw || hh) {
      const px = p.x - ox, pz = p.z - oz, pl = Math.hypot(px, pz) || 1;
      nx += px; nz += pz;
      // szemből ütközve megáll, súrolva csak lassul
      const head = clamp(-(px * fx + pz * fz) / pl, 0, 1);
      if (off > 0 && !R.jump.active) R.v *= Math.pow(lerp(0.7, 0.05, head), dt);
    }
  }
  // átkelés akadályon / kapun
  for (const o of props.obstacles) {
    const dx0 = R.px - o.x, dz0 = R.pz - o.z; if (Math.abs(dx0) > 8 || Math.abs(dz0) > 8) continue;
    const dx1 = nx - o.x, dz1 = nz - o.z;
    const l0 = dx0 * o.f.x + dz0 * o.f.y, l1 = dx1 * o.f.x + dz1 * o.f.y, la = dx1 * o.a.x + dz1 * o.a.y;
    if (l0 * l1 < 0 && Math.abs(la) < o.w / 2 + 0.2 && R.lift > 0.15) onClear(o, l1 > 0, R.lift);
  }
  const gx = (g) => crossGate(g, R.px - g.x, R.pz - g.z, nx - g.x, nz - g.z);
  if (!R.course.active) { for (const c of props.courses) if (gx(c.start)) { startCourse(c); break; } }
  else if (R.course.next > R.course.c.jumps.length && gx(R.course.c.finish)) endCourse(true);
  if (R.course.active) {
    R.course.out = R.course.c.inside(nx, nz) ? 0 : R.course.out + dt;
    if (R.course.out > 6 || time - R.course.t0 > 240) { endCourse(false); toast('A kör megszakadt.'); }
  }
  R.px = R.x; R.pz = R.z; R.x = nx; R.z = nz;

  pickups(dt);

  // energia és állapot
  const g = R.gait;
  const drain = { stand: -6, walk: -5, trot: -0.8, canter: 0.6, gallop: 7 }[g];
  const maxE = 40 + 0.6 * Math.min(S.stats.food, S.stats.water);
  R.energy = clamp(R.energy - drain * dt, 0, maxE);
  const st = S.stats;
  const inWater = depth > 0.05;
  st.food = clamp(st.food - dt * (0.05 + (g === 'gallop' ? 0.08 : 0)) + (horse.grazing ? dt * 0.6 : 0), 0, 100);
  st.water = clamp(st.water - dt * (0.06 + (g === 'gallop' || g === 'canter' ? 0.06 : 0)) + (R.drink > 0 ? dt * 14 : 0), 0, 100);
  st.clean = clamp(st.clean - dt * (0.02 + (R.v > 5 ? 0.08 : 0) + (inWater && R.v > 1 ? 0.25 : 0)), 0, 100);
  const tgtMood = (st.food + st.water + st.clean) / 3 + 15;
  st.mood = clamp(st.mood + (tgtMood - st.mood) * 0.004 * dt, 0, 100);
  if (R.drink > 0) { R.drink -= dt; if (R.drink <= 0) toast('Jólesett neki a friss víz! 💧', 'good'); }
  horse.setDirt(dirtOf(st.clean));
  if (st.food < 20) msgOnce('hungry', `${S.name} éhes! Legeltesd (állj meg vele), vagy etesd meg az istállóban.`, 60);
  if (st.water < 20) msgOnce('thirsty', `${S.name} szomjas! Itasd meg a tónál vagy az istállónál.`, 60);
}

// ---------- gyalog ----------
function footUpdate(dt) {
  if (R.pose) { R.v = 0; R.pose.t += dt; return; }
  const k = readKeys();
  let jx = input.jx, jy = input.jy, m = input.m, run = input.gallop;
  if (k) { jx = k.jx; jy = k.jy; m = k.m; run = run || k.gallop; }
  let vt = 0;
  if (m > 0.12) {
    const fx = Math.sin(cam.yaw), fz = Math.cos(cam.yaw), rx = -Math.cos(cam.yaw), rz = Math.sin(cam.yaw);
    const desired = input.absYaw != null ? input.absYaw : Math.atan2(fx * jy + rx * jx, fz * jy + rz * jx);
    R.yaw = dampAngle(R.yaw, desired, 11, dt);
    vt = run || m > 0.88 ? 4.0 : lerp(0.8, 1.7, clamp((m - 0.12) / 0.6, 0, 1));
    if (R.mode === 'house') vt = Math.min(vt, 2.0);
  }
  R.v = damp(R.v, vt, vt > R.v ? 7 : 12, dt);
  const fx = Math.sin(R.yaw), fz = Math.cos(R.yaw);
  let nx = R.x + fx * R.v * dt, nz = R.z + fz * R.v * dt;
  const hC = world.heightAt(R.x, R.z), hN = world.heightAt(nx, nz), steep = (hN - hC) / Math.max(R.v * dt, 1e-3);
  if (WATER - hN > 0.45 || Math.abs(nx) > HALF - 18 || Math.abs(nz) > HALF - 18 || steep > 1.4) { nx = R.x; nz = R.z; if (WATER - hN > 0.45) msgOnce('deep', 'Ott már túl mély a víz!'); }
  const p = { x: nx, z: nz }; world.resolve(p, 0.27, 0, 'foot'); pushFromHorses(p, 0.3, -1); nx = p.x; nz = p.z;
  R.px = R.x; R.pz = R.z; R.x = nx; R.z = nz;
  setIndoors(house.contains(R.x, R.z));
  if (R.mode === 'foot') pickups(dt);
  // lépések hangja
  const ph = rider.wph || 0, step = Math.floor(ph * 2);
  if (R.v > 0.4 && step !== R.lastStep) { R.lastStep = step; if (sound.ctx) sound.hoof(R.mode === 'house' ? 'hard' : surfaceAt(R.x, R.z), 0.6, 0.25); }
}

// saját lovak, amelyeket nem R mozgat: boxban, kikötve, kint legelnek vagy vezetjük őket
function updateOwned(dt) {
  if (!S) return;
  const cx = camera.position.x, cz = camera.position.z;
  for (let i = 0; i < herd.length; i++) {
    const e = herd[i], d = S.horses[i], h = e.h;
    if (!d) { h.root.visible = false; continue; }
    if (i === S.cur && (R.mode === 'ride' || R.mode === 'care' || R.mode === 'title')) { e.driven = true; h.root.visible = true; h.setStall(false); h.setShadow(true); h.setDetail(true); continue; }
    e.driven = false;
    let x, z, yaw, mode = 'ride';
    if (d.loc === 'stall') { const st = props.stalls[i]; x = st.x; z = st.z; yaw = st.yaw; mode = 'care'; e.v = 0; }
    else if (d.loc === 'tie') { x = TIE.x; z = TIE.z; yaw = Math.PI / 2; mode = 'care'; e.v = 0; }
    else {
      if (R.lead === i) {
        const dx = R.x - d.x, dz = R.z - d.z, dd = Math.hypot(dx, dz);
        if (dd > 30 || R.mode !== 'foot') stopLead();
        const want = dd > 2.4 ? clamp((dd - 2.1) * 1.7, 0, Math.max(R.v + 1.2, 1.8)) : 0;
        e.v = damp(e.v, want, 3.5, dt);
        if (e.v > 0.15) d.yaw = dampAngle(d.yaw, Math.atan2(dx, dz), 3.2, dt);
        const p = { x: d.x + Math.sin(d.yaw) * e.v * dt, z: d.z + Math.cos(d.yaw) * e.v * dt };
        world.resolve(p, 0.45, 0); d.x = p.x; d.z = p.z;
      } else e.v = damp(e.v, 0, 4, dt);
      x = d.x; z = d.z; yaw = d.yaw;
    }
    const inStall = d.loc === 'stall', dc = Math.hypot(x - cx, z - cz), vis = dc < (inStall ? 70 : 150) && !(R.mode === 'house' && dc > 60);
    h.root.visible = vis; e.reins.forEach((r) => (r.mesh.visible = vis && h.tack.bridle.visible && dc < 45 && !inStall));
    if (!vis) continue;
    h.setDetail(dc < 30); h.setStall(inStall); h.setShadow(!inStall && dc < 45);
    const fx = Math.sin(yaw), fz = Math.cos(yaw), gy = groundY(x, z);
    const hf = groundY(x + fx * 0.8, z + fz * 0.8), hb = groundY(x - fx * 0.75, z - fz * 0.75);
    h.root.position.set(x, Math.max(gy, (hf + hb) / 2 - 0.02), z); h.root.rotation.set(Math.atan2(hb - hf, 1.55), yaw, 0);
    // a boxban álló lovak néha kinéznek, fejüket mozgatják
    e.lookT -= dt; if (e.lookT < 0) { e.lookT = 2 + Math.random() * 5; e.look = (Math.random() - 0.5) * 0.9; e.nod = Math.random() < 0.3 ? 1 : 0; }
    if (dc < 80 || (e.skip = !e.skip)) {
      const g = e.v > 5.5 ? 'canter' : e.v > 2.7 ? 'trot' : e.v > 0.12 ? 'walk' : 'stand';
      h.update(dt * (dc < 80 ? 1 : 2), { gait: g, v: e.v, yawRate: 0, jumpT: -1, mode, headDown: 0, chew: false, nod: mode === 'care' ? e.nod * 0.4 : 0, liftLeg: -1, liftAmt: 0, lookYaw: mode === 'care' ? e.look : 0 });
      h.placeStirrups(null);
      if (dc < 45 && h.tack.bridle.visible && !inStall) restReins(e, R.lead === i);
    }
  }
}
function restReins(e, led) {
  const h = e.h;
  for (let k = 0; k < 2; k++) {
    const a = h.bitWorld(k, tmpV.clone());
    let b, sag = 0.12;
    if (led && k === 0) { b = rider.handWorld(1, new THREE.Vector3()); sag = 0.35; }
    else { const s = h.neckSmp[3]; b = h.neck.localToWorld(s.p.clone().addScaledVector(s.U, s.ry + 0.01).addScaledVector(s.S, (k === 0 ? 1 : -1) * 0.02)); }
    const pts = []; for (let q = 0; q <= 10; q++) { const t = q / 10, p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * sag; pts.push(p); }
    e.reins[k].update(pts);
  }
}
// lovak teste két körrel: a gyalogos és a lovagolt ló nem megy át rajtuk
const bodyC = [];
function horseBodies(skip) {
  bodyC.length = 0;
  const add = (x, z, yaw, sc = 1) => { const fx = Math.sin(yaw), fz = Math.cos(yaw); bodyC.push({ ax: x - fx * 0.7 * sc, az: z - fz * 0.7 * sc, bx: x + fx * 0.85 * sc, bz: z + fz * 0.85 * sc, x, z, r: 0.42 * sc }); };
  if (S) S.horses.forEach((d, i) => {
    if (i === skip || d.loc === 'stall') return;
    if (i === S.cur && (R.mode === 'ride' || R.mode === 'care' || R.mode === 'title')) return;
    if (d.loc === 'tie') add(TIE.x, TIE.z, Math.PI / 2); else if (d.loc === 'out') add(d.x, d.z, d.yaw);
  });
  for (const w of fauna.wild) if (w.h.root.visible) add(w.x, w.z, w.h.root.rotation.y, w.scale);
  return bodyC;
}
function pushFromHorses(p, r, skip) {
  let hit = false;
  for (const c of horseBodies(skip)) {
    if (Math.abs(p.x - c.x) > 3 || Math.abs(p.z - c.z) > 3) continue;
    // legközelebbi pont a ló testének szakaszán
    const sx = c.bx - c.ax, sz = c.bz - c.az, t = clamp(((p.x - c.ax) * sx + (p.z - c.az) * sz) / (sx * sx + sz * sz), 0, 1);
    const qx = c.ax + sx * t, qz = c.az + sz * t, dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz), m = r + c.r;
    if (d < m && d > 1e-4) { p.x = qx + dx / d * m; p.z = qz + dz / d * m; hit = true; }
  }
  return hit;
}
function nearestOwn(x, z, maxD = 2.8) {
  let best = -1, bd = maxD;
  S.horses.forEach((d, i) => { if (d.loc !== 'out' && d.loc !== 'tie') return; const hx = d.loc === 'tie' ? TIE.x : d.x, hz = d.loc === 'tie' ? TIE.z : d.z; const dd = Math.hypot(hx - x, hz - z); if (dd < bd) { bd = dd; best = i; } });
  return best;
}

function pickups(dt) {
  // aranypatkók
  for (const it of props.horseshoes.items) {
    if (it.taken) continue;
    if (Math.abs(it.x - R.x) < 2.3 && Math.abs(it.z - R.z) < 2.3 && Math.hypot(it.x - R.x, it.z - R.z) < 2.3) {
      it.taken = true; S.shoes.push(it.id); addCoins(5); sound.coin();
      for (let i = 0; i < 18; i++) parts.star.emit(tmpV.set(it.x, it.y, it.z), (Math.random() - 0.5) * 4, Math.random() * 3, (Math.random() - 0.5) * 4, 1, 0.25, new THREE.Color('#ffd54a'), -2, 0);
      const n = S.shoes.length, tot = props.horseshoes.items.length;
      if (n === tot) { addCoins(50); toast(`Mind a ${tot} aranypatkó megvan! +50 érme 🏆`, 'gold'); sound.success(); }
      else toast(`Aranypatkó! +5 érme (${n}/${tot})`, 'gold');
      save();
    }
  }

  // virágok, alma, répa
  for (const f of props.flowers) {
    if (f.taken || Math.abs(f.x - R.x) > 2.6 || Math.abs(f.z - R.z) > 2.6) continue;
    if (Math.hypot(f.x - R.x, f.z - R.z) < 2.4) {
      f.taken = true; S.flowers.push(f.id); addCoins(3); sound.coin();
      const F = props.FLOWERS[f.sp], have = props.flowers.filter((q) => q.sp === f.sp && q.taken).length, all = props.flowers.filter((q) => q.sp === f.sp).length;
      for (let i = 0; i < 12; i++) parts.star.emit(tmpV.set(f.x, f.y + 0.8, f.z), (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3, 0.9, 0.2, new THREE.Color(F.petal), -2, 0);
      toast(`${F.name} a gyűjteménybe! (${have}/${all}) +3 érme`, 'gold'); save();
    }
  }
  for (const a of [...props.apples, ...props.carrots]) {
    if (a.taken || Math.abs(a.x - R.x) > 2.2 || Math.abs(a.z - R.z) > 2.2) continue;
    if (Math.hypot(a.x - R.x, a.z - R.z) < 2.0) { a.taken = true; a.back = time + 150; S.inv[a.kind]++; sound.munch(); toast(a.kind === 'alma' ? `Felvettél egy almát! 🍎 (${S.inv.alma} db)` : `Kihúztál egy répát! 🥕 (${S.inv.repa} db)`, 'good'); }
  }
  R.lmT = (R.lmT || 0) - dt;
  if (R.lmT <= 0) {
    R.lmT = 0.5;
    for (const L of props.landmarks) if (!S.found.includes(L.key) && Math.hypot(L.x - R.x, L.z - R.z) < L.r) {
      S.found.push(L.key); addCoins(10); sound.success();
      toast(`Felfedezted: ${L.name}! +10 érme (${S.found.length}/${props.landmarks.length})`, 'gold'); save();
    }
  }

}

function dbg(t) { const l = R.log || (R.log = []); l.push(t); if (l.length > 60) l.shift(); }
function msgOnce(key, txt, cool = 4) { if ((R.msgCool[key] || -99) + cool < time) { R.msgCool[key] = time; toast(txt); } }
function dustColor(x, z) { return world.inArena(x, z) ? new THREE.Color('#cdb48a') : world.inYard(x, z) ? new THREE.Color('#a89c88') : new THREE.Color('#9b8263'); }
function surfaceAt(x, z) {
  if (WATER - world.heightAt(x, z) > 0.02 || world.creekDist(x, z) < 1.7 || Math.hypot(x - world.pool.x, z - world.pool.z) < 5.5) return 'water';
  if (world.canyonDist(x, z) < 9) return 'hard';
  if (world.inArena(x, z)) return 'sand'; if (world.inYard(x, z)) return 'hard';
  if (world.pathDist(x, z) < 1.8) return 'sand'; return 'grass';
}

// ---------- gondozás ----------
let hayMesh, bucket;
function careProps() {
  if (hayMesh) return;
  const hg = new THREE.Group();
  for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(0.22 + Math.random() * 0.08, 0), props.hayMat); s.position.set((Math.random() - 0.5) * 0.45, 0.1 + Math.random() * 0.08, (Math.random() - 0.5) * 0.45); s.scale.y = 0.55; s.castShadow = true; hg.add(s); }
  hayMesh = hg; hayMesh.visible = false; scene.add(hayMesh);
  const bg = new THREE.Group();
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.16, 0.3, 18, 1, true), new THREE.MeshStandardMaterial({ color: '#2f6fd0', roughness: 0.5, side: THREE.DoubleSide })); b.position.y = 0.15; b.castShadow = true; bg.add(b);
  const bot = new THREE.Mesh(new THREE.CircleGeometry(0.16, 18), b.material); bot.rotation.x = -Math.PI / 2; bot.position.y = 0.01; bg.add(bot);
  const fill = new THREE.Mesh(new THREE.CircleGeometry(0.19, 18), new THREE.MeshStandardMaterial({ color: '#4a8fb0', roughness: 0.1 })); fill.rotation.x = -Math.PI / 2; fill.position.y = 0.24; bg.add(fill);
  bucket = { g: bg, fill, body: b }; bg.visible = false; scene.add(bg);
}

function enterCare() {
  if (R.course.active) endCourse(false);
  leaveHouse(); stopLead();
  for (const h of S.horses) if (h.loc === 'tie' || h.loc === 'ride') h.loc = h === S.horses[S.cur] ? 'tie' : 'stall';
  S.horses[S.cur].loc = 'tie';
  R.mode = 'care'; R.pose = null; placeHorseAtTie(); R.brush = false; R.careAct = null; R.drink = 0;
  cam.yaw = Math.PI + 0.35; cam.pitch = 0.22; cam.zoom = 1; cam.user = 9;
  cam.target.set(TIE.x, 1.25, TIE.z);
  $('hud').classList.add('hide'); $('care').classList.remove('hide'); $('title').classList.add('hide');
  input.jx = input.jy = input.m = 0;
  $('hname').textContent = S.name; $('careName').textContent = S.name;
  careProps(); setTab(curTab === 'horses' ? 'horses' : 'care'); updateCareStats();
  save();
}

function mount() {
  if (!S.tack.saddle || !S.tack.bridle) { toast('Előbb tedd fel a nyerget és a kantárt!', 'bad'); setTab('tack'); return; }
  if (R.careAct) return;
  if (S.tack.blanket) { S.tack.blanket = null; horse.setTack(S.tack); toast('A takarót levetted, indulhattok!'); }
  R.brush = false; $('careHint').classList.add('hide');
  R.x = TIE.x + 0.4; R.z = TIE.z + 2.6; R.yaw = 0.85; R.px = R.x; R.pz = R.z; R.v = 0;
  startRide();
  if (hayMesh) hayMesh.visible = false; if (bucket) bucket.g.visible = false;
  S.tut.done = true;
  if (!S.tut.ride) {
    S.tut.ride = true;
    setTimeout(() => modal(`<h2>Irányítás</h2><ul>
      <li><b>Jobb oldal:</b> húzd az ujjad arra, amerre menni szeretnél. Kicsit = <b>lépés</b>, félig = <b>ügetés</b>, teljesen = <b>vágta</b>.</li>
      <li><b>Galopp gomb:</b> tartsd nyomva a leggyorsabb vágtához (fárasztó).</li>
      <li><b>Ugrás gomb:</b> nyomd meg az akadály előtt, a ló a megfelelő helyen elrugaszkodik.</li>
      <li><b>Bal oldal és a kép többi része:</b> húzással körbenézhetsz. A <b>Galopp</b> és az <b>Ugrás</b> gomb bal oldalt van.</li>
      <li><b>Leszállás:</b> ha megállsz, alul megjelenik a <b>Leszállok</b> gomb. A ló ott marad és legel, bármikor visszaülhetsz.</li>
      <li>Gyűjtsd össze az <b>aranypatkókat</b>, és próbáld ki a <b>díjugrató pályát</b>: lovagolj át a zöld START kapun!</li></ul>
      <button class="big" data-close>Indulás!</button>`), 300);
  }
  sound.snort(); save();
}
// lóra ülés (bárhonnan): R a ló helyzetét veszi át
function startRide() {
  stopLead(); leaveHouse();
  const d = S.horses[S.cur];
  d.loc = 'ride'; R.mode = 'ride'; R.pose = null; R.jump.active = false; R.jump.queued = null; R.lift = 0; R.refuse = 0; R.drink = 0;
  horse = herd[S.cur].h; rider.attach(horse);
  cam.yaw = R.yaw; cam.pitch = 0.26; cam.user = 9; cam.target.set(R.x, 1.9, R.z);
  $('care').classList.add('hide'); $('hud').classList.remove('hide'); $('hud').classList.remove('foot'); $('title').classList.add('hide');
  $('hname').textContent = S.name;
}
function mountHorse(i) {
  const d = S.horses[i]; if (!d) return;
  if (!d.tack.saddle || !d.tack.bridle) { toast(`${d.name} nincs felnyergelve. Vezesd az istállóhoz, és ott nyergeld fel!`, 'bad'); return; }
  S.cur = i; horse = herd[i].h;
  if (d.loc === 'tie') { d.x = TIE.x; d.z = TIE.z; d.yaw = Math.PI / 2; }
  R.x = d.x; R.z = d.z; R.yaw = d.yaw; R.px = R.x; R.pz = R.z; R.v = 0; R.yawRate = 0;
  startRide(); sound.snort(); save();
}
function dismount() {
  if (R.mode !== 'ride') return;
  if (R.course.active) endCourse(false);
  const d = S.horses[S.cur]; d.loc = 'out'; d.x = R.x; d.z = R.z; d.yaw = R.yaw;
  const e = herd[S.cur]; e.v = 0;
  // a lovas a ló bal oldalára száll le
  const lx = -Math.cos(R.yaw), lz = Math.sin(R.yaw);
  goFoot(R.x + lx * 1.15, R.z + lz * 1.15, R.yaw);
  toast(`Leszálltál. ${d.name} itt marad és legel.`);
  save();
}
function goFoot(x = R.x, z = R.z, yaw = R.yaw) {
  rider.detach(walker); rider.setHelmet(true);
  R.mode = 'foot'; R.pose = null; R.x = x; R.z = z; R.yaw = yaw; R.v = 0; R.px = x; R.pz = z; R.lift = 0; R.jump.active = false;
  const p = { x, z }; world.resolve(p, 0.3, 0); R.x = p.x; R.z = p.z;
  $('care').classList.add('hide'); $('hud').classList.remove('hide'); $('hud').classList.add('foot'); $('title').classList.add('hide'); $('careHint').classList.add('hide');
  if (hayMesh) hayMesh.visible = false; if (bucket) bucket.g.visible = false;
  cam.user = 9;
}
// gondozásból gyalog: a ló kikötve marad
function walkFromCare() {
  if (R.careAct) return;
  R.brush = false;
  S.horses[S.cur].loc = 'tie';
  goFoot(TIE.x - 1.3, TIE.z + 1.6, 0.3);
  cam.yaw = 0.3; cam.pitch = 0.3;
}
function stopLead() { R.lead = -1; }
function toStall(i) {
  const d = S.horses[i]; if (!d) return;
  if (R.mode === 'ride' && i === S.cur) {
    const st = props.stalls[i]; d.loc = 'stall';
    goFoot(st.x + 1.2, st.z + 3.2, Math.PI);
  } else d.loc = 'stall';
  if (R.lead === i) stopLead();
  d.stats.water = Math.max(d.stats.water, 60); d.stats.food = Math.max(d.stats.food, 50);
  toast(`${d.name} a boxában pihen. 🐴`, 'good'); sound.nicker(); save();
}
// ló választása a kikötőhöz (gondozás)
function chooseHorse(i) {
  if (!S.horses[i] || R.careAct) return;
  const old = S.horses[S.cur]; if (old.loc === 'tie' || old.loc === 'ride') old.loc = 'stall';
  S.cur = i; horse = herd[i].h; S.horses[i].loc = 'tie';
  if (R.lead === i) stopLead();
  placeHorseAtTie(); horse.setDirt(dirtOf(S.stats.clean));
  $('hname').textContent = S.name; $('careName').textContent = S.name;
  sound.nicker(); renderPane(); updateCareStats(); save();
}
function addHorse(name, coat, blaze = true, socks = false) {
  if (S.horses.length >= MAX_HORSES) { toast('Az istállóban csak 6 ló fér el.'); return false; }
  S.horses.push(newHorseData(name, coat, { blaze, socks })); syncHerd(); save();
  toast(`${name} beköltözött a(z) ${S.horses.length}. boxba! 🎉`, 'gold'); sound.success();
  return true;
}

// ---------- ház ----------
function setIndoors(on) {
  if (on === (R.mode === 'house')) return;
  R.mode = on ? 'house' : 'foot'; house.setInside(on); rider.setHelmet(!on);
  if (!on) { standUp(true); house.setTV(false); }
  if (on) stopLead();
}
function enterHouse() {
  stopLead(); R.pose = null;
  const p = house.toWorld(house.doorIn.x, house.doorIn.z); R.x = p.x; R.z = p.z; R.yaw = Math.PI; R.v = 0;
  if (R.mode !== 'foot' && R.mode !== 'house') goFoot(p.x, p.z, Math.PI);
  setIndoors(true); cam.yaw = Math.PI; cam.pitch = 0.2; cam.user = 9; cam.target.set(R.x, house.floorY() + 1.45, R.z);
}
function exitHouse() {
  const p = house.toWorld(house.doorOut.x, house.doorOut.z); R.x = p.x; R.z = p.z; R.yaw = 0; R.v = 0;
  setIndoors(false); cam.yaw = 0; cam.pitch = 0.28; cam.user = 9;
}
function leaveHouse() { if (R.mode === 'house' || house.inside) { standUp(true); house.setInside(false); house.setTV(false); rider.setHelmet(true); } }
function sitOn(key) {
  const sp = house.spots[key]; if (!sp) return;
  const w = house.toWorld(sp.x, sp.z);
  R.pose = { kind: sp.kind, key, x: w.x, z: w.z, yaw: sp.yaw, y: sp.y || 0, t: 0 }; R.v = 0;
  cam.yaw = sp.yaw + (sp.kind === 'lie' ? Math.PI * 0.6 : Math.PI); cam.pitch = sp.kind === 'lie' ? 0.75 : 0.3; cam.user = 0;
  if (key === 'sofa') house.setTV(true);
  if (key === 'fridge') { R.pose = null; fridge(); }
  if (key === 'tub') sound.splash && sound.splash();
}
function standUp(silent) {
  if (!R.pose) return; const k = R.pose.key; R.pose = null; house.setTV(false);
  if (!silent && k) { const sp = house.spots[k]; const w = house.toWorld(sp.x, sp.z); R.x = w.x + Math.sin(sp.yaw) * 0.75; R.z = w.z + Math.cos(sp.yaw) * 0.75; if (k === 'bed') { R.x = w.x + 1.15; R.z = w.z + 0.3; } if (k === 'tub') { R.x = w.x - 0.4; R.z = w.z + 0.95; } }
}
function fridge() {
  if (S.fridgeDay === S.day) { toast('A hűtőben most nincs több alma. Holnap reggelre lesz!'); return; }
  S.fridgeDay = S.day; S.inv.alma += 2; S.inv.repa += 2; sound.munch();
  toast('A hűtőből: 2 alma 🍎 és 2 répa 🥕 a lovaknak!', 'good'); save();
}
function sleep() {
  fadeFlash(1.6);
  setTimeout(() => {
    S.day++; setTod(7.5, S.todAuto);
    for (const h of S.horses) if (h.loc === 'stall') { h.stats.food = Math.max(h.stats.food, 80); h.stats.water = Math.max(h.stats.water, 80); h.stats.mood = Math.min(100, h.stats.mood + 10); }
    R.energy = 100; toast('Jó reggelt! ☀️ A boxban álló lovak éjjel szénát és vizet kaptak.', 'gold'); save();
  }, 700);
}
function fadeFlash(dur = 0.8) { const f = $('fade'); f.style.transition = 'none'; f.style.opacity = '1'; requestAnimationFrame(() => requestAnimationFrame(() => { f.style.transition = `opacity ${dur}s`; f.style.opacity = '0'; })); }
function setTod(h, auto) { S.tod = ((h % 24) + 24) % 24; if (auto !== undefined) S.todAuto = auto; }
function setSeason(k) { S.season = k; env.setSeason(k); grass.last.set(1e9, 1e9); save(); }

const ACTIONS = [
  { id: 'brush', ico: ICON.brush, name: 'Csutakolás', sub: 'húzd a lovon' },
  { id: 'hoof', ico: ICON.hoof, name: 'Patakaparás', sub: '' },
  { id: 'hay', ico: '🌾', name: 'Széna', sub: 'ingyen' },
  { id: 'water', ico: '💧', name: 'Víz', sub: 'ingyen' },
  { id: 'oats', ico: '🥣', name: 'Zab', sub: '3 érme', cost: 3 },
  { id: 'apple', ico: '🍎', name: 'Alma', sub: '1 érme', cost: 1, inv: 'alma' },
  { id: 'carrot', ico: '🥕', name: 'Répa', sub: '1 érme', cost: 1, inv: 'repa' },
  { id: 'pet', ico: '❤️', name: 'Simogatás', sub: 'koppints rá' },
];
let curTab = 'care';
function setTab(t) {
  curTab = t;
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === t));
  renderPane();
}
function chip(label, on, attrs, color) {
  return `<button class="chip ${color && !label ? 'sw' : ''} ${on ? 'on' : ''}" ${attrs}>${color ? `<span class="dot" style="background:${color}"></span>` : ''}${label || ''}</button>`;
}
function renderPane() {
  const P = $('carePane'); let h = '';
  if (curTab === 'care') {
    if (!S.tut.done) {
      const t = S.tut; const it = (ok, txt) => `<div class="${ok ? 'ok' : ''}">${ok ? '✅' : '⬜'} ${txt}</div>`;
      h += `<div id="tut" class="panel" style="margin-bottom:8px;box-shadow:none;background:#fff6e6"><h5>Első lépések</h5>
        ${it(t.fed, 'Adj neki szénát')}${it(t.water, 'Adj neki vizet')}${it(t.brush, 'Csutakold tisztára (✨ 80% fölé)')}${it(S.tack.saddle && S.tack.bridle, 'Nyergeld fel (Felszerelés fül)')}</div>`;
    }
    h += '<div class="agrid">' + ACTIONS.map((a) => `<button class="act ${a.id === 'brush' && R.brush ? 'on' : ''}" data-act="${a.id}" ${R.careAct || (a.cost && S.coins < a.cost && !(a.inv && S.inv[a.inv] > 0)) ? 'disabled' : ''}><i>${a.ico}</i>${a.name}<small>${a.inv && S.inv[a.inv] > 0 ? S.inv[a.inv] + ' db' : a.sub}</small></button>`).join('') + '</div>';
  } else if (curTab === 'tack') {
    const T = S.tack;
    const sec = (title, key, opts) => `<div class="opt"><h4>${title}</h4><div class="chips">${opts}</div></div>`;
    const leather = (key) => chip('Nincs', !T[key], `data-tack="${key}" data-v=""`) + Object.entries(SADDLES).map(([k, c]) => chip({ barna: 'Barna', fekete: 'Fekete', konyak: 'Konyak' }[k], T[key] === k, `data-tack="${key}" data-v="${k}"`, c)).join('');
    const pal = (key) => chip('Nincs', !T[key], `data-tack="${key}" data-v=""`) + Object.entries(PALETTE).map(([k, p]) => chip('', T[key] === k, `data-tack="${key}" data-v="${k}" aria-label="${p.name}"`, p.c)).join('');
    h += sec('Nyereg', 'saddle', leather('saddle')) + sec('Kantár', 'bridle', leather('bridle')) + sec('Nyeregalátét', 'pad', pal('pad')) + sec('Fásli (lábvédő)', 'wraps', pal('wraps')) + sec('Takaró (csak az istállóban)', 'blanket', pal('blanket'));
  } else if (curTab === 'horses') {
    if (R.nh) {
      const N = R.nh;
      h += `<div class="opt"><h4>Új ló neve</h4><input class="namein" id="nhName" maxlength="16" value="${esc(N.name)}"></div>`;
      h += `<div class="opt"><h4>Szőrszín</h4><div class="chips">${Object.entries(COATS).map(([k, c]) => chip(c.name, N.coat === k, `data-nhc="${k}"`, c.patch ? `linear-gradient(135deg,${c.base} 50%,${c.patch} 50%)` : c.base)).join('')}</div></div>`;
      h += `<div class="opt"><h4>Jegyek</h4><div class="chips">${chip('Hóka a homlokán', N.blaze, 'data-nhf="blaze"')}${chip('Fehér zokni', N.socks, 'data-nhf="socks"')}</div></div>`;
      h += `<div style="display:flex;gap:8px"><button class="big alt" data-nhok style="flex:2">✔️ Beköltözik</button><button class="big ghost" data-nhcancel style="flex:1">Mégse</button></div>`;
    } else {
      const loc = (d, i) => d.loc === 'stall' ? `${i + 1}. boksz` : d.loc === 'tie' ? 'A kikötőnél' : d.loc === 'out' ? `Kint legel (${Math.round(Math.hypot(d.x - TIE.x, d.z - TIE.z))} m)` : 'Nyeregben';
      const bar = (v) => `<b><s style="width:${v.toFixed(0)}%;${v < 25 ? 'background:#e0533d' : ''}"></s></b>`;
      h += '<div class="hlist">' + S.horses.map((d, i) => {
        const c = COATS[d.coat] || COATS.pej, sw = c.patch ? `linear-gradient(135deg,${c.base} 50%,${c.patch} 50%)` : c.base;
        return `<div class="hrow ${i === S.cur ? 'on' : ''}"><span class="hdot" style="background:${sw}"></span><div class="hinfo"><b>${esc(d.name)}</b><small>${loc(d, i)}</small><div class="hbars">${['food', 'water', 'clean', 'mood'].map((k) => bar(d.stats[k])).join('')}</div></div>${i === S.cur ? '<span class="here">Itt van</span>' : `<button class="chip" data-pick="${i}">Kihozom</button>`}</div>`;
      }).join('') + '</div>';
      h += S.horses.length < MAX_HORSES ? `<button class="big alt" data-newh>＋ Új ló (${S.horses.length}/${MAX_HORSES})</button>` : '<p style="text-align:center;font-weight:700;color:#777">Mind a 6 boksz foglalt.</p>';
    }
  } else {
    h += `<div class="opt"><h4>A lovad neve</h4><input class="namein" id="nameIn" maxlength="16" value="${esc(S.name)}"></div>`;
    h += `<div class="opt"><h4>Szőrszín</h4><div class="chips">${Object.entries(COATS).map(([k, c]) => chip(c.name, S.coat === k, `data-coat="${k}"`, c.patch ? `linear-gradient(135deg,${c.base} 50%,${c.patch} 50%)` : c.base)).join('')}</div></div>`;
    h += `<div class="opt"><h4>Jegyek</h4><div class="chips">${chip('Hóka a homlokán', S.blaze, 'data-flag="blaze"')}${chip('Fehér zokni', S.socks, 'data-flag="socks"')}</div></div>`;
    const jc = ['#1f2f5c', '#2f63d6', '#d23a33', '#8a55d0', '#f27aaa', '#2e9a58', '#21b3ae', '#222222', '#f4f2ec'];
    h += `<div class="opt"><h4>Lovas kabátja</h4><div class="chips">${jc.map((c) => chip('', S.rider.jacket === c, `data-rider="jacket" data-v="${c}"`, c)).join('')}</div></div>`;
    h += `<div class="opt"><h4>Lovas sisakja</h4><div class="chips">${['#1d1d22', '#1f2f5c', '#f4f2ec', '#f27aaa', '#8a55d0', '#d23a33', '#c9a13a'].map((c) => chip('', S.rider.helmet === c, `data-rider="helmet" data-v="${c}"`, c)).join('')}</div></div>`;
    h += `<div class="opt"><h4>Lovas haja</h4><div class="chips">${Object.entries(HAIR).map(([k, c]) => chip({ barna: 'Barna', szoke: 'Szőke', fekete: 'Fekete', voros: 'Vörös' }[k], S.rider.hair === k, `data-rider="hair" data-v="${k}"`, c)).join('')}</div></div>`;
  }
  P.innerHTML = h;
  const ni = $('nameIn'); if (ni) ni.addEventListener('input', () => { S.name = ni.value.trim() || 'Csillag'; $('hname').textContent = S.name; $('careName').textContent = S.name; props.setPlate(S.cur, S.name); save(); });
  const nn = $('nhName'); if (nn) nn.addEventListener('input', () => { R.nh.name = nn.value.trim(); });
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function careClick(e) {
  const b = e.target.closest('button'); if (!b) return;
  sound.init();
  if (b.dataset.act) return doAction(b.dataset.act);
  if (b.dataset.tack !== undefined) {
    const k = b.dataset.tack, v = b.dataset.v || null; S.tack[k] = v; horse.setTack(S.tack);
    if (S.tack.saddle && S.tack.bridle) S.tut.tack = true;
    sound.tone({ f: 660, dur: 0.08, vol: 0.1, type: 'triangle' }); renderPane(); save(); return;
  }
  if (b.dataset.coat) { S.coat = b.dataset.coat; horseLook(S.cur); renderPane(); save(); return; }
  if (b.dataset.flag) { S[b.dataset.flag] = !S[b.dataset.flag]; horseLook(S.cur); renderPane(); save(); return; }
  if (b.dataset.pick !== undefined) { chooseHorse(+b.dataset.pick); return; }
  if (b.dataset.newh !== undefined) { const names = ['Villám', 'Hópihe', 'Szellő', 'Bogár', 'Csoki', 'Mazsola', 'Pötty', 'Zserbó', 'Fecske', 'Mókus']; R.nh = { name: names.find((n) => !S.horses.some((d) => d.name === n)) || 'Paci', coat: ['sarga', 'szurke', 'fekete', 'palomino', 'tarka', 'almas'][S.horses.length % 6], blaze: Math.random() < 0.5, socks: Math.random() < 0.4 }; renderPane(); return; }
  if (b.dataset.nhc) { R.nh.coat = b.dataset.nhc; renderPane(); return; }
  if (b.dataset.nhf) { R.nh[b.dataset.nhf] = !R.nh[b.dataset.nhf]; renderPane(); return; }
  if (b.dataset.nhcancel !== undefined) { R.nh = null; renderPane(); return; }
  if (b.dataset.nhok !== undefined) { const N = R.nh; R.nh = null; if (addHorse(N.name || 'Paci', N.coat, N.blaze, N.socks)) chooseHorse(S.horses.length - 1); renderPane(); return; }
  if (b.dataset.rider) { S.rider[b.dataset.rider] = b.dataset.v; rider.setLook(S.rider); renderPane(); save(); }
}

function doAction(id) {
  const a = ACTIONS.find((x) => x.id === id);
  if (R.careAct && id !== 'brush') return;
  if (a.inv && S.inv[a.inv] > 0) S.inv[a.inv]--;
  else if (a.cost) { if (S.coins < a.cost) { toast('Nincs elég érméd. Gyűjts aranypatkót vagy ugorj!'); return; } addCoins(-a.cost); }
  if (id === 'brush') { R.brush = !R.brush; $('careHint').textContent = 'Húzd az ujjad a lovon a csutakoláshoz!'; $('careHint').classList.toggle('hide', !R.brush); renderPane(); return; }
  if (id === 'pet') { toast('Koppints a lovadra a simogatáshoz! ❤️'); return; }
  R.brush = false; $('careHint').classList.add('hide');
  const head = new THREE.Vector3(TIE.x + 1.55, groundY(TIE.x + 1.55, TIE.z), TIE.z);
  const durs = { hoof: 4.6, hay: 5, water: 4, oats: 4, apple: 2.2, carrot: 2.2 };
  R.careAct = { id, t: 0, dur: durs[id] };
  if (id === 'hay') { hayMesh.position.copy(head); hayMesh.scale.setScalar(1); hayMesh.visible = true; }
  if (id === 'water' || id === 'oats') {
    bucket.g.position.copy(head); bucket.g.visible = true; bucket.fill.position.y = 0.24;
    bucket.fill.material.color.set(id === 'water' ? '#4a8fb0' : '#d8b26a'); bucket.body.material.color.set(id === 'water' ? '#2f6fd0' : '#c9453a');
  }
  if (id === 'apple' || id === 'carrot') sound.munch();
  renderPane();
}

function careUpdate(dt) {
  const hs = { mode: R.mode === 'title' ? 'ride' : 'care', headDown: 0, chew: false, nod: 0, liftLeg: -1, liftAmt: 0, lookYaw: 0 };
  if (!S) return hs;
  const st = S.stats; const a = R.careAct;
  if (a) {
    a.t += dt; const p = a.t / a.dur;
    if (a.id === 'hay') { hs.headDown = p < 0.92 ? 1 : 0; hs.chew = true; st.food = Math.min(100, st.food + dt * 8); hayMesh.scale.setScalar(Math.max(0.2, 1 - p * 0.8)); if (Math.random() < dt * 2) sound.munch(); }
    if (a.id === 'water') { hs.headDown = p < 0.9 ? 1 : 0; st.water = Math.min(100, st.water + dt * 13); bucket.fill.position.y = 0.24 - p * 0.18; }
    if (a.id === 'oats') { hs.headDown = p < 0.9 ? 1 : 0; hs.chew = true; st.food = Math.min(100, st.food + dt * 7); st.mood = Math.min(100, st.mood + dt * 1.5); bucket.fill.position.y = 0.24 - p * 0.18; if (Math.random() < dt * 2) sound.munch(); }
    if (a.id === 'apple' || a.id === 'carrot') { hs.chew = true; hs.nod = 0.6; st.mood = Math.min(100, st.mood + dt * 6); st.food = Math.min(100, st.food + dt * 1.5); if (Math.random() < dt * 5) heartsAt(headWorld()); }
    if (a.id === 'hoof') {
      const seg = 1.15, i = Math.floor(a.t / seg), f = (a.t % seg) / seg;
      if (i < 4) { hs.liftLeg = i; hs.liftAmt = Math.sin(Math.PI * clamp(f * 1.15, 0, 1)); if (f > 0.4 && f < 0.6 && Math.random() < dt * 25) { horse.legs[i].hoof.getWorldPosition(tmpV); parts.dust.emit(tmpV, (Math.random() - 0.5), 0.5, (Math.random() - 0.5), 0.8, 0.12, new THREE.Color('#5e4630'), -4, 0); } }
    }
    if (a.t >= a.dur) {
      if (a.id === 'hay') { hayMesh.visible = false; S.tut.fed = true; toast('Megette a szénát! 🌾', 'good'); }
      if (a.id === 'water') { bucket.g.visible = false; S.tut.water = true; toast('Jóllakott vízzel! 💧', 'good'); }
      if (a.id === 'oats') { bucket.g.visible = false; S.tut.fed = true; toast('Nyamm, zab! 🥣', 'good'); }
      if (a.id === 'apple' || a.id === 'carrot') { toast(a.id === 'apple' ? 'Imádta az almát! 🍎' : 'Ropi-ropi, répa! 🥕', 'good'); sound.nicker(); }
      if (a.id === 'hoof') { st.clean = Math.min(100, st.clean + 10); st.mood = Math.min(100, st.mood + 3); toast('A paták tiszták!', 'good'); }
      R.careAct = null; renderPane(); save();
    }
  }
  // fej a kamera felé
  const toCam = Math.atan2(camera.position.x - R.x, camera.position.z - R.z);
  hs.lookYaw = R.mode === 'care' && !a ? clamp(wrapAngle(toCam - R.yaw) * 0.35, -0.45, 0.45) : 0;
  return hs;
}
const headWorld = () => horse.head.localToWorld(tmpV2.set(0, -0.2, 0.25));
function heartsAt(p) { parts.heart.emit(p, (Math.random() - 0.5) * 0.6, 0.8 + Math.random() * 0.5, (Math.random() - 0.5) * 0.6, 1.4, 0.18, new THREE.Color('#ff5a8a'), -0.1, 0.4); }

const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
function hitHorse(x, y) {
  ndc.set(x / innerWidth * 2 - 1, -(y / innerHeight) * 2 + 1); ray.setFromCamera(ndc, camera);
  const h = ray.intersectObjects(horse.meshes, false); return h[0] || null;
}
let brushSnd = 0;
function showBrush(x, y) { const b = $('brushCur'); b.classList.remove('hide'); b.style.left = x + 'px'; b.style.top = y + 'px'; }
function brushAt(x, y, d) {
  showBrush(x, y);
  const h = hitHorse(x, y); if (!h) return;
  const st = S.stats; const before = st.clean;
  st.clean = Math.min(100, st.clean + d * 0.03); st.mood = Math.min(100, st.mood + d * 0.004);
  horse.setDirt(dirtOf(st.clean));
  if (Math.random() < 0.5) parts.dust.emit(h.point, (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.4, (Math.random() - 0.5) * 0.6, 0.9, 0.12, st.clean > 80 ? new THREE.Color('#fff2b0') : new THREE.Color('#8a7356'), -0.3, 1.5);
  if (st.clean > 80 && Math.random() < 0.15) parts.star.emit(h.point, 0, 0.4, 0, 0.7, 0.15, new THREE.Color('#fff3c4'), 0, 0);
  if (time - brushSnd > 0.13) { brushSnd = time; sound.brush(); }
  if (before < 80 && st.clean >= 80) { S.tut.brush = true; toast(`${S.name} ragyog! ✨`, 'good'); renderPane(); horse.happyT = 2; }
  if (before < 100 && st.clean >= 100) { R.brush = false; $('careHint').classList.add('hide'); $('brushCur').classList.add('hide'); renderPane(); }
}
function pet(p) {
  if (time - R.lastPet < 0.5) return; R.lastPet = time;
  for (let i = 0; i < 4; i++) heartsAt(p);
  S.stats.mood = Math.min(100, S.stats.mood + 4); sound.nicker(); horse.happyT = 1.5;
}

// ---------- UI ----------
function setupUI() {
  $('carePane').addEventListener('click', careClick);
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => { sound.init(); setTab(b.dataset.tab); }));
  $('btnMount').addEventListener('click', () => { sound.init(); mount(); });
  $('btnWalk').addEventListener('click', () => { sound.init(); walkFromCare(); });
  $('btnMenu').addEventListener('click', openMenu);
  $('cstop').addEventListener('click', () => { endCourse(false); toast('Kör megszakítva.'); });
  $('mini').addEventListener('click', openBigMap);
  $('bigmap').addEventListener('click', () => $('bigmap').classList.add('hide'));
  $('modal').addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (e.target.id === 'modal') return closeModal();
    if (!b) return; if (b.dataset.close !== undefined) return closeModal();
    const a = b.dataset.m;
    if (a === 'stable') { closeModal(); enterCare(); }
    if (a === 'home') { closeModal(); if (R.mode === 'ride') dismount(); leaveHouse(); const p = house.toWorld(house.doorOut.x, house.doorOut.z + 1.2); goFoot(p.x, p.z, Math.PI); cam.yaw = Math.PI; }
    if (a === 'tod') { const i = (TOD_PRESETS.findIndex((t) => t.k === todKey()) + 1) % TOD_PRESETS.length, t = TOD_PRESETS[i]; if (t.auto) S.todAuto = true; else setTod(t.h, false); save(); openMenu(); }
    if (a === 'season') { const ks = Object.keys(SEASONS); setSeason(ks[(ks.indexOf(S.season) + 1) % ks.length]); openMenu(); }
    if (a === 'arena' || a === 'terep') { closeModal(); if (R.mode !== 'ride') { if (!S.tack.saddle || !S.tack.bridle) { toast('Előbb nyergeld fel a lovat!'); return; } mount(); } const g = props.courses[a === 'arena' ? 0 : 1].start; placeHorse(g.x - g.f.x * 6, g.z - g.f.y * 6, g.yaw); cam.yaw = R.yaw; toast('Lovagolj át a zöld START kapun!'); }
    if (a === 'coll') collectionModal();
    if (a === 'map') { closeModal(); openBigMap(); }
    if (a === 'sound') { S.sound = !S.sound; sound.setOn(S.sound); save(); openMenu(); }
    if (a === 'q') { const o = ['gyors', 'normal', 'szep']; S.quality = o[(o.indexOf(S.quality) + 1) % 3]; applyQuality(S.quality); save(); openMenu(); }
    if (a === 'help') helpModal();
    if (a === 'title') { closeModal(); save(); showTitle(); }
  });
}
function modal(html) { $('modalBox').innerHTML = html; $('modal').classList.remove('hide'); R.paused = true; }
function closeModal() { $('modal').classList.add('hide'); R.paused = false; }
function openMenu() {
  const qn = { gyors: 'Gyors', normal: 'Normál', szep: 'Szép' }[S.quality] || 'Normál';
  modal(`<h2>Menü</h2>
    <button class="big" data-close>▶️ Folytatás</button>
    <button class="big alt" data-m="stable">🐴 Az istállóhoz (gondozás)</button>
    <button class="big alt" data-m="home">🏡 Haza, a házhoz</button>
    <button class="big alt" data-m="arena">🏁 Díjugrató pálya</button>
    <button class="big alt" data-m="terep">🌳 Terepugrató pálya</button>
    <button class="big ghost" data-m="coll">📒 Gyűjtemény</button>
    <button class="big ghost" data-m="map">🗺️ Térkép</button>
    <div style="display:flex;gap:8px"><button class="big ghost" data-m="tod" style="flex:1">${TOD_PRESETS.find((t) => t.k === todKey()).ico} ${TOD_PRESETS.find((t) => t.k === todKey()).name}</button><button class="big ghost" data-m="season" style="flex:1">${SEASONS[S.season].ico} ${SEASONS[S.season].name}</button></div>
    <button class="big ghost" data-m="sound">${S.sound ? '🔊 Hang: be' : '🔇 Hang: ki'}</button>
    <button class="big ghost" data-m="q">⚙️ Grafika: ${qn}</button>
    <button class="big ghost" data-m="help">❓ Súgó</button>
    <button class="big ghost" data-m="title">🚪 Címlap</button>
    ${props.courses.map((c) => S.best[c.key] ? `<p style="text-align:center;margin:8px 0 0">🏆 ${c.name}: ${S.best[c.key].faults} hibapont, ${S.best[c.key].time.toFixed(1)} mp</p>` : '').join('')}`);
}
function todKey() { if (S.todAuto) return 'auto'; let best = TOD_PRESETS[0], bd = 99; for (const t of TOD_PRESETS) if (!t.auto) { const dd = Math.abs(((S.tod - t.h + 36) % 24) - 12); if (dd < bd) { bd = dd; best = t; } } return best.k; }
function helpModal() {
  modal(`<h2>Súgó</h2><ul>
    <li><b>Mozgás:</b> jobb oldalon húzd az ujjad. Kicsit = lépés, félig = ügetés, teljesen = vágta. A <b>Galopp</b> gombot tartsd nyomva a leggyorsabb tempóhoz.</li>
    <li><b>Ugrás:</b> ügetésben vagy vágtában, az akadály előtt nyomd meg. Ha korán nyomod, a ló kivárja a jó elugrási pontot. Ha túl későn, leverheti a rudat.</li>
    <li><b>Kamera:</b> a kép többi részén húzással körbenézel. A Galopp és az Ugrás gomb bal oldalt van.</li>
    <li><b>Energia:</b> a galopp fáraszt. Lépésben vagy állva visszatölt. Jóllakott, itatott ló tovább bírja.</li>
    <li><b>Gondozás:</b> az istállónál etesd, itasd, csutakold. Útközben megállva legel, a tóba besétálva ihat.</li>
    <li><b>Díjugratás:</b> az aréna zöld START kapuján át indul az idő. Ugord át sorban az 1–8. akadályt, majd menj át a piros CÉL kapun. Leverés vagy megtorpanás 4 hibapont.</li>
    <li><b>Aranypatkók:</b> 40 darab van elrejtve a völgyben. A térképen sárga pöttyök jelzik.</li>
    <li><b>Több ló:</b> az istállóban 6 boksz van. A gondozásnál a <b>Lovak</b> fülön új lovat hozhatsz, vagy kihozhatod a többit.</li>
    <li><b>Le- és felszállás:</b> megállva a <b>Leszállok</b> gombbal szállhatsz le, a ló ott marad és legel. Mellette állva felszállhatsz, vezetheted, az istállónál beállíthatod a boxába.</li>
    <li><b>Ház:</b> gyalog besétálhatsz az istálló melletti ház ajtaján. Leülhetsz a kanapéra, megfürödhetsz, lefekhetsz az ágyba, és reggelig alhatsz.</li>
    <li><b>Napszak, évszak:</b> a menüben váltható.</li></ul>
    <button class="big" data-close>Értem</button>`);
}

function showTitle() {
  leaveHouse(); stopLead();
  if (S && (S.horses[S.cur].loc === 'ride' || S.horses[S.cur].loc === 'tie')) S.horses[S.cur].loc = 'stall';
  if (S && S.horses[S.cur].loc === 'out') { const i = S.horses.findIndex((d) => d.loc === 'stall'); if (i >= 0) S.cur = i; }
  if (S) horse = herd[S.cur].h;
  R.mode = 'title'; R.pose = null; placeHorse(TITLE_SPOT.x, TITLE_SPOT.z, TITLE_SPOT.yaw);
  $('hud').classList.add('hide'); $('care').classList.add('hide'); $('careHint').classList.add('hide');
  rider.root.visible = false;
  cam.yaw = TITLE_SPOT.yaw + 2.4; cam.pitch = 0.1; cam.zoom = 1;
  const box = $('titleBox');
  const has = !!S;
  box.innerHTML = `<div class="logo">Vágtavölgy</div><p>Lovas kaland a saját lovaddal</p>
    ${has ? `<button class="big" id="tContinue">Folytatás – ${S.horses.map((d) => esc(d.name)).join(', ')}</button><button class="big ghost" id="tNew">Új játék</button>` : newHorseForm()}`;
  $('title').classList.remove('hide');
  if (has) {
    $('tContinue').onclick = () => { sound.init(); sound.setOn(S.sound); applyLook(); env.setSeason(S.season); enterCare(); };
    $('tNew').onclick = () => { box.innerHTML = `<div class="logo">Vágtavölgy</div><p style="color:#b5452e">Az új játék törli a mostani mentést (${S.horses.length} ló, ${S.coins} érme).</p>${newHorseForm()}<button class="big ghost" id="tBack">Vissza</button>`; bindNew(); $('tBack').onclick = showTitle; };
  } else bindNew();
}
function newHorseForm() {
  return `<label class="l">Mi legyen a lovad neve?</label><input class="namein" id="tName" maxlength="16" value="Csillag">
    <label class="l">Milyen színű legyen?</label><div class="chips" id="tCoats" style="justify-content:center">${Object.entries(COATS).map(([k, c], i) => chip(c.name, i === 0, `data-c="${k}"`, c.patch ? `linear-gradient(135deg,${c.base} 50%,${c.patch} 50%)` : c.base)).join('')}</div>
    <button class="big" id="tStart">Irány az istálló!</button>`;
}
let newCoat = 'pej';
function bindNew() {
  newCoat = 'pej';
  $('tCoats').onclick = (e) => { const b = e.target.closest('button'); if (!b) return; newCoat = b.dataset.c; document.querySelectorAll('#tCoats .chip').forEach((c) => c.classList.toggle('on', c === b)); horse.setCoat(newCoat, { blaze: true }); };
  $('tStart').onclick = () => { sound.init(); startNew($('tName').value.trim() || 'Csillag', newCoat); };
}
function startNew(name, coat) {
  S = linkCur(DEFAULT()); S.horses[0].name = name; S.horses[0].coat = coat; R.energy = 100;
  props.horseshoes.items.forEach((it) => (it.taken = false));
  syncHerd(); horse = herd[0].h; env.setSeason(S.season);
  applyLook(); save(); enterCare();
}

function openBigMap() {
  const c = $('bigc'), ctx = c.getContext('2d'), W = c.width;
  ctx.drawImage(mapCanvas, 0, 0, W, W);
  const k = W / SIZE, toS = (x, z) => [(x + HALF) * k, (z + HALF) * k];
  ctx.strokeStyle = 'rgba(120,85,50,.0)';
  for (const it of props.horseshoes.items) if (!it.taken) { const [x, y] = toS(it.x, it.z); ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#7a5200'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 7, 0, TAU); ctx.fill(); ctx.stroke(); }
  const label = (txt, x, z) => { const [sx, sy] = toS(x, z); ctx.font = 'bold 27px system-ui'; ctx.textAlign = 'center'; ctx.lineWidth = 7; ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.strokeText(txt, sx, sy); ctx.fillStyle = '#2a2733'; ctx.fillText(txt, sx, sy); };
  label('🏠 Istálló', STABLE.x, STABLE.z - 10); label('🏁 Aréna', ARENA.x, ARENA.z - ARENA.hd - 6); label('Tó', LAKE.x, LAKE.z);
  for (const L of props.landmarks) if (!['to'].includes(L.key)) label((S.found.includes(L.key) ? '' : '❔ ') + L.name, L.x, L.z + (L.key === 'vizeses' ? 14 : L.key === 'vadlovak' ? -38 : 0));
  { const hp = fauna.herdPos(), [hx, hy] = toS(hp.x, hp.z); ctx.font = '46px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('🐴', hx, hy); ctx.textBaseline = 'alphabetic'; }
  S.horses.forEach((d, i) => { if (d.loc !== 'out' || (R.mode === 'ride' && i === S.cur)) return; const [x, y] = toS(d.x, d.z), c = COATS[d.coat] || COATS.pej; ctx.fillStyle = c.base; ctx.strokeStyle = '#fff'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(x, y, 11, 0, TAU); ctx.fill(); ctx.stroke(); label(d.name, d.x, d.z - 14); });
  label('🏡 Ház', HOUSE.x + 6, HOUSE.z + 16);
  const [px, py] = toS(R.x, R.z);
  ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(Math.cos(R.yaw), Math.sin(R.yaw)));
  ctx.fillStyle = '#e8402a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-10, 10); ctx.lineTo(-5, 0); ctx.lineTo(-10, -10); ctx.closePath(); ctx.fill(); ctx.stroke(); ctx.restore();
  $('bigmap').classList.remove('hide');
}

function drawMini() {
  const c = $('mini'), ctx = c.getContext('2d'), W = c.width;
  ctx.save(); ctx.clearRect(0, 0, W, W); ctx.beginPath(); ctx.arc(W / 2, W / 2, W / 2, 0, TAU); ctx.clip();
  const view = 190, sc = mapCanvas.width / SIZE, k = W / view;
  ctx.drawImage(mapCanvas, (R.x + HALF) * sc - view / 2 * sc, (R.z + HALF) * sc - view / 2 * sc, view * sc, view * sc, 0, 0, W, W);
  const toS = (x, z) => [W / 2 + (x - R.x) * k, W / 2 + (z - R.z) * k];
  const edge = (x, z, col, r) => { let [sx, sy] = toS(x, z); const dx = sx - W / 2, dy = sy - W / 2, d = Math.hypot(dx, dy); if (d > W / 2 - 10) { sx = W / 2 + dx / d * (W / 2 - 10); sy = W / 2 + dy / d * (W / 2 - 10); } ctx.fillStyle = col; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); };
  for (const it of props.horseshoes.items) if (!it.taken && Math.abs(it.x - R.x) < view * 0.6 && Math.abs(it.z - R.z) < view * 0.6) { const [x, y] = toS(it.x, it.z); ctx.fillStyle = '#ffd23a'; ctx.strokeStyle = '#7a5200'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 6, 0, TAU); ctx.fill(); ctx.stroke(); }
  for (const w of fauna.wild) if (Math.abs(w.x - R.x) < view * 0.5 && Math.abs(w.z - R.z) < view * 0.5) { const [x, y] = toS(w.x, w.z); ctx.fillStyle = '#6b3f1f'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(x, y, w.scale < 0.8 ? 3 : 4.5, 0, TAU); ctx.fill(); ctx.stroke(); }
  S.horses.forEach((d, i) => { if (d.loc !== 'out' || (R.mode === 'ride' && i === S.cur)) return; const c = COATS[d.coat] || COATS.pej; edge(d.x, d.z, c.base, 6); });
  edge(STABLE.x, STABLE.z, '#b5452e', 7);
  if (R.course.active) { const c = R.course.c, t = R.course.next > c.jumps.length ? c.finish : c.jumps[R.course.next - 1]; edge(t.x, t.z, '#ff8a2a', 7); }
  ctx.translate(W / 2, W / 2); ctx.rotate(Math.atan2(Math.cos(R.yaw), Math.sin(R.yaw)));
  ctx.fillStyle = '#e8402a'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-9, 9); ctx.lineTo(-4, 0); ctx.lineTo(-9, -9); ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.restore();
}

function toast(txt, cls = '') {
  const t = document.createElement('div'); t.className = 'tst ' + cls; t.textContent = txt;
  const box = $('toast'); box.appendChild(t); while (box.children.length > 3) box.removeChild(box.firstChild);
  setTimeout(() => { t.style.transition = 'opacity .4s'; t.style.opacity = '0'; setTimeout(() => t.remove(), 400); }, 2600);
}
function addCoins(n) { S.coins = Math.max(0, S.coins + n); }

function feedWild() {
  const nw = fauna.nearestWild(R.x, R.z); if (!nw || S.inv.alma <= 0) return;
  S.inv.alma--; sound.munch(); setTimeout(() => sound.nicker(), 500);
  const hp = nw.w.h.head.localToWorld(new THREE.Vector3(0, -0.2, 0.25)); for (let i = 0; i < 6; i++) heartsAt(hp);
  if (!S.friends.includes(nw.w.name)) { S.friends.push(nw.w.name); addCoins(10); toast(`${nw.w.name} a barátod lett! 💛 +10 érme (${S.friends.length}/${fauna.wild.length})`, 'gold'); }
  else toast(`${nw.w.name} örül az almának! 🍎`, 'good');
  fauna.herd.stillT = 0; fauna.herd.curious = nw.w; save();
}
function collectionModal() {
  const fl = Object.entries(props.FLOWERS).map(([k, F]) => { const all = props.flowers.filter((f) => f.sp === k), got = all.filter((f) => S.flowers.includes(f.id)).length; return `<li><span style="color:${F.petal};text-shadow:0 0 2px #555">●</span> ${F.name}: <b>${got}/${all.length}</b></li>`; }).join('');
  const lm = props.landmarks.map((L) => `<li>${S.found.includes(L.key) ? '✅' : '⬜'} ${S.found.includes(L.key) ? L.name : '???'}</li>`).join('');
  const fr = fauna.wild.map((w) => `<li>${S.friends.includes(w.name) ? '💛' : '🤍'} ${S.friends.includes(w.name) ? w.name : '???'}</li>`).join('');
  modal(`<h2>📒 Gyűjtemény</h2>
    <p><b>Aranypatkók:</b> ${S.shoes.length}/${props.horseshoes.items.length} &nbsp; <b>Érmék:</b> ${S.coins}</p>
    <p><b>Készlet:</b> 🍎 ${S.inv.alma} alma, 🥕 ${S.inv.repa} répa <span style="color:#777;font-size:13px">(almáskert és veteményes a tanyán)</span></p>
    <h3 style="margin:10px 0 4px">Ritka virágok</h3><ul style="margin-top:0">${fl}</ul>
    <h3 style="margin:10px 0 4px">Felfedezések (${S.found.length}/${props.landmarks.length})</h3><ul style="columns:2;margin-top:0">${lm}</ul>
    <h3 style="margin:10px 0 4px">Vadló barátok (${S.friends.length}/${fauna.wild.length})</h3><ul style="margin-top:0">${fr}</ul>
    <p style="color:#666;font-size:14px">Tipp: a vadlovak a tanyától északra legelnek. Ha lassan közelítesz és megállsz, odajönnek – egy almával barátot szerezhetsz.</p>
    <button class="big" data-close>Bezárás</button>`);
}
function updateHud() {
  const st = S.stats;
  for (const k of ['food', 'water', 'clean', 'mood']) {
    const e = $('hb_' + k); e.querySelector('s').style.width = st[k].toFixed(0) + '%'; e.classList.toggle('low', st[k] < 25);
  }
  $('coinN').textContent = S.coins; $('shoeN').textContent = `${S.shoes.length}/${props.horseshoes.items.length}`;
  const maxE = 40 + 0.6 * Math.min(st.food, st.water);
  $('energy').querySelector('s').style.width = (R.energy / 100 * 100).toFixed(0) + '%';
  $('energy').querySelector('s').style.background = R.tired ? '#e0533d' : R.energy > maxE - 1 ? '#ffd34d' : '#ffd34d';
  $('btnGallop').classList.toggle('dis', R.tired);
  $('gaitlbl').textContent = R.jump.active ? 'Ugrás!' : GAIT_HU[R.gait];
  // környezeti gombok
  const ctxEl = $('ctx'); let html = '';
  const B = (c, label, a = '') => `<button class="cbtn" data-c="${c}" data-a="${a}">${label}</button>`;
  const nearStable = Math.abs(R.x - STABLE.x) < STABLE.w / 2 + 2 && R.z > STABLE.z && R.z < TIE.z + 7;
  const foot = R.mode === 'foot', inHouse = R.mode === 'house';
  $('gaitlbl').textContent = R.mode === 'ride' ? (R.jump.active ? 'Ugrás!' : GAIT_HU[R.gait]) : inHouse ? (R.pose ? '' : 'Otthon') : R.v > 2.6 ? 'Futás' : R.v > 0.2 ? 'Séta' : 'Gyalog';
  $('btnGallop').textContent = R.mode === 'ride' ? 'Galopp' : 'Futás';
  if (R.mode === 'ride') {
    if (nearStable && R.v < 3) html += B('stable', '🧽 Gondozás') + B('box', '📥 Boxba', S.cur);
    if ((WATER - world.heightAt(R.x, R.z) > 0.05 || world.creekDist(R.x, R.z) < 1.8 || Math.hypot(R.x - world.pool.x, R.z - world.pool.z) < 5.5) && R.v < 1.5 && R.drink <= 0) html += B('drink', '💧 Itatás');
    const nw = fauna.nearestWild(R.x, R.z);
    if (nw && nw.d < 5.5 && R.v < 1.2 && S.inv.alma > 0) html += B('feedwild', `🍎 Almát adok: ${esc(nw.w.name)}`);
    if (R.v < 2.2 && !R.jump.active && R.drink <= 0 && !R.course.active) html += B('dismount', '⬇️ Leszállok');
  } else if (foot) {
    const i = nearestOwn(R.x, R.z, 2.7);
    if (i >= 0) {
      const d = S.horses[i];
      if (d.tack.saddle && d.tack.bridle) html += B('mount', `🐴 Felszállok: ${esc(d.name)}`, i);
      if (d.loc === 'tie') html += B('care', '🧽 Gondozás', i);
      else html += R.lead === i ? B('unlead', '✋ Elengedem') : B('lead', `🪢 Vezetem`, i);
    }
    if (R.lead >= 0 && Math.hypot(R.x - TIE.x, R.z - TIE.z) < 6) html += B('tie', '🪢 Kikötöm');
    if (R.lead >= 0 && nearStable) html += B('box', '📥 Boxba', R.lead);
    if (R.lead < 0 && i < 0 && nearStable) html += B('stable', '🏠 Istálló');
    const nw = fauna.nearestWild(R.x, R.z);
    if (nw && nw.d < 4 && R.v < 1.2 && S.inv.alma > 0) html += B('feedwild', `🍎 Almát adok: ${esc(nw.w.name)}`);
  } else if (inHouse) {
    if (R.pose) {
      if (R.pose.kind === 'lie') html += B('sleep', '😴 Alszom reggelig') + B('stand', '⬆️ Felkelek');
      else html += B('stand', '⬆️ Felállok');
    } else {
      const sp = house.nearSpot(R.x, R.z); if (sp) html += B('spot', sp.label, sp.key);
    }
  }
  if (ctxEl.dataset.h !== html) { ctxEl.dataset.h = html; ctxEl.innerHTML = html; ctxEl.querySelectorAll('button').forEach((b) => b.onclick = () => ctxAction(b.dataset.c, b.dataset.a)); }
  if (R.course.active) {
    $('ctime').textContent = (time - R.course.t0).toFixed(1); $('cfault').textContent = R.course.faults;
    $('cnext').textContent = R.course.next > R.course.c.jumps.length ? '→ CÉL' : `Köv.: ${R.course.next}.`;
  }
}
function ctxAction(c, a) {
  sound.init(); const i = a === '' ? -1 : +a;
  if (c === 'stable') { if (R.mode !== 'ride' && R.lead >= 0) S.cur = R.lead; enterCare(); }
  if (c === 'care') { S.cur = i; enterCare(); }
  if (c === 'box') toStall(i);
  if (c === 'drink') { R.drink = 3.5; S.tut.water = true; }
  if (c === 'feedwild') feedWild();
  if (c === 'dismount') dismount();
  if (c === 'mount') mountHorse(i);
  if (c === 'lead') { const d = S.horses[i]; if (d.loc === 'tie') { d.loc = 'out'; d.x = TIE.x; d.z = TIE.z; d.yaw = Math.PI / 2; } R.lead = i; toast(`${d.name} jön utánad. 🪢`); sound.nicker(); }
  if (c === 'unlead') { toast(`${S.horses[R.lead].name} itt marad legelni.`); stopLead(); }
  if (c === 'tie') { S.cur = R.lead; stopLead(); enterCare(); }
  if (c === 'enter') enterHouse();
  if (c === 'exit') exitHouse();
  if (c === 'spot') sitOn(a);
  if (c === 'stand') standUp();
  if (c === 'sleep') sleep();
  $('ctx').dataset.h = ''; hudT = 0;
}
function updateCareStats() {
  const st = S.stats;
  for (const k of ['food', 'water', 'clean', 'mood']) { const e = $('cs_' + k); e.querySelector('s').style.width = st[k].toFixed(0) + '%'; e.classList.toggle('low', st[k] < 25); }
  $('careCoinN').textContent = S.coins;
  if (!S.tut.done && curTab === 'care') {
    const sig = [S.tut.fed, S.tut.water, S.tut.brush, !!(S.tack.saddle && S.tack.bridle)].join();
    if (sig !== updateCareStats.sig) { updateCareStats.sig = sig; renderPane(); }
  }
}

// ---------- fő ciklus ----------
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const raw = (now - last) / 1000; last = now;
  const dt = Math.min(0.05, raw);
  if (window.__freeze) return;
  if (!document.hidden) { update(R.paused ? 0 : dt); post.render(); }
  // automatikus minőségcsökkentés lassú gépen
  autoQ.acc += raw; autoQ.n++;
  if (autoQ.acc > 3) {
    const avg = autoQ.acc / autoQ.n;
    if (avg > 0.034 && R.mode === 'ride' && !window.__noAuto) {
      if (pixelRatio > 1.01) { pixelRatio = Math.max(1, pixelRatio - 0.25); renderer.setPixelRatio(pixelRatio); onResize(); }
      else if (S && S.quality !== 'gyors' && avg > 0.045) { S.quality = 'gyors'; applyQuality('gyors'); toast('A grafikát gyorsabbra állítottam.'); }
    }
    autoQ.acc = 0; autoQ.n = 0;
  }
}

function update(dt) {
  time += dt;
  if (S && env) { if (S.todAuto) S.tod = (S.tod + dt / 60) % 24; }
  let hs = { mode: 'ride' };
  const onFoot = R.mode === 'foot' || R.mode === 'house';
  if (R.mode === 'ride') rideUpdate(dt);
  else if (onFoot) footUpdate(dt);
  else hs = careUpdate(dt);
  const mounted = R.mode === 'ride';
  if (!onFoot) {
    if (horse.happyT > 0) { horse.happyT -= dt; hs.happy = true; }
    const gy = groundY(R.x, R.z);
    // test dőlése a terephez
    const fx = Math.sin(R.yaw), fz = Math.cos(R.yaw);
    const hf = groundY(R.x + fx * 0.8, R.z + fz * 0.8), hb = groundY(R.x - fx * 0.75, R.z - fz * 0.75);
    R.pitch = damp(R.pitch, R.jump.active ? 0 : Math.atan2(hb - hf, 1.55), 8, dt);
    R.roll = damp(R.roll, clamp(-R.yawRate * R.v * 0.03, -0.18, 0.18), 5, dt);
    horse.root.position.set(R.x, Math.max(gy, (hf + hb) / 2 - 0.02) + R.lift, R.z);
    horse.root.rotation.set(R.pitch, R.yaw, R.roll);
    const st = { gait: mounted ? (R.drink > 0 ? 'stand' : R.gait) : 'stand', v: mounted ? R.v : 0, yawRate: R.yawRate, jumpT: R.jump.active ? R.jump.t : -1, ...hs };
    if (mounted && R.drink > 0) { st.headDown = 1; }
    if (R.refuse > 0) st.jumpT = -1;
    const events = horse.update(dt, st);
    if (R.refuse > 0) { horse.body.rotation.x -= Math.sin(clamp(R.refuse / 1.1, 0, 1) * Math.PI) * 0.18; horse.neck.rotation.x -= Math.sin(clamp(R.refuse / 1.1, 0, 1) * Math.PI) * 0.25; }
    // patadobogás
    if (mounted) for (const i of events) {
      horse.legs[i].hoof.getWorldPosition(tmpV); const sf = surfaceAt(tmpV.x, tmpV.z);
      sound.hoof(sf, R.v);
      if ((sf === 'sand' || sf === 'hard') && R.v > 3) for (let k = 0; k < 2; k++) parts.dust.emit(tmpV, -fx * R.v * 0.15 + (Math.random() - 0.5) * 0.6, 0.3 + Math.random() * 0.6, -fz * R.v * 0.15 + (Math.random() - 0.5) * 0.6, 0.9 + Math.random() * 0.5, 0.35, dustColor(tmpV.x, tmpV.z), -0.3, 2.2);
      if (sf === 'water') for (let k = 0; k < 4; k++) parts.dust.emit(tmpV.setY(WATER + 0.05), (Math.random() - 0.5) * 1.5, 1.2 + Math.random() * 1.5, (Math.random() - 0.5) * 1.5, 0.6, 0.18, new THREE.Color('#e8f4ff'), -9, 0.5);
    }
    horse.root.updateMatrixWorld(true);
    rider.root.visible = mounted;
    if (mounted) rider.update(dt, { gait: st.gait, v: R.v, jumpT: st.jumpT, yawRate: R.yawRate });
    horse.placeStirrups(mounted ? rider.feetBody : null);
    updateReins(mounted);
  } else {
    // gyalogos lovas
    rider.root.visible = true;
    const P = R.pose;
    if (P) {
      const fy = house.floorY();
      walker.position.set(P.x, fy + P.y + (P.kind === 'lie' ? 0 : 0.1), P.z); walker.rotation.set(0, P.yaw, 0);
      rider.root.rotation.set(P.kind === 'lie' ? -Math.PI / 2 : 0, 0, 0);
      if (P.kind === 'bath' && Math.random() < dt * 8) parts.heart.emit(tmpV.set(P.x + (Math.random() - 0.5) * 1.2, fy + 0.55, P.z + (Math.random() - 0.5) * 0.5), 0, 0.25, 0, 1.6, 0.09, new THREE.Color('#e8f6ff'), 0, 0.5);
      if (P.kind === 'lie' && Math.random() < dt * 0.6) parts.star.emit(tmpV.set(P.x, fy + P.y + 0.5, P.z - 0.6), 0.1, 0.35, 0, 2.2, 0.12, new THREE.Color('#cfe0ff'), 0, 0.8);
    } else {
      const gy = R.mode === 'house' ? house.floorY() : groundY(R.x, R.z);
      walker.position.set(R.x, gy + 0.915, R.z); walker.rotation.set(0, R.yaw, 0); rider.root.rotation.set(0, 0, 0);
    }
    rider.updateFoot(dt, { v: R.v, pose: P ? P.kind : 'stand' });
    walker.updateMatrixWorld(true);
  }
  updateOwned(dt);
  // kamera
  updateCamera(dt);
  // környezet
  const focus = mounted ? horse.root.position : onFoot ? walker.position : cam.target;
  grass.update(focus.x, focus.z, time, mounted ? horse.root.position : { x: R.x, z: R.z });
  world.updateChunks(camera.position); world.updateShadowProxies(focus.x, focus.z);
  R.cullT = (R.cullT || 0) - dt; if (R.cullT <= 0) { R.cullT = 0.25; props.cull(camera.position); }
  world.waterUniforms.uTime.value = time; world.treeUniforms.uTime.value = time;
  world.sky.position.copy(camera.position);
  props.update(dt, time); house.update(time); props.horseshoes.update(time, camera.position); props.collectUpdate(time, camera.position);
  world.fallUniform.value = time;
  const fev = fauna.update(dt, time, { px: R.x, pz: R.z, pv: mounted || onFoot ? R.v : 0, cx: camera.position.x, cz: camera.position.z, mode: onFoot ? 'ride' : R.mode });
  if (mounted || R.mode === 'foot') for (const e of fev) { if (e.type === 'flee') msgOnce('flee', 'A vadlovak megijedtek! Lassan, lépésben közelíts hozzájuk.', 20); if (e.type === 'curious') msgOnce('cur', `${e.name} kíváncsian közelebb jön…`, 25); if (e.type === 'near') msgOnce('herd', 'Nyerítés! Vadlovak legelnek a közelben 🐴', 90); }
  { const wb = world.waterfallBase, dw = Math.hypot(camera.position.x - wb.x, camera.position.z - wb.z);
    if (dw < 70 && Math.random() < dt * 30) parts.dust.emit(tmpV.set(wb.x + (Math.random() - 0.5) * 4, wb.y + 0.3, wb.z + (Math.random() - 0.5) * 4), (Math.random() - 0.5) * 1.5, 0.8 + Math.random() * 1.2, (Math.random() - 0.5) * 1.5, 1.4, 0.7, new THREE.Color('#eef6fb'), -0.3, 2);
    if (sound.ctx) sound.water(clamp(1 - dw / 70, 0, 1) * 0.3 + clamp(1 - world.creekDist(R.x, R.z) / 25, 0, 1) * 0.08); }
  for (const k in parts) parts[k].update(dt);
  // nap / hold, ég, évszak
  env.update(dt, time, S ? S.tod : 10.5, focus, camera, R.mode === 'house');
  // következő akadály jelzése
  if (R.course.active) {
    const c = R.course.c, t = R.course.next > c.jumps.length ? c.finish : c.jumps[R.course.next - 1];
    arrow.visible = true; arrow.position.set(t.x, (t.h || 1.0) + 2.9 + Math.sin(time * 4) * 0.15, t.z); arrow.rotation.y = time * 2;
  } else arrow.visible = false;
  // hang
  if (sound.ctx) {
    sound.wind(mounted ? R.v : R.mode === 'house' ? -1 : 0);
    birdT -= dt; if (birdT < 0) { birdT = 3 + Math.random() * 8; if (R.mode !== 'house' && (!env || env.night < 0.5) && S && S.season !== 'tel' && (world.forestAt(R.x, R.z) > 0.2 || Math.random() < 0.5)) sound.bird(); }
    if (R.mode === 'care' && Math.random() < dt * 0.04) sound.snort();
  }
  // HUD
  hudT -= dt;
  if (hudT < 0 && S) { hudT = 0.2; if (mounted || onFoot) updateHud(); else if (R.mode === 'care') updateCareStats(); }
  if ((mounted || onFoot) && S) drawMiniMaybe(dt);
  saveT += dt; if (saveT > 6 && S && R.mode !== 'title') { saveT = 0; save(); }
}
let miniT = 0;
function drawMiniMaybe(dt) { miniT += dt; if (miniT > 0.066) { miniT = 0; drawMini(); } }

function updateReins(mounted) {
  const e = herd[S ? S.cur : 0]; if (!e) return;
  const vis = horse.tack.bridle.visible;
  e.reins.forEach((r) => (r.mesh.visible = vis));
  if (!vis) return;
  if (!mounted) { restReins(e, false); return; }
  for (let i = 0; i < 2; i++) {
    const a = horse.bitWorld(i, tmpV.clone()), b = rider.handWorld(i, new THREE.Vector3());
    const sag = lerp(0.07, 0.025, clamp(R.v / 10, 0, 1)), pts = [];
    for (let k = 0; k <= 10; k++) { const t = k / 10; const p = a.clone().lerp(b, t); p.y -= Math.sin(Math.PI * t) * sag; pts.push(p); }
    e.reins[i].update(pts);
  }
}

function treeNear(x, z, r) {
  const i = Math.floor(x / 8), j = Math.floor(z / 8);
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
    const a = world.circles.get((i + di) * 4096 + (j + dj)); if (!a) continue;
    for (const c of a) if (c.h === 50 && Math.hypot(c.x - x, c.z - z) < r + c.r * 3) return true;
  }
  return false;
}
function updateCamera(dt) {
  cam.user += dt;
  let tgt, dist;
  const portrait = innerWidth < innerHeight;
  if (R.mode === 'ride') {
    const fx = Math.sin(R.yaw), fz = Math.cos(R.yaw);
    tgt = tmpV3.set(R.x + fx * 0.5, groundY(R.x, R.z) + 1.85 + R.lift * 0.45, R.z + fz * 0.5);
    dist = lerp(5.4, 8.2, clamp(R.v / 12.5, 0, 1)) * (portrait ? 1.22 : 1);
    if (cam.user > 1.3 && R.v > 0.5) { cam.yaw = dampAngle(cam.yaw, R.yaw, 1.7 * clamp(R.v / 3, 0.3, 1), dt); cam.pitch = damp(cam.pitch, 0.24, 1.2, dt); }
    cam.target.x = damp(cam.target.x, tgt.x, 14, dt); cam.target.z = damp(cam.target.z, tgt.z, 14, dt); cam.target.y = damp(cam.target.y, tgt.y, 7, dt);
  } else if (R.mode === 'foot') {
    tgt = tmpV3.set(R.x, groundY(R.x, R.z) + 1.4, R.z);
    dist = 3.9 * (portrait ? 1.3 : 1) * (cam.zoom || 1);
    if (cam.user > 1.3 && R.v > 0.5) { cam.yaw = dampAngle(cam.yaw, R.yaw, 1.6, dt); cam.pitch = damp(cam.pitch, 0.26, 1.2, dt); }
    cam.target.x = damp(cam.target.x, tgt.x, 12, dt); cam.target.z = damp(cam.target.z, tgt.z, 12, dt); cam.target.y = damp(cam.target.y, tgt.y, 7, dt);
  } else if (R.mode === 'house') {
    const P = R.pose, fy = house.floorY();
    tgt = P ? tmpV3.set(P.x, fy + P.y + (P.kind === 'lie' ? 0.35 : 0.55), P.z) : tmpV3.set(R.x, fy + 1.45, R.z);
    dist = (P ? 2.3 : 2.6) * (portrait ? 1.15 : 1) * (cam.zoom || 1);
    if (!P && cam.user > 1.3 && R.v > 0.4) { cam.yaw = dampAngle(cam.yaw, R.yaw, 2.2, dt); cam.pitch = damp(cam.pitch, 0.2, 1.5, dt); }
    cam.target.x = damp(cam.target.x, tgt.x, 12, dt); cam.target.z = damp(cam.target.z, tgt.z, 12, dt); cam.target.y = damp(cam.target.y, tgt.y, 8, dt);
  } else {
    if (R.mode === 'title') { cam.yaw += dt * 0.08; tgt = tmpV3.set(R.x, groundY(R.x, R.z) + 1.05, R.z); }
    else tgt = tmpV3.set(TIE.x + 0.25, 1.15, TIE.z);
    cam.target.lerp(tgt, 1 - Math.exp(-dt * 5));
    dist = (R.mode === 'title' ? 5.4 : 4.3) * (cam.zoom || 1) * (portrait ? 1.5 : 1);
  }
  if (cam.fixDist) dist = cam.fixDist;
  cam.dist = damp(cam.dist, dist, 3, dt);
  const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
  camera.position.set(cam.target.x - Math.sin(cam.yaw) * cp * cam.dist, cam.target.y + sp * cam.dist, cam.target.z - Math.cos(cam.yaw) * cp * cam.dist);
  // kamera ne kerüljön fa lombjába: húzzuk közelebb
  if (R.mode === 'ride' || R.mode === 'foot') {
    for (let k = 0; k < 6 && treeNear(camera.position.x, camera.position.z, 2.6); k++) camera.position.lerp(cam.target, 0.18);
  }
  // a kamera ne menjen át falon (ház, istálló), bent ne menjen a plafon fölé
  if (R.mode === 'foot' || R.mode === 'ride' || R.mode === 'house') {
    const t = world.segmentHit(cam.target.x, cam.target.z, camera.position.x, camera.position.z, camera.position.y, 0.22);
    if (t < 1) { const k = Math.max(0.04, t - 0.03); camera.position.x = lerp(cam.target.x, camera.position.x, k); camera.position.z = lerp(cam.target.z, camera.position.z, k); camera.position.y = lerp(cam.target.y, camera.position.y, Math.max(k, 0.5)); }
    if (R.mode === 'house') camera.position.y = Math.min(camera.position.y, house.ceilingY() - 0.22);
  }
  { const fov = R.mode === 'house' ? (portrait ? 80 : 70) : (portrait ? 62 : 55); if (Math.abs(camera.fov - fov) > 0.05) { camera.fov = damp(camera.fov, fov, 6, dt); camera.updateProjectionMatrix(); } }
  const gyc = world.heightAt(camera.position.x, camera.position.z) + 0.5;
  if (camera.position.y < gyc) camera.position.y = gyc;
  if (cam.shake > 0) { cam.shake -= dt; camera.position.y += (Math.random() - 0.5) * cam.shake * 0.4; }
  camera.lookAt(cam.target);
  const side = R.mode === 'care' || R.mode === 'title';
  if (side && !portrait) {
    camera.setViewOffset(innerWidth, innerHeight, Math.min(R.mode === 'title' ? 230 : 190, innerWidth * 0.24), 0, innerWidth, innerHeight);
  } else if (side) {
    camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * (R.mode === 'title' ? 0.24 : 0.26), innerWidth, innerHeight);
  } else if (camera.view && camera.view.enabled) camera.clearViewOffset();
}

setTimeout(init, 40);
