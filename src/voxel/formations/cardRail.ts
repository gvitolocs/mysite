/**
 * World B: CardRail, "one inventory, every marketplace".
 *
 * Left to right: a scanner gate with a card mid-scan, a conveyor, and a stock
 * rack whose slots hold cards at named shelf positions. The workflow the
 * product implements (scan → recognise → place → list) is read in one glance.
 */
import { hash1 } from '../../math/random.ts';
import { TargetBuilder } from '../correspondence.ts';
import { MaterialId, VOXEL_SIZE, hexToSrgbBytes, type FormationTargets } from '../VoxelData.ts';
import { rasterText } from './pixelFont.ts';

type RGB = [number, number, number];
const graphite = hexToSrgbBytes('#1b2136');
const steel = hexToSrgbBytes('#3a4566');
const cyan = hexToSrgbBytes('#5ce1e6');
const navy = hexToSrgbBytes('#23376e');
const gold = hexToSrgbBytes('#ffcb03');
const ivory = hexToSrgbBytes('#eef1f8');

const CARD_COLORS: RGB[] = [
  hexToSrgbBytes('#ffcb03'),
  hexToSrgbBytes('#e8edf7'),
  hexToSrgbBytes('#5ce1e6'),
  hexToSrgbBytes('#db9300'),
  hexToSrgbBytes('#7aa2ff'),
  hexToSrgbBytes('#ff8a65'),
];

export interface CardRailFormation {
  targets: FormationTargets;
  /** Scanner gate opening in formation space (world units), for the scan beam. */
  gate: { center: [number, number, number]; width: number; height: number };
}

export function buildCardRail(): CardRailFormation {
  const b = new TargetBuilder('cardrail', VOXEL_SIZE);

  // Scanner gate: two posts and a lintel, cyan-lit on the inside edges.
  const GX = -26;
  for (let y = 0; y < 24; y++) {
    for (const x of [GX - 8, GX - 7, GX + 7, GX + 8]) {
      for (let z = -2; z <= 1; z++) {
        const inner = x === GX - 7 || x === GX + 7;
        b.add(x, y, z, inner && z === 1 ? cyan : graphite, inner && z === 1 ? MaterialId.GlowCyan : MaterialId.Graphite);
      }
    }
  }
  for (let x = GX - 8; x <= GX + 8; x++) {
    for (const y of [24, 25]) for (let z = -2; z <= 1; z++) b.add(x, y, z, y === 24 && z === 1 ? cyan : graphite, y === 24 && z === 1 ? MaterialId.GlowCyan : MaterialId.Graphite);
  }
  // The card being scanned, upright inside the gate; one row lit by the scan line.
  for (let py = 0; py < 14; py++) {
    for (let px = 0; px < 10; px++) {
      const edge = Math.min(px, py, 9 - px, 13 - py);
      const lit = py === 6;
      const rgb = lit ? cyan : edge === 0 ? gold : Math.hypot(px - 4.5, py - 5) < 2.5 ? gold : navy;
      const mat = lit ? MaterialId.GlowCyan : edge === 0 || rgb === gold ? MaterialId.Gold : MaterialId.Enamel;
      b.add(GX - 4.5 + px, 18 - py, 0, rgb, mat);
    }
  }
  // Conveyor from the gate to the rack.
  for (let x = GX - 10; x <= 4; x++) {
    for (let z = -2; z <= 1; z++) b.add(x, -1, z, (x + z) % 4 === 0 ? steel : graphite, MaterialId.Graphite);
  }

  // Stock rack: 4 columns × 3 shelves, each slot holding a card.
  const RX = 6;
  const COLS = 4;
  const ROWS = 3;
  const SLOT_W = 8;
  const SLOT_H = 11;
  const width = COLS * SLOT_W + 1;
  const height = ROWS * SLOT_H + 1;
  for (let x = 0; x < width; x++) {
    for (let r = 0; r <= ROWS; r++) for (let z = -2; z <= 0; z++) b.add(RX + x, r * SLOT_H, z, graphite, MaterialId.Graphite);
  }
  for (let c = 0; c <= COLS; c++) {
    for (let y = 0; y < height; y++) b.add(RX + c * SLOT_W, y, -2, graphite, MaterialId.Graphite);
  }
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = CARD_COLORS[Math.floor(hash1(r * 9 + c + 3) * CARD_COLORS.length)];
      const filled = !(r === 1 && c === 2); // one empty slot: the scanned card's destination
      const x0 = RX + c * SLOT_W + 2;
      const y0 = r * SLOT_H + 2;
      for (let py = 0; py < 8 && filled; py++) {
        for (let px = 0; px < 5; px++) {
          const edge = px === 0 || px === 4 || py === 0 || py === 7;
          b.add(x0 + px, y0 + py, -1, edge ? color : navy, edge ? MaterialId.Ceramic : MaterialId.Enamel);
        }
      }
      if (!filled) {
        // Destination slot outlined in light.
        for (let px = 0; px < 5; px++) for (const py of [0, 7]) b.add(x0 + px, y0 + py, -1, cyan, MaterialId.GlowCyan);
        for (let py = 1; py < 7; py++) for (const px of [0, 4]) b.add(x0 + px, y0 + py, -1, cyan, MaterialId.GlowCyan);
      }
    }
  }
  // Shelf labels, A at the top.
  ['C', 'B', 'A'].forEach((label, r) => {
    const text = rasterText(label, '3x5');
    for (const [x, y] of text.pixels) b.add(RX - 5 + x, r * SLOT_H + 7 - y, -1, ivory, MaterialId.Ceramic);
  });

  const targets = b.build();
  // Centre the composition horizontally around the origin.
  let minX = Infinity, maxX = -Infinity;
  for (let i = 0; i < targets.count; i++) {
    minX = Math.min(minX, targets.positions[i * 3]);
    maxX = Math.max(maxX, targets.positions[i * 3]);
  }
  const shift = (minX + maxX) / 2;
  for (let i = 0; i < targets.count; i++) targets.positions[i * 3] -= shift;
  // The opening spans x ∈ (GX-7, GX+7) and y ∈ [0, 24) in voxels.
  const gate = { center: [GX * VOXEL_SIZE - shift, 12 * VOXEL_SIZE, 0.05] as [number, number, number], width: 13 * VOXEL_SIZE, height: 23 * VOXEL_SIZE };
  return { targets, gate };
}
