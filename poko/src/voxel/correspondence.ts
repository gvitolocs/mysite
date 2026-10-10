/**
 * Correspondence: which pool voxel goes to which formation target.
 *
 * Every formation's targets are sorted along a 3D Hilbert curve and spread
 * evenly over the pool's id range: voxel i takes target floor(i · M / N).
 * Because *every* formation is ordered the same way, a voxel's rank is
 * spatially meaningful in all of them, so morphing between any two formations
 * moves neighbours to neighbours, whatever their voxel counts.
 *
 * When a formation has fewer targets (M) than the pool (N), several voxels
 * share one target. The first is visible; the others ("twins") sit at the same
 * spot with scale 0. In flight the twins grow, so matter appears to divide;
 * on arrival they shrink back into their sibling. Nothing pops in or out.
 */
import { hilbertOrder } from '../math/hilbert.ts';
import { POOL_SIZE, type FormationTargets, type PoolFormation } from './VoxelData.ts';

export function toPoolFormation(targets: FormationTargets, poolSize = POOL_SIZE): PoolFormation {
  const { count } = targets;
  if (count < 1 || count > poolSize) {
    throw new Error(`Formation "${targets.name}" has ${count} targets; the pool holds ${poolSize}.`);
  }
  const order = hilbertOrder(targets.positions, count);
  const positions = new Float32Array(poolSize * 4);
  const colors = new Uint8Array(poolSize * 4);
  const sources = new Uint32Array(poolSize);
  let previous = -1;
  for (let i = 0; i < poolSize; i++) {
    const rank = Math.floor((i * count) / poolSize);
    const t = order[rank];
    const primary = rank !== previous;
    previous = rank;
    sources[i] = t;
    positions[i * 4] = targets.positions[t * 3];
    positions[i * 4 + 1] = targets.positions[t * 3 + 1];
    positions[i * 4 + 2] = targets.positions[t * 3 + 2];
    positions[i * 4 + 3] = primary ? (targets.scales ? targets.scales[t] : 1) : 0;
    colors.set(targets.colors.subarray(t * 4, t * 4 + 4), i * 4);
  }
  return { name: targets.name, positions, colors, visible: count, sources };
}

/** Build targets from a list of [x, y, z, r, g, b, material] rows (helper for generators). */
export class TargetBuilder {
  private pos: number[] = [];
  private col: number[] = [];
  private scl: number[] = [];
  private seen = new Set<string>();

  constructor(readonly name: string, private readonly unit: number) {}

  /** Add a voxel at integer lattice coordinates (scaled by `unit`). Duplicates are ignored. */
  add(x: number, y: number, z: number, rgb: [number, number, number], material: number, scale = 1): void {
    const key = `${x},${y},${z}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);
    this.pos.push(x * this.unit, y * this.unit, z * this.unit);
    this.col.push(rgb[0], rgb[1], rgb[2], material);
    this.scl.push(scale);
  }

  /** Add a voxel at an arbitrary world-space point (no lattice dedupe). */
  addFree(x: number, y: number, z: number, rgb: [number, number, number], material: number, scale = 1): void {
    this.pos.push(x, y, z);
    this.col.push(rgb[0], rgb[1], rgb[2], material);
    this.scl.push(scale);
  }

  has(x: number, y: number, z: number): boolean {
    return this.seen.has(`${x},${y},${z}`);
  }

  get count(): number {
    return this.scl.length;
  }

  build(): FormationTargets {
    return {
      name: this.name,
      count: this.count,
      positions: new Float32Array(this.pos),
      colors: new Uint8Array(this.col),
      scales: new Float32Array(this.scl),
    };
  }
}
