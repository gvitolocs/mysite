import type { Page } from '@playwright/test';

export interface PokoInfo {
  progress: number;
  chapter: string;
  quality: string;
  compute: boolean;
  skinned: boolean;
  render: { calls: number; triangles: number };
  memory: { geometries: number; textures: number };
  drawingBuffer: [number, number];
  scheduler: string;
}

declare global {
  interface Window {
    __poko: {
      ready: boolean;
      setProgress(u: number): void;
      freeze(t: number | null): void;
      renderNow(): void;
      info(): PokoInfo;
      voxelChecksum(): number | null;
      samples(): number[];
      resetPerf(): void;
      dispose(): void;
      /** The live Experience (debug only); just the fields tests read. */
      experience: { time: number; rig: { bone(name: string): { quaternion: { w: number } } } };
    };
  }
}

/** Open the home page with the debug API and wait for the first WebGL frame. */
export async function openExperience(page: Page, query = '') {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.goto(`/?debug${query}`);
  await page.waitForFunction(() => window.__poko?.ready === true, null, { timeout: 90_000 });
  return { errors };
}

export async function waitForCharacter(page: Page) {
  await page.waitForFunction(() => window.__poko.info().skinned === true, null, { timeout: 60_000 });
}

/** Read the canvas as a data URL (the debug renderer preserves its drawing buffer). */
export async function canvasPixels(page: Page): Promise<string> {
  return page.evaluate(() => (document.querySelector('canvas.stage') as HTMLCanvasElement).toDataURL('image/png'));
}

/** Fraction of sampled canvas pixels that are not near-black: "is anything drawn?" */
export async function litFraction(page: Page): Promise<number> {
  return page.evaluate(() => {
    const src = document.querySelector('canvas.stage') as HTMLCanvasElement;
    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 100;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0, c.width, c.height);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i] + d[i + 1] + d[i + 2] > 120) lit++;
    return lit / (d.length / 4);
  });
}
