/**
 * Drives Poko's bones every frame from three layers:
 *
 *  1. Story layer (deterministic): clips scrubbed by scroll progress. The story
 *     says "Hop at 40 %, weight 1" and the clip time is derived from progress,
 *     so scrolling backward plays the hop backward.
 *  2. Ambient layer (time based, stateless): idle breathing and blinks. Blinks
 *     follow a fixed schedule hashed from time, so there is no hidden state to
 *     drift or reconstruct.
 *  3. Reaction layer (procedural, damped): Poko turns towards the pointer and
 *     his eyes follow it. Added on top of whatever the clips produced.
 *
 * The mixer is updated with dt = 0 after setting each action's time explicitly:
 * clip playback never advances on its own.
 */
import * as THREE from 'three';
import { hash1 } from '../math/random.ts';
import { damp } from '../math/easing.ts';
import type { PokoRig } from './PokoRig.ts';

export type ClipName = 'Idle' | 'Blink' | 'Walk' | 'Hop' | 'Surprise' | 'Wave' | 'LookAround' | 'Float' | 'Land';

export interface ScrubbedClip {
  clip: ClipName;
  /** Normalised clip time 0..1 (looping clips wrap). */
  t: number;
  weight: number;
}

export interface PokoAnimState {
  scrubs: ScrubbedClip[];
  /** Weight of the ambient idle loop (0..1). */
  idle: number;
  blink: boolean;
  /** Pointer-look enabled (0..1). */
  look: number;
}

const BLINK_PERIOD = 4.2;

export class PokoAnimationController {
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<ClipName, THREE.AnimationAction>();
  private lookYaw = 0;
  private lookPitch = 0;
  private eyeX = 0;
  private eyeY = 0;
  private readonly baseQuat = new THREE.Quaternion();
  private readonly lookQuat = new THREE.Quaternion();
  private readonly euler = new THREE.Euler();
  /** Pointer target in normalised device coordinates (-1..1), set by InteractionController. */
  readonly pointer = new THREE.Vector2();
  /** Impulse 0..1 for a short "boop" reaction when clicked. */
  private boop = 0;

  private readonly eyeRest: THREE.Vector3[];

  constructor(private readonly rig: PokoRig) {
    this.eyeRest = [rig.bone('eye_l').position.clone(), rig.bone('eye_r').position.clone()];
  }

  get hasClips(): boolean {
    return this.actions.size > 0;
  }

  attachClips(root: THREE.Object3D, clips: THREE.AnimationClip[]): void {
    this.mixer = new THREE.AnimationMixer(root);
    for (const clip of clips) {
      const action = this.mixer.clipAction(clip);
      action.play();
      action.setEffectiveWeight(0);
      action.enabled = true;
      this.actions.set(clip.name as ClipName, action);
    }
  }

  poke(): void {
    this.boop = 1;
  }

  update(dt: number, time: number, state: PokoAnimState): void {
    if (this.mixer) {
      for (const action of this.actions.values()) action.setEffectiveWeight(0);
      const idle = this.actions.get('Idle');
      if (idle && state.idle > 0) {
        idle.setEffectiveWeight(state.idle);
        idle.time = (time % idle.getClip().duration);
      }
      for (const s of state.scrubs) {
        const action = this.actions.get(s.clip);
        if (!action || s.weight <= 0) continue;
        const d = action.getClip().duration;
        action.setEffectiveWeight(s.weight);
        action.time = Math.min(d - 1e-4, Math.max(0, s.t * d));
      }
      const blink = this.actions.get('Blink');
      if (blink && state.blink) {
        // Blink k happens at k·PERIOD + jitter(k); evaluate the one nearest now.
        const k = Math.floor(time / BLINK_PERIOD);
        const at = k * BLINK_PERIOD + hash1(k) * 2.4;
        const local = time - at;
        const d = blink.getClip().duration;
        if (local >= 0 && local < d) {
          blink.setEffectiveWeight(1);
          blink.time = local;
        }
      }
      this.mixer.update(0);
    } else {
      this.proceduralFallback(time, state);
    }
    this.applyLook(dt, state.look);
  }

  /** Without the GLB: a gentle breath so the voxel character still feels alive. */
  private proceduralFallback(time: number, state: PokoAnimState): void {
    const body = this.rig.bone('body');
    const breath = Math.sin(time * Math.PI * 2 * 0.5) * 0.02 * state.idle;
    body.scale.set(1 / Math.sqrt(1 + breath), 1 + breath, 1 / Math.sqrt(1 + breath));
    body.quaternion.identity();
    (['eye_l', 'eye_r'] as const).forEach((name, i) => {
      const eye = this.rig.bone(name);
      eye.position.copy(this.eyeRest[i]); // the mixer would rewrite this; here we must
      const k = Math.floor(time / BLINK_PERIOD);
      const local = time - (k * BLINK_PERIOD + hash1(k) * 2.4);
      eye.scale.y = state.blink && local >= 0 && local < 0.3 ? 0.15 : 1;
    });
  }

  private applyLook(dt: number, weight: number): void {
    const targetYaw = this.pointer.x * 0.42 * weight;
    const targetPitch = -this.pointer.y * 0.2 * weight;
    // Eyes lead, the body follows: different damping rates give overlap.
    this.eyeX = damp(this.eyeX, this.pointer.x * 0.9 * weight, 14, dt);
    this.eyeY = damp(this.eyeY, this.pointer.y * 0.45 * weight, 14, dt);
    this.lookYaw = damp(this.lookYaw, targetYaw, 4.5, dt);
    this.lookPitch = damp(this.lookPitch, targetPitch, 4.5, dt);
    this.boop = damp(this.boop, 0, 5, dt);

    const body = this.rig.bone('body');
    this.baseQuat.copy(body.quaternion);
    const wobble = Math.sin(this.boop * 9) * this.boop * 0.12;
    this.euler.set(this.lookPitch, this.lookYaw, wobble, 'YXZ');
    this.lookQuat.setFromEuler(this.euler);
    body.quaternion.copy(this.baseQuat).premultiply(this.lookQuat);
    const squash = 1 - 0.1 * Math.sin(this.boop * Math.PI) * this.boop;
    body.scale.y *= squash;
    for (const name of ['eye_l', 'eye_r'] as const) {
      const eye = this.rig.bone(name);
      eye.position.x += this.eyeX * 0.05;
      eye.position.y += this.eyeY * 0.04;
    }
  }
}
