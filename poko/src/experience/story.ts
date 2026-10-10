/**
 * The story: a pure function from scroll progress to everything on screen.
 *
 *   evaluateStory(u) → { camera, morph, stream, poko, env, effects }
 *
 * Nothing here depends on the previous frame, elapsed time or scroll direction.
 * That is the whole trick behind reversible scrolling: rendering frame N never
 * needs frame N-1, so scrubbing backward is just evaluating smaller u.
 * (Ambient motion — breathing, blinks, the pointer — is layered on top by the
 * renderer and decays to nothing; it never feeds back into this state.)
 *
 * The script is written per chapter in chapter-local time t ∈ [0, 1].
 */
import * as THREE from 'three';
import { CHAPTERS, chapterAt, type ChapterId } from '../content/chapters.ts';
import { bell, clamp01, easeInOutCubic, lerp, range, smoothstep } from '../math/easing.ts';
import { DEFAULT_MORPH, type MorphParams, type StreamParams } from '../voxel/VoxelEngine.ts';
import { LAYER_STREAM, type FormationPlacement } from '../voxel/VoxelData.ts';
import type { PokoAnimState, ScrubbedClip } from '../character/PokoAnimationController.ts';
import { CameraTrack, type CameraKey } from './CameraController.ts';

// ---------------------------------------------------------------- world anchors
export const ANCHORS = {
  home: new THREE.Vector3(0, 0, 0),
  rift: new THREE.Vector3(0, 1.6, -2.4),
  cloud: new THREE.Vector3(0, 1.75, -0.3),
  portal: new THREE.Vector3(0, 1.9, -16),
  pokoin: new THREE.Vector3(0, 2.55, -44),
  cardrail: new THREE.Vector3(7, 0.15, -60),
  prduct: new THREE.Vector3(-6.5, 0.15, -76),
  tmelnik: new THREE.Vector3(5.5, 0.15, -92),
  systems: new THREE.Vector3(0, 0.25, -108),
  finale: new THREE.Vector3(0, 0, -126),
  name: new THREE.Vector3(0, 3.75, -129),
} as const;

const POKO_CENTER_Y = 1.45;

