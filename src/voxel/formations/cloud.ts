/**
 * The dispersed state: Poko's matter as a slowly turning halo.
 *
 * Built per voxel from Poko's own layout so the correspondence is legible:
 * a voxel from Poko's upper-left ends up in the halo's upper-left, outer
 * voxels go to the outer rings, and every voxel keeps its colour. Twins (the
 * hidden duplicates inside Poko) are born here, so the halo holds the full pool.
 */
import { hash1 } from '../../math/random.ts';
import { MaterialId, POOL_SIZE, type PoolFormation } from '../VoxelData.ts';

export function buildCloud(poko: PoolFormation, center: [number, number, number]): PoolFormation {
  const positions = new Float32Array(POOL_SIZE * 4);
  const colors = new Uint8Array(poko.colors);
  let maxR = 0;
  for (let i = 0; i < POOL_SIZE; i++) {
    const dx = poko.positions[i * 4] - center[0];
    const dy = poko.positions[i * 4 + 1] - center[1];
    maxR = Math.max(maxR, Math.hypot(dx, dy));
  }
  for (let i = 0; i < POOL_SIZE; i++) {
    const s1 = hash1(i * 7 + 3);
    const s2 = hash1(i * 13 + 5);
    const s3 = hash1(i * 17 + 11);
    const dx = poko.positions[i * 4] - center[0];
    const dy = poko.positions[i * 4 + 1] - center[1];
    const r0 = Math.hypot(dx, dy) / maxR;
    const angle = Math.atan2(dy, dx) + (s1 - 0.5) * 0.5;
    // Three loose bands; outer voxels of Poko feed the outer bands.
    const band = Math.min(2, Math.floor(Math.pow(r0, 0.8) * 2.6 + s2 * 0.6));
    const radius = 1.75 + band * 0.95 + (s3 - 0.5) * 0.7;
    const thickness = 0.35 + band * 0.18;
    positions[i * 4] = Math.cos(angle) * radius;
    positions[i * 4 + 1] = Math.sin(angle) * radius;
    positions[i * 4 + 2] = (s2 - 0.5) * 2 * thickness + Math.sin(angle * 3 + s1) * 0.15;
    positions[i * 4 + 3] = 0.55 + 0.5 * s3;
    // A few sparks of light in the halo.
    if (s1 > 0.955) colors[i * 4 + 3] = MaterialId.GlowGold;
  }
  return { name: 'cloud', positions, colors, visible: POOL_SIZE, sources: new Uint32Array(POOL_SIZE) };
}
