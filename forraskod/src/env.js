import * as THREE from 'three';
import { clamp, lerp, smoothstep } from './noise.js';
import { ROOF_MATS } from './deco.js';

// Napszakok (nap, hold, csillagok, esti fények) és évszakok (fű, lomb, hó, jég).
export const SEASONS = {
  tavasz: { name: 'Tavasz', ico: '🌸' }, nyar: { name: 'Nyár', ico: '☀️' }, osz: { name: 'Ősz', ico: '🍂' }, tel: { name: 'Tél', ico: '❄️' },
};
export const TOD_PRESETS = [
  { k: 'reggel', name: 'Reggel', ico: '🌅', h: 7.5 }, { k: 'nappal', name: 'Nappal', ico: '☀️', h: 12.5 },
  { k: 'este', name: 'Este', ico: '🌇', h: 18.7 }, { k: 'ejjel', name: 'Éjszaka', ico: '🌙', h: 23.2 },
  { k: 'auto', name: 'Telik az idő', ico: '⏳', auto: true },
];
const SEASON_P = {
  tavasz: { A: 0.7, B: 0.0, tint: [0.9, 1.1, 0.78], aut: 0, spring: 1, bare: 0, snow: 0, ice: 0 },
  nyar: { A: 0.78, B: 0.08, tint: [1, 1, 1], aut: 0, spring: 0, bare: 0, snow: 0, ice: 0 },
  osz: { A: 0.68, B: -0.02, tint: [1.32, 0.98, 0.55], aut: 1, spring: 0, bare: 0, snow: 0, ice: 0 },
  tel: { A: 0.55, B: -0.06, tint: [1.05, 1.0, 0.9], aut: 0, spring: 0, bare: 1, snow: 1, ice: 1 },
};
const C = (h) => new THREE.Color(h);
const SKY = {
  night: { top: C('#060b1d'), hor: C('#17223a'), gnd: C('#0a0d14') },
  twi: { top: C('#38508c'), hor: C('#eea47a'), gnd: C('#4a4650') },
  day: { top: C('#4f9ae0'), hor: C('#e6e8d6'), gnd: C('#a9b89a') },
};
const BASE_AZ = Math.atan2(0.55, 0.42);