// ---------------------------------------------------------------- camera script
const KEYS: CameraKey[] = [
  // Awakening: a long lens makes the sprite read as flat; the camera swings to reveal depth.
  { chapter: 'awakening', at: 0, position: [0, 0.8, 9.6], target: [0, 0.6, 0], fov: 21, portrait: { position: [0, 1.1, 9.6], target: [0, 0.55, 0] } },
  { chapter: 'awakening', at: 0.55, position: [1.4, 1.3, 8.6], target: [0, 1.0, 0], fov: 26 },
  { chapter: 'awakening', at: 1, position: [3.0, 1.85, 7.3], target: [0, 1.25, 0], fov: 30 },
  // Disintegration: a slow turntable drift around the same voxel Poko (about
  // 20° in all), then he comes apart. Faster or wider swings read as spinning.
  { chapter: 'disintegration', at: 0.38, position: [1.3, 1.7, 7.4], target: [0, 1.3, 0], fov: 30 },
  { chapter: 'disintegration', at: 0.7, position: [-0.6, 2.4, 8.6], target: [0, 1.55, 0], fov: 34 },
  { chapter: 'disintegration', at: 1, position: [1.8, 4.3, 9.6], target: [0, 1.7, -1], fov: 38 },
  // Portal: follow the stream, enter the tunnel.
  { chapter: 'portal', at: 0.32, position: [8.2, 4.4, 5.2], target: [0.5, 1.9, -8], fov: 40, ease: 'glide' },
  { chapter: 'portal', at: 0.64, position: [0.9, 2.15, -5.8], target: [0, 1.9, -16], fov: 42, ease: 'glide' },
  { chapter: 'portal', at: 1, position: [0, 1.9, -23], target: [0, 1.9, -36], fov: 54, ease: 'glide' },
  // World A: Pokoin
  { chapter: 'pokoin', at: 0.12, position: [0, 2.1, -30.5], target: [0, 2.4, -44], fov: 46, ease: 'out' },
  { chapter: 'pokoin', at: 0.45, position: [-0.6, 2.6, -34.2], target: [-1.5, 2.5, -44], fov: 37, subject: [0, 2.5, -44] },
  { chapter: 'pokoin', at: 0.86, position: [1.2, 2.7, -35.0], target: [-1.3, 2.5, -44], fov: 36, ease: 'in', subject: [0, 2.5, -44] },
  // Flight to World B, tracked along the path, then the CardRails hero shots.
  { chapter: 'cardrail', at: 0.22, position: [6.6, 3.6, -40.8], target: [4.6, 1.8, -52], fov: 40, ease: 'out' },
  { chapter: 'cardrail', at: 0.5, position: [2.6, 2.6, -50.2], target: [5.2, 1.4, -60], fov: 42, subject: [7, 1.7, -60] },
  { chapter: 'cardrail', at: 0.88, position: [6.8, 2.3, -50.8], target: [5.2, 1.5, -60], fov: 41, ease: 'in', subject: [7, 1.7, -60] },
  // Flight to World C: the prduct pilot, off to the left of the path.
  { chapter: 'prduct', at: 0.22, position: [2.2, 3.8, -61.5], target: [-4.2, 1.8, -70], fov: 40, ease: 'out' },
  { chapter: 'prduct', at: 0.5, position: [-1.2, 2.6, -67.8], target: [-8.4, 1.8, -76], fov: 40, subject: [-6.1, 1.9, -76] },
  { chapter: 'prduct', at: 0.88, position: [-6.0, 2.8, -65.4], target: [-7.0, 1.8, -76], fov: 44, ease: 'in', subject: [-6.1, 1.9, -76] },
  // Flight to World D: the Tmelnik app, back to the right.
  { chapter: 'tmelnik', at: 0.22, position: [-4.0, 4.0, -77.5], target: [2.6, 2.0, -86], fov: 40, ease: 'out' },
  { chapter: 'tmelnik', at: 0.5, position: [3.6, 2.7, -84.2], target: [4.4, 2.4, -92], fov: 40, subject: [6.4, 2.4, -92] },
  { chapter: 'tmelnik', at: 0.88, position: [8.4, 2.9, -84.6], target: [4.8, 2.4, -92], fov: 40, ease: 'in', subject: [6.4, 2.4, -92] },
  // Flight to World E: systems
  { chapter: 'systems', at: 0.22, position: [8.6, 3.9, -90.5], target: [3.5, 2.0, -101], fov: 40, ease: 'out' },
  { chapter: 'systems', at: 0.5, position: [-3.4, 4.7, -99.4], target: [0, 2.2, -108], fov: 38, subject: [0, 2.0, -108] },
  { chapter: 'systems', at: 0.88, position: [2.9, 3.7, -100.4], target: [0, 2.0, -108], fov: 36, ease: 'in', subject: [0, 2.0, -108] },
  // Return: track the fragments home, then frame Poko under his name.
  { chapter: 'reconstruction', at: 0.25, position: [3.4, 4.3, -106.5], target: [0, 1.7, -118], fov: 40, ease: 'out' },
  { chapter: 'reconstruction', at: 0.65, position: [-2.6, 2.5, -117.4], target: [0, 1.7, -126], fov: 36 },
  { chapter: 'reconstruction', at: 1, position: [0, 1.75, -115.4], target: [0, 1.5, -126], fov: 40 },
  { chapter: 'finale', at: 1, position: [0.3, 1.8, -115.2], target: [0, 1.45, -126], fov: 40 },
];

export const cameraTrack = new CameraTrack(KEYS);

