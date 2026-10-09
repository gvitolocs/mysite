import { readFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { describe, expect, it } from 'vitest';
import { PALETTE, PALETTE_TOLERANCE, SPRITE_HEIGHT, SPRITE_ROWS, SPRITE_WIDTH, hexToRgb, type SwatchKey } from '../../src/character/pokoSprite.ts';

// The authoritative mascot, copied byte-for-byte from gvitolocs/pokoin brand/mascot/.
const png = PNG.sync.read(readFileSync(new URL('../../src/assets/poko/pokoin-mascot@8x.png', import.meta.url)));
const SCALE = 8;

describe('Poko sprite', () => {
  it('matches the source image dimensions (26 × 24 cells of 8 px)', () => {
    expect(png.width).toBe(SPRITE_WIDTH * SCALE);
    expect(png.height).toBe(SPRITE_HEIGHT * SCALE);
    expect(SPRITE_ROWS).toHaveLength(SPRITE_HEIGHT);
    for (const row of SPRITE_ROWS) expect(row).toHaveLength(SPRITE_WIDTH);
  });

  it('reproduces every pixel of the mascot within the palette tolerance', () => {
    let maxDeviation = 0;
    for (let y = 0; y < SPRITE_HEIGHT; y++) {
      for (let x = 0; x < SPRITE_WIDTH; x++) {
        const i = ((y * SCALE + 4) * png.width + (x * SCALE + 4)) * 4;
        const [r, g, b, a] = [png.data[i], png.data[i + 1], png.data[i + 2], png.data[i + 3]];
        const key = SPRITE_ROWS[y][x];
        if (key === '.') {
          expect(a, `(${x},${y}) should be transparent`).toBe(0);
          continue;
        }
        expect(a, `(${x},${y}) should be opaque`).toBe(255);
        const [sr, sg, sb] = hexToRgb(PALETTE[key as SwatchKey].hex);
        maxDeviation = Math.max(maxDeviation, Math.abs(r - sr), Math.abs(g - sg), Math.abs(b - sb));
      }
    }
    expect(maxDeviation).toBeLessThanOrEqual(PALETTE_TOLERANCE);
  });

  it('has uniform 8 × 8 blocks, so cell-centre sampling is exact', () => {
    for (let y = 0; y < SPRITE_HEIGHT; y++) {
      for (let x = 0; x < SPRITE_WIDTH; x++) {
        const base = ((y * SCALE) * png.width + x * SCALE) * 4;
        for (let dy = 0; dy < SCALE; dy++) {
          for (let dx = 0; dx < SCALE; dx++) {
            const i = (((y * SCALE + dy) * png.width) + (x * SCALE + dx)) * 4;
            for (let c = 0; c < 4; c++) expect(png.data[i + c]).toBe(png.data[base + c]);
          }
        }
      }
    }
  });
});
