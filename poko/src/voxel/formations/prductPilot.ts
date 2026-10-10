/**
 * World C: the prduct DPP assessment pilot. The pilot asks about furniture,
 * so the matter becomes a chair carrying a Digital Product Passport code. A
 * journey of five rising stops (one situation per stop, as in the prototype)
 * leads to the result: a product-data landscape panel where known data glows
 * and gaps stay open. No score anywhere, because the prototype has none.
 *
 * Colours come from the prototype's own stylesheet (violet, slate, oak) and
 * its red "pilot" badge. Built on the 0.1 lattice from y = 0 (the floor).
 */
import { hash1 } from '../../math/random.ts';
import { TargetBuilder } from '../correspondence.ts';
import { MaterialId, VOXEL_SIZE, hexToSrgbBytes, type FormationTargets } from '../VoxelData.ts';
import { rasterText } from './pixelFont.ts';

type RGB = [number, number, number];
const C = {
  oak: hexToSrgbBytes('#c9ad86'),
  oakDark: hexToSrgbBytes('#9a6224'),
  slate: hexToSrgbBytes('#0f172a'),
  slateLight: hexToSrgbBytes('#1e293b'),
  ivory: hexToSrgbBytes('#e2e8f0'),
  violet: hexToSrgbBytes('#8b5cf6'),
  violetDeep: hexToSrgbBytes('#5b20b6'),
  lavender: hexToSrgbBytes('#ede9fe'),
  red: hexToSrgbBytes('#ef4444'),
  white: hexToSrgbBytes('#ffffff'),
};

const shade = (rgb: RGB, k: number): RGB => rgb.map((c) => Math.max(0, Math.min(255, Math.round(c * k)))) as RGB;

function addChair(b: TargetBuilder): void {
  const X0 = -27;
  const X1 = X0 + 11;
  const Z0 = -6;
  const Z1 = 5;
  // Legs, seat and backrest, with a little grain from per-voxel shade.
  for (const lx of [X0, X1 - 1]) {
    for (const lz of [Z0, Z1 - 1]) {
      for (let y = 0; y < 10; y++) for (let dx = 0; dx < 2; dx++) for (let dz = 0; dz < 2; dz++) b.add(lx + dx, y, lz + dz, C.oakDark, MaterialId.Ceramic);
    }
  }
  for (let x = X0; x <= X1; x++) {
    for (let z = Z0; z <= Z1; z++) {
      for (let y = 10; y < 12; y++) b.add(x, y, z, shade(C.oak, 0.9 + 0.2 * hash1(x * 13 + z * 7)), MaterialId.Ceramic);
    }
  }
  for (let x = X0; x <= X1; x++) {
    for (let y = 12; y < 28; y++) {
      for (let z = Z0; z < Z0 + 2; z++) b.add(x, y, z, shade(C.oak, 0.85 + 0.2 * hash1(x * 5 + y * 11)), MaterialId.Ceramic);
    }
  }
  // The passport: a 7 × 7 code on the backrest (finder squares in three corners).
  const QX = X0 + 3;
  const QY = 18;
  for (let i = 0; i < 7; i++) {
    for (let j = 0; j < 7; j++) {
      const finder = (cx: number, cy: number) => {
        const d = Math.max(Math.abs(i - cx), Math.abs(j - cy));
        return d === 1 ? 0 : 1;
      };
      let dark: number;
      if (i < 3 && j < 3) dark = finder(1, 1);
      else if (i > 3 && j < 3) dark = finder(5, 1);
      else if (i < 3 && j > 3) dark = finder(1, 5);
      else dark = hash1(i * 31 + j * 17 + 5) > 0.5 ? 1 : 0;
      b.add(QX + i, QY + 6 - j, Z0 + 2, dark ? C.slate : C.ivory, dark ? MaterialId.Enamel : MaterialId.Ceramic);
    }
  }
}