// ---------------------------------------------------------------- frame type
export interface StoryEffects {
  /** Rift (spatial disturbance) behind Poko, 0..1. */
  rift: number;
  /** Portal event horizon at the end of the tunnel, 0..1. */
  portal: number;
  /** White flash while crossing the horizon, 0..1. */
  flash: number;
  /** Chromatic aberration / radial distortion, 0..1. */
  warp: number;
  /** Scanner beam in the CardRails world, 0..1. */
  scan: number;
  bloom: number;
  vignette: number;
}

export interface StoryFrame {
  u: number;
  chapter: ChapterId;
  chapterIndex: number;
  local: number;
  morph: MorphParams;
  stream: StreamParams | null;
  /** Awakening: 0 = flat pixel art, 1 = full volume. */
  depth: number;
  /**
   * Draw Poko with the skinned GLB mesh instead of the voxel pool. The story
   * keeps it false: Poko is the same voxels from the first frame to the last,
   * so nothing is ever swapped. (The GLB still drives the bones.)
   */
  pokoSkinned: boolean;
  /** Draw the voxel pool at all. */
  voxels: boolean;
  hideRigged: boolean;
  poko: { position: THREE.Vector3; yaw: number; anim: PokoAnimState; visible: boolean };
  env: {
    skyTop: THREE.Color;
    skyHorizon: THREE.Color;
    floor: number;
    stage: THREE.Vector3;
    exposure: number;
    accent: number;
  };
  effects: StoryEffects;
  /** Pointer push on free-flying voxels (0 when they must hold a shape). */
  push: number;
}

// ---------------------------------------------------------------- helpers
const quatY = (yaw: number): [number, number, number, number] => [0, Math.sin(yaw / 2), 0, Math.cos(yaw / 2)];
const quatXZ = (x: number, z: number): [number, number, number, number] => {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(x, 0, z, 'XYZ'));
  return [q.x, q.y, q.z, q.w];
};
const place = (p: THREE.Vector3, quaternion: [number, number, number, number] = [0, 0, 0, 1], scale = 1): FormationPlacement => ({
  position: [p.x, p.y, p.z],
  quaternion,
  scale,
});
const tup = (v: THREE.Vector3): [number, number, number] => [v.x, v.y, v.z];
const col = (hex: number) => new THREE.Color(hex);

const SKY = {
  void: [col(0x010205), col(0x05070f)],
  home: [col(0x02030a), col(0x0b1226)],
  portal: [col(0x010208), col(0x061226)],
  pokoin: [col(0x03030a), col(0x171127)],
  cardrail: [col(0x02050a), col(0x0a1d24)],
  prduct: [col(0x04030c), col(0x18102e)],
  tmelnik: [col(0x02040c), col(0x0a1a3a)],
  systems: [col(0x02030b), col(0x0d1030)],
  dawn: [col(0x03040c), col(0x1a1630)],
} as const;

function sky(a: readonly [THREE.Color, THREE.Color], b: readonly [THREE.Color, THREE.Color], t: number): [THREE.Color, THREE.Color] {
  return [a[0].clone().lerp(b[0], t), a[1].clone().lerp(b[1], t)];
}

function cloudPlacement(spin: number): FormationPlacement {
  return place(ANCHORS.cloud, quatXZ(1.12, spin), 0.92);
}

const STREAM_BASE = {
  p0: new THREE.Vector3(2.4, 2.3, 0.4),
  p1: new THREE.Vector3(3.8, 3.0, -6.5),
  p2: new THREE.Vector3(-2.4, 1.5, -10.5),
  p3: new THREE.Vector3(0, 1.9, -16.4),
};

function streamAt(flow: number): StreamParams {
  return { ...STREAM_BASE, flow, radius: 0.5, twist: 1.6, scale: 0.75 };
}

function idleAnim(extra: Partial<PokoAnimState> = {}): PokoAnimState {
  return { scrubs: [], idle: 1, blink: true, look: 1, ...extra };
}

