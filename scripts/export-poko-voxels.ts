/**
 * Export the voxelised Poko for Blender: `npm run poko:voxels`.
 *
 * The browser builds the same model at runtime from `src/character`, so the
 * Blender character (Representation A) and the GPU particles (Representation B)
 * can never drift apart: both read one deterministic voxelizer.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BONE_NAMES, buildPokoModel, swatchRgb } from '../src/character/pokoVoxelizer.ts';
import { PALETTE, type SwatchKey } from '../src/character/pokoSprite.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const out = resolve(root, 'blender/data/poko_voxels.json');
const model = buildPokoModel();

const palette = Object.fromEntries(
  (Object.keys(PALETTE) as SwatchKey[]).map((key) => [
    key,
    { hex: PALETTE[key].hex, rgb: swatchRgb(key), material: PALETTE[key].material, role: PALETTE[key].role },
  ]),
);

const payload = {
  generator: 'scripts/export-poko-voxels.ts',
  units: 'voxel (1 voxel = 0.1 m in Blender/glTF)',
  axes: 'x right, y up, z towards viewer (glTF convention)',
  boneNames: BONE_NAMES,
  bones: model.bones,
  palette,
  bounds: model.bounds,
  // Compact rows: [x, y, z, colorKey, boneIndex, depth, shade, front]
  voxels: model.voxels.map((v) => [v.x, v.y, v.z, v.color, v.bone, v.depth, Number(v.shade.toFixed(4)), v.front ? 1 : 0]),
};

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(payload));
console.log(`Wrote ${model.voxels.length} voxels and ${model.bones.length} bones to ${out}`);
