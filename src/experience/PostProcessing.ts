/**
 * Post-processing, hand-rolled so every pass is explicit and cheap.
 *
 *   scene ──► HDR target (half float, MSAA) ──┬───────────────────────────┐
 *                                              │ prefilter (threshold)      │
 *                                              ▼                            │
 *                         bloom down 1/2 → 1/4 → 1/8 → 1/16 → 1/32          │
 *                         bloom up   1/16 ← 1/8 ← 1/4 ← 1/2  (+ each level) │
 *                                              ▼                            ▼
 *                       composite: bloom + flash + warp/aberration + tone map
 *                                  + vignette + grain + sRGB  ──► screen
 *
 * Bloom uses the dual filter (Bjørge, "Bandwidth-Efficient Rendering", 2015):
 * each level reads 5 (down) or 8 (up) bilinear taps, so a wide, smooth glow
 * costs a handful of small passes instead of a large Gaussian.
 *
 * Tone mapping is Khronos PBR Neutral: it leaves mid-tones and saturated brand
 * colours almost untouched, so Poko's gold stays #ffcb03-ish instead of shifting
 * orange (ACES) or desaturating (AgX).
 */
import * as THREE from 'three';
import type { QualitySettings } from '../systems/QualityManager.ts';

const FULLSCREEN_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() { vUv = position.xy * 0.5 + 0.5; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

const PREFILTER = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
uniform float uThreshold;
varying vec2 vUv;
vec3 tap(vec2 uv) {
  vec3 c = texture2D(tInput, uv).rgb;
  float l = max(c.r, max(c.g, c.b));
  float soft = clamp(l - uThreshold + 0.5, 0.0, 1.0);
  soft = soft * soft * 0.5;
  float w = max(soft, l - uThreshold) / max(l, 1e-4);
  return c * w;
}
void main() {
  vec2 h = uTexel;
  vec3 s = tap(vUv) * 4.0 + tap(vUv - h) + tap(vUv + h) + tap(vUv + vec2(h.x, -h.y)) + tap(vUv - vec2(h.x, -h.y));
  gl_FragColor = vec4(min(s / 8.0, vec3(64.0)), 1.0);
}`;

const DOWN = /* glsl */ `
uniform sampler2D tInput;
uniform vec2 uTexel;
varying vec2 vUv;
void main() {
  vec2 h = uTexel;
  vec3 s = texture2D(tInput, vUv).rgb * 4.0
    + texture2D(tInput, vUv - h).rgb + texture2D(tInput, vUv + h).rgb
    + texture2D(tInput, vUv + vec2(h.x, -h.y)).rgb + texture2D(tInput, vUv - vec2(h.x, -h.y)).rgb;
  gl_FragColor = vec4(s / 8.0, 1.0);
}`;

const UP = /* glsl */ `
uniform sampler2D tInput;   // lower resolution, already accumulated
uniform sampler2D tLevel;   // this level's downsampled image
uniform vec2 uTexel;        // texel of tInput
varying vec2 vUv;
void main() {
  vec2 h = uTexel;
  vec3 s = texture2D(tInput, vUv + vec2(-h.x * 2.0, 0.0)).rgb
    + texture2D(tInput, vUv + vec2(-h.x, h.y)).rgb * 2.0
    + texture2D(tInput, vUv + vec2(0.0, h.y * 2.0)).rgb
    + texture2D(tInput, vUv + vec2(h.x, h.y)).rgb * 2.0
    + texture2D(tInput, vUv + vec2(h.x * 2.0, 0.0)).rgb
    + texture2D(tInput, vUv + vec2(h.x, -h.y)).rgb * 2.0
    + texture2D(tInput, vUv + vec2(0.0, -h.y * 2.0)).rgb
    + texture2D(tInput, vUv + vec2(-h.x, -h.y)).rgb * 2.0;
  gl_FragColor = vec4(s / 12.0 + texture2D(tLevel, vUv).rgb, 1.0);
}`;

const COMPOSITE = /* glsl */ `
uniform sampler2D tScene;
uniform sampler2D tBloom;
uniform float uBloom;
uniform float uFlash;
uniform float uWarp;
uniform float uVignette;
uniform float uExposure;
uniform float uTime;
uniform float uGrain;
varying vec2 vUv;

// Khronos PBR Neutral tone mapping (https://modelviewer.dev/examples/tone-mapping)
vec3 neutral(vec3 color) {
  const float startCompression = 0.8 - 0.04;
  const float desaturation = 0.15;
  float x = min(color.r, min(color.g, color.b));
  float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
  color -= offset;
  float peak = max(color.r, max(color.g, color.b));
  if (peak < startCompression) return color;
  const float d = 1.0 - startCompression;
  float newPeak = 1.0 - d * d / (peak + d - startCompression);
  color *= newPeak / peak;
  float g = 1.0 - 1.0 / (desaturation * (peak - newPeak) + 1.0);
  return mix(color, vec3(newPeak), g);
}
vec3 toSRGB(vec3 c) {
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(vec3(0.0031308), c));
}
float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }

void main() {
  vec2 c = vUv - 0.5;
  float r2 = dot(c, c);
  // Barrel warp and chromatic aberration grow towards the edges while flying.
  vec2 uv = 0.5 + c * (1.0 + uWarp * 0.32 * r2) * (1.0 - uWarp * 0.05);
  vec2 ca = c * uWarp * 0.014;
  vec3 col = vec3(texture2D(tScene, uv + ca).r, texture2D(tScene, uv).g, texture2D(tScene, uv - ca).b);
  col += texture2D(tBloom, uv).rgb * uBloom;
  col += vec3(1.0, 0.96, 0.88) * uFlash * (1.6 - r2 * 2.0);
  col = neutral(col * uExposure);
  float vig = smoothstep(0.95, 0.25, length(c * vec2(1.05, 0.95)) * 1.25);
  col *= mix(1.0, vig, uVignette * 0.6);
  col = toSRGB(clamp(col, 0.0, 1.0));
  // Grain and dither in display space, which also hides gradient banding.
  col += (hash(gl_FragCoord.xy + fract(uTime) * 97.0) - 0.5) * uGrain;
  gl_FragColor = vec4(col, 1.0);
}`;

const LEVELS = 5;

export interface PostParams {
  bloom: number;
  flash: number;
  warp: number;
  vignette: number;
  exposure: number;
}

export class PostProcessing {
  private scene: THREE.WebGLRenderTarget;
  private readonly down: THREE.WebGLRenderTarget[] = [];
  private readonly up: THREE.WebGLRenderTarget[] = [];
  private readonly quad: THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly camera = new THREE.Camera();
  private readonly prefilter: THREE.ShaderMaterial;
  private readonly downMat: THREE.ShaderMaterial;
  private readonly upMat: THREE.ShaderMaterial;
  private readonly composite: THREE.ShaderMaterial;
  private bloomEnabled: boolean;
  private readonly black = new THREE.DataTexture(new Uint8Array([0, 0, 0, 255]), 1, 1);

  constructor(private readonly renderer: THREE.WebGLRenderer, quality: QualitySettings) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-1, -1, 0, 3, -1, 0, -1, 3, 0], 3));
    const mat = (fragmentShader: string, uniforms: Record<string, THREE.IUniform>) =>
      new THREE.ShaderMaterial({ vertexShader: FULLSCREEN_VERTEX, fragmentShader, uniforms, depthTest: false, depthWrite: false, toneMapped: false });
    this.prefilter = mat(PREFILTER, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() }, uThreshold: { value: 1.6 } });
    this.downMat = mat(DOWN, { tInput: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.upMat = mat(UP, { tInput: { value: null }, tLevel: { value: null }, uTexel: { value: new THREE.Vector2() } });
    this.composite = mat(COMPOSITE, {
      tScene: { value: null },
      tBloom: { value: this.black },
      uBloom: { value: 0.6 },
      uFlash: { value: 0 },
      uWarp: { value: 0 },
      uVignette: { value: 1 },
      uExposure: { value: 1 },
      uTime: { value: 0 },
      uGrain: { value: 0.022 },
    });
    this.black.needsUpdate = true;
    this.quad = new THREE.Mesh(geometry, this.composite);
    this.quad.frustumCulled = false;
    this.scene = this.makeSceneTarget(1, 1, quality.msaa);
    this.bloomEnabled = quality.bloom;
  }

  private makeSceneTarget(w: number, h: number, samples: number): THREE.WebGLRenderTarget {
    return new THREE.WebGLRenderTarget(w, h, {
      type: THREE.HalfFloatType,
      samples,
      depthBuffer: true,
      stencilBuffer: false,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
  }

  get target(): THREE.WebGLRenderTarget {
    return this.scene;
  }

  setQuality(q: QualitySettings): void {
    if (this.scene.samples !== q.msaa) {
      const { width, height } = this.scene;
      this.scene.dispose();
      this.scene = this.makeSceneTarget(width, height, q.msaa);
    }
    this.bloomEnabled = q.bloom;
  }

  setSize(width: number, height: number): void {
    this.scene.setSize(width, height);
    for (const rt of [...this.down, ...this.up]) rt.dispose();
    this.down.length = 0;
    this.up.length = 0;
    let w = width;
    let h = height;
    for (let i = 0; i < LEVELS; i++) {
      w = Math.max(1, Math.floor(w / 2));
      h = Math.max(1, Math.floor(h / 2));
      const opts = { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter } as const;
      this.down.push(new THREE.WebGLRenderTarget(w, h, opts));
      this.up.push(new THREE.WebGLRenderTarget(w, h, opts));
    }
  }

  private pass(material: THREE.ShaderMaterial, target: THREE.WebGLRenderTarget | null): void {
    this.quad.material = material;
    this.renderer.setRenderTarget(target);
    this.renderer.render(this.quad, this.camera);
  }

  /** Render `scene` through the chain to the canvas. Returns the number of post passes. */
  render(scene: THREE.Scene, camera: THREE.Camera, params: PostParams, time: number): number {
    const r = this.renderer;
    r.setRenderTarget(this.scene);
    r.render(scene, camera);
    let passes = 1;

    const bloomOn = this.bloomEnabled && params.bloom > 0.001 && this.down.length === LEVELS;
    if (bloomOn) {
      const src = this.scene.texture;
      this.prefilter.uniforms.tInput.value = src;
      this.prefilter.uniforms.uTexel.value.set(1 / this.scene.width, 1 / this.scene.height);
      this.pass(this.prefilter, this.down[0]);
      for (let i = 1; i < LEVELS; i++) {
        this.downMat.uniforms.tInput.value = this.down[i - 1].texture;
        this.downMat.uniforms.uTexel.value.set(1 / this.down[i - 1].width, 1 / this.down[i - 1].height);
        this.pass(this.downMat, this.down[i]);
      }
      let lower = this.down[LEVELS - 1];
      for (let i = LEVELS - 2; i >= 0; i--) {
        this.upMat.uniforms.tInput.value = lower.texture;
        this.upMat.uniforms.tLevel.value = this.down[i].texture;
        this.upMat.uniforms.uTexel.value.set(1 / lower.width, 1 / lower.height);
        this.pass(this.upMat, this.up[i]);
        lower = this.up[i];
      }
      passes += LEVELS * 2 - 1;
    }

    const u = this.composite.uniforms;
    u.tScene.value = this.scene.texture;
    u.tBloom.value = bloomOn ? this.up[0].texture : this.black;
    u.uBloom.value = params.bloom;
    u.uFlash.value = params.flash;
    u.uWarp.value = params.warp;
    u.uVignette.value = params.vignette;
    u.uExposure.value = params.exposure;
    u.uTime.value = time;
    this.pass(this.composite, null);
    return passes + 1;
  }

  /** Compile every pass's program ahead of the first frame. */
  async compile(between: () => Promise<void>): Promise<void> {
    const holder = new THREE.Scene();
    holder.add(this.quad);
    for (const m of [this.prefilter, this.downMat, this.upMat, this.composite]) {
      this.quad.material = m;
      await this.renderer.compileAsync(holder, this.camera);
      await between();
    }
    holder.remove(this.quad);
  }

  dispose(): void {
    this.scene.dispose();
    for (const rt of [...this.down, ...this.up]) rt.dispose();
    for (const m of [this.prefilter, this.downMat, this.upMat, this.composite]) m.dispose();
    this.quad.geometry.dispose();
    this.black.dispose();
  }
}