/** Scrub a clip over [a, b] of chapter time. */
function scrub(clip: ScrubbedClip['clip'], t: number, a: number, b: number, fadeIn = 0.02, fadeOut = 0.02): ScrubbedClip {
  const w = smoothstep(a - fadeIn, a, t) * (1 - smoothstep(b, b + fadeOut, t));
  return { clip, t: range(t, a, b), weight: w };
}

// ---------------------------------------------------------------- chapters
type Writer = (t: number, f: StoryFrame) => void;

const SCRIPT: Record<ChapterId, Writer> = {
  awakening(t, f) {
    // Pixels gain depth ring by ring; light rises to reveal the cubes.
    f.depth = smoothstep(0.1, 0.92, t);
    f.pokoSkinned = false;
    f.poko.anim = idleAnim({ idle: smoothstep(0.75, 1, t), blink: t > 0.7, look: smoothstep(0.6, 1, t) });
    const [top, hor] = sky(SKY.void, SKY.home, smoothstep(0.15, 0.8, t));
    f.env.skyTop = top; f.env.skyHorizon = hor;
    f.env.floor = smoothstep(0.25, 0.85, t);
    f.env.exposure = lerp(0.55, 1, smoothstep(0.05, 0.75, t));
    f.effects.bloom = 0.33;
  },

  disintegration(t, f) {
    // Poko hops, looks around, then notices the rift and startles. Each beat
    // gets about half a viewport of scroll: squeezed together they read as
    // one blur between the intro and the break-up.
    f.poko.anim = {
      scrubs: [
        scrub('Hop', t, 0.04, 0.16),
        scrub('LookAround', t, 0.18, 0.3, 0.03, 0.02),
        scrub('Surprise', t, 0.31, 0.42, 0.02, 0.6),
      ],
      idle: 1 - smoothstep(0.28, 0.34, t) * 0.6,
      blink: t < 0.3,
      look: 1 - smoothstep(0.14, 0.22, t),
    };
    f.effects.rift = smoothstep(0.24, 0.44, t) * (1 - smoothstep(0.8, 1, t) * 0.7);
    f.pokoSkinned = false;
    // Matter comes apart: shiver, single pixels, clumps, then the whole body.
    const m = range(t, 0.44, 1);
    f.morph = {
      ...DEFAULT_MORPH,
      from: 'poko',
      to: 'cloud',
      toPlacement: cloudPlacement(m * 0.45),
      t: easeInOutCubic(m) * 0.5 + m * 0.5,
      spread: 0.8,
      delayAxis: [0, -1 / 2.8, 0, 1],
      delayWeights: { axis: 0.7, depth: 1, seed: 0.55 },
      center: [0, POKO_CENTER_Y, 0],
      explode: 1.1,
      // Gentle on purpose: a big swirl plus fast tumbling read as the whole
      // character spinning away instead of coming apart.
      swirlAxis: [0, 0, 1],
      swirlAngle: 0.55,
      swirlCenter: [0, POKO_CENTER_Y, 0],
      noiseAmp: 0.55,
      noiseFreq: 0.75,
      clump: 0.9,
      spin: 1.8,
      transitScale: 0.85,
      vibrate: 0.025,
      glow: 0.75,
    };
    f.push = smoothstep(0.7, 0.92, t);
    f.env.exposure = 1;
    f.effects.bloom = 0.33 + bell(m) * 0.193;
  },

  portal(t, f) {
    f.pokoSkinned = false;
    f.poko.visible = false;
    if (t < 0.36) {
      // The halo unwinds into a stream flowing towards the portal.
      const m = range(t, 0, 0.36);
      f.morph = {
        ...DEFAULT_MORPH,
        from: 'cloud',
        to: LAYER_STREAM,
        fromPlacement: cloudPlacement(0.45 + m * 0.4),
        t: m,
        spread: 0.6,
        delayWeights: { axis: 0, depth: 0, seed: 1 },
        center: tup(ANCHORS.cloud),
        swirlAxis: [0, 1, 0],
        swirlAngle: 0.8,
        swirlCenter: tup(ANCHORS.cloud),
        noiseAmp: 0.35,
        noiseFreq: 0.6,
        spin: 2.5,
        transitScale: 0.85,
        glow: 0.35,
      };
      f.push = 1;
    } else {
      // The stream builds the tunnel, nearest frames first.
      const m = range(t, 0.36, 0.72);
      f.morph = {
        ...DEFAULT_MORPH,
        from: LAYER_STREAM,
        to: 'portal',
        toPlacement: place(ANCHORS.portal),
        t: m,
        spread: 0.7,
        delayAxis: [0, 0, 1 / 17, 1],
        delayWeights: { axis: 1, depth: 0, seed: 0.35 },
        center: tup(ANCHORS.portal),
        arc: [0, 0.6, 0],
        swirlAxis: [0, 0, 1],
        swirlAngle: -1.6,
        swirlCenter: tup(ANCHORS.portal),
        noiseAmp: 0.3,
        noiseFreq: 0.5,
        spin: 3,
        transitScale: 0.9,
        glow: 0.5,
      };
      f.push = 1 - smoothstep(0.36, 0.5, t);
    }
    f.stream = streamAt(t * 1.4);
    f.effects.rift = 0.3 * (1 - smoothstep(0, 0.4, t));
    f.effects.portal = smoothstep(0.45, 0.9, t);
    f.effects.warp = smoothstep(0.72, 1, t) * 0.8;
    f.effects.bloom = 0.385 + smoothstep(0.6, 1, t) * 0.22;
    f.env.floor = 1 - smoothstep(0.5, 0.88, t);
    const [top, hor] = sky(SKY.home, SKY.portal, smoothstep(0.3, 0.9, t));
    f.env.skyTop = top; f.env.skyHorizon = hor;
    f.env.stage.copy(ANCHORS.portal);
  },

  pokoin(t, f) {
    f.pokoSkinned = false;
    f.poko.visible = false;
    const m = range(t, 0, 0.42);
    const yaw = 0.42 - 0.75 * smoothstep(0.35, 1, t) + 0.12 * Math.sin(t * Math.PI * 2);
    f.morph = {
      ...DEFAULT_MORPH,
      from: 'portal',
      to: 'pokoin',
      fromPlacement: place(ANCHORS.portal),
      toPlacement: place(ANCHORS.pokoin, quatY(yaw)),
      t: m,
      spread: 0.65,
      delayAxis: [0, 0, 1 / 16.5, 32.5 / 16.5],
      delayWeights: { axis: 1, depth: 0, seed: 0.4 },
      center: tup(ANCHORS.pokoin),
      arc: [0, 1.1, 0],
      swirlAxis: [0, 0, 1],
      swirlAngle: 1.4,
      swirlCenter: tup(ANCHORS.pokoin),
      noiseAmp: 0.45,
      noiseFreq: 0.45,
      spin: 4,
      transitScale: 0.85,
      glow: 0.55,
    };
    f.effects.portal = 1 - smoothstep(0.02, 0.16, t);
    f.effects.flash = bell(range(t, 0.03, 0.14)) * 0.9;
    f.effects.warp = 0.8 * (1 - smoothstep(0.04, 0.2, t));
    f.env.floor = smoothstep(0.2, 0.55, t) * 0.55;
    const [top, hor] = sky(SKY.portal, SKY.pokoin, smoothstep(0.05, 0.4, t));
    f.env.skyTop = top; f.env.skyHorizon = hor;
    f.env.stage.copy(ANCHORS.pokoin).setY(0);
    f.env.accent = 0.25;
    f.effects.bloom = 0.413;
  },

  cardrail(t, f) {
    f.pokoSkinned = false;
    f.poko.visible = false;
    const m = range(t, 0, 0.45);
    const yawFrom = 0.42 - 0.75 + 0.12 * Math.sin(Math.PI * 2);
    f.morph = {
      ...DEFAULT_MORPH,
      from: 'pokoin',
      to: 'cardrail',
      fromPlacement: place(ANCHORS.pokoin, quatY(yawFrom)),
      toPlacement: place(ANCHORS.cardrail, quatY(-0.32)),
      t: m,
      spread: 0.6,
      delayAxis: [-1 / 6, 0, 0, 0.5],
      delayWeights: { axis: 0.6, depth: 0, seed: 0.6 },
      center: tup(ANCHORS.cardrail),
      arc: [0, 1.4, 0],
      swirlAxis: [0, 1, 0],
      swirlAngle: 0.35,
      swirlCenter: [3.5, 1.4, -52],
      noiseAmp: 0.4,
      noiseFreq: 0.5,
      spin: 3.5,
      transitScale: 0.85,
      glow: 0.45,
    };
    f.effects.scan = smoothstep(0.42, 0.55, t) * (1 - smoothstep(0.92, 1, t));
    f.env.floor = 0.55;
    const [top, hor] = sky(SKY.pokoin, SKY.cardrail, smoothstep(0.1, 0.5, t));
    f.env.skyTop = top; f.env.skyHorizon = hor;
    f.env.stage.copy(ANCHORS.cardrail).setY(0);
    f.env.accent = 0.6;
    f.effects.bloom = 0.44;
  },

  prduct(t, f) {
    f.pokoSkinned = false;
    f.poko.visible = false;
    const m = range(t, 0, 0.45);
    f.morph = {
      ...DEFAULT_MORPH,
      from: 'cardrail',
      to: 'prduct',
      fromPlacement: place(ANCHORS.cardrail, quatY(-0.32)),
      toPlacement: place(ANCHORS.prduct, quatY(0.3)),
      t: m,
      spread: 0.6,
      // CardRails sits to the right; its left edge leaves first, towards prduct.
      delayAxis: [1 / 7.4, 0, 0, -3.3 / 7.4],
      delayWeights: { axis: 0.6, depth: 0, seed: 0.6 },
      center: tup(ANCHORS.prduct),
      arc: [0, 1.4, 0],
      swirlAxis: [0, 1, 0],
      swirlAngle: -0.35,
      swirlCenter: [0.5, 1.4, -68],
      noiseAmp: 0.4,
      noiseFreq: 0.5,
      spin: 3.5,
      transitScale: 0.85,
      glow: 0.45,
    };
    f.env.floor = 0.55;
    const [top, hor] = sky(SKY.cardrail, SKY.prduct, smoothstep(0.1, 0.5, t));
    f.env.skyTop = top; f.env.skyHorizon = hor;
    f.env.stage.copy(ANCHORS.prduct).setY(0);
    f.env.accent = 0.7;
    f.effects.bloom = 0.44;
  },

  tmelnik(t, f) {
    f.pokoSkinned = false;
    f.poko.visible = false;
    const m = range(t, 0, 0.45);
    f.morph = {
      ...DEFAULT_MORPH,
      from: 'prduct',
      to: 'tmelnik',
      fromPlacement: place(ANCHORS.prduct, quatY(0.3)),
      toPlacement: place(ANCHORS.tmelnik, quatY(-0.3 + 0.12 * smoothstep(0.45, 1, t))),
      t: m,
      spread: 0.6,
      // prduct sits to the left; its right edge leaves first, towards Tmelnik.
      delayAxis: [-1 / 6.3, 0, 0, -2.9 / 6.3],
      delayWeights: { axis: 0.6, depth: 0, seed: 0.6 },
      center: tup(ANCHORS.tmelnik),
      arc: [0, 1.5, 0],
      swirlAxis: [0, 1, 0],
      swirlAngle: 0.35,
      swirlCenter: [-0.5, 1.4, -84],
      noiseAmp: 0.4,
      noiseFreq: 0.5,
      spin: 3.5,
      transitScale: 0.85,
      glow: 0.45,
    };
    f.env.floor = 0.55;
    const [top, hor] = sky(SKY.prduct, SKY.tmelnik, smoothstep(0.1, 0.5, t));
    f.env.skyTop = top; f.env.skyHorizon = hor;
    f.env.stage.copy(ANCHORS.tmelnik).setY(0);
    f.env.accent = 0.75;
    f.effects.bloom = 0.44;
  },

  systems(t, f) {
    f.pokoSkinned = false;
    f.poko.visible = false;
    const m = range(t, 0, 0.45);
    f.morph = {
      ...DEFAULT_MORPH,
      from: 'tmelnik',
      to: 'systems',
      fromPlacement: place(ANCHORS.tmelnik, quatY(-0.18)),
      toPlacement: place(ANCHORS.systems, quatY(0.1 + 0.25 * smoothstep(0.45, 1, t))),
      t: m,
      spread: 0.65,
      delayAxis: [0, 1 / 4.5, 0, 0],
      delayWeights: { axis: 0.8, depth: 0, seed: 0.5 },
      center: tup(ANCHORS.systems),
      arc: [0, 1.6, 0],
      swirlAxis: [0, 1, 0],
      swirlAngle: -0.35,
      swirlCenter: [3.0, 1.2, -100],
      noiseAmp: 0.45,
      noiseFreq: 0.5,
      spin: 3.5,
      transitScale: 0.85,
      glow: 0.45,
    };
    f.env.floor = 0.55;
    const [top, hor] = sky(SKY.tmelnik, SKY.systems, smoothstep(0.1, 0.5, t));
    f.env.skyTop = top; f.env.skyHorizon = hor;
    f.env.stage.copy(ANCHORS.systems).setY(0);
    f.env.accent = 0.9;
    f.effects.bloom = 0.468;
  },

  reconstruction(t, f) {
    // Fragments spiral back onto Poko's skeleton, core first; he floats, then lands.
    const m = range(t, 0, 0.84);
    f.pokoSkinned = false;
    f.poko.anim = {
      scrubs: [
        { clip: 'Float', t: (t * 2.2) % 1, weight: 1 - smoothstep(0.78, 0.86, t) },
        scrub('Land', t, 0.84, 1, 0.04, 0.2),
      ],
      // Ramp ambient layers in before the finale so the hand-over is seamless.
      idle: smoothstep(0.93, 1, t),
      blink: false,
      look: smoothstep(0.93, 1, t),
    };
    f.morph = {
      ...DEFAULT_MORPH,
      from: 'systems',
      to: 'finale',
      fromPlacement: place(ANCHORS.systems, quatY(0.35)),
      toPlacement: place(ANCHORS.name, [0, 0, 0, 1], 1.3),
      t: m,
      spread: 0.75,
      delayWeights: { axis: 0, depth: 1, seed: 0.45, invert: true },
      center: [0, POKO_CENTER_Y, ANCHORS.finale.z],
      // The pivot sits mid-flight: a small angle there gives a wide, gentle spiral
      // without whipping far-away voxels through the camera.
      swirlAxis: [0, 1, 0],
      swirlAngle: 0.6,
      swirlCenter: [0, POKO_CENTER_Y, (ANCHORS.systems.z + ANCHORS.finale.z) / 2],
      arc: [0, 1.0, 0],
      noiseAmp: 0.35,
      noiseFreq: 0.6,
      spin: 5,
      transitScale: 0.8,
      glow: 0.6,
    };
    f.env.floor = 0.55 + 0.45 * smoothstep(0.2, 0.7, t);
    const [top, hor] = sky(SKY.systems, SKY.dawn, smoothstep(0.1, 0.8, t));
    f.env.skyTop = top; f.env.skyHorizon = hor;
    f.env.accent = 0.9 * (1 - smoothstep(0.1, 0.6, t));
    f.effects.bloom = 0.385 + bell(m) * 0.165;
  },

  finale(t, f) {
    f.morph = {
      ...DEFAULT_MORPH,
      from: 'finale',
      to: 'finale',
      fromPlacement: place(ANCHORS.name, [0, 0, 0, 1], 1.3),
      toPlacement: place(ANCHORS.name, [0, 0, 0, 1], 1.3),
      t: 1,
      idle: 0.012,
    };
    f.poko.anim = { scrubs: [scrub('Wave', t, 0.3, 0.75, 0.05, 0.05)], idle: 1, blink: true, look: 1 };
    f.env.floor = 1;
    f.env.skyTop = SKY.dawn[0].clone();
    f.env.skyHorizon = SKY.dawn[1].clone();
    f.effects.bloom = 0.358;
  },
};

