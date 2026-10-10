/**
 * Poko, the Pokoin coin mascot, as authored pixel art.
 *
 * Source of truth: `src/assets/poko/pokoin-mascot@8x.png` (208×192, 8×8 px per
 * pixel), copied byte-for-byte from gvitolocs/pokoin `brand/mascot/`. The grid
 * below is that image sampled at each cell centre and quantised to ten swatches;
 * `tests/unit/pokoSprite.test.ts` decodes the PNG and fails if any cell differs
 * by more than `PALETTE_TOLERANCE` per channel from its swatch.
 *
 * Coordinates: column x grows right, row y grows down (image space).
 * "Left"/"right" in names always mean screen left/right in the front view.
 */

export const SPRITE_WIDTH = 26;
export const SPRITE_HEIGHT = 24;
/** Max per-channel deviation between a source pixel and its swatch (0–255). */
export const PALETTE_TOLERANCE = 12;

export type SwatchKey = 'N' | 'B' | 'L' | 'W' | 'Y' | 'O' | 'C' | 'A' | 'X' | 'D';

/** Surface treatment used by the renderer; see `materialFor` in the voxel engine. */
export type MaterialKind = 'gold' | 'enamel' | 'ceramic';

export interface Swatch {
  hex: string;
  role: string;
  material: MaterialKind;
}

export const PALETTE: Record<SwatchKey, Swatch> = {
  N: { hex: '#040d34', role: 'navy outline and engraved features', material: 'enamel' },
  B: { hex: '#01023b', role: 'deep navy (mouth centre, soles)', material: 'enamel' },
  L: { hex: '#281b2a', role: 'plum outline accent (single pixel)', material: 'enamel' },
  W: { hex: '#ffffff', role: 'specular highlight and eye catchlights', material: 'ceramic' },
  Y: { hex: '#feda0b', role: 'light gold highlight', material: 'gold' },
  O: { hex: '#ffcb03', role: 'coin gold (body)', material: 'gold' },
  C: { hex: '#d58d01', role: 'amber shading', material: 'gold' },
  A: { hex: '#db9300', role: 'orange shading and cheeks', material: 'gold' },
  X: { hex: '#be7c00', role: 'bronze rim ring', material: 'gold' },
  D: { hex: '#b16c00', role: 'dark bronze accent', material: 'gold' },
};

/** One string per row; '.' is transparent. */
export const SPRITE_ROWS: readonly string[] = [
  '..........NNNNNN..........',
  '........NNNYYYYNNN........',
  '......NNNWWWOOOOONNN......',
  '.....NNWWYXXXXXXXOYNN.....',
  '....NWWXYOOOOOOOOXXYYN....',
  '....NYXYOOOOOOOOOOOXYNN...',
  '....YOXYOOOOOOOOOOOXYON...',
  '....ODOOOOOOOOOOOOOODON...',
  '...NOXOOOOOOOOOOOOOOXOL...',
  '...NOXOOONNOOOONNOOOXOO...',
  '.NNNOXOOOWNOOOOWNOOOXOONN.',
  'NOONOXOOONNOOOONNOOOXOOOON',
  'NOANOXOOOOONOONOOOOOXOOAON',
  'NAANOXOOAAOOBNOOAAOOXOAAAN',
  '.NNNOOXOOOOOOOOOOOOXOONNN.',
  '....AOXOOOOOOOOOOOOXOAN...',
  '....AAOXOOOOOOOOOOXOCAN...',
  '....NCCOXXOOOOOOXXOCANN...',
  '....NNCCOOXXXXXXOOCCNN....',
  '.....NNNXXOOOOOOXXNNN.....',
  '.....NNCACNNNNNNCACNN.....',
  '.....NOOOAN....NCOOON.....',
  '.....NDDDXN....NXXDDN.....',
  '.....NBBBBN....NBBBBN.....',
];

export function spriteAt(x: number, y: number): SwatchKey | null {
  if (x < 0 || y < 0 || x >= SPRITE_WIDTH || y >= SPRITE_HEIGHT) return null;
  const c = SPRITE_ROWS[y][x];
  return c === '.' ? null : (c as SwatchKey);
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
