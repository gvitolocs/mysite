import { expect, test } from '@playwright/test';
import { litFraction, openExperience } from './helpers.ts';

test.describe('mobile (Pixel 7 emulation)', () => {
  test('renders, adapts quality, and has no horizontal overflow', async ({ page }) => {
    await openExperience(page);
    const info = await page.evaluate(() => window.__poko.info());
    expect(['low', 'medium']).toContain(info.quality);
    expect(await litFraction(page)).toBeGreaterThan(0.03);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('touch scrolling advances the story', async ({ page }) => {
    await openExperience(page);
    // Real touch-point sequences, so the browser's native touch scrolling handles them.
    const client = await page.context().newCDPSession(page);
    for (let k = 0; k < 4; k++) {
      await client.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: 200, y: 700 }] });
      for (let i = 1; i <= 10; i++) await client.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: 200, y: 700 - i * 50 }] });
      await client.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    await expect.poll(() => page.evaluate(() => window.__poko.info().progress), { timeout: 15_000 }).toBeGreaterThan(0.1);
  });

  test('text stays readable over the scene', async ({ page }) => {
    await openExperience(page);
    await page.evaluate(() => window.__poko.setProgress(0.53));
    const overlay = page.locator('#pokoin .overlay');
    await expect(overlay).toBeVisible();
    const box = await overlay.boundingBox();
    const vp = page.viewportSize()!;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vp.width + 1);
    const fontSize = await page.locator('#pokoin .overlay__body').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(fontSize).toBeGreaterThanOrEqual(15);
  });
});
