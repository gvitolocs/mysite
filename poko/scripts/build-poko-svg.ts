/**
 * Writes Poko as SVG from the sprite grid: src/assets/poko/poko.svg (exact
 * 26×24 viewBox, used by <PokoMark>) and public/favicon.svg (padded square).
 *   node scripts/build-poko-svg.ts
 */
import { writeFileSync } from 'node:fs';
import { PALETTE, SPRITE_HEIGHT, SPRITE_ROWS, SPRITE_WIDTH, type SwatchKey } from '../src/character/pokoSprite.ts';

let rects = '';
SPRITE_ROWS.forEach((row, y) => {
  let x = 0;
  while (x < SPRITE_WIDTH) {
    const c = row[x];
    let end = x + 1;
    while (end < SPRITE_WIDTH && row[end] === c) end++;
    if (c !== '.') rects += `<rect x="${x}" y="${y}" width="${end - x}" height="1" fill="${PALETTE[c as SwatchKey].hex}"/>`;
    x = end;
  }
});
const svg = (viewBox: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" shape-rendering="crispEdges">${rects}</svg>\n`;
writeFileSync(new URL('../src/assets/poko/poko.svg', import.meta.url), svg(`0 0 ${SPRITE_WIDTH} ${SPRITE_HEIGHT}`));
writeFileSync(new URL('../public/favicon.svg', import.meta.url), svg(`-1 -2 ${SPRITE_WIDTH + 2} ${SPRITE_WIDTH + 2}`));
console.log('Wrote src/assets/poko/poko.svg and public/favicon.svg');
