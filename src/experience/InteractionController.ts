/**
 * Pointer → scene. Never intercepts scrolling: listeners are passive and the
 * canvas has pointer-events: none; we listen on the window and only *read*.
 *
 *  - pointer position (NDC) drives Poko's gaze and a ray that free-flying
 *    voxels lean away from;
 *  - a click/tap on Poko (ray vs. his bounding box) makes him react and sends
 *    a ripple through his voxels, without blocking links or text underneath.
 *
 * On touch, the gaze target drifts back to the centre after the finger lifts,
 * because there is no hover on a phone.
 */
import * as THREE from 'three';
import { damp } from '../math/easing.ts';

export class InteractionController {
  /** Smoothed pointer in NDC (-1..1). */
  readonly pointer = new THREE.Vector2();
  private readonly raw = new THREE.Vector2();
  readonly ray = new THREE.Ray();
  /** Seconds since the last pointer activity. */
  idleTime = 0;
  /** 0..1, how much the pointer is "present" (fades out after touch). */
  presence = 0;
  private touching = false;
  private isTouch = false;
  private readonly raycaster = new THREE.Raycaster();
  private clickHandler: ((ray: THREE.Ray) => void) | null = null;
  private readonly onMove = (e: PointerEvent) => this.move(e);
  private readonly onDown = (e: PointerEvent) => this.down(e);
  private readonly onUp = (e: PointerEvent) => this.up(e);

  constructor() {
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerdown', this.onDown, { passive: true });
    window.addEventListener('pointerup', this.onUp, { passive: true });
    window.addEventListener('pointercancel', this.onUp, { passive: true });
  }

  onClick(fn: (ray: THREE.Ray) => void): void {
    this.clickHandler = fn;
  }

  private setFrom(e: PointerEvent): void {
    this.raw.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    this.idleTime = 0;
    this.isTouch = e.pointerType === 'touch';
  }

  private move(e: PointerEvent): void {
    this.setFrom(e);
  }

  private down(e: PointerEvent): void {
    this.setFrom(e);
    this.touching = true;
    this.downAt = { x: e.clientX, y: e.clientY, t: performance.now() };
  }

  private downAt = { x: 0, y: 0, t: 0 };

  private up(e: PointerEvent): void {
    this.touching = false;
    // A tap/click is a short press that did not travel: never fire after a scroll gesture.
    const moved = Math.hypot(e.clientX - this.downAt.x, e.clientY - this.downAt.y);
    const target = e.target as HTMLElement | null;
    const interactive = target?.closest('a, button, input, textarea, select, [role="button"]');
    if (e.type === 'pointerup' && moved < 8 && performance.now() - this.downAt.t < 400 && !interactive) {
      this.clickHandler?.(this.ray.clone());
    }
  }

  update(dt: number, camera: THREE.PerspectiveCamera): void {
    this.idleTime += dt;
    const active = this.isTouch ? this.touching || this.idleTime < 1.2 : this.idleTime < 6;
    this.presence = damp(this.presence, active ? 1 : 0, 3, dt);
    const tx = active ? this.raw.x : 0;
    const ty = active ? this.raw.y : 0;
    this.pointer.x = damp(this.pointer.x, tx, 8, dt);
    this.pointer.y = damp(this.pointer.y, ty, 8, dt);
    this.raycaster.setFromCamera(this.pointer, camera);
    this.ray.copy(this.raycaster.ray);
  }

  dispose(): void {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onUp);
  }
}
