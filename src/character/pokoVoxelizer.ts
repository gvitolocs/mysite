/**
 * Pixel art → volumetric voxel character.
 *
 * Extruding the PNG would give a flat slab. Instead, each pixel's depth is
 * reconstructed from what the pixel *depicts*: the sprite is a coin seen
 * face-on, so it gets coin relief.
 *
 *   side view of one column of the body (front is +z)
 *
 *        lip   trough  plateau  engraving  plateau  trough   lip
 *   z=+3 ███            ████               ████             ███
 *   z=+2 ███  ██████    ████  ██████████   ████   ██████    ███
 *   ...  (solid gold core)                                   ...
 *   z=-3 ███            mirrored on the back, without the face ███
 *
 * - lip: body pixels outside the bronze ring (the ring is the drawn shadow at
 *   the lip's foot), so the outline becomes a navy band around the coin's edge;
 * - plateau: a round boss (radius PLATEAU_RADIUS) carrying the face;
 * - face features (eyes, mouth) are engraved one voxel into the plateau;
 * - hands and feet are short extrusions; feet get a toe so they read in profile.
 *
 * Everything is deterministic: no randomness except a coordinate hash used for
 * a ±3 % per-voxel tint that makes individual cubes legible.
 *
 * This module is dependency-free so Node can run it directly
 * (`scripts/export-poko-voxels.ts` feeds Blender from the same code).
 */
import {
  PALETTE,
  SPRITE_HEIGHT,
  SPRITE_WIDTH,
  spriteAt,
  type SwatchKey,
} from './pokoSprite.ts';

export const BONE_NAMES = [
  'root',
  'body',
  'eye_l',
  'eye_r',
  'mouth',
  'hand_l',
  'hand_r',
  'foot_l',
  'foot_r',
] as const;
export type BoneName = (typeof BONE_NAMES)[number];

export interface BoneSpec {
  name: BoneName;
  parent: BoneName | null;
  /** Pivot in voxel units (character space, +y up, +z towards the viewer). */
  head: [number, number, number];
  /** Bone tip, only used to give Blender bones a sensible length/direction. */
  tail: [number, number, number];
}

export type Region = 'lip' | 'ring' | 'trough' | 'plateau' | 'feature' | 'hand' | 'foot' | 'core';

export interface PokoVoxel {
  /** Voxel centre in voxel units. x, y are half-integers; z is an integer. */
  x: number;
  y: number;
  z: number;
  color: SwatchKey;
  bone: number;
  region: Region;
  /** Source pixel (image space) this voxel was extruded from. */
  px: number;
  py: number;
  /** True for the voxel that shows the pixel in the flat front view. */
  front: boolean;
  /** 0 on the surface, increasing towards the core (6-neighbour BFS). */
  depth: number;
  /** Per-voxel brightness multiplier in [0.97, 1.03]. */
  shade: number;
}

export interface PokoModel {
  voxels: PokoVoxel[];
  bones: BoneSpec[];
  /** Axis-aligned bounds of voxel centres. */
  bounds: { min: [number, number, number]; max: [number, number, number] };
}

/** Coin centre and plateau radius in image space (pixels). */
const COIN_CX = 12.5;
const COIN_CY = 9.75;
const PLATEAU_RADIUS = 5.6;

const LIP_Z = 3;
const TROUGH_Z = 2;
const PLATEAU_Z = 3;
const ENGRAVE_Z = 2;
const HAND_Z = 1;
const FOOT_BACK_Z = -2;
const FOOT_FRONT_Z = 2;
const TOE_FRONT_Z = 3;

const DARK = new Set<SwatchKey>(['N', 'B', 'L']);
const RING_BARRIER = new Set<SwatchKey>(['X', 'D', 'W', 'Y']);

/** Map image coordinates to character space (voxel centres). */
export function toCharacterSpace(px: number, py: number): [number, number] {
  return [px - (SPRITE_WIDTH - 1) / 2, SPRITE_HEIGHT - 0.5 - py];
}

type PixelRegion = 'body' | 'hand' | 'foot';

function pixelRegion(x: number, y: number): PixelRegion | null {
  if (!spriteAt(x, y)) return null;
  if (y >= 10 && y <= 14 && (x <= 2 || x >= 23)) return 'hand';
  if (y >= 21 || (y === 20 && (x <= 9 || x >= 16))) return 'foot';
  return 'body';
}

/** Eye and mouth boxes, in image space. */
function featureBone(x: number, y: number): BoneName | null {
  if (y >= 9 && y <= 11 && (x === 9 || x === 10)) return 'eye_l';
  if (y >= 9 && y <= 11 && (x === 15 || x === 16)) return 'eye_r';
  if (y >= 12 && y <= 13 && x >= 11 && x <= 14) return 'mouth';
  return null;
}

