/**
 * World D: the Tmelnik app. A phone showing the app's layout as the README
 * describes it: project offers as cards, and a bottom navigation with its four
 * sections (Offers, Feedback, Info, News). Offers float off the phone, as they
 * do when shared to Instagram, towards a globe pinned with exchange
 * destinations: the app serves international youth-exchange projects.
 *
 * Colours are the app's theme (lib/theme/app_theme.dart): primary blue
 * #0066FF, amber #FFC107 and the #F5F6FA background. The screen is a schematic
 * of the layout, not a copy of a real screen.
 */
import { hash1 } from '../../math/random.ts';
import { TargetBuilder } from '../correspondence.ts';
import { MaterialId, VOXEL_SIZE, hexToSrgbBytes, type FormationTargets } from '../VoxelData.ts';

type RGB = [number, number, number];
const C = {
  blue: hexToSrgbBytes('#0066ff'),
  blueDeep: hexToSrgbBytes('#0a2a6b'),
  amber: hexToSrgbBytes('#ffc107'),
  paper: hexToSrgbBytes('#f5f6fa'),
  card: hexToSrgbBytes('#ffffff'),
  line: hexToSrgbBytes('#c9cfdd'),
  ink: hexToSrgbBytes('#2a3142'),
  body: hexToSrgbBytes('#1b2136'),
  ocean: hexToSrgbBytes('#0b3a8c'),
};

const PW = 22; // phone width (voxels)
const PH = 44; // phone height
const PY = 2; // lift off the floor

/** The screen as a pixel function (image space, y down, 18 × 38). */
function screen(px: number, py: number): { rgb: RGB; mat: number } {
  // Header band with a title bar.
  if (py < 5) return py === 2 && px >= 2 && px < 11 ? { rgb: C.card, mat: MaterialId.Ceramic } : { rgb: C.blue, mat: MaterialId.Enamel };
  // Bottom navigation: four sections, the first one (Offers) selected.
  if (py >= 34) {
    const slot = Math.floor(px / 4.5);
    const cx = slot * 4.5 + 2;
    const icon = py === 35 && Math.abs(px + 0.5 - cx) <= 1;
    if (icon) return slot === 0 ? { rgb: C.blue, mat: MaterialId.GlowCyan } : { rgb: C.ink, mat: MaterialId.Enamel };
    return py === 34 ? { rgb: C.line, mat: MaterialId.Ceramic } : { rgb: C.card, mat: MaterialId.Ceramic };
  }
  // Three offer cards.
  for (let k = 0; k < 3; k++) {
    const top = 7 + k * 9;
    if (py >= top && py < top + 7 && px >= 1 && px < 17) {
      const edge = py === top || py === top + 6 || px === 1 || px === 16;
      if (edge) return { rgb: C.line, mat: MaterialId.Ceramic };
      if (px >= 2 && px < 7 && py > top && py < top + 6) return { rgb: k === 1 ? C.amber : C.blue, mat: MaterialId.Enamel }; // picture
      if (py === top + 2 && px >= 8 && px < 15) return { rgb: C.ink, mat: MaterialId.Enamel }; // title
      if (py === top + 4 && px >= 8 && px < 12) return { rgb: C.amber, mat: MaterialId.GlowGold }; // date / tag
      return { rgb: C.card, mat: MaterialId.Ceramic };
    }
  }
  return { rgb: C.paper, mat: MaterialId.Ceramic };
}

