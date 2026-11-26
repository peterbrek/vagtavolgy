import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { mulberry32, hash2 } from './noise.js';

// A ló körül folyamatosan újraszórt, szélben hajló fű és virágok.
export class Grass {
  constructor(world, scene, quality) {
    this.world = world;
    this.radius = quality === 'low' ? 34 : 52;
    this.cell = quality === 'low' ? 1.05 : 0.82;
    const maxN = Math.ceil(Math.PI * (this.radius / this.cell) ** 2 * 1.02);
    this.uniforms = { uTime: { value: 0 }, uCenter: { value: new THREE.Vector2() }, uRadius: { value: this.radius }, uHorse: { value: new THREE.Vector3(0, 0, -999) }, uSnow: { value: 0 }, uGrassTint: { value: new THREE.Color(1, 1, 1) } };

    // fűcsomó: 6 penge
    const r = mulberry32(3), blades = [];
    for (let b = 0; b < 6; b++) {
      const h = 0.3 + r() * 0.32, w = 0.045 + r() * 0.03, bend = (r() - 0.3) * 0.18;
      const ox = (r() - 0.5) * 0.26, oz = (r() - 0.5) * 0.26, a = r() * Math.PI;
      const v = [[-w / 2, 0, 0], [w / 2, 0, 0], [-w * 0.32, h * 0.55, bend * 0.4], [w * 0.32, h * 0.55, bend * 0.4], [0, h, bend]];
      const pos = [], col = [];
      const ca = Math.cos(a), sa = Math.sin(a);
      for (const [x, y, z] of v) {
        pos.push(ox + x * ca + z * sa, y, oz - x * sa + z * ca);
        const t = y / 0.62; const c = 0.5 + t * 0.75; col.push(c, c, c * 0.92);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(new Array(15).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
      g.setIndex([0, 1, 2, 1, 3, 2, 2, 3, 4]);
      blades.push(g);
    }
    const geo = mergeGeometries(blades);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
    this.patch(mat, 1.0);
    this.mesh = new THREE.InstancedMesh(geo, mat, maxN);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false; this.mesh.receiveShadow = quality !== 'low';
    this.mesh.count = 0;
    this.mesh.setColorAt(0, new THREE.Color());
    scene.add(this.mesh);

    // virágok
    const petals = [];
    for (let k = 0; k < 5; k++) {
      const s = new THREE.SphereGeometry(0.035, 5, 3); s.scale(1, 0.35, 0.55);
      const a = (k / 5) * Math.PI * 2; s.translate(Math.cos(a) * 0.035, 0, Math.sin(a) * 0.035); s.deleteAttribute('uv'); petals.push(s);
    }
    const fgeo = mergeGeometries(petals.map((g) => g.toNonIndexed())); fgeo.translate(0, 0.32, 0);
    const fmat = new THREE.MeshLambertMaterial({ });
    this.patch(fmat, 0.6);
    this.flowers = new THREE.InstancedMesh(fgeo, fmat, 2200);
    this.flowers.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.flowers.frustumCulled = false; this.flowers.count = 0;
    this.flowers.setColorAt(0, new THREE.Color());
    scene.add(this.flowers);
    this.fcols = ['#ffffff', '#f6e04a', '#e9548c', '#a77be0', '#ff8a3d', '#f4f1de', '#5d8ff0'].map((c) => new THREE.Color(c));
    this.last = new THREE.Vector2(1e9, 1e9);
  }

  setQuality(q) {
    this.radius = q === 'gyors' ? 34 : 52; this.cell = q === 'gyors' ? 1.05 : 0.82;
    this.uniforms.uRadius.value = this.radius; this.last.set(1e9, 1e9);
  }
  patch(mat, windAmt) {
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, this.uniforms);
      sh.vertexShader = 'uniform float uTime; uniform vec2 uCenter; uniform float uRadius; uniform vec3 uHorse; uniform float uSnow;\n' + sh.vertexShader
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
          float fd = distance(ip.xz, uCenter);
          transformed *= 1.0 - smoothstep(uRadius*0.72, uRadius, fd);
          transformed.y *= 1.0 - uSnow * 0.72;`)
        .replace('#include <project_vertex>', `
          vec4 mvPosition = vec4(transformed, 1.0);
          mvPosition = instanceMatrix * mvPosition;
          float hy = transformed.y * transformed.y;
          float w = sin(uTime*1.7 + ip.x*0.31 + ip.z*0.23)*0.6 + sin(uTime*2.9 + ip.x*0.8 - ip.z*0.5)*0.25;
          mvPosition.x += w * hy * ${(0.75 * windAmt).toFixed(2)}; mvPosition.z += w * hy * ${(0.4 * windAmt).toFixed(2)};
          vec2 away = mvPosition.xz - uHorse.xz; float ad = length(away);
          float push = (1.0 - smoothstep(0.4, 1.5, ad)) * uHorse.y;
          mvPosition.xz += normalize(away + 1e-4) * push * hy * 2.2; mvPosition.y -= push * hy * 0.8;
          mvPosition = modelViewMatrix * mvPosition;
          gl_Position = projectionMatrix * mvPosition;`);
      sh.fragmentShader = 'uniform float uSnow; uniform vec3 uGrassTint;\n' + sh.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\n normal = normalize(vNormal);')
        .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb *= uGrassTint; diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.8,0.84,0.9), uSnow*0.6);');
    };
  }

  update(px, pz, time, horse) {
    this.uniforms.uTime.value = time;
    this.uniforms.uCenter.value.set(px, pz);
    if (horse) this.uniforms.uHorse.value.set(horse.x, 1, horse.z); else this.uniforms.uHorse.value.set(0, 0, -999);
    if (Math.hypot(px - this.last.x, pz - this.last.y) < 3) return;
    this.last.set(px, pz);
    const W = this.world, R = this.radius, cs = this.cell, R2 = R * R;
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0), c = new THREE.Color();
    const i0 = Math.floor((px - R) / cs), i1 = Math.ceil((px + R) / cs), j0 = Math.floor((pz - R) / cs), j1 = Math.ceil((pz + R) / cs);
    let n = 0, nf = 0; const max = this.mesh.instanceMatrix.count, fmax = 2200;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const hx = hash2(i, j), hz = hash2(i + 917, j - 331);
      const x = (i + hx) * cs, z = (j + hz) * cs;
      const dx = x - px, dz = z - pz; if (dx * dx + dz * dz > R2) continue;
      const d = W.grassDensity(x, z); const hr = hash2(i * 3 + 7, j * 5 - 2);
      if (hr > d) continue;
      const y = W.heightAt(x, z);
      const sc = 0.65 + hash2(i - 41, j + 13) * 0.7 * (0.6 + d * 0.6);
      p.set(x, y - 0.03, z); q.setFromAxisAngle(up, hash2(i + 5, j + 9) * 6.283); s.set(sc, sc * (0.8 + hr * 0.5), sc);
      m.compose(p, q, s);
      if (n < max) {
        this.mesh.setMatrixAt(n, m);
        W.gridColor(x, z, c); c.multiplyScalar(0.95 + hash2(i, j + 77) * 0.25);
        this.mesh.setColorAt(n, c); n++;
      }
      if (nf < fmax && d > 0.5 && hash2(i + 333, j - 999) < 0.045 * d) {
        const fs = 0.8 + hr * 0.6; s.set(fs, fs * (0.7 + hx), fs); m.compose(p, q, s);
        this.flowers.setMatrixAt(nf, m);
        const pick = Math.floor(hash2(Math.floor(i / 9), Math.floor(j / 9)) * this.fcols.length);
        this.flowers.setColorAt(nf, hash2(i, j - 5) < 0.75 ? this.fcols[pick] : this.fcols[(pick + 2) % this.fcols.length]); nf++;
      }
    }
    this.mesh.count = n; this.flowers.count = nf;
    this.mesh.instanceMatrix.needsUpdate = true; if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.flowers.instanceMatrix.needsUpdate = true; if (this.flowers.instanceColor) this.flowers.instanceColor.needsUpdate = true;
  }
}
