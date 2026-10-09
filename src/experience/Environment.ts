/**
 * The stage: light, reflections, floor, sky and atmosphere.
 *
 * Gold only looks like gold when it has something bright to reflect, so the
 * environment map is a small virtual photo studio (dark room + softboxes)
 * rendered once into a prefiltered PMREM cube. Three lights do the rest:
 * a warm key that casts the only shadow, a cool rim that separates silhouettes
 * from the dark background, and a faint hemisphere fill.
 */
import * as THREE from 'three';
import type { QualitySettings } from '../systems/QualityManager.ts';

export interface EnvironmentState {
  /** Sky colours (linear RGB). */
  skyTop: THREE.Color;
  skyHorizon: THREE.Color;
  /** 0..1 floor visibility (0 in deep space / portal). */
  floor: number;
  /** World position the key light and shadow frustum follow. */
  stage: THREE.Vector3;
  /** Multiplier on light intensities. */
  exposure: number;
  /** Strength of the cyan accent light (project worlds). */
  accent: number;
}

const SKY_VERTEX = /* glsl */ `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * p;
  gl_Position.z = gl_Position.w; // always at the far plane
}`;

const SKY_FRAGMENT = /* glsl */ `
uniform vec3 uTop;
uniform vec3 uHorizon;
varying vec3 vDir;
void main() {
  float h = clamp(vDir.y, -1.0, 1.0);
  float t = smoothstep(-0.05, 0.65, h);
  vec3 c = mix(uHorizon, uTop, t);
  // A soft band of light just above the horizon gives depth to the void.
  c += uHorizon * 0.35 * exp(-pow((h - 0.04) * 9.0, 2.0));
  gl_FragColor = vec4(c, 1.0);
}`;

export class Environment {
  readonly group = new THREE.Group();
  readonly envMap: THREE.Texture;
  readonly key: THREE.DirectionalLight;
  readonly rim: THREE.DirectionalLight;
  readonly accent: THREE.PointLight;
  readonly fill: THREE.HemisphereLight;
  readonly fog: THREE.Fog;
  private readonly floor: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshStandardMaterial>;
  private readonly sky: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private readonly dust: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private readonly floorUniforms = { uStage: { value: new THREE.Vector3() }, uGridFade: { value: 1 } };
  private readonly disposables: { dispose(): void }[] = [];

  constructor(renderer: THREE.WebGLRenderer, quality: QualitySettings) {
    this.group.name = 'Environment';
    this.envMap = buildStudioEnvironment(renderer);
    this.disposables.push(this.envMap);

    this.key = new THREE.DirectionalLight(0xffe9cf, 3.0);
    this.key.position.set(-3.5, 6, 4.5);
    this.key.castShadow = quality.shadows;
    this.key.shadow.mapSize.setScalar(quality.shadowMapSize);
    const sc = this.key.shadow.camera;
    sc.left = -4; sc.right = 4; sc.top = 4; sc.bottom = -4; sc.near = 0.5; sc.far = 20;
    this.key.shadow.bias = -0.0004;
    this.key.shadow.normalBias = 0.02;
    this.key.shadow.radius = 3;
    this.group.add(this.key, this.key.target);

    this.rim = new THREE.DirectionalLight(0x9fbfff, 2.2);
    this.rim.position.set(4, 3.5, -5);
    this.group.add(this.rim, this.rim.target);

    this.fill = new THREE.HemisphereLight(0x2a3a66, 0x07080d, 0.35);
    this.group.add(this.fill);

    this.accent = new THREE.PointLight(0x5ce1e6, 0, 9, 1.6);
    this.accent.position.set(0, 2.5, 2);
    this.group.add(this.accent);

    this.fog = new THREE.Fog(0x070a16, 14, 46);

    // Floor: dark lacquer with a faint pixel grid that fades away from the stage.
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x04050a, roughness: 0.5, metalness: 0.0, envMapIntensity: 0.3, transparent: true });
    floorMat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, this.floorUniforms);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vWorld;')
        .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;');
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform vec3 uStage;\nuniform float uGridFade;\nvarying vec3 vWorld;\nfloat gridLine(vec2 p, float cell) { vec2 g = abs(fract(p / cell - 0.5) - 0.5) * cell; vec2 w = fwidth(p) * 1.2; vec2 l = 1.0 - smoothstep(vec2(0.0), w, g); return max(l.x, l.y); }')
        .replace(
          '#include <emissivemap_fragment>',
          `#include <emissivemap_fragment>
          float r = length(vWorld.xz - uStage.xz);
          float near = exp(-r * r / 30.0) * smoothstep(0.6, 2.2, r);
          float grid = gridLine(vWorld.xz, 0.5) * 0.4 + gridLine(vWorld.xz, 2.5) * 0.6;
          totalEmissiveRadiance += vec3(0.012, 0.016, 0.03) * grid * near * uGridFade;
          totalEmissiveRadiance += vec3(0.035, 0.026, 0.014) * exp(-r * r / 5.0);`,
        );
    };
    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(240, 240), floorMat);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = quality.shadows;
    this.floor.name = 'Floor';
    this.group.add(this.floor);

    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(400, 32, 16),
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        uniforms: { uTop: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() } },
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
      }),
    );
    this.sky.renderOrder = -10;
    this.sky.frustumCulled = false;
    this.group.add(this.sky);

    this.dust = buildDust(quality.dustCount);
    this.group.add(this.dust);

    this.disposables.push(this.floor.geometry, floorMat, this.sky.geometry, this.sky.material, this.dust.geometry, this.dust.material);
  }

  apply(state: EnvironmentState, time: number, cameraPosition: THREE.Vector3): void {
    (this.sky.material.uniforms.uTop.value as THREE.Color).copy(state.skyTop);
    (this.sky.material.uniforms.uHorizon.value as THREE.Color).copy(state.skyHorizon);
    this.sky.position.copy(cameraPosition);
    this.fog.color.copy(state.skyHorizon);

    const f = state.floor;
    this.floor.visible = f > 0.01;
    this.floor.material.opacity = f;
    this.floorUniforms.uStage.value.copy(state.stage);
    this.floorUniforms.uGridFade.value = f;

    this.key.intensity = 3.0 * state.exposure;
    this.rim.intensity = 2.2 * state.exposure;
    this.fill.intensity = 0.35 * state.exposure;
    this.key.position.set(state.stage.x - 3.5, state.stage.y + 6, state.stage.z + 4.5);
    this.key.target.position.copy(state.stage);
    this.rim.position.set(state.stage.x + 4, state.stage.y + 3.5, state.stage.z - 5);
    this.rim.target.position.copy(state.stage);
    this.accent.intensity = state.accent * 6;
    this.accent.position.set(state.stage.x, state.stage.y + 2.2, state.stage.z + 2.2);

    this.dust.position.set(cameraPosition.x, 0, cameraPosition.z);
    this.dust.material.uniforms.uTime.value = time;
    this.dust.material.uniforms.uOrigin.value.copy(cameraPosition);
  }

  setShadows(enabled: boolean, size: number): void {
    this.key.castShadow = enabled;
    this.floor.receiveShadow = enabled;
    if (this.key.shadow.mapSize.x !== size) {
      this.key.shadow.mapSize.setScalar(size);
      this.key.shadow.map?.dispose();
      this.key.shadow.map = null;
    }
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.key.shadow.map?.dispose();
  }
}

function buildStudioEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const scene = new THREE.Scene();
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(20, 12, 20),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0.012, 0.016, 0.03), side: THREE.BackSide }),
  );
  room.position.y = 4;
  scene.add(room);
  const panel = (w: number, h: number, color: THREE.Color, pos: [number, number, number], look: [number, number, number]) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide }));
    m.position.set(...pos);
    m.lookAt(...look);
    scene.add(m);
  };
  panel(4, 4, new THREE.Color(1.0, 0.9, 0.78).multiplyScalar(7), [-5, 6, 5], [0, 1, 0]); // warm key softbox
  panel(1.2, 7, new THREE.Color(0.55, 0.7, 1.0).multiplyScalar(6), [6, 4, -5], [0, 1, 0]); // cool rim strip
  panel(8, 3, new THREE.Color(1, 1, 1).multiplyScalar(1.6), [0, 9.5, 0], [0, 0, 0]); // overhead
  panel(10, 0.25, new THREE.Color(0.36, 0.88, 0.9).multiplyScalar(2.2), [0, 1.2, -9.5], [0, 1.2, 0]); // cyan accent line
  panel(6, 1.5, new THREE.Color(0.9, 0.62, 0.3).multiplyScalar(0.35), [0, -1.8, 4], [0, 1, 0]); // warm floor bounce
  const pmrem = new THREE.PMREMGenerator(renderer);
  const target = pmrem.fromScene(scene, 0.02);
  pmrem.dispose();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
  return target.texture;
}

function buildDust(count: number): THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    // Deterministic placement (golden-ratio sequence), no Math.random.
    positions[i * 3] = ((i * 0.618034) % 1 - 0.5) * 24;
    positions[i * 3 + 1] = ((i * 0.754877) % 1) * 7;
    positions[i * 3 + 2] = ((i * 0.569840) % 1 - 0.5) * 24;
    seeds[i] = (i * 0.381966) % 1;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('seed', new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uOrigin: { value: new THREE.Vector3() }, uPixelRatio: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float seed;
      uniform float uTime;
      uniform vec3 uOrigin;
      varying float vAlpha;
      void main() {
        vec3 p = position;
        p.y = mod(p.y + uTime * (0.04 + seed * 0.05), 7.0);
        p.x += sin(uTime * 0.2 + seed * 40.0) * 0.4;
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        float d = -mv.z;
        vAlpha = smoothstep(0.5, 3.0, d) * (1.0 - smoothstep(9.0, 16.0, d)) * (0.25 + 0.75 * seed);
        gl_PointSize = clamp(18.0 / d, 1.0, 4.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      void main() {
        float r = length(gl_PointCoord - 0.5);
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * 0.9, vAlpha * smoothstep(0.5, 0.0, r) * 0.55);
      }`,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.name = 'Dust';
  return points;
}
