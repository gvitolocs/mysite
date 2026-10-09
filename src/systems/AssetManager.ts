/**
 * Progressive asset loading.
 *
 * Stage 1 (first paint) needs no binary asset at all: the voxel Poko is built
 * from code (the 26 × 24 sprite is 624 bytes of source). Stage 2 fetches the
 * Blender character (skinned mesh + 9 actions) once the first frame is on
 * screen, with a timeout so a slow network can never block the experience.
 * Files are content-hashed by Vite and served with immutable caching.
 */
import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import pokoGlbUrl from '../assets/poko/poko.glb?url';

export async function loadPokoCharacter(timeoutMs = 15000): Promise<GLTF | null> {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs));
  try {
    return await Promise.race([loader.loadAsync(pokoGlbUrl), timeout]);
  } catch (error) {
    console.warn('[poko] Character asset failed to load; continuing with voxel Poko.', error);
    return null;
  }
}

export function disposeObject(root: THREE.Object3D): void {
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const m of materials) m.dispose();
  });
}
