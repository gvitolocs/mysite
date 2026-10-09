/**
 * Dev-only lab: renders one engine state from URL parameters, for visual QA.
 *   /lab/?rep=B&cam=tq&from=poko&to=cloud&t=0.5&depth=1&clip=Hop&ct=0.5
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { buildPokoModel } from '../src/character/pokoVoxelizer.ts';
import { PokoRig } from '../src/character/PokoRig.ts';
import { PokoAnimationController, type ClipName } from '../src/character/PokoAnimationController.ts';
import { buildPokoPool } from '../src/voxel/formations/poko.ts';
import { buildCloud } from '../src/voxel/formations/cloud.ts';
import { DEFAULT_MORPH, VoxelEngine } from '../src/voxel/VoxelEngine.ts';
import { patchSkinnedVoxelMaterial } from '../src/voxel/voxelMaterial.ts';
import { Environment } from '../src/experience/Environment.ts';
import { TIERS } from '../src/systems/QualityManager.ts';

const q = new URLSearchParams(location.search);
const num = (k: string, d: number) => (q.has(k) ? Number(q.get(k)) : d);
const hud = document.getElementById('hud')!;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = num('exposure', 1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const quality = TIERS.high;
const env = new Environment(renderer, quality);
scene.add(env.group);
scene.environment = env.envMap;
scene.fog = env.fog;

const camera = new THREE.PerspectiveCamera(num('fov', 30), innerWidth / innerHeight, 0.1, 500);
const cams: Record<string, [number, number, number]> = {
  front: [0, 1.25, 8.5],
  tq: [3.6, 2.0, 7.2],
  side: [8.5, 1.3, 0.01],
  back: [-2.5, 1.8, -7.5],
  wide: [5, 4, 14],
};
camera.position.set(...(cams[q.get('cam') ?? 'tq'] ?? cams.tq));
camera.lookAt(0, num('ty', 1.2), 0);

const t0 = performance.now();
const model = buildPokoModel();
const poko = buildPokoPool(model);
const cloud = buildCloud(poko.formation, poko.center);
const engine = new VoxelEngine(renderer, [poko.formation, cloud], poko.staticData, poko.center, model.bones.length);
const buildMs = performance.now() - t0;
scene.add(engine.mesh);

const rig = new PokoRig(model.bones);
scene.add(rig.root);
const anim = new PokoAnimationController(rig);

const rep = q.get('rep') ?? 'B';
async function loadGlb() {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const gltf = await loader.loadAsync('/assets/poko/poko.glb');
  gltf.scene.traverse((o) => {
    const m = o as THREE.SkinnedMesh;
    if (m.isSkinnedMesh) {
      m.material = patchSkinnedVoxelMaterial(m.material as THREE.MeshStandardMaterial);
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = false;
    }
  });
  if (rig.attachSkinned(gltf.scene)) anim.attachClips(gltf.scene, gltf.animations);
  return gltf;
}

const stage = new THREE.Vector3(0, 0, 0);
const envState = {
  skyTop: new THREE.Color(0x02030a),
  skyHorizon: new THREE.Color(0x0b1226),
  floor: num('floor', 1),
  stage,
  exposure: 1,
  accent: 0,
};

function frame(time: number) {
  const clip = q.get('clip') as ClipName | null;
  anim.update(1 / 60, time, {
    scrubs: clip ? [{ clip, t: num('ct', 0.5), weight: 1 }] : [],
    idle: num('idle', 0),
    blink: false,
    look: 0,
  });
  engine.setBones(rig.computePose());
  engine.setDepth(num('depth', 1), 0.6);
  engine.setMorph({
    ...DEFAULT_MORPH,
    from: q.get('from') ?? 'poko',
    to: q.get('to') ?? 'poko',
    toPlacement: { position: poko.center, quaternion: [0, 0, 0, 1], scale: 1 },
    t: num('t', 0),
    spread: num('spread', 0.7),
    delayWeights: { axis: 0, depth: 1, seed: 0.6 },
    center: poko.center,
    explode: num('explode', 1.2),
    swirlAxis: [0, 0, 1],
    swirlAngle: num('swirl', 1.2),
    swirlCenter: poko.center,
    noiseAmp: num('noise', 0.6),
    noiseFreq: 0.7,
    clump: 0.8,
    spin: num('spin', 3),
    transitScale: 0.8,
    glow: num('glow', 0.5),
  });
  engine.mesh.visible = rep !== 'A';
  if (rig.skinnedScene) rig.skinnedScene.visible = rep !== 'B';
  env.apply(envState, time, camera.position);
  engine.update(renderer, time);
  renderer.render(scene, camera);
}

(async () => {
  if (rep !== 'B' || q.has('glb')) {
    try { await loadGlb(); } catch (e) { console.error(e); }
  }
  frame(num('time', 0));
  frame(num('time', 0));
  const info = renderer.info;
  hud.textContent = `build ${buildMs.toFixed(1)} ms · compute ${engine.usesCompute} · calls ${info.render.calls} · tris ${info.render.triangles}`;
  (window as unknown as { __ready: boolean }).__ready = true;
  if (q.has('animate')) {
    renderer.setAnimationLoop((ms) => frame(ms / 1000));
  }
})();
