/**
 * The finale: Poko reassembled on his rig, and the twins (the duplicate voxels
 * born during the journey) spelling the name behind him.
 *
 * Poko's voxels are marked rig-bound (scale = -1): the shader then places them
 * with the skeleton, not the formation transform, so Poko can land and wave
 * while the name stays put. Built directly per voxel id: the rig-bound part
 * must keep the exact ids of the Poko layer.
 */
import { hilbertOrder } from '../../math/hilbert.ts';
import { MaterialId, POOL_SIZE, VOXEL_SIZE, hexToSrgbBytes, type PoolFormation } from '../VoxelData.ts';
import { rasterText } from './pixelFont.ts';

const gold = hexToSrgbBytes('#ffcb03');
const amber = hexToSrgbBytes('#db9300');

export const RIG_BOUND = -1;

export function buildFinale(poko: PoolFormation): PoolFormation {
  const positions = new Float32Array(POOL_SIZE * 4);
  const colors = new Uint8Array(POOL_SIZE * 4);

  // Name targets: two lines, two voxels deep, centred on the origin.
  const lines = ['GIUSEPPE', 'VITOLO'].map((t) => rasterText(t, '5x7'));
  const targets: number[] = [];
  const targetColors: number[] = [];
  lines.forEach((line, row) => {
    const ox = -(line.width - 1) / 2;
    const oy = row === 0 ? 9 : 0;
    for (const [x, y] of line.pixels) {
      for (const z of [0, -1]) {
        targets.push((ox + x) * VOXEL_SIZE, (oy + 6 - y) * VOXEL_SIZE, z * VOXEL_SIZE);
        targetColors.push(...(z === 0 ? gold : amber), MaterialId.Gold);
      }
    }
  });
  const count = targets.length / 3;
  const order = hilbertOrder(new Float32Array(targets), count);

  const twins: number[] = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    if (poko.positions[i * 4 + 3] > 0) {
      positions.set([poko.positions[i * 4], poko.positions[i * 4 + 1], poko.positions[i * 4 + 2], RIG_BOUND], i * 4);
      colors.set(poko.colors.subarray(i * 4, i * 4 + 4), i * 4);
    } else {
      twins.push(i);
    }
  }
  let previous = -1;
  twins.forEach((id, j) => {
    const rank = Math.floor((j * count) / twins.length);
    const t = order[rank];
    positions.set([targets[t * 3], targets[t * 3 + 1], targets[t * 3 + 2], rank !== previous ? 1 : 0], id * 4);
    colors.set(targetColors.slice(t * 4, t * 4 + 4), id * 4);
    previous = rank;
  });
  return { name: 'finale', positions, colors, visible: (POOL_SIZE - twins.length) + Math.min(count, twins.length), sources: new Uint32Array(POOL_SIZE) };
}
