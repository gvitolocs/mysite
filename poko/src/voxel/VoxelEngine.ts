/**
 * VoxelEngine: the GPU voxel system behind every transformation on the site.
 *
 *   formations (CPU, once)  →  FormationLibrary (textures)
 *   MorphParams (per frame) →  uniforms
 *   VoxelCompute (GPU)      →  per-voxel position / rotation / scale / colour
 *   voxel mesh (GPU)        →  one instanced draw call for all 4096 cubes
 *
 * The CPU never touches individual voxels after start-up. Per frame it writes
 * ~40 uniforms; everything else happens on the GPU.
 */
import * as THREE from 'three';
import { FormationLibrary } from './FormationLibrary.ts';
import { VoxelCompute } from './VoxelCompute.ts';
import { createVoxelDepthMaterial, createVoxelMaterial } from './voxelMaterial.ts';
import {
  IDENTITY_PLACEMENT,
  LAYER_POKO,
  LAYER_STREAM,
  POOL_SIZE,
  type FormationPlacement,
  type PoolFormation,
} from './VoxelData.ts';

export type FormationRef = string | typeof LAYER_STREAM;

export interface MorphParams {
  from: FormationRef;
  to: FormationRef;
  fromPlacement: FormationPlacement;
  toPlacement: FormationPlacement;
  /** 0..1 progress of the morph. */
  t: number;
  /** Share of the morph used to stagger departures (0 = all leave together). */
  spread: number;
  /** Delay key = dot(fromPosition, axis.xyz) + axis.w, clamped to 0..1. */
  delayAxis: [number, number, number, number];
  /** Weights of axis sweep, surface depth and seed in the delay; invert flips the order. */
  delayWeights: { axis: number; depth: number; seed: number; invert?: boolean };
  center: [number, number, number];
  explode: number;
  arc: [number, number, number];
  swirlAxis: [number, number, number];
  swirlAngle: number;
  swirlCenter: [number, number, number];
  noiseAmp: number;
  noiseFreq: number;
  /** 1 = voxels start their flight in clumps, 0 = individually. */
  clump: number;
  spin: number;
  transitScale: number;
  vibrate: number;
  glow: number;
  idle: number;
}

export const DEFAULT_MORPH: MorphParams = {
  from: 'poko',
  to: 'poko',
  fromPlacement: IDENTITY_PLACEMENT,
  toPlacement: IDENTITY_PLACEMENT,
  t: 0,
  spread: 0.5,
  delayAxis: [0, 0, 0, 0],
  delayWeights: { axis: 0, depth: 0, seed: 1 },
  center: [0, 1.2, 0],
  explode: 0,
  arc: [0, 0, 0],
  swirlAxis: [0, 1, 0],
  swirlAngle: 0,
  swirlCenter: [0, 1.2, 0],
  noiseAmp: 0,
  noiseFreq: 0.6,
  clump: 0,
  spin: 0,
  transitScale: 1,
  vibrate: 0,
  glow: 0,
  idle: 0,
};

export interface StreamParams {
  p0: THREE.Vector3;
  p1: THREE.Vector3;
  p2: THREE.Vector3;
  p3: THREE.Vector3;
  flow: number;
  radius: number;
  twist: number;
  scale: number;
}

export interface BonePose {
  /** BONE_COUNT × 4 each: translation, quaternion, scale of skinning matrices. */
  t: Float32Array;
  q: Float32Array;
  s: Float32Array;
}

export class VoxelEngine {
  readonly mesh: THREE.Mesh;
  readonly library: FormationLibrary;
  readonly compute: VoxelCompute | null;
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly geometry: THREE.InstancedBufferGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  private readonly depthMaterial: THREE.MeshDepthMaterial;

