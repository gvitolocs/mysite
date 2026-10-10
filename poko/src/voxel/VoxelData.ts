/**
 * Voxel engine data model.
 *
 * The engine owns a fixed pool of POOL_SIZE voxels. A *formation* is one
 * arrangement of that pool: Poko, a cloud, a trading card, a server rack...
 * Each formation is stored as one layer of two DataArrayTextures (position +
 * scale, colour + material), indexed by voxel id, so the GPU can read any
 * formation for any voxel with a single texelFetch.
 */

export const POOL_TEX = 64;
export const POOL_SIZE = POOL_TEX * POOL_TEX; // 4096

/** World units per voxel. Matches the Blender/glTF export (0.1 m). */
export const VOXEL_SIZE = 0.1;

/** Shading model per voxel, read by the voxel material. Keep in sync with voxelMaterial.ts. */
export const MaterialId = {
  Gold: 0,
  Enamel: 1,
  Ceramic: 2,
  GlowCyan: 3,
  GlowGold: 4,
  Graphite: 5,
} as const;
export type MaterialId = (typeof MaterialId)[keyof typeof MaterialId];

/** Special layer indices understood by voxelState.glsl. */
export const LAYER_POKO = 0;
export const LAYER_STREAM = -1;

/** A formation before it is mapped onto the pool: just a list of targets. */
export interface FormationTargets {
  name: string;
  count: number;
  /** count × 3, world units, relative to the formation origin. */
  positions: Float32Array;
  /** count × 4: sRGB r, g, b (0–255) and MaterialId. */
  colors: Uint8Array;
  /** Optional per-target scale (default 1). */
  scales?: Float32Array;
}

/** A formation mapped onto the pool: one entry per voxel id. */
export interface PoolFormation {
  name: string;
  /** POOL_SIZE × 4: x, y, z, scale (0 hides the voxel). */
  positions: Float32Array;
  /** POOL_SIZE × 4: sRGB r, g, b and MaterialId. */
  colors: Uint8Array;
  /** Number of visible voxels. */
  visible: number;
  /** For each voxel id, the index of the target it was assigned. */
  sources: Uint32Array;
}

/** Placement of a formation in the world, animated by the story. */
export interface FormationPlacement {
  position: [number, number, number];
  /** Quaternion x, y, z, w. */
  quaternion: [number, number, number, number];
  scale: number;
}

export const IDENTITY_PLACEMENT: FormationPlacement = {
  position: [0, 0, 0],
  quaternion: [0, 0, 0, 1],
  scale: 1,
};

export function hexToSrgbBytes(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', ''), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
