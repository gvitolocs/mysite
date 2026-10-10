/**
 * Offline walkthrough recording.
 *
 * Because every frame is a pure function of (scroll progress, clock), the
 * journey can be rendered frame by frame at any speed and encoded into a
 * perfectly smooth video, even on a machine that renders at 1 fps (this
 * container has no GPU). Each frame sets the scroll position, freezes the
 * ambient clock at frame/30 s, waits for overlays to settle and screenshots.
 *
 *   node scripts/record-walkthrough.mjs <out.mp4> [baseUrl] [seconds] [WxH] [quality]
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const [out, base = 'http://127.0.0.1:4180/', seconds = '24', size = '1280x720', quality = 'high'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
const fps = Number(process.env.FPS ?? 30);
const frames = Math.round(Number(seconds) * fps);
const dir = join(tmpdir(), `poko-walkthrough-${Date.now()}`);
mkdirSync(dir, { recursive: true });

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
await page.goto(`${base}?debug&quality=${quality}`);
await page.waitForFunction(() => window.__poko?.ready === true, null, { timeout: 180_000 });
await page.waitForFunction(() => window.__poko.info().skinned === true, null, { timeout: 60_000 });
// Hide the debug-only controls row for a clean frame.
await page.addStyleTag({ content: '.controls{display:none!important}' });
await page.evaluate(() => window.__poko.manual(true));

// Pacing: linger on the hero states, move briskly through transitions.
const ease = (t) => t * t * (3 - 2 * t);
for (let i = 0; i < frames; i++) {
  const t = i / (frames - 1);
  const u = 0.985 * (0.5 * t + 0.5 * ease(t)) + 0.015 * t;
  await page.evaluate(([v, time]) => {
    window.__poko.freeze(time);
    window.__poko.setProgress(v);
  }, [u, i / fps]);
  await page.waitForTimeout(40);
  await page.screenshot({ path: join(dir, `f${String(i).padStart(5, '0')}.png`) });
  if (i % 30 === 0) console.log(`frame ${i}/${frames} u=${u.toFixed(3)}`);
}
await browser.close();

execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%05d.png'),
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'slow', '-crf', '24', '-movflags', '+faststart', out]);
rmSync(dir, { recursive: true, force: true });
console.log(`Wrote ${out}`);