/** One situation per stop: five pedestals that climb towards the result. */
function addJourney(b: TargetBuilder): void {
  for (let k = 0; k < 5; k++) {
    const x0 = -12 + k * 4;
    const h = 2 + k;
    for (let x = x0; x < x0 + 3; x++) {
      for (let z = 5; z < 8; z++) {
        for (let y = 0; y < h; y++) b.add(x, y, z, k % 2 ? C.slateLight : C.slate, MaterialId.Enamel);
        b.add(x, h, z, C.violet, MaterialId.GlowCyan);
      }
    }
  }
  // Breadcrumbs on the floor between the stops.
  for (let x = -16; x < 8; x += 2) b.add(x, 0, 9, C.lavender, MaterialId.GlowCyan);
}

/** The result: a standing product-data landscape. Known data glows, gaps stay open. */
function addLandscape(b: TargetBuilder): void {
  const X0 = 9;
  const W = 28;
  const Y0 = 4;
  const H = 24;
  const Z = -2;
  for (let x = X0 + 3; x < X0 + W - 3; x += W - 7) {
    for (let y = 0; y < Y0; y++) for (let dx = 0; dx < 2; dx++) b.add(x + dx, y, Z, C.slateLight, MaterialId.Graphite);
  }
  // Nodes of the landscape: three columns, two rows. true = data known, false = a gap.
  const nodes: { x: number; y: number; known: boolean }[] = [];
  const known = [true, false, true, true, true, false];
  for (let r = 0; r < 2; r++) for (let c = 0; c < 3; c++) nodes.push({ x: X0 + 3 + c * 8, y: Y0 + 4 + (1 - r) * 8, known: known[r * 3 + c] });
  const inNode = (x: number, y: number) => nodes.find((n) => x >= n.x && x < n.x + 6 && y >= n.y && y < n.y + 4);
  const title = rasterText('DPP', '3x5');
  for (let x = X0; x < X0 + W; x++) {
    for (let y = Y0; y < Y0 + H; y++) {
      const px = x - X0;
      const py = y - Y0;
      const edge = Math.min(px, py, W - 1 - px, H - 1 - py);
      let rgb: RGB = C.slate;
      let mat: number = MaterialId.Enamel;
      const n = inNode(x, y);
      const tx = px - 2;
      const ty = H - 2 - py; // text rows count down from the top
      if (edge === 0) { rgb = C.violetDeep; }
      else if (ty >= 0 && ty < title.height && title.pixels.some(([gx, gy]) => gx === tx && gy === ty)) { rgb = C.lavender; mat = MaterialId.Ceramic; }
      else if (n) {
        const border = x === n.x || x === n.x + 5 || y === n.y || y === n.y + 3;
        if (n.known) { rgb = border ? C.violet : C.lavender; mat = border ? MaterialId.GlowCyan : MaterialId.Ceramic; }
        else if (border && (x + y) % 2 === 0) { rgb = C.red; mat = MaterialId.Enamel; }
      } else {
        // Links between neighbouring nodes in each row and down each column.
        const rowLink = nodes.some((m) => y === m.y + 2 && x >= m.x + 6 && x < m.x + 8 && m.x + 8 < X0 + W - 3);
        const colLink = nodes.some((m) => x === m.x + 3 && y >= m.y - 4 && y < m.y && m.y > Y0 + 4);
        if (rowLink || colLink) { rgb = C.violet; mat = MaterialId.GlowCyan; }
      }
      b.add(x, y, Z, rgb, mat);
      b.add(x, y, Z - 1, C.slateLight, MaterialId.Graphite);
    }
  }
  // The red "PILOT" badge on the top edge.
  const pilot = rasterText('PILOT', '3x5');
  const bx = X0 + W - pilot.width - 4;
  const by = Y0 + H + 1;
  for (let x = bx - 1; x <= bx + pilot.width; x++) {
    for (let y = by; y < by + 7; y++) {
      const gx = x - bx;
      const gy = by + 5 - y;
      const lit = pilot.pixels.some(([px, py]) => px === gx && py === gy);
      b.add(x, y, Z, lit ? C.white : C.red, lit ? MaterialId.Ceramic : MaterialId.Enamel);
    }
  }
}

export function buildPrductPilot(): FormationTargets {
  const b = new TargetBuilder('prduct', VOXEL_SIZE);
  addChair(b);
  addJourney(b);
  addLandscape(b);
  return b.build();
}
