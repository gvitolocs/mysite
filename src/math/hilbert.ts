/**
 * 3D Hilbert curve index (John Skilling, "Programming the Hilbert curve", 2004).
 *
 * Used to give every voxel formation a 1D order that preserves spatial
 * locality: points close on the curve are close in space. Matching two
 * formations rank-by-rank therefore sends neighbouring voxels to neighbouring
 * targets, which is what keeps morphs readable instead of chaotic.
 */

/** Hilbert index of integer coordinates in [0, 2^bits). Returns a float (fits 53 bits). */
export function hilbertIndex3(x: number, y: number, z: number, bits: number): number {
  const X = [x | 0, y | 0, z | 0];
  const n = 3;
  const M = 1 << (bits - 1);
  // Inverse undo excess work (AxesToTranspose)
  for (let Q = M; Q > 1; Q >>= 1) {
    const P = Q - 1;
    for (let i = 0; i < n; i++) {
      if (X[i] & Q) {
        X[0] ^= P;
      } else {
        const t = (X[0] ^ X[i]) & P;
        X[0] ^= t;
        X[i] ^= t;
      }
    }
  }
  // Gray encode
  for (let i = 1; i < n; i++) X[i] ^= X[i - 1];
  let t = 0;
  for (let Q = M; Q > 1; Q >>= 1) if (X[n - 1] & Q) t ^= Q - 1;
  for (let i = 0; i < n; i++) X[i] ^= t;
  // Interleave the transposed bits into one index, most significant first.
  let index = 0;
  for (let b = bits - 1; b >= 0; b--) {
    for (let i = 0; i < n; i++) index = index * 2 + ((X[i] >> b) & 1);
  }
  return index;
}

/**
 * Order points along a Hilbert curve fitted to their bounding box.
 * The box is scaled uniformly (aspect preserved) so thin axes stay thin and do
 * not dominate the ordering.
 */
export function hilbertOrder(positions: Float32Array, count: number, bits = 10): Uint32Array {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
    if (x < minX) minX = x; if (y < minY) minY = y; if (z < minZ) minZ = z;
    if (x > maxX) maxX = x; if (y > maxY) maxY = y; if (z > maxZ) maxZ = z;
  }
  const extent = Math.max(maxX - minX, maxY - minY, maxZ - minZ) || 1;
  const cells = (1 << bits) - 1;
  const keys = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    const qx = Math.round(((positions[i * 3] - minX) / extent) * cells);
    const qy = Math.round(((positions[i * 3 + 1] - minY) / extent) * cells);
    const qz = Math.round(((positions[i * 3 + 2] - minZ) / extent) * cells);
    keys[i] = hilbertIndex3(qx, qy, qz, bits);
  }
  const order = new Uint32Array(count);
  for (let i = 0; i < count; i++) order[i] = i;
  // Stable tie-break on the original index keeps the result deterministic.
  order.sort((a, b) => keys[a] - keys[b] || a - b);
  return order;
}
