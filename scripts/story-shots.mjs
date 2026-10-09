/**
 * Screenshot the home page at story checkpoints (visual QA and the screenshot gallery).
 *   node scripts/story-shots.mjs <outDir> [baseUrl] [u1,u2,...] [WxH]
 */
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const [outDir, base = 'http://127.0.0.1:4180/', list = '0,0.1,0.25,0.4,0.55,0.7,0.85,1', size = '1440x900'] = process.argv.slice(2);
const [w, h] = size.split('x').map(Number);
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 1 });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`); });
page.on('pageerror', (e) => errors.push(`[pageerror] ${e.message}`));
const t0 = Date.now();
await page.goto(`${base}?debug${process.env.QUALITY ? `&quality=${process.env.QUALITY}` : ""}`);
await page.waitForFunction(() => window.__poko?.ready === true, null, { timeout: 180_000 });
await page.waitForFunction(() => window.__poko.info().skinned === true, null, { timeout: 60_000 }).catch(() => {});
console.log(`ready in ${Date.now() - t0} ms; skinned=${await page.evaluate(() => window.__poko.info().skinned)}`);
await page.evaluate(() => window.__poko.freeze(3.2));
const report = {};
for (const u of list.split(',').map(Number)) {
  await page.evaluate((v) => window.__poko.setProgress(v), u);
  await page.waitForTimeout(800); // scroll events dispatch next frame; overlays fade for 0.55 s
  await page.evaluate(() => window.__poko.renderNow());
  const info = await page.evaluate(() => window.__poko.info());
  const name = `u${String(Math.round(u * 1000)).padStart(4, '0')}`;
  await page.screenshot({ path: resolve(outDir, `${name}.png`) });
  report[name] = { chapter: info.chapter, calls: info.render.calls, triangles: info.render.triangles };
  console.log(`${name} ${info.chapter} calls=${info.render.calls} tris=${info.render.triangles}`);
}
writeFileSync(resolve(outDir, 'report.json'), JSON.stringify(report, null, 2));
if (errors.length) console.log(errors.slice(0, 20).join('\n'));
await browser.close();
