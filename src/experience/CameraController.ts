/**
 * The camera is an authored animation, not a controller.
 *
 * Keyframes (position, look-at target, vertical FOV) are placed on the story
 * timeline. Positions and targets each lie on a centripetal Catmull-Rom spline,
 * which passes through every keyframe without cusps or self-intersections
 * (unlike the uniform variant on unevenly spaced points).
 *
 * Between two keyframes, an easing curve maps time to spline parameter:
 *   'settle' (ease in-out): the camera arrives, comes to rest, then leaves:
 *            used for hero shots where the viewer should read something;
 *   'glide'  (linear): constant parametric speed for fly-throughs, so the
 *            camera never stalls in the middle of a continuous move.
 *
 * Framing adapts to aspect ratio: on portrait screens the camera backs away
 * along its view direction until the subject's horizontal extent fits.
 */
import * as THREE from 'three';
import { easeInOutSine } from '../math/easing.ts';
import { progressFor, type ChapterId } from '../content/chapters.ts';

export type Ease = 'settle' | 'glide' | 'out' | 'in';

export interface CameraKey {
  chapter: ChapterId;
  /** chapter-local time 0..1 */
  at: number;
  position: [number, number, number];
  target: [number, number, number];
  fov: number;
  /** Easing of the segment that *starts* at this key. */
  ease?: Ease;
  /** Optional portrait override for position (otherwise derived). */
  portrait?: { position?: [number, number, number]; target?: [number, number, number]; fov?: number };
}

const EASE: Record<Ease, (t: number) => number> = {
  settle: easeInOutSine,
  glide: (t) => t,
  out: (t) => 1 - (1 - t) * (1 - t),
  in: (t) => t * t,
};

export interface CameraPose {
  position: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
}

export class CameraTrack {
  private readonly times: number[];
  private readonly eases: ((t: number) => number)[];
  private readonly fovs: number[];
  private readonly positions: THREE.CatmullRomCurve3;
  private readonly targets: THREE.CatmullRomCurve3;
  private readonly portraitPositions: THREE.CatmullRomCurve3;
  private readonly portraitTargets: THREE.CatmullRomCurve3;
  private readonly portraitFovs: number[];

  constructor(keys: CameraKey[]) {
    const sorted = [...keys].map((k) => ({ ...k, u: progressFor(k.chapter, k.at) })).sort((a, b) => a.u - b.u);
    this.times = sorted.map((k) => k.u);
    this.eases = sorted.map((k) => EASE[k.ease ?? 'settle']);
    this.fovs = sorted.map((k) => k.fov);
    const v = (p: [number, number, number]) => new THREE.Vector3(...p);
    this.positions = new THREE.CatmullRomCurve3(sorted.map((k) => v(k.position)), false, 'centripetal');
    this.targets = new THREE.CatmullRomCurve3(sorted.map((k) => v(k.target)), false, 'centripetal');
    this.portraitPositions = new THREE.CatmullRomCurve3(sorted.map((k) => v(k.portrait?.position ?? k.position)), false, 'centripetal');
    this.portraitTargets = new THREE.CatmullRomCurve3(sorted.map((k) => v(k.portrait?.target ?? k.target)), false, 'centripetal');
    this.portraitFovs = sorted.map((k) => k.portrait?.fov ?? k.fov);
  }

  /** Spline parameter for global progress u (pure function). */
  param(u: number): { s: number; segment: number; local: number } {
    const n = this.times.length;
    if (u <= this.times[0]) return { s: 0, segment: 0, local: 0 };
    if (u >= this.times[n - 1]) return { s: 1, segment: n - 2, local: 1 };
    let i = 0;
    while (i < n - 2 && u >= this.times[i + 1]) i++;
    const local = (u - this.times[i]) / (this.times[i + 1] - this.times[i]);
    const eased = this.eases[i](local);
    return { s: (i + eased) / (n - 1), segment: i, local: eased };
  }

  evaluate(u: number, aspect: number, out: CameraPose): CameraPose {
    const { s, segment, local } = this.param(u);
    const portrait = aspect < 0.85;
    (portrait ? this.portraitPositions : this.positions).getPoint(s, out.position);
    (portrait ? this.portraitTargets : this.targets).getPoint(s, out.target);
    const fovs = portrait ? this.portraitFovs : this.fovs;
    out.fov = fovs[segment] + (fovs[Math.min(segment + 1, fovs.length - 1)] - fovs[segment]) * local;
    if (aspect < 1.25) {
      // Back away so content framed for ~16:10 still fits horizontally.
      const k = Math.pow(1.25 / Math.max(aspect, 0.4), 0.72);
      out.position.sub(out.target).multiplyScalar(k).add(out.target);
      out.fov = Math.min(out.fov * (portrait ? 1.08 : 1), 60);
    }
    return out;
  }
}
