/**
 * Poko as a pool formation, plus the per-voxel static data every other
 * formation inherits (bone, surface depth, seeds, clump id).
 */
import { BONE_NAMES, type PokoModel } from '../../character/pokoVoxelizer.ts';
import { PALETTE } from '../../character/pokoSprite.ts';
import { hash1, hash3 } from '../../math/random.ts';
import { toPoolFormation } from '../correspondence.ts';
import {
  MaterialId,
  POOL_SIZE,
  VOXEL_SIZE,
  hexToSrgbBytes,
  type FormationTargets,
  type PoolFormation,
} from '../VoxelData.ts';

const MATERIAL_OF = { gold: MaterialId.Gold, enamel: MaterialId.Enamel, ceramic: MaterialId.Ceramic } as const;

export interface PokoPool {
  formation: PoolFormation;
  /** POOL_SIZE × 4 floats: bone + depth·0.99, seedA, seedB, clump seed. */
  staticData: Float32Array;
  /** Poko's visual centre in character space (world units). */
  center: [number, number, number];
}

export function pokoTargets(model: PokoModel): FormationTargets {
  const n = model.voxels.length;
  const positions = new Float32Array(n * 3);
  const colors = new Uint8Array(n * 4);
  model.voxels.forEach((v, i) => {
    positions.set([v.x * VOXEL_SIZE, v.y * VOXEL_SIZE, v.z * VOXEL_SIZE], i * 3);
    const sw = PALETTE[v.color];
    // Per-voxel shade is applied in sRGB, exactly like the Blender export.
    const [r, g, b] = hexToSrgbBytes(sw.hex).map((c) => Math.min(255, Math.round(c * v.shade)));
    colors.set([r, g, b, MATERIAL_OF[sw.material]], i * 4);
  });
  return { name: 'poko', count: n, positions, colors };
}

export function buildPokoPool(model: PokoModel): PokoPool {
  const formation = toPoolFormation(pokoTargets(model));
  const maxDepth = Math.max(...model.voxels.map((v) => v.depth)) || 1;
  const staticData = new Float32Array(POOL_SIZE * 4);
  for (let i = 0; i < POOL_SIZE; i++) {
    const v = model.voxels[formation.sources[i]];
    const depth01 = v.depth / maxDepth;
    // Clumps of ~3×3×3 voxels share a seed so fragments leave as chunks first.
    const clump = hash3(Math.floor(v.x / 3), Math.floor(v.y / 3), Math.floor((v.z + 3) / 3));
    staticData[i * 4] = v.bone + depth01 * 0.99;
    staticData[i * 4 + 1] = hash1(i * 2 + 1);
    staticData[i * 4 + 2] = hash1(i * 2 + 2);
    staticData[i * 4 + 3] = clump;
  }
  const { min, max } = model.bounds;
  const center: [number, number, number] = [
    ((min[0] + max[0]) / 2) * VOXEL_SIZE,
    ((min[1] + max[1]) / 2 + 2) * VOXEL_SIZE, // the coin, not the feet, is the visual centre
    0,
  ];
  return { formation, staticData, center };
}

export const POKO_BONE_COUNT = BONE_NAMES.length;
