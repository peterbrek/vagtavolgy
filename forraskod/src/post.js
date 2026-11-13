import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

// Színkorrekció: telítettség, enyhén meleg tónus, finom vignetta (lineáris térben, tónusleképezés előtt)
const Grade = {
  uniforms: { tDiffuse: { value: null }, uSat: { value: 1.17 }, uVig: { value: 0.34 }, uWarm: { value: new THREE.Vector3(1.035, 1.0, 0.955) }, uCon: { value: 1.06 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uSat, uVig, uCon; uniform vec3 uWarm; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      c.rgb = max(mix(vec3(l), c.rgb, uSat), 0.0) * uWarm;
      c.rgb = pow(c.rgb, vec3(uCon)) * 1.04;
      vec2 d = vUv - 0.5; c.rgb *= 1.0 - uVig * dot(d, d) * 1.8;
      gl_FragColor = c;
    }`,
};

export class Post {
  constructor(renderer, scene, camera) {
    this.r = renderer; this.scene = scene; this.camera = camera; this.q = null; this.composer = null;
  }
  setQuality(q) {
    if (this.q === q) return; this.q = q;
    if (this.composer) { this.composer.dispose(); this.composer = null; }
    if (q === 'gyors') return;
    const size = this.r.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q === 'szep' ? 4 : 2 });
    const c = new EffectComposer(this.r, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), q === 'szep' ? 0.32 : 0.25, 0.55, 0.92);
    c.addPass(this.bloom);
    c.addPass(new ShaderPass(Grade));
    c.addPass(new OutputPass());
    this.composer = c;
    this.resize();
  }
  resize() {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.r.getPixelRatio());
    this.composer.setSize(innerWidth, innerHeight);
  }
  render() {
    if (this.composer) this.composer.render(); else this.r.render(this.scene, this.camera);
  }
}