function addPhone(b: TargetBuilder): void {
  const X0 = -Math.floor(PW / 2);
  const corner = (px: number, py: number) => {
    const r = 3;
    const cx = px < r ? r : px > PW - 1 - r ? PW - 1 - r : px;
    const cy = py < r ? r : py > PH - 1 - r ? PH - 1 - r : py;
    return Math.hypot(px - cx, py - cy) > r + 0.2;
  };
  for (let px = 0; px < PW; px++) {
    for (let py = 0; py < PH; py++) {
      if (corner(px, py)) continue;
      const x = X0 + px;
      const y = PY + PH - 1 - py;
      const sx = px - 2;
      const sy = py - 3;
      const onScreen = sx >= 0 && sx < PW - 4 && sy >= 0 && sy < PH - 6;
      const front = onScreen ? screen(sx, sy) : { rgb: C.body, mat: MaterialId.Graphite };
      b.add(x, y, 0, front.rgb, front.mat);
      b.add(x, y, -1, C.body, MaterialId.Graphite);
      b.add(x, y, -2, C.body, MaterialId.Graphite);
    }
  }
  // Speaker slot above the screen.
  for (let px = 8; px < 14; px++) b.add(X0 + px, PY + PH - 2, 1, C.ink, MaterialId.Enamel);
}

/** A globe of exchange destinations with pins. */
function addGlobe(b: TargetBuilder): void {
  const cx = 22;
  const cy = 18;
  const cz = -6;
  const R = 8;
  for (let x = -R; x <= R; x++) {
    for (let y = -R; y <= R; y++) {
      for (let z = -R; z <= R; z++) {
        const d = Math.hypot(x, y, z);
        if (d > R + 0.5 || d < R - 0.5) continue;
        // Land as soft patches: a few lattice-hashed blobs, coarse enough to read as continents.
        const land = hash1(Math.floor((x + 20) / 4) * 7 + Math.floor((y + 20) / 4) * 13 + Math.floor((z + 20) / 4) * 29) > 0.58;
        b.add(cx + x, cy + y, cz + z, land ? C.amber : C.ocean, land ? MaterialId.Ceramic : MaterialId.Enamel);
      }
    }
  }
  // Pins: short stalks with glowing heads, on the side that faces the camera.
  const pins: [number, number, number][] = [[-0.45, 0.55, 0.7], [0.35, 0.2, 0.9], [-0.15, -0.35, 0.92], [0.6, 0.6, 0.5]];
  for (const [ux, uy, uz] of pins) {
    const n = Math.hypot(ux, uy, uz);
    for (let s = 1; s <= 3; s++) {
      const k = (R + s) / n;
      b.add(cx + Math.round(ux * k), cy + Math.round(uy * k), cz + Math.round(uz * k), s === 3 ? C.blue : C.card, s === 3 ? MaterialId.GlowCyan : MaterialId.Ceramic);
    }
  }
}

/** Offer cards drifting from the phone towards the globe: shared offers. */
function addSharedOffers(b: TargetBuilder): void {
  const MW = 8;
  const MH = 5;
  for (let m = 0; m < 3; m++) {
    const cx = (12 + m * 3.2) * VOXEL_SIZE;
    const cy = (PY + 32 - m * 3) * VOXEL_SIZE;
    const cz = (2 + m) * VOXEL_SIZE;
    const tilt = -0.25 + m * 0.15;
    const yaw = -0.4 + hash1(m + 70) * 0.3;
    for (let py = 0; py < MH; py++) {
      for (let px = 0; px < MW; px++) {
        const edge = px === 0 || py === 0 || px === MW - 1 || py === MH - 1;
        const pic = px >= 1 && px < 4 && py >= 1 && py < 4;
        const rgb = edge ? C.line : pic ? C.blue : py === 2 && px > 4 ? C.amber : C.card;
        const mat = pic ? MaterialId.GlowCyan : MaterialId.Ceramic;
        const lx = (px - (MW - 1) / 2) * VOXEL_SIZE;
        const ly = ((MH - 1) / 2 - py) * VOXEL_SIZE;
        const tx = lx * Math.cos(tilt) - ly * Math.sin(tilt);
        const ty = lx * Math.sin(tilt) + ly * Math.cos(tilt);
        b.addFree(cx + tx * Math.cos(yaw), cy + ty, cz - tx * Math.sin(yaw), rgb, mat);
      }
    }
  }
}

export function buildTmelnikApp(): FormationTargets {
  const b = new TargetBuilder('tmelnik', VOXEL_SIZE);
  addPhone(b);
  addGlobe(b);
  addSharedOffers(b);
  return b.build();
}
