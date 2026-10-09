/**
 * Poko's skeleton, shared by both representations.
 *
 * The rig starts procedural (bones built from the voxelizer's specs) so the
 * voxel particles can render before any asset arrives. When the Blender GLB
 * loads, its skeleton replaces the procedural one; both have the same bone
 * names, pivots and rest pose (asserted at load), so nothing jumps.
 *
 * Skinning maths for Representation B: a voxel's rest position r (glTF space)
 * lands at  boneWorld · boneInverse · r.  That matrix is decomposed into
 * translation / rotation / scale and sent to the GPU as three vec4 per bone.
 */
import * as THREE from 'three';
import { BONE_NAMES, type BoneSpec } from './pokoVoxelizer.ts';
import { VOXEL_SIZE } from '../voxel/VoxelData.ts';
import type { BonePose } from '../voxel/VoxelEngine.ts';

const _m = new THREE.Matrix4();
const _t = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _s = new THREE.Vector3();

export class PokoRig {
  /** Placement of Poko in the world. Move/rotate this, never the bones' parents. */
  readonly root = new THREE.Group();
  bones: THREE.Bone[];
  boneInverses: THREE.Matrix4[];
  /** The GLB scene (Representation A) once attached. */
  skinnedScene: THREE.Object3D | null = null;
  readonly pose: BonePose;

  constructor(specs: BoneSpec[]) {
    this.root.name = 'Poko';
    const byName = new Map<string, THREE.Bone>();
    const holder = new THREE.Group();
    holder.name = 'ProceduralRig';
    for (const spec of specs) {
      const bone = new THREE.Bone();
      bone.name = spec.name;
      const parent = spec.parent ? specs.find((s) => s.name === spec.parent)! : null;
      const head = new THREE.Vector3(...spec.head).multiplyScalar(VOXEL_SIZE);
      if (parent) head.sub(new THREE.Vector3(...parent.head).multiplyScalar(VOXEL_SIZE));
      bone.position.copy(head);
      (spec.parent ? byName.get(spec.parent)! : holder).add(bone);
      byName.set(spec.name, bone);
    }
    this.root.add(holder);
    this.bones = BONE_NAMES.map((n) => byName.get(n)!);
    this.root.updateMatrixWorld(true);
    this.boneInverses = this.bones.map((b) => b.matrixWorld.clone().invert());
    const n = this.bones.length;
    this.pose = { t: new Float32Array(n * 4), q: new Float32Array(n * 4), s: new Float32Array(n * 4) };
  }

  /** Swap in the Blender skeleton. Returns false (and keeps the procedural rig) on mismatch. */
  attachSkinned(scene: THREE.Object3D): boolean {
    let skinned: THREE.SkinnedMesh | null = null;
    scene.traverse((o) => {
      if (!skinned && (o as THREE.SkinnedMesh).isSkinnedMesh) skinned = o as THREE.SkinnedMesh;
    });
    if (!skinned) return false;
    const skeleton = (skinned as THREE.SkinnedMesh).skeleton;
    const bones: THREE.Bone[] = [];
    for (const name of BONE_NAMES) {
      const bone = skeleton.bones.find((b) => b.name === name);
      if (!bone) {
        console.warn(`[poko] GLB is missing bone "${name}"; keeping the procedural rig.`);
        return false;
      }
      bones.push(bone);
    }
    // Rest pivots must match the voxelizer, otherwise A and B would disagree.
    // Compare bone rest positions in world space (the GLB is still in its rest
    // pose here). The GLB's own inverse bind matrices are not comparable: the
    // compressor folds vertex dequantisation into them.
    scene.updateMatrixWorld(true);
    for (let i = 0; i < bones.length; i++) {
      const glb = new THREE.Vector3().setFromMatrixPosition(bones[i].matrixWorld);
      const ours = new THREE.Vector3().setFromMatrixPosition(this.boneInverses[i].clone().invert());
      if (glb.distanceTo(ours) > 1e-3) {
        console.warn(`[poko] Bone "${BONE_NAMES[i]}" pivot differs between GLB and voxelizer.`);
        return false;
      }
    }
    this.root.remove(this.root.getObjectByName('ProceduralRig')!);
    this.root.add(scene);
    this.skinnedScene = scene;
    // Keep our inverse bind matrices: they are defined in the same space as the
    // voxel rest positions, which is all Representation B needs.
    this.bones = bones;
    return true;
  }

  /** Decompose the current skinning matrices into the GPU pose buffers. */
  computePose(): BonePose {
    this.root.updateMatrixWorld(true);
    const { t, q, s } = this.pose;
    for (let i = 0; i < this.bones.length; i++) {
      _m.multiplyMatrices(this.bones[i].matrixWorld, this.boneInverses[i]);
      _m.decompose(_t, _q, _s);
      t[i * 4] = _t.x; t[i * 4 + 1] = _t.y; t[i * 4 + 2] = _t.z; t[i * 4 + 3] = 0;
      q[i * 4] = _q.x; q[i * 4 + 1] = _q.y; q[i * 4 + 2] = _q.z; q[i * 4 + 3] = _q.w;
      s[i * 4] = _s.x; s[i * 4 + 1] = _s.y; s[i * 4 + 2] = _s.z; s[i * 4 + 3] = 0;
    }
    return this.pose;
  }

  bone(name: (typeof BONE_NAMES)[number]): THREE.Bone {
    return this.bones[BONE_NAMES.indexOf(name)];
  }
}
