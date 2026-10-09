/**
 * Client-only start-up of the cinematic home page. Loaded with a dynamic
 * import after hydration so three.js never blocks first paint or the text.
 *
 *   capabilities → (static page | Experience.create) → status
 *
 * Every failure path ends in the static page, which is the same DOM with the
 * pixel-art Poko instead of the canvas: content and navigation never depend on
 * WebGL succeeding.
 */
import { CHAPTERS, chapterAt } from '../content/chapters.ts';
import { detectCapabilities } from '../systems/capabilities.ts';
import type { QualityTier } from '../systems/QualityManager.ts';
import {
  reducedMotion,
  setChapter,
  setOverlay,
  setQualityLabel,
  setReducedMotion,
  setStaticReason,
  setStatus,
} from '../app/store.ts';
import { ScrollController } from './ScrollController.ts';

const INIT_TIMEOUT_MS = 9000;

export interface BootHandle {
  scroll: ScrollController;
  setQuality(tier: QualityTier | 'auto'): void;
  setReducedMotion(reduce: boolean): void;
  dispose(): void;
}

function overlayFor(u: number): number {
  const { index, local } = chapterAt(u);
  const o = CHAPTERS[index].overlay;
  return o && local >= o[0] && local <= o[1] ? index : -1;
}

export async function boot(canvas: HTMLCanvasElement): Promise<BootHandle> {
  const params = new URLSearchParams(location.search);
  const caps = detectCapabilities();
  const motionOverride = localStorageGet('poko:motion');
  const reduce = motionOverride ? motionOverride === 'reduced' : caps.reducedMotion;
  setReducedMotion(reduce);
  document.documentElement.classList.toggle('reduced-motion', reduce);

  const scroll = new ScrollController(9, reduce);
  const sync = (u: number) => {
    setChapter(chapterAt(u).index);
    setOverlay(overlayFor(u));
  };
  sync(scroll.target);
  scroll.onChange(sync);

  let experience: import('./Experience.ts').Experience | null = null;
  const handle: BootHandle = {
    scroll,
    setQuality(tier) {
      setQualityLabel(tier);
      localStorageSet('poko:quality', tier);
      if (experience && tier !== 'auto') experience.setQuality(tier);
    },
    setReducedMotion(next) {
      setReducedMotion(next);
      document.documentElement.classList.toggle('reduced-motion', next);
      localStorageSet('poko:motion', next ? 'reduced' : 'full');
      experience?.setReducedMotion(next);
    },
    dispose() {
      experience?.dispose();
      scroll.dispose();
    },
  };

  const forceStatic = params.has('static') || caps.saveData;
  if (!caps.webgl2 || forceStatic) {
    setStaticReason(!caps.webgl2 ? 'WebGL 2 is not available in this browser.' : 'Static mode.');
    setStatus('static');
    document.documentElement.classList.add('static');
    return handle;
  }

  setStatus('loading');
  const qParam = params.get('quality') ?? localStorageGet('poko:quality');
  const override = qParam === 'low' || qParam === 'medium' || qParam === 'high' ? qParam : null;
  if (override) setQualityLabel(override);
  try {
    const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), INIT_TIMEOUT_MS));
    const create = (async () => {
      const { Experience } = await import('./Experience.ts');
      return Experience.create({
        canvas,
        scroll,
        capabilities: caps,
        reducedMotion: reducedMotion(),
        qualityOverride: override,
        debug: params.has('debug') || navigator.webdriver,
        onChapter: () => undefined,
        onQuality: (tier) => {
          if (!override) document.documentElement.dataset.quality = tier;
        },
      });
    })();
    experience = await Promise.race([create, timeout]);
    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      setStaticReason('The graphics context was lost.');
      setStatus('static');
      document.documentElement.classList.add('static');
    });
    setStatus('ready');
    document.documentElement.classList.add('webgl-ready');
  } catch (error) {
    console.warn('[poko] Falling back to the static page:', error);
    setStaticReason(error instanceof Error && error.message === 'timeout' ? 'The 3D scene took too long to start.' : 'The 3D scene could not start.');
    setStatus('static');
    document.documentElement.classList.add('static');
  }
  return handle;
}

function localStorageGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function localStorageSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode: preferences simply are not remembered */
  }
}