// ---------------------------------------------------------------- evaluation
export function createFrame(): StoryFrame {
  return {
    u: 0,
    chapter: 'awakening',
    chapterIndex: 0,
    local: 0,
    morph: { ...DEFAULT_MORPH },
    stream: null,
    depth: 1,
    pokoSkinned: false,
    voxels: true,
    hideRigged: false,
    poko: { position: new THREE.Vector3(), yaw: 0, anim: idleAnim(), visible: true },
    env: { skyTop: new THREE.Color(), skyHorizon: new THREE.Color(), floor: 1, stage: new THREE.Vector3(), exposure: 1, accent: 0 },
    effects: { rift: 0, portal: 0, flash: 0, warp: 0, scan: 0, bloom: 0.33, vignette: 1 },
    push: 0,
  };
}

/** Evaluate the whole scene for global progress u ∈ [0, 1]. Pure: same u, same frame. */
export function evaluateStory(u: number, f: StoryFrame = createFrame()): StoryFrame {
  u = clamp01(u);
  const { index, local } = chapterAt(u);
  const id = CHAPTERS[index].id;
  // Reset to neutral defaults; each chapter writes only what it controls.
  f.u = u;
  f.chapter = id;
  f.chapterIndex = index;
  f.local = local;
  f.morph = { ...DEFAULT_MORPH, from: 'poko', to: 'poko', t: 0 };
  f.stream = null;
  f.depth = 1;
  f.pokoSkinned = false;
  f.voxels = true;
  f.hideRigged = false;
  const beforeFinale = index < CHAPTERS.findIndex((c) => c.id === 'reconstruction');
  f.poko.position.copy(beforeFinale ? ANCHORS.home : ANCHORS.finale);
  f.poko.yaw = 0;
  f.poko.visible = true;
  f.poko.anim = idleAnim();
  f.env.skyTop.copy(SKY.home[0]);
  f.env.skyHorizon.copy(SKY.home[1]);
  f.env.floor = 1;
  f.env.stage.copy(f.poko.position);
  f.env.exposure = 1;
  f.env.accent = 0;
  Object.assign(f.effects, { rift: 0, portal: 0, flash: 0, warp: 0, scan: 0, bloom: 0.33, vignette: 1 });
  f.push = 0;
  SCRIPT[id](local, f);
  // When the skinned mesh draws Poko and nothing else is in flight, skip the pool.
  if (f.pokoSkinned && f.morph.from === 'poko' && f.morph.to === 'poko') f.voxels = false;
  return f;
}

/** Progress at which each chapter's "hero" state is fully formed (used by reduced motion). */
export const REST_POINTS: Record<ChapterId, number> = {
  awakening: 1,
  disintegration: 0.17,
  portal: 0.8,
  pokoin: 0.7,
  cardrail: 0.7,
  prduct: 0.7,
  tmelnik: 0.7,
  systems: 0.7,
  reconstruction: 1,
  finale: 0.9,
};
