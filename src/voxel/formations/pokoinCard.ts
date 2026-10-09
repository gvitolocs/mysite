/**
 * World A: Pokoin. Poko's matter becomes a collectible card with Poko as its
 * art, backed by a fan of smaller cards: a collection assembling itself.
 *
 * The card is an original Pokoin-branded design (navy enamel, gold frame,
 * coin rarity dots). It intentionally avoids imitating any trading-card
 * game's layout or trade dress.
 */
import { PALETTE, SPRITE_HEIGHT, SPRITE_WIDTH, spriteAt } from '../../character/pokoSprite.ts';
import { hash1 } from '../../math/random.ts';
import { TargetBuilder } from '../correspondence.ts';
import { MaterialId, VOXEL_SIZE, hexToSrgbBytes, type FormationTargets } from '../VoxelData.ts';
import { rasterText } from './pixelFont.ts';

type RGB = [number, number, number];
const C = {
  border: hexToSrgbBytes('#23376e'),
  field: hexToSrgbBytes('#0c1636'),
  stripe: hexToSrgbBytes('#13234f'),
  frame: hexToSrgbBytes('#ffd23f'),
  title: hexToSrgbBytes('#ffcb03'),
  artTop: hexToSrgbBytes('#24489a'),
  artBottom: hexToSrgbBytes('#0f2259'),
  dotEmpty: hexToSrgbBytes('#2b3f7c'),
  spark: hexToSrgbBytes('#c6f7ff'),
};
const MAT_OF = { gold: MaterialId.Gold, enamel: MaterialId.Enamel, ceramic: MaterialId.Ceramic } as const;

export const CARD_W = 32;
export const CARD_H = 44;

const mixRgb = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;

/** Front face of the card as a pixel function (image space, y down). */
function cardFront(px: number, py: number): { rgb: RGB; mat: number } {
  const edge = Math.min(px, py, CARD_W - 1 - px, CARD_H - 1 - py);
  if (edge <= 1) return { rgb: C.border, mat: MaterialId.Enamel };
  if (edge === 2) return { rgb: C.frame, mat: MaterialId.Gold };
  // Title plate
  const title = rasterText('POKOIN', '3x5');
  const tx = px - Math.floor((CARD_W - title.width) / 2);
  const ty = py - 4;
  if (ty >= 0 && ty < title.height && title.pixels.some(([x, y]) => x === tx && y === ty)) {
    return { rgb: C.title, mat: MaterialId.Gold };
  }
  // Art window holds Poko at 1:1, one pixel per voxel.
  const ax = px - 3;
  const ay = py - 10;
  if (ax >= 0 && ax < SPRITE_WIDTH && ay >= 0 && ay < SPRITE_HEIGHT) {
    const key = spriteAt(ax, ay);
    if (key) return { rgb: hexToSrgbBytes(PALETTE[key].hex), mat: MAT_OF[PALETTE[key].material] };
    if (hash1(px * 131 + py * 7) > 0.985) return { rgb: C.spark, mat: MaterialId.GlowCyan };
    return { rgb: mixRgb(C.artTop, C.artBottom, ay / SPRITE_HEIGHT), mat: MaterialId.Enamel };
  }
  // Art window border
  if (ax >= -1 && ax <= SPRITE_WIDTH && ay >= -1 && ay <= SPRITE_HEIGHT) return { rgb: C.frame, mat: MaterialId.Gold };
  // Rarity row: five coins, four lit.
  if (py === 37 || py === 38) {
    const slot = Math.floor((px - 5) / 3);
    if (px >= 5 && slot < 5 && (px - 5) % 3 < 2) return { rgb: slot < 4 ? C.frame : C.dotEmpty, mat: slot < 4 ? MaterialId.Gold : MaterialId.Enamel };
  }
  // Holo field: faint diagonal stripes.
  return { rgb: (px + py) % 6 === 0 ? C.stripe : C.field, mat: MaterialId.Enamel };
}