export class Env {
  constructor({ renderer, scene, world, sun, hemi, props, house, grass, fauna }) {
    Object.assign(this, { renderer, scene, world, sun, hemi, props, house, grass, fauna });
    this.U = { uSnow: { value: 0 }, uAut: { value: 0 }, uSpring: { value: 0 }, uBare: { value: 0 }, uGrassTint: { value: new THREE.Color(1, 1, 1) } };
    this.sunDir = new THREE.Vector3().copy(new THREE.Vector3(0.55, 0.64, 0.42)).normalize(); this.moonDir = new THREE.Vector3(0, 1, 0); this.lightDir = new THREE.Vector3();
    this.night = 0; this.day = 1; this.season = 'nyar'; this.cur = { snow: 0, aut: 0, spring: 0, bare: 0, ice: 0, tint: new THREE.Color(1, 1, 1) };
    this.tmpC = new THREE.Color(); this.tmpC2 = new THREE.Color();
    this.buildSky();
    // évszak-árnyalás a terepre, fákra, tetőkre
    this.seasonize(world.terrain.material, 'ground');
    const TA = world.treeAssets;
    this.seasonize(TA.decMat, 'dec'); this.seasonize(TA.birchMat, 'birch'); this.seasonize(TA.appleMat, 'apple'); this.seasonize(TA.autMat, 'aut'); this.seasonize(TA.conMat, 'needle');
    for (const m of [world.rockMat, props.roofMat, house.M.roof, props.yardMat, props.arenaMat, ...ROOF_MATS]) if (m) this.seasonize(m, 'snow');
    this.lavender = world.lavenderMat;
    // esti fények: udvari lámpa és a ház belső fénye
    const lp = this.lampPos = new THREE.Vector3(-6.2, 0, -30.6);
    const pm = new THREE.MeshStandardMaterial({ color: '#2a2d33', roughness: 0.5, metalness: 0.5 });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 3.0, 8), pm); post.position.set(lp.x, 1.5, lp.z); post.castShadow = true; scene.add(post);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.05, 0.05), pm); arm.position.set(lp.x + 0.25, 2.95, lp.z); scene.add(arm);
    const lan = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.17, 0.32, 8), props.lampMat); lan.position.set(lp.x + 0.5, 2.75, lp.z); scene.add(lan);
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.16, 8), pm); cap.position.set(lp.x + 0.5, 2.98, lp.z); scene.add(cap);
    world.addCircle(lp.x, lp.z, 0.15, 99);
    this.yardLight = new THREE.PointLight('#ffc77a', 0, 26, 1.4); this.yardLight.position.set(lp.x + 0.5, 2.6, lp.z); scene.add(this.yardLight);
    this.buildPrecip();
  }

  // ---------- ég: színátmenet, nap, hold, csillagok ----------
  buildSky() {
    const u = this.skyU = {
      top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, gnd: { value: new THREE.Color() },
      sunDir: { value: this.sunDir }, moonDir: { value: this.moonDir }, uNight: { value: 0 }, uSunVis: { value: 1 }, uGlow: { value: new THREE.Color('#ffd08c') }, uTime: { value: 0 },
    };
    this.world.sky.material = new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false, uniforms: u,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
      fragmentShader: `varying vec3 vDir; uniform vec3 top, hor, gnd, sunDir, moonDir, uGlow; uniform float uNight, uSunVis, uTime;
        float h3(vec3 p){ return fract(sin(dot(p, vec3(127.1,311.7,74.7)))*43758.5453); }
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(hor, top, pow(clamp(h,0.0,1.0), 0.5));
          col = mix(col, gnd, smoothstep(0.0, -0.12, h));
          float s = max(dot(d, sunDir), 0.0);
          col += uGlow*pow(s, 5.0)*0.3*uSunVis + vec3(1.0,0.96,0.88)*smoothstep(0.9993, 0.9997, s)*4.0*uSunVis;
          if (uNight > 0.01 && h > 0.0) {
            vec3 q = d*230.0; vec3 c = floor(q); float r = h3(c);
            float st = step(0.9955, r) * smoothstep(0.42, 0.0, length(fract(q)-0.5));
            col += vec3(0.9,0.93,1.0) * st * uNight * (0.55 + 0.45*sin(uTime*2.3 + r*80.0)) * smoothstep(0.0, 0.2, h) * 1.6;
          }
          float m = dot(d, moonDir);
          col += vec3(0.95,0.96,1.0)*smoothstep(0.99935, 0.9997, m)*1.4*uNight + vec3(0.45,0.55,0.8)*pow(max(m,0.0), 60.0)*0.25*uNight;
          gl_FragColor = vec4(col,1.0);
          #include <colorspace_fragment>
        }`,
    });
  }

  // ---------- hó / falevél ----------
  buildPrecip() {
    const N = 1600, pos = new Float32Array(N * 3), rnd = new Float32Array(N);
    for (let i = 0; i < N; i++) { pos[i * 3] = Math.random() * 56; pos[i * 3 + 1] = Math.random() * 22; pos[i * 3 + 2] = Math.random() * 56; rnd[i] = Math.random(); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aR', new THREE.BufferAttribute(rnd, 1));
    this.pU = { uTime: { value: 0 }, uCam: { value: new THREE.Vector3() }, uFall: { value: 1.2 }, uSway: { value: 0.6 }, uSize: { value: 0.05 }, uScale: { value: 600 }, uLeaf: { value: 0 }, uBright: { value: 1 } };
    this.precip = new THREE.Points(g, new THREE.ShaderMaterial({
      uniforms: this.pU, transparent: true, depthWrite: false,
      vertexShader: `attribute float aR; uniform float uTime, uFall, uSway, uSize, uScale, uLeaf; uniform vec3 uCam; varying float vR;
        void main(){ vR = aR; vec3 p = position;
          float y = mod(p.y - uTime*uFall*(0.7 + 0.6*aR), 22.0);
          float sx = sin(uTime*(0.6+aR) + y*0.45 + aR*20.0)*uSway, sz = cos(uTime*(0.5+aR*0.7) + y*0.37 + aR*9.0)*uSway;
          vec3 w = vec3(uCam.x + mod(p.x + sx - uCam.x, 56.0) - 28.0, uCam.y - 7.0 + y, uCam.z + mod(p.z + sz - uCam.z, 56.0) - 28.0);
          vec4 mv = viewMatrix*vec4(w,1.0); gl_PointSize = uSize*(1.0 + uLeaf*aR*1.5)*uScale/max(-mv.z, 0.3); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform float uLeaf, uBright; varying float vR;
        void main(){ vec2 c = gl_PointCoord - 0.5; float d = length(c*vec2(1.0, 1.0 + uLeaf*0.8)); if (d > 0.5) discard;
          vec3 col = uLeaf > 0.5 ? (vR < 0.4 ? vec3(0.85,0.35,0.06) : vR < 0.75 ? vec3(0.7,0.12,0.05) : vec3(0.9,0.62,0.1)) : vec3(1.0);
          gl_FragColor = vec4(col*uBright, (1.0 - smoothstep(0.25, 0.5, d))*(uLeaf > 0.5 ? 1.0 : 0.85));
          #include <colorspace_fragment>
        }`,
    }));
    this.precip.frustumCulled = false; this.precip.renderOrder = 6; this.precip.visible = false; this.scene.add(this.precip);
  }

  // anyag kiegészítése évszak-kóddal (meglévő onBeforeCompile megtartásával)
  seasonize(mat, kind) {
    if (!mat || mat.userData.season) return; mat.userData.season = kind;
    const prev = mat.onBeforeCompile, U = this.U;
    const prevKey = prev && prev !== THREE.Material.prototype.onBeforeCompile ? 'p' : 'n';
    let frag;
    if (kind === 'ground') frag = `{ vec3 c = diffuseColor.rgb; float gr = clamp((c.g - max(c.r, c.b)) * 14.0, 0.0, 1.0);
        c = mix(c, c * uGrassTint, gr);
        float n = sin(vSWP.x * 0.37 + sin(vSWP.z * 0.21) * 2.0) * sin(vSWP.z * 0.41 + vSWP.x * 0.13);
        c = mix(c, vec3(0.86, 0.89, 0.94), uSnow * smoothstep(0.72, 0.9, vSNy) * (0.9 + 0.1 * n));
        diffuseColor.rgb = c; }`;
    else if (kind === 'snow') frag = `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.88, 0.91, 0.95), uSnow * smoothstep(0.5, 0.82, vSNy));`;
    else if (kind === 'needle') frag = `if (vLeaf > 0.5) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.86, 0.9, 0.95), uSnow * smoothstep(0.2, 0.55, vSNy));`;
    else {
      const AU = kind === 'birch' ? 'vec3(0.96, 0.78, 0.18)' : kind === 'apple' ? 'vec3(0.92, 0.62, 0.14)' : '(pk < 0.4 ? vec3(0.96, 0.5, 0.1) : pk < 0.72 ? vec3(0.86, 0.22, 0.07) : vec3(0.97, 0.76, 0.16))';
      frag = `if (vLeaf > 0.5) {
        if (uBare > 0.5) discard;
        float fruit = step(1.9, vLeaf);
        if (fruit > 0.5 && uSpring > 0.5) discard;
        vec3 c = diffuseColor.rgb; float l = dot(c, vec3(0.3, 0.59, 0.11));
        float fh = clamp((vLeaf - 1.0) / 0.45, 0.0, 1.0);
        float pk = fract(vSTH * 3.7 + fh * 0.55);
        vec3 au = ${AU} * clamp(l / 0.3, 0.7, 1.3);
        ${kind === 'aut' ? 'c = au;' : 'c = mix(c, au, uAut * (1.0 - fruit));'}
        ${kind !== 'aut' ? 'c = mix(c, c * vec3(1.0, 1.15, 0.72) + vec3(0.03, 0.04, 0.0), uSpring * (1.0 - fruit));' : ''}
        ${kind === 'apple' ? 'c = mix(c, vec3(0.97, 0.82, 0.88), uSpring * step(0.55, fh) * (1.0 - fruit));' : ''}
        diffuseColor.rgb = c; }`;
    }
    mat.onBeforeCompile = (sh, r) => {
      if (prev) prev.call(mat, sh, r);
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'varying float vSNy; varying vec3 vSWP; varying float vSTH;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 sN = objectNormal; vec4 sP = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        sN = mat3(instanceMatrix) * sN; sP = instanceMatrix * sP; vSTH = fract(sin(dot(instanceMatrix[3].xz, vec2(12.9898, 78.233))) * 43758.5453);
        #else
        vSTH = 0.5;
        #endif
        vSNy = normalize(mat3(modelMatrix) * sN).y; vSWP = (modelMatrix * sP).xyz;`);
      sh.fragmentShader = 'uniform float uSnow, uAut, uSpring, uBare; uniform vec3 uGrassTint; varying float vSNy; varying vec3 vSWP; varying float vSTH;\n' +
        sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\n' + frag);
    };
    mat.customProgramCacheKey = () => 'season-' + kind + '-' + prevKey;
    mat.needsUpdate = true;
  }

  setSeason(k) { this.season = SEASON_P[k] ? k : 'nyar'; this.target = SEASON_P[this.season]; this.applySeason(true); }
  applySeason(now) {
    const T = this.target || SEASON_P.nyar, c = this.cur, U = this.U;
    for (const key of ['snow', 'aut', 'spring', 'bare', 'ice']) c[key] = T[key];
    c.tint.setRGB(...T.tint);
    U.uSnow.value = c.snow; U.uAut.value = c.aut; U.uSpring.value = c.spring; U.uBare.value = c.bare; U.uGrassTint.value.copy(c.tint);
    this.grass.uniforms.uSnow.value = c.snow; this.grass.uniforms.uGrassTint.value.copy(c.tint);
    this.grass.flowers.visible = this.season === 'tavasz' || this.season === 'nyar';
    if (this.world.lakeMat) this.world.lakeMat.uniforms.uIce.value = c.ice;
    if (this.lavender) { this.lavender.visible = this.season !== 'tel'; this.lavender.color.set(this.season === 'osz' ? '#b6a27c' : this.season === 'tavasz' ? '#cfe0b0' : '#ffffff'); }
    this.precip.visible = this.season === 'tel' || this.season === 'osz';
    const leaf = this.season === 'osz';
    this.pU.uLeaf.value = leaf ? 1 : 0; this.pU.uFall.value = leaf ? 0.9 : 1.25; this.pU.uSway.value = leaf ? 1.6 : 0.7; this.pU.uSize.value = leaf ? 0.07 : 0.045;
    this.precip.geometry.setDrawRange(0, leaf ? 260 : 1600);
  }

  // napállás: sinE (emelkedés szinusza)
  sunAt(tod) {
    const P = this.target || SEASON_P.nyar, th = (tod - 13) / 24 * Math.PI * 2;
    const sinE = clamp(P.A * Math.cos(th) + P.B, -1, 1), cosE = Math.sqrt(1 - sinE * sinE), az = BASE_AZ + th * 0.95;
    return { sinE, dir: this.sunDir.set(cosE * Math.sin(az), sinE, cosE * Math.cos(az)), az };
  }

  update(dt, time, tod, focus, camera, inside) {
    const { sinE, az } = this.sunAt(tod);
    const maz = az + Math.PI, me = 0.62; this.moonDir.set(Math.cos(me) * Math.sin(maz), Math.sin(me), Math.cos(me) * Math.cos(maz));
    const D = smoothstep(-0.12, 0.2, sinE), N = this.night = 1 - smoothstep(-0.1, 0.1, sinE); this.day = D;
    const tw = smoothstep(-0.16, 0.0, sinE) * (1 - smoothstep(0.02, 0.3, sinE)); // alkony
    // ég színei
    const u = this.skyU, a1 = smoothstep(-0.2, 0.02, sinE), a2 = smoothstep(0.0, 0.32, sinE);
    for (const k of ['top', 'hor', 'gnd']) u[k].value.copy(SKY.night[k]).lerp(SKY.twi[k], a1).lerp(SKY.day[k], a2);
    u.uNight.value = N; u.uSunVis.value = smoothstep(-0.06, 0.02, sinE); u.uTime.value = time;
    u.uGlow.value.set('#ffd08c').lerp(this.tmpC.set('#ff8a4a'), tw);
    const W = this.world, hor = W.horizon;
    hor.copy(u.hor.value); if (this.scene.fog) this.scene.fog.color.copy(hor);
    if (this.scene.background && this.scene.background.isColor) this.scene.background.copy(hor);
    // fények
    const sun = this.sun, sunI = 3.1 * smoothstep(-0.02, 0.2, sinE), moonI = 0.7 * (1 - smoothstep(-0.12, 0.03, sinE));
    const useSun = sunI >= moonI;
    this.lightDir.copy(useSun ? this.sunDir : this.moonDir);
    sun.intensity = Math.max(sunI, moonI);
    sun.color.set(useSun ? '#ffe8c4' : '#a9bdf0'); if (useSun) sun.color.lerp(this.tmpC.set('#ff9a5c'), 1 - smoothstep(0.03, 0.32, sinE));
    const tx = Math.round(focus.x / 0.5) * 0.5, tz = Math.round(focus.z / 0.5) * 0.5;
    sun.target.position.set(tx, W.heightAt(tx, tz), tz); sun.position.copy(sun.target.position).addScaledVector(this.lightDir, 90);
    this.hemi.intensity = lerp(0.46, 1.15, D) + tw * 0.15;
    this.hemi.color.set('#3c4d80').lerp(this.tmpC.set('#d9e9ff'), D).lerp(this.tmpC2.set('#ffc9a8'), tw * 0.5);
    this.hemi.groundColor.set('#1a1e26').lerp(this.tmpC.set(this.season === 'tel' ? '#b4bccb' : '#6f7d48'), D);
    this.renderer.toneMappingExposure = lerp(1.32, 1.08, D);
    this.scene.environmentIntensity = 0.55 * (0.14 + 0.86 * D);
    // víz és felhők
    this.world.waterLight.value.setRGB(lerp(0.18, 1, D), lerp(0.22, 1, D), lerp(0.34, 1, D)).lerp(this.tmpC.set('#ffc8a0'), tw * 0.4);
    W.cloudMat.color.set('#ffffff').lerp(this.tmpC.set('#ffbe96'), tw * 0.8).lerp(this.tmpC2.set('#2a3352'), N); W.cloudMat.emissive.copy(W.cloudMat.color); W.cloudMat.emissiveIntensity = lerp(0.12, 0.35, D);
    // esti fények
    const lit = smoothstep(0.25, 0.75, N + tw * 0.4);
    this.props.lampMat.emissiveIntensity = lit * 3.2; this.props.glassMat.emissiveIntensity = lit * 0.9;
    this.house.lampMat.emissiveIntensity = 0.15 + lit * 2.6; this.house.glassMat.emissiveIntensity = lit * 1.3;
    this.house.ceilMat.emissiveIntensity = 0.12 + D * 0.75 + lit * 0.25;
    this.house.glassInMat.emissiveIntensity = D * 0.95; this.house.glassInMat.emissive.set('#d4e9ff').lerp(this.tmpC.set('#ffc39a'), tw);
    this.yardLight.intensity = lit * 14;
    this.house.light.intensity = inside ? 4 + lit * 16 : lit * 6;
    // madarak csak nappal, pillangók nyáron/tavasszal
    if (this.fauna.birds) this.fauna.birds.visible = D > 0.35;
    if (this.fauna.bf) this.fauna.bf.visible = D > 0.35 && (this.season === 'nyar' || this.season === 'tavasz');
    // csapadék
    if (this.precip.visible) {
      this.pU.uTime.value = time; this.pU.uCam.value.copy(camera.position);
      this.pU.uBright.value = lerp(0.35, 1, D);
      this.precip.material.visible = !inside;
    }
  }
}
