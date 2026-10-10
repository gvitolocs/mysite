/**
 * World E: engineering systems. An abstract but faithful sketch of the Pokoin
 * stack documented in the CV, top to bottom:
 *
 *   edge nodes (Cloudflare cache + request coalescing)
 *        │  cyan links carry pulses (animated in the voxel material)
 *   three service pods (Rust/Axum on k3s, overflow + health failover)
 *        │
 *   PostgreSQL writer ─ two read replicas
 *   32 monthly partitions (the real count from the price-history import)
 */
import { TargetBuilder } from '../correspondence.ts';
import { MaterialId, VOXEL_SIZE, hexToSrgbBytes, type FormationTargets } from '../VoxelData.ts';

const graphite = hexToSrgbBytes('#1b2136');
const steel = hexToSrgbBytes('#3a4566');
const cyan = hexToSrgbBytes('#5ce1e6');
const navy = hexToSrgbBytes('#23376e');
const gold = hexToSrgbBytes('#ffcb03');
const amber = hexToSrgbBytes('#db9300');
const ivory = hexToSrgbBytes('#eef1f8');

export function buildSystems(): FormationTargets {
  const b = new TargetBuilder('systems', VOXEL_SIZE);
  const line = (a: [number, number, number], c: [number, number, number], step = 2) => {
    const n = Math.max(Math.abs(c[0] - a[0]), Math.abs(c[1] - a[1]), Math.abs(c[2] - a[2]));
    for (let i = 0; i <= n; i += step) {
      const t = i / n;
      b.add(Math.round(a[0] + (c[0] - a[0]) * t), Math.round(a[1] + (c[1] - a[1]) * t), Math.round(a[2] + (c[2] - a[2]) * t), cyan, MaterialId.GlowCyan);
    }
  };
  const box = (cx: number, cy: number, cz: number, r: number, shell: [number, number, number], core: [number, number, number], coreMat: number) => {
    for (let x = -r; x <= r; x++) for (let y = -r; y <= r; y++) for (let z = -r; z <= r; z++) {
      const surface = Math.max(Math.abs(x), Math.abs(y), Math.abs(z)) === r;
      const corner = [x, y, z].filter((v) => Math.abs(v) === r).length >= 2;
      if (surface && !corner && (x + y + z) % 2 !== 0) continue; // perforated faces, solid edges
      b.add(cx + x, cy + y, cz + z, surface ? shell : core, surface ? MaterialId.Graphite : coreMat);
    }
  };
  const cylinder = (cx: number, y0: number, cz: number, r: number, h: number, band: number) => {
    for (let y = 0; y < h; y++) for (let x = -r; x <= r; x++) for (let z = -r; z <= r; z++) {
      const d = Math.hypot(x, z);
      if (d > r + 0.35) continue;
      const rim = d > r - 0.9;
      if (!rim && y !== h - 1 && y !== 0) continue; // hollow
      const isBand = y % band === 0;
      b.add(cx + x, y0 + y, cz + z, isBand && rim ? gold : navy, isBand && rim ? MaterialId.Gold : MaterialId.Enamel);
    }
  };

  // Edge: six nodes on a ring.
  const edge: [number, number, number][] = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const p: [number, number, number] = [Math.round(Math.cos(a) * 15), 34, Math.round(Math.sin(a) * 9) - 4];
    edge.push(p);
    box(...p, 1, steel, ivory, MaterialId.Ceramic);
  }
  // Services: three pods.
  const pods: [number, number, number][] = [[-11, 21, -2], [0, 21, 0], [11, 21, -2]];
  for (const p of pods) box(...p, 3, graphite, gold, MaterialId.GlowGold);
  // Data: writer and two replicas.
  const writer: [number, number, number] = [0, 2, -6];
  cylinder(writer[0], writer[1], writer[2], 4, 9, 3);
  const replicas: [number, number, number][] = [[-12, 2, -8], [12, 2, -8]];
  for (const r of replicas) cylinder(r[0], r[1], r[2], 3, 7, 3);
  // 32 monthly partitions, like books on a shelf behind the database.
  for (let m = 0; m < 32; m++) {
    const x = -24 + m * 1.5;
    const h = 4 + ((m * 7) % 5);
    for (let y = 0; y < h; y++) for (let z = -16; z <= -14; z++) {
      b.add(Math.round(x), y, z, m % 4 === 3 ? amber : y === h - 1 ? gold : navy, m % 4 === 3 || y === h - 1 ? MaterialId.Gold : MaterialId.Enamel);
    }
  }
  // Links: edge → pods → writer → replicas.
  edge.forEach((e, i) => line([e[0], e[1] - 2, e[2]], [pods[i % 3][0], pods[i % 3][1] + 4, pods[i % 3][2]]));
  for (const p of pods) line([p[0], p[1] - 4, p[2]], [writer[0], writer[1] + 10, writer[2]]);
  for (const r of replicas) line([writer[0] + Math.sign(r[0]) * 5, writer[1] + 5, writer[2]], [r[0] - Math.sign(r[0]) * 4, r[1] + 4, r[2]]);
  return b.build();
}