/** Back face: a large Pokoin coin with a "P". */
function cardBack(px: number, py: number): { rgb: RGB; mat: number } {
  const edge = Math.min(px, py, CARD_W - 1 - px, CARD_H - 1 - py);
  if (edge <= 1) return { rgb: C.border, mat: MaterialId.Enamel };
  const cx = (CARD_W - 1) / 2;
  const cy = (CARD_H - 1) / 2;
  const r = Math.hypot(px - cx, py - cy);
  if (r <= 10.5 && r > 8.6) return { rgb: C.title, mat: MaterialId.Gold };
  const p = rasterText('P', '5x7');
  const lx = px - Math.round(cx - 2);
  const ly = py - Math.round(cy - 3);
  if (p.pixels.some(([x, y]) => x === lx && y === ly)) return { rgb: C.frame, mat: MaterialId.Gold };
  return { rgb: (px + py) % 6 === 0 ? C.stripe : C.field, mat: MaterialId.Enamel };
}

const MINI_PALETTES: { border: RGB; art: RGB; motif: RGB; mat: number }[] = [
  { border: hexToSrgbBytes('#ffd23f'), art: hexToSrgbBytes('#1b3a85'), motif: hexToSrgbBytes('#ffcb03'), mat: MaterialId.Gold },
  { border: hexToSrgbBytes('#e8edf7'), art: hexToSrgbBytes('#20305e'), motif: hexToSrgbBytes('#c6f7ff'), mat: MaterialId.Ceramic },
  { border: hexToSrgbBytes('#23376e'), art: hexToSrgbBytes('#5ce1e6'), motif: hexToSrgbBytes('#ffffff'), mat: MaterialId.Enamel },
  { border: hexToSrgbBytes('#db9300'), art: hexToSrgbBytes('#0c1636'), motif: hexToSrgbBytes('#ffd23f'), mat: MaterialId.Gold },
];

export function buildPokoinCard(): FormationTargets {
  const b = new TargetBuilder('pokoin', VOXEL_SIZE);
  const ox = -(CARD_W - 1) / 2;
  const oy = (CARD_H - 1) / 2;
  for (let py = 0; py < CARD_H; py++) {
    for (let px = 0; px < CARD_W; px++) {
      const f = cardFront(px, py);
      b.add(ox + px, oy - py, 0, f.rgb, f.mat);
      // The back is mirrored horizontally so it reads correctly when the card turns.
      const k = cardBack(CARD_W - 1 - px, py);
      b.add(ox + px, oy - py, -1, k.rgb, k.mat);
    }
  }
  // A fan of eight smaller cards behind: the collection.
  const MW = 10;
  const MH = 14;
  for (let m = 0; m < 8; m++) {
    const pal = MINI_PALETTES[m % MINI_PALETTES.length];
    const angle = (-0.9 + (m / 7) * 1.8) * 0.95;
    const radius = 3.6;
    const cx = Math.sin(angle) * radius;
    const cz = -1.6 - Math.cos(angle) * 1.4;
    const cy = 0.35 + Math.cos(angle * 2) * 0.25 + (m % 2) * 0.35;
    const yaw = -angle * 0.85;
    const tilt = (hash1(m + 40) - 0.5) * 0.25;
    for (let py = 0; py < MH; py++) {
      for (let px = 0; px < MW; px++) {
        const edge = Math.min(px, py, MW - 1 - px, MH - 1 - py);
        let rgb: RGB = pal.art;
        let mat: number = MaterialId.Enamel;
        if (edge === 0) { rgb = pal.border; mat = pal.mat; }
        else if (Math.hypot(px - 4.5, py - 5.5) < 2.6 && py < 10) { rgb = pal.motif; mat = pal.mat === MaterialId.Enamel ? MaterialId.GlowCyan : pal.mat; }
        else if (py >= 11 && px >= 2 && px <= 7) { rgb = pal.border; mat = pal.mat; }
        const lx = (px - (MW - 1) / 2) * VOXEL_SIZE;
        const ly = ((MH - 1) / 2 - py) * VOXEL_SIZE;
        // rotate around Z (tilt) then Y (yaw)
        const tx = lx * Math.cos(tilt) - ly * Math.sin(tilt);
        const ty = lx * Math.sin(tilt) + ly * Math.cos(tilt);
        b.addFree(cx + tx * Math.cos(yaw), cy + ty, cz - tx * Math.sin(yaw), rgb, mat);
      }
    }
  }
  return b.build();
}
