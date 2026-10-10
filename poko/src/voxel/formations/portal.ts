/**
 * The portal: Poko's voxels build a tunnel of square pixel frames, each turned
 * a little further than the last, narrowing into the distance. The camera flies
 * through it. A square aperture is the pixel's own shape: the gateway is made
 * of the same matter as the character.
 */
import { TargetBuilder } from '../correspondence.ts';
import { MaterialId, VOXEL_SIZE, hexToSrgbBytes, type FormationTargets } from '../VoxelData.ts';

const gold = hexToSrgbBytes('#ffcb03');
const amber = hexToSrgbBytes('#db9300');
const navy = hexToSrgbBytes('#23376e');
const deep = hexToSrgbBytes('#0c1636');
const cyan = hexToSrgbBytes('#5ce1e6');

export const PORTAL_FRAMES = 12;
export const PORTAL_SPACING = 1.5; // world units between frames

export function buildPortal(): FormationTargets {
  const b = new TargetBuilder('portal', VOXEL_SIZE);
  for (let k = 0; k < PORTAL_FRAMES; k++) {
    const side = 38 - k * 1.4; // outer size in voxels, narrowing with depth
    const half = side / 2;
    const twist = k * 0.13;
    const z = -k * PORTAL_SPACING;
    const depthT = k / (PORTAL_FRAMES - 1);
    for (let i = 0; i < Math.round(side); i++) {
      for (let w = 0; w < 2; w++) {
        // Four edges of a square ring, ring width 2 voxels.
        const edges: [number, number][] = [
          [-half + i, half - w],
          [-half + i, -half + w],
          [-half + w, -half + i],
          [half - w, -half + i],
        ];
        for (const [lx, ly] of edges) {
          const x = (lx * Math.cos(twist) - ly * Math.sin(twist)) * VOXEL_SIZE;
          const y = (lx * Math.sin(twist) + ly * Math.cos(twist)) * VOXEL_SIZE;
          const innerEdge = w === 1;
          let rgb = depthT < 0.35 ? gold : depthT < 0.6 ? amber : depthT < 0.85 ? navy : deep;
          let mat: number = depthT < 0.6 ? MaterialId.Gold : MaterialId.Enamel;
          if (innerEdge && k % 3 === 0) { rgb = cyan; mat = MaterialId.GlowCyan; }
          b.addFree(x, y, z, rgb, mat);
        }
      }
    }
  }
  return b.build();
}
