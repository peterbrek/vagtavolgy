import * as THREE from 'three';

// Low-poly stílus: lapos árnyalás, egyszínű lapok, enyhe laponkénti színeltérés.

// determinisztikus 3D érték-zaj (JS) a foltokhoz, sárhoz
function h3(x, y, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
export function vnoise3(x, y, z) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  let fx = x - ix, fy = y - iy, fz = z - iz;
  fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (dx, dy, dz) => h3(ix + dx, iy + dy, iz + dz);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), fx), l(c(0, 1, 0), c(1, 1, 0), fx), fy), l(l(c(0, 0, 1), c(1, 0, 1), fx), l(c(0, 1, 1), c(1, 1, 1), fx), fy), fz);
}
export const hashF = (a, b = 0, c = 0) => h3(Math.round(a * 1000), Math.round(b * 1000), Math.round(c * 1000));

// lapos árnyalású anyag
export function flat(color, o = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, flatShading: true, ...o });
}
export function flatL(color, o = {}) {
  return new THREE.MeshLambertMaterial({ color, flatShading: true, ...o });
}

// geometria lapjainak adatai (nem indexelt): középpont, normális
export function faceInfo(geo) {
  const p = geo.attributes.position, n = p.count / 3;
  const cent = new Float32Array(n * 3), nrm = new Float32Array(n * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), e1 = new THREE.Vector3(), e2 = new THREE.Vector3();
  for (let f = 0; f < n; f++) {
    a.fromBufferAttribute(p, f * 3); b.fromBufferAttribute(p, f * 3 + 1); c.fromBufferAttribute(p, f * 3 + 2);
    cent[f * 3] = (a.x + b.x + c.x) / 3; cent[f * 3 + 1] = (a.y + b.y + c.y) / 3; cent[f * 3 + 2] = (a.z + b.z + c.z) / 3;
    e1.subVectors(b, a); e2.subVectors(c, a); e1.cross(e2).normalize();
    nrm[f * 3] = e1.x; nrm[f * 3 + 1] = e1.y; nrm[f * 3 + 2] = e1.z;
  }
  return { n, cent, nrm };
}

// laponként színez: fn(cx, cy, cz, nx, ny, nz, f, out) → out (THREE.Color)
export function paintFaces(geo, fn) {
  if (geo.index) geo = geo.toNonIndexed();
  const fi = faceInfo(geo), col = new Float32Array(fi.n * 9), c = new THREE.Color();
  for (let f = 0; f < fi.n; f++) {
    fn(fi.cent[f * 3], fi.cent[f * 3 + 1], fi.cent[f * 3 + 2], fi.nrm[f * 3], fi.nrm[f * 3 + 1], fi.nrm[f * 3 + 2], f, c);
    for (let k = 0; k < 3; k++) { col[f * 9 + k * 3] = c.r; col[f * 9 + k * 3 + 1] = c.g; col[f * 9 + k * 3 + 2] = c.b; }
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// egyszínű festés laponkénti enyhe eltéréssel
export function tint(geo, color, vary = 0.08, seed = 1) {
  const base = new THREE.Color(color);
  return paintFaces(geo, (x, y, z, nx, ny, nz, f, out) => out.copy(base).multiplyScalar(1 - vary + hashF(x + seed, y, z) * vary * 2));
}

// csúcsok enyhe elmozdítása (szabálytalanabb, "faragott" forma)
export function jitter(geo, amt, seed = 1) {
  const p = geo.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    p.setXYZ(i, x + (hashF(x, y + seed, z) - 0.5) * amt, y + (hashF(z, x, y + seed) - 0.5) * amt, z + (hashF(y + seed, z, x) - 0.5) * amt);
  }
  return geo;
}

// textúra átlagszíne (vászon-alapú textúrákhoz)
function avgColor(tex) {
  const img = tex.image; if (!img || !img.width) return null;
  try {
    const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d');
    x.drawImage(img, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data;
    let r = 0, g = 0, b = 0; for (let i = 0; i < 64; i++) { r += d[i * 4]; g += d[i * 4 + 1]; b += d[i * 4 + 2]; }
    return new THREE.Color().setRGB(r / 64 / 255, g / 64 / 255, b / 64 / 255, THREE.SRGBColorSpace);
  } catch (e) { return null; }
}

// A már felépített jelenet anyagainak átállítása: lapos árnyalás, mintás textúrák helyett átlagszín.
// A feliratok, számtáblák, csíkos rudak textúrája megmarad (userData.keep).
export function lowpolyfy(root) {
  const done = new Set();
  root.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of mats) {
      if (!m || done.has(m)) continue; done.add(m);
      if (m.isShaderMaterial || m.isMeshBasicMaterial || m.userData.lpSkip) continue;
      if (!(m.isMeshLambertMaterial || m.isMeshStandardMaterial || m.isMeshPhongMaterial)) continue;
      if (m.map && !(m.map.userData && m.map.userData.keep)) {
        const a = avgColor(m.map);
        if (a) m.color.multiply(a);
        m.map = null;
      }
      if (m.isMeshPhysicalMaterial) { m.clearcoat = 0; m.sheen = 0; }
      if (m.isMeshStandardMaterial && m.roughness < 0.5 && m.metalness < 0.3) m.roughness = 0.6;
      m.flatShading = true; m.needsUpdate = true;
    }
  });
}