/** 32-bit integer hash → [0, 1). Deterministic across JS engines. */
export function hash3(x: number, y: number, z: number): number {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/**
 * Classify body pixels: flood-fill the coin face from its centre, stopping at
 * the drawn ring (bronze plus the highlight pixels that interrupt it). Pixels
 * reached are the face field; barrier pixels touching the field are the ring;
 * everything else in the body is the lip.
 */
function classifyBody(): Map<number, 'lip' | 'ring' | 'field'> {
  const key = (x: number, y: number) => y * SPRITE_WIDTH + x;
  const field = new Set<number>();
  const start: [number, number] = [Math.floor(COIN_CX), Math.floor(COIN_CY)];
  const queue: [number, number][] = [start];
  field.add(key(...start));
  while (queue.length) {
    const [x, y] = queue.shift()!;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      const k = key(nx, ny);
      if (field.has(k) || pixelRegion(nx, ny) !== 'body') continue;
      // Eye catchlights are white like the rim highlight but belong to the face.
      if (RING_BARRIER.has(spriteAt(nx, ny)!) && !featureBone(nx, ny)) continue;
      field.add(k);
      queue.push([nx, ny]);
    }
  }
  const out = new Map<number, 'lip' | 'ring' | 'field'>();
  for (let y = 0; y < SPRITE_HEIGHT; y++) {
    for (let x = 0; x < SPRITE_WIDTH; x++) {
      if (pixelRegion(x, y) !== 'body') continue;
      const k = key(x, y);
      if (field.has(k)) {
        out.set(k, 'field');
        continue;
      }
      let touchesField = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (field.has(key(x + dx, y + dy))) touchesField = true;
        }
      }
      out.set(k, touchesField && RING_BARRIER.has(spriteAt(x, y)!) ? 'ring' : 'lip');
    }
  }
  if (field.size < 100) throw new Error(`Coin face flood fill leaked or failed (${field.size} px)`);
  return out;
}

/** True if a body pixel has a 4-neighbour outside the body: the silhouette band. */
function isBodyEdge(x: number, y: number): boolean {
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    if (pixelRegion(x + dx, y + dy) !== 'body') return true;
  }
  return false;
}

