/**
 * Native scroll → story progress.
 *
 * The document really is TOTAL_LENGTH viewports tall and the browser scrolls it
 * (wheel, trackpad, touch, keyboard, scrollbar, find-in-page, screen readers…).
 * Nothing is hijacked: we only *read* scrollY.
 *
 *   target u  = scrollY / (scrollHeight − innerHeight)        exact, instantaneous
 *   visual u  = critically damped follow of target u          smooth, never overshoots
 *
 * The visual value is a spring (ω = stiffness) solved analytically per frame, so
 * the motion is identical at 30, 60 or 144 Hz. It only shapes *how fast* the
 * scene catches up; *where* it ends is always the scroll position, so the same
 * scroll position always produces the same frame.
 */
import { CHAPTERS, CHAPTER_STARTS, chapterAt, type ChapterId } from '../content/chapters.ts';

export type ProgressListener = (target: number) => void;

export class ScrollController {
  /** Exact progress from the scroll position. */
  target = 0;
  /** Smoothed progress used for rendering. */
  value = 0;
  private velocity = 0;
  private listeners = new Set<ProgressListener>();
  private readonly onScroll = () => this.read();
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);

  constructor(private stiffness = 9, private reduceMotion = false) {
    this.read();
    this.value = this.target;
    window.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
    window.addEventListener('keydown', this.onKey);
  }

  setReducedMotion(reduce: boolean): void {
    this.reduceMotion = reduce;
  }

  onChange(fn: ProgressListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private read(): void {
    const max = document.documentElement.scrollHeight - window.innerHeight;
    const u = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
    if (u !== this.target) {
      this.target = u;
      for (const fn of this.listeners) fn(u);
    }
  }

  /** Advance the smoothed value. Returns true while still moving. */
  update(dt: number): boolean {
    if (this.reduceMotion) {
      this.value = this.target;
      this.velocity = 0;
      return false;
    }
    // Critically damped spring, exact solution over dt (no explicit-Euler drift).
    const w = this.stiffness;
    const x0 = this.value - this.target;
    const v0 = this.velocity;
    const e = Math.exp(-w * dt);
    const x = (x0 + (v0 + w * x0) * dt) * e;
    this.velocity = (v0 - (v0 + w * x0) * w * dt) * e;
    this.value = this.target + x;
    if (Math.abs(x) < 1e-5 && Math.abs(this.velocity) < 1e-4) {
      this.value = this.target;
      this.velocity = 0;
      return false;
    }
    return true;
  }

  /** Jump the visuals to the scroll position (e.g. after a refresh restores scroll). */
  snap(): void {
    this.read();
    this.value = this.target;
    this.velocity = 0;
  }

  /** Scroll to a chapter. The browser animates the scroll; the story follows. */
  goTo(id: ChapterId, local = 0.55): void {
    const i = CHAPTERS.findIndex((c) => c.id === id);
    const start = CHAPTER_STARTS[i];
    const end = i + 1 < CHAPTERS.length ? CHAPTER_STARTS[i + 1] : 1;
    const u = start + (end - start) * local;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    window.scrollTo({ top: u * max, behavior: this.reduceMotion ? 'auto' : 'smooth' });
  }

  get chapter(): { index: number; local: number } {
    return chapterAt(this.value);
  }

  /** "[" / "]" step between chapters (Page Up/Down, arrows and space already scroll natively). */
  private handleKey(e: KeyboardEvent): void {
    if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))) return;
    if (e.key !== '[' && e.key !== ']') return;
    const { index } = chapterAt(this.target);
    const next = Math.min(CHAPTERS.length - 1, Math.max(0, index + (e.key === ']' ? 1 : -1)));
    this.goTo(CHAPTERS[next].id);
    e.preventDefault();
  }

  dispose(): void {
    window.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    window.removeEventListener('keydown', this.onKey);
    this.listeners.clear();
  }
}
