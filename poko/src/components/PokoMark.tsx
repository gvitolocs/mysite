/**
 * Poko as a crisp vector image. The SVG is generated from the same sprite grid
 * the voxelizer uses (scripts/build-poko-svg.ts), so it cannot drift from the
 * 3D character; as a hashed file it is downloaded once and cached, instead of
 * repeating ~10 KB of <rect>s in every page's HTML.
 */
import pokoSvg from '../assets/poko/poko.svg?url';
import { SPRITE_HEIGHT, SPRITE_WIDTH } from '../character/pokoSprite.ts';

export function PokoMark(props: { size?: number; class?: string; title?: string }) {
  const size = props.size ?? 26;
  return (
    <img
      class={props.class}
      src={pokoSvg}
      width={size}
      height={Math.round((size * SPRITE_HEIGHT) / SPRITE_WIDTH)}
      alt={props.title ?? ''}
      decoding="async"
    />
  );
}