  constructor(
    renderer: THREE.WebGLRenderer,
    formations: PoolFormation[],
    staticData: Float32Array,
    pokoCenter: [number, number, number],
    boneCount: number,
  ) {
    if (formations[LAYER_POKO]?.name !== 'poko') throw new Error('Layer 0 must be the Poko formation.');
    this.library = new FormationLibrary(formations, staticData);
    const identityBones = () => Array.from({ length: boneCount }, () => new THREE.Vector4());
    this.uniforms = {
      uFormPos: { value: this.library.positions },
      uFormCol: { value: this.library.colors },
      uStatic: { value: this.library.staticData },
      uFrom: { value: LAYER_POKO },
      uTo: { value: LAYER_POKO },
      uFromT: { value: new THREE.Vector4(0, 0, 0, 1) },
      uFromQ: { value: new THREE.Vector4(0, 0, 0, 1) },
      uToT: { value: new THREE.Vector4(0, 0, 0, 1) },
      uToQ: { value: new THREE.Vector4(0, 0, 0, 1) },
      uMorph: { value: 0 },
      uSpread: { value: 0.5 },
      uDelayAxis: { value: new THREE.Vector4() },
      uDelayW: { value: new THREE.Vector4(0, 0, 1, 0) },
      uCenter: { value: new THREE.Vector3() },
      uExplode: { value: 0 },
      uArc: { value: new THREE.Vector3() },
      uSwirl: { value: new THREE.Vector4(0, 1, 0, 0) },
      uSwirlCenter: { value: new THREE.Vector3() },
      uNoise: { value: new THREE.Vector3(0, 0.6, 0) },
      uSpin: { value: 0 },
      uTransitScale: { value: 1 },
      uVibrate: { value: 0 },
      uGlow: { value: 0 },
      uIdle: { value: 0 },
      uHideRigged: { value: 0 },
      uTime: { value: 0 },
      uBoneT: { value: identityBones() },
      uBoneQ: { value: identityBones().map((v) => v.set(0, 0, 0, 1)) },
      uBoneS: { value: identityBones().map((v) => v.set(1, 1, 1, 0)) },
      uDepth: { value: 1 },
      uDepthStagger: { value: 0.6 },
      uPokoCenter: { value: new THREE.Vector3(...pokoCenter) },
      uStreamP0: { value: new THREE.Vector3() },
      uStreamP1: { value: new THREE.Vector3() },
      uStreamP2: { value: new THREE.Vector3() },
      uStreamP3: { value: new THREE.Vector3() },
      uStream: { value: new THREE.Vector4(0, 0.5, 1, 1) },
      uRayOrigin: { value: new THREE.Vector3() },
      uRayDir: { value: new THREE.Vector3(0, 0, -1) },
      uPush: { value: new THREE.Vector2(0, 0.6) },
      uRipple: { value: new THREE.Vector4(0, 0, 0, -1) },
      uCameraPos: { value: new THREE.Vector3(0, 0, 100) },
    };

    this.compute = VoxelCompute.isSupported(renderer) ? new VoxelCompute(this.uniforms) : null;
    const stateTextures = this.compute ? this.compute.textures : null;
    this.material = createVoxelMaterial({ sharedUniforms: this.uniforms, stateTextures });
    this.depthMaterial = createVoxelDepthMaterial({ sharedUniforms: this.uniforms, stateTextures });

    // One unit cube, drawn POOL_SIZE times. No per-instance attributes:
    // the vertex shader indexes the state textures with gl_InstanceID.
    const box = new THREE.BoxGeometry(1, 1, 1);
    this.geometry = new THREE.InstancedBufferGeometry();
    this.geometry.index = box.index;
    this.geometry.setAttribute('position', box.getAttribute('position'));
    this.geometry.setAttribute('normal', box.getAttribute('normal'));
    this.geometry.setAttribute('uv', box.getAttribute('uv'));
    this.geometry.instanceCount = POOL_SIZE;

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.name = 'VoxelPool';
    this.mesh.customDepthMaterial = this.depthMaterial;
    this.mesh.frustumCulled = false; // positions are only known on the GPU
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
  }

  get usesCompute(): boolean {
    return this.compute !== null;
  }

  private layerOf(ref: FormationRef): number {
    return ref === LAYER_STREAM ? LAYER_STREAM : this.library.layer(ref);
  }

