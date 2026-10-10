/**
 * Shader effects that are not made of voxels. Each is one additive quad whose
 * look is computed in the fragment shader, with UVs quantised to a pixel grid
 * so the effects speak the same pixel language as Poko.
 *
 *  Rift          the disturbance that startles Poko: a pulsing square vortex
 *  PortalHorizon the far end of the voxel tunnel: concentric square waves
 *  ScanBeam      CardRails's scanner: a sweeping band of light in the gate
 */
import * as THREE from 'three';

const QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}`;

const PIXEL_HELPERS = /* glsl */ `
float squareDist(vec2 p) { return max(abs(p.x), abs(p.y)); }
vec2 rot(vec2 p, float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c) * p; }
float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
`;

const RIFT_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;
${PIXEL_HELPERS}
void main() {
  vec2 cell = floor(vUv * 48.0) / 48.0 + 0.5 / 48.0;      // pixel grid
  vec2 p = cell - 0.5;
  float r = length(p);
  float d = squareDist(rot(p, uTime * 0.6 + r * 6.0));
  float rings = 0.5 + 0.5 * sin(d * 70.0 - uTime * 7.0);
  float core = smoothstep(0.32 * uStrength, 0.0, d);
  float edge = exp(-pow((d - 0.22 * uStrength) * 22.0, 2.0));
  float sparkle = step(0.985, hash12(cell * 91.0 + floor(uTime * 12.0))) * smoothstep(0.45, 0.1, r);
  vec3 cyan = vec3(0.36, 0.88, 0.9);
  vec3 gold = vec3(1.0, 0.78, 0.25);
  vec3 c = cyan * edge * 2.6 + mix(cyan, gold, rings) * core * rings * 0.9 + gold * sparkle * 2.0;
  float fade = smoothstep(0.5, 0.25, r);
  gl_FragColor = vec4(c * fade * uStrength, 1.0);
}`;

const HORIZON_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;
${PIXEL_HELPERS}
void main() {
  vec2 cell = floor(vUv * 64.0) / 64.0 + 0.5 / 64.0;
  vec2 p = cell - 0.5;
  float d = squareDist(rot(p, uTime * 0.25));
  float waves = pow(0.5 + 0.5 * sin(d * 60.0 + uTime * 5.0), 3.0);
  float center = exp(-d * 9.0);
  vec3 cyan = vec3(0.36, 0.88, 0.9);
  vec3 gold = vec3(1.0, 0.82, 0.3);
  vec3 c = mix(gold, cyan, smoothstep(0.05, 0.4, d)) * waves * 1.2 + vec3(1.0, 0.95, 0.85) * center * 2.5;
  float fade = smoothstep(0.5, 0.4, d);
  gl_FragColor = vec4(c * fade * uStrength, 1.0);
}`;

const SCAN_FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uStrength;
varying vec2 vUv;
// A clean line with a soft trail. No stripe texture or stepped rows: at the
// gate's on-screen size those aliased into moiré and read as a glitch.
void main() {
  float sweep = fract(uTime * 0.45);
  float y = vUv.y;
  float band = exp(-pow((y - sweep) * 26.0, 2.0));
  float trail = smoothstep(sweep - 0.3, sweep, y) * step(y, sweep) * 0.12;
  // Fade in at the bottom and out at the top, so the wrap-around never jumps.
  float ends = smoothstep(0.0, 0.08, sweep) * (1.0 - smoothstep(0.9, 1.0, sweep));
  vec3 c = vec3(0.36, 0.88, 0.9) * (band * 2.0 + trail) * ends;
  gl_FragColor = vec4(c * uStrength, 1.0);
}`;

function additive(fragment: string): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    vertexShader: QUAD_VERTEX,
    fragmentShader: fragment,
    uniforms: { uTime: { value: 0 }, uStrength: { value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: false,
  });
}

export class Effects {
  readonly group = new THREE.Group();
  private readonly rift: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly horizon: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private readonly scan: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;

  constructor(opts: {
    rift: THREE.Vector3;
    horizon: THREE.Vector3;
    horizonSize: number;
    scanCenter: THREE.Vector3;
    scanYaw: number;
    scanSize: [number, number];
  }) {
    this.group.name = 'Effects';
    this.rift = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 2.6), additive(RIFT_FRAGMENT));
    this.rift.position.copy(opts.rift);
    this.horizon = new THREE.Mesh(new THREE.PlaneGeometry(opts.horizonSize, opts.horizonSize), additive(HORIZON_FRAGMENT));
    this.horizon.position.copy(opts.horizon);
    this.scan = new THREE.Mesh(new THREE.PlaneGeometry(...opts.scanSize), additive(SCAN_FRAGMENT));
    this.scan.position.copy(opts.scanCenter);
    this.scan.rotation.y = opts.scanYaw;
    for (const m of [this.rift, this.horizon, this.scan]) {
      m.frustumCulled = true;
      m.renderOrder = 5;
      this.group.add(m);
    }
  }

  update(time: number, rift: number, portal: number, scan: number): void {
    const set = (m: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>, s: number, scale = 1) => {
      m.visible = s > 0.002;
      m.material.uniforms.uStrength.value = s;
      m.material.uniforms.uTime.value = time;
      m.scale.setScalar(scale);
    };
    set(this.rift, rift, 0.4 + 0.6 * rift);
    set(this.horizon, portal);
    set(this.scan, scan);
  }

  dispose(): void {
    for (const m of [this.rift, this.horizon, this.scan]) {
      m.geometry.dispose();
      m.material.dispose();
    }
  }
}