export function buildPokoModel(): PokoModel {
  const classes = classifyBody();
  const boneIndex = (name: BoneName) => BONE_NAMES.indexOf(name);
  const raw: Omit<PokoVoxel, 'depth' | 'shade'>[] = [];

  for (let py = 0; py < SPRITE_HEIGHT; py++) {
    for (let px = 0; px < SPRITE_WIDTH; px++) {
      const color = spriteAt(px, py);
      const region = pixelRegion(px, py);
      if (!color || !region) continue;
      const [x, y] = toCharacterSpace(px, py);

      if (region === 'hand' || region === 'foot') {
        const bone =
          region === 'hand'
            ? boneIndex(px <= 12 ? 'hand_l' : 'hand_r')
            : boneIndex(px <= 12 ? 'foot_l' : 'foot_r');
        const back = region === 'hand' ? -HAND_Z : FOOT_BACK_Z;
        const front = region === 'hand' ? HAND_Z : py >= 22 ? TOE_FRONT_Z : FOOT_FRONT_Z;
        for (let z = back; z <= front; z++) {
          raw.push({ x, y, z, color, bone, region, px, py, front: z === front });
        }
        continue;
      }

      const cls = classes.get(py * SPRITE_WIDTH + px)!;
      const feature = featureBone(px, py);
      const engraved = feature !== null && (DARK.has(color) || color === 'W');
      const r = Math.hypot(px - COIN_CX, py - COIN_CY);
      const onPlateau = cls === 'field' && r <= PLATEAU_RADIUS;
      let frontZ: number;
      let frontRegion: Region;
      if (cls === 'lip') {
        frontZ = LIP_Z;
        frontRegion = 'lip';
      } else if (cls === 'ring') {
        frontZ = TROUGH_Z;
        frontRegion = 'ring';
      } else if (engraved) {
        frontZ = ENGRAVE_Z;
        frontRegion = 'feature';
      } else if (onPlateau) {
        frontZ = PLATEAU_Z;
        frontRegion = 'plateau';
      } else {
        frontZ = TROUGH_Z;
        frontRegion = 'trough';
      }
      // The back mirrors the relief but carries no face.
      const backZ = -(cls === 'lip' ? LIP_Z : onPlateau ? PLATEAU_Z : TROUGH_Z);
      const isCheek = color === 'A' && onPlateau;
      let backColor: SwatchKey = color;
      if (engraved || isCheek) backColor = 'O';
      else if (color === 'W') backColor = 'Y';
      const edge = isBodyEdge(px, py);
      for (let z = backZ; z <= frontZ; z++) {
        const isFront = z === frontZ;
        const isBack = z === backZ;
        let c: SwatchKey;
        let reg: Region;
        let bone = boneIndex('body');
        if (isFront) {
          c = color;
          reg = frontRegion;
          if (frontRegion === 'feature' && feature) bone = boneIndex(feature);
        } else if (isBack) {
          c = edge ? 'N' : backColor;
          reg = cls === 'lip' ? 'lip' : 'core';
        } else {
          // The silhouette band reads as the coin's navy edge; the core is solid gold.
          c = edge ? 'N' : 'O';
          reg = edge ? 'lip' : 'core';
        }
        raw.push({ x, y, z, color: c, bone, region: reg, px, py, front: isFront });
      }
    }
  }

  // Surface depth via 6-neighbour BFS from empty space: drives disintegration order.
  const posKey = (x: number, y: number, z: number) => `${x},${y},${z}`;
  const occupied = new Map<string, number>();
  raw.forEach((v, i) => occupied.set(posKey(v.x, v.y, v.z), i));
  const depth = new Array<number>(raw.length).fill(Infinity);
  const queue: number[] = [];
  const dirs = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] as const;
  raw.forEach((v, i) => {
    if (dirs.some(([dx, dy, dz]) => !occupied.has(posKey(v.x + dx, v.y + dy, v.z + dz)))) {
      depth[i] = 0;
      queue.push(i);
    }
  });
  for (let head = 0; head < queue.length; head++) {
    const i = queue[head];
    const v = raw[i];
    for (const [dx, dy, dz] of dirs) {
      const j = occupied.get(posKey(v.x + dx, v.y + dy, v.z + dz));
      if (j !== undefined && depth[j] > depth[i] + 1) {
        depth[j] = depth[i] + 1;
        queue.push(j);
      }
    }
  }

  const voxels: PokoVoxel[] = raw.map((v, i) => ({
    ...v,
    depth: depth[i],
    shade: 0.97 + 0.06 * hash3(v.x * 2, v.y * 2, v.z * 2 + 7),
  }));

  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const v of voxels) {
    min[0] = Math.min(min[0], v.x); min[1] = Math.min(min[1], v.y); min[2] = Math.min(min[2], v.z);
    max[0] = Math.max(max[0], v.x); max[1] = Math.max(max[1], v.y); max[2] = Math.max(max[2], v.z);
  }

  return { voxels, bones: buildBones(), bounds: { min, max } };
}

function buildBones(): BoneSpec[] {
  const [eyeLx, eyeY] = toCharacterSpace(9.5, 10);
  const [eyeRx] = toCharacterSpace(15.5, 10);
  const [, mouthY] = toCharacterSpace(12.5, 12.5);
  const [handLx, handY] = toCharacterSpace(3, 12);
  const [handRx] = toCharacterSpace(22, 12);
  const [footLx, footY] = toCharacterSpace(7.5, 20);
  const [footRx] = toCharacterSpace(17.5, 20);
  const bodyY = toCharacterSpace(0, 20)[1];
  // Every bone points straight up with zero roll, so all bones share one local
  // frame (local x = right, local y = up). Keyframes authored in character
  // space then convert to bone space without per-bone axis bookkeeping.
  const bone = (name: BoneName, parent: BoneName | null, head: [number, number, number], length: number): BoneSpec => ({
    name,
    parent,
    head,
    tail: [head[0], head[1] + length, head[2]],
  });
  return [
    bone('root', null, [0, 0, 0], 2),
    bone('body', 'root', [0, bodyY, 0], 8),
    bone('eye_l', 'body', [eyeLx, eyeY, ENGRAVE_Z], 1.5),
    bone('eye_r', 'body', [eyeRx, eyeY, ENGRAVE_Z], 1.5),
    bone('mouth', 'body', [0, mouthY, ENGRAVE_Z], 1),
    bone('hand_l', 'body', [handLx, handY, 0], 2),
    bone('hand_r', 'body', [handRx, handY, 0], 2),
    bone('foot_l', 'root', [footLx, footY, 0], 2),
    bone('foot_r', 'root', [footRx, footY, 0], 2),
  ];
}

export function swatchRgb(key: SwatchKey): [number, number, number] {
  const n = parseInt(PALETTE[key].hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
