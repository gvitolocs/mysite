/**
 * Visual QA helper: render lab states to PNG with headless Chromium.
 *   node scripts/lab-shot.mjs <outDir> "<name>=<query>" ...
 * e.g. node scripts/lab-shot.mjs shots "tq=rep=B&cam=tq" "cloud=to=cloud&t=0.5"
 */
import { chromium } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

const [outDir, ...specs] = process.argv.slice(2);
const base = process.env.LAB_URL ?? 'http://127.0.0.1:5173/lab/';
const [w, h] = (process.env.LAB_SIZE ?? '960x720').split('x').map(Number);
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch({
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}]`, m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
for (const spec of specs) {
  const [name, query] = spec.split(/=(.*)/s);
  const t0 = Date.now();
  await page.goto(`${base}?${query}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 120_000 });
  const hud = await page.locator('#hud').textContent();
  await page.screenshot({ path: resolve(outDir, `${name}.png`) });
  console.log(`${name}: ${Date.now() - t0} ms · ${hud}`);
}
await browser.close();