  setMorph(m: MorphParams): void {
    const u = this.uniforms;
    u.uFrom.value = this.layerOf(m.from);
    u.uTo.value = this.layerOf(m.to);
    setPlacement(u.uFromT.value, u.uFromQ.value, m.fromPlacement);
    setPlacement(u.uToT.value, u.uToQ.value, m.toPlacement);
    u.uMorph.value = m.t;
    u.uSpread.value = m.spread;
    (u.uDelayAxis.value as THREE.Vector4).set(...m.delayAxis);
    const w = m.delayWeights;
    (u.uDelayW.value as THREE.Vector4).set(w.axis, w.depth, w.seed, w.invert ? 1 : 0);
    (u.uCenter.value as THREE.Vector3).set(...m.center);
    u.uExplode.value = m.explode;
    (u.uArc.value as THREE.Vector3).set(...m.arc);
    (u.uSwirl.value as THREE.Vector4).set(...m.swirlAxis, m.swirlAngle);
    (u.uSwirlCenter.value as THREE.Vector3).set(...m.swirlCenter);
    (u.uNoise.value as THREE.Vector3).set(m.noiseAmp, m.noiseFreq, m.clump);
    u.uSpin.value = m.spin;
    u.uTransitScale.value = m.transitScale;
    u.uVibrate.value = m.vibrate;
    u.uGlow.value = m.glow;
    u.uIdle.value = m.idle;
  }

  setStream(s: StreamParams): void {
    const u = this.uniforms;
    (u.uStreamP0.value as THREE.Vector3).copy(s.p0);
    (u.uStreamP1.value as THREE.Vector3).copy(s.p1);
    (u.uStreamP2.value as THREE.Vector3).copy(s.p2);
    (u.uStreamP3.value as THREE.Vector3).copy(s.p3);
    (u.uStream.value as THREE.Vector4).set(s.flow, s.radius, s.twist, s.scale);
  }

  setDepth(depth: number, stagger = 0.6): void {
    this.uniforms.uDepth.value = depth;
    this.uniforms.uDepthStagger.value = stagger;
  }

  setBones(pose: BonePose): void {
    const t = this.uniforms.uBoneT.value as THREE.Vector4[];
    const q = this.uniforms.uBoneQ.value as THREE.Vector4[];
    const s = this.uniforms.uBoneS.value as THREE.Vector4[];
    for (let i = 0; i < t.length; i++) {
      t[i].fromArray(pose.t, i * 4);
      q[i].fromArray(pose.q, i * 4);
      s[i].fromArray(pose.s, i * 4);
    }
  }

  /** While the skinned GLB draws Poko, hide the voxels the rig places. */
  setHideRigged(hide: boolean): void {
    this.uniforms.uHideRigged.value = hide ? 1 : 0;
  }

  setPointer(origin: THREE.Vector3, dir: THREE.Vector3, strength: number, radius: number): void {
    (this.uniforms.uRayOrigin.value as THREE.Vector3).copy(origin);
    (this.uniforms.uRayDir.value as THREE.Vector3).copy(dir);
    (this.uniforms.uPush.value as THREE.Vector2).set(strength, radius);
  }

  setRipple(origin: THREE.Vector3 | null, age: number): void {
    const r = this.uniforms.uRipple.value as THREE.Vector4;
    if (origin) r.set(origin.x, origin.y, origin.z, age);
    else r.w = -1;
  }

  setCamera(position: THREE.Vector3): void {
    (this.uniforms.uCameraPos.value as THREE.Vector3).copy(position);
  }

  /** Run the compute pass. Call once per rendered frame, before rendering the scene. */
  update(renderer: THREE.WebGLRenderer, time: number): void {
    this.uniforms.uTime.value = time;
    this.compute?.run(renderer);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.depthMaterial.dispose();
    this.compute?.dispose();
    this.library.dispose();
  }
}

function setPlacement(t: THREE.Vector4, q: THREE.Vector4, p: FormationPlacement): void {
  t.set(p.position[0], p.position[1], p.position[2], p.scale);
  q.set(p.quaternion[0], p.quaternion[1], p.quaternion[2], p.quaternion[3]);
}
