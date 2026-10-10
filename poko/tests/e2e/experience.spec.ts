import { expect, test } from '@playwright/test';
import { canvasPixels, litFraction, openExperience, waitForCharacter } from './helpers.ts';

test.describe('cinematic home page', () => {
  test('ships readable HTML before any JavaScript runs', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1, name: 'Giuseppe Vitolo' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pokoin' })).toBeAttached();
    await expect(page.locator('a[href="/work/pokoin/"]')).toBeAttached();
    await expect(page.locator('a[href^="mailto:"]').first()).toBeAttached();
    await expect(page.locator('.static-poko')).toBeVisible();
    await ctx.close();
  });

  test('starts the WebGL scene, loads the character, draws Poko', async ({ page }) => {
    const { errors } = await openExperience(page);
    await waitForCharacter(page);
    const info = await page.evaluate(() => window.__poko.info());
    expect(info.compute).toBe(true);
    expect(info.chapter).toBe('awakening');
    expect(await litFraction(page)).toBeGreaterThan(0.04);
    await expect(page.locator('html')).toHaveClass(/webgl-ready/);
    await expect(page.locator('.loader')).toHaveClass(/is-hidden/);
    expect(errors).toEqual([]);
  });

  test('scroll drives the story and the chapter index', async ({ page }) => {
    await openExperience(page);
    for (const [u, chapter, label] of [
      [0.17, 'disintegration', 'Poko'],
      [0.44, 'pokoin', 'Pokoin'],
      [0.54, 'cardrail', 'CardRails'],
      [0.64, 'prduct', 'prduct'],
      [0.74, 'tmelnik', 'Tmelnik'],
      [0.84, 'systems', 'Systems'],
      [1, 'finale', 'Contact'],
    ] as const) {
      await page.evaluate((v) => window.__poko.setProgress(v), u);
      await expect.poll(() => page.evaluate(() => window.__poko.info().chapter)).toBe(chapter);
      await expect(page.locator('.chapter-index a[aria-current="step"]')).toHaveText(label);
    }
  });

  test('voxel state is identical whether reached by scrolling forward or backward', async ({ page }) => {
    await openExperience(page);
    await waitForCharacter(page);
    await page.evaluate(() => window.__poko.freeze(2));
    const probes = [0.18, 0.24, 0.37, 0.47, 0.57, 0.68, 0.79, 0.92];
    const forward: Record<number, number | null> = {};
    for (const u of probes) {
      await page.evaluate((v) => window.__poko.setProgress(v), u);
      forward[u] = await page.evaluate(() => window.__poko.voxelChecksum());
    }
    await page.evaluate(() => window.__poko.setProgress(1));
    for (const u of [...probes].reverse()) {
      await page.evaluate((v) => window.__poko.setProgress(v), u);
      expect(await page.evaluate(() => window.__poko.voxelChecksum()), `u=${u}`).toBe(forward[u]);
    }
    expect(new Set(Object.values(forward)).size).toBe(probes.length);
  });

  test('rendered frames are pixel-identical forward and backward', async ({ page }) => {
    await openExperience(page);
    await waitForCharacter(page);
    await page.evaluate(() => window.__poko.freeze(2));
    const shots: Record<string, string> = {};
    for (const u of [0.3, 0.6, 0.85]) {
      await page.evaluate((v) => window.__poko.setProgress(v), u);
      shots[u] = await canvasPixels(page);
    }
    for (const u of [0.85, 0.6, 0.3]) {
      await page.evaluate((v) => window.__poko.setProgress(v), u);
      expect(await canvasPixels(page), `u=${u}`).toBe(shots[u]);
    }
  });

  test('chapter index and keyboard shortcuts navigate', async ({ page }) => {
    await openExperience(page);
    await page.locator('.chapter-index a', { hasText: 'Systems' }).click();
    await expect.poll(() => page.evaluate(() => window.__poko.info().chapter), { timeout: 15_000 }).toBe('systems');
    await page.keyboard.press(']');
    await expect.poll(() => page.evaluate(() => window.__poko.info().chapter), { timeout: 15_000 }).toBe('reconstruction');
    await page.keyboard.press('[');
    await expect.poll(() => page.evaluate(() => window.__poko.info().chapter), { timeout: 15_000 }).toBe('systems');
  });

  test('skip link and tab order reach the contact links', async ({ page }) => {
    await openExperience(page);
    await page.keyboard.press('Tab');
    const skip = page.locator('.skip-link');
    await expect(skip).toBeFocused();
    await skip.press('Enter');
    await expect(page).toHaveURL(/#finale$/);
    const email = page.locator('#finale a[href^="mailto:"]');
    await email.focus();
    await expect(email).toBeVisible();
  });

  test('project and contact links point at real destinations', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page.locator('main a').evaluateAll((as) => as.map((a) => (a as HTMLAnchorElement).getAttribute('href')));
    expect(hrefs).toEqual(expect.arrayContaining([
      '/work/pokoin/', 'https://pokoin.com', '/work/cardrails/', 'https://cardrails.vercel.app', '/work/prduct/', '/work/tmelnik/', '/work/systems/',
      'mailto:gvitolocs@gmail.com', 'https://github.com/gvitolocs', 'https://www.linkedin.com/in/gvitolocs/', '/cv.pdf', '/about/', '/work/',
    ]));
    for (const path of ['/work/pokoin/', '/work/cardrails/', '/work/prduct/', '/work/tmelnik/', '/work/systems/', '/about/', '/work/', '/cv.pdf']) {
      const res = await page.request.get(path);
      expect(res.status(), path).toBe(200);
    }
  });

  test('a refresh mid-page restores the same scene', async ({ page }) => {
    await openExperience(page);
    await page.evaluate(() => window.__poko.setProgress(0.62));
    const before = await page.evaluate(() => window.__poko.info().chapter);
    await page.reload();
    await page.waitForFunction(() => window.__poko?.ready === true, null, { timeout: 90_000 });
    const after = await page.evaluate(() => window.__poko.info());
    expect(after.chapter).toBe(before);
    expect(after.progress).toBeGreaterThan(0.55);
  });

  test('resizing the window resizes the render targets', async ({ page }) => {
    await openExperience(page);
    const a = (await page.evaluate(() => window.__poko.info())).drawingBuffer;
    await page.setViewportSize({ width: 900, height: 700 });
    await expect.poll(async () => (await page.evaluate(() => window.__poko.info())).drawingBuffer[0]).not.toBe(a[0]);
    expect(await litFraction(page)).toBeGreaterThan(0.02);
  });

  test('reduced motion shows settled states and no journey', async ({ browser }) => {
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await openExperience(page);
    await expect(page.locator('html')).toHaveClass(/reduced-motion/);
    await expect(page.getByRole('button', { name: 'Motion: reduced' })).toBeVisible();
    await page.evaluate(() => window.__poko.freeze(1));
    await page.evaluate(() => window.__poko.setProgress(0.52));
    const a = await page.evaluate(() => window.__poko.voxelChecksum());
    await page.evaluate(() => window.__poko.setProgress(0.58));
    const b = await page.evaluate(() => window.__poko.voxelChecksum());
    expect(b, 'within one chapter the scene holds still').toBe(a);
    await ctx.close();
  });

  test('without WebGL the static page keeps all content and navigation', async ({ browser }) => {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error test shim
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        if (type === 'webgl2' || type === 'webgl') return null;
        return original.call(this, type, ...rest);
      };
    });
    const page = await ctx.newPage();
    await page.goto('/');
    await expect(page.locator('html')).toHaveClass(/static/);
    await expect(page.locator('.static-poko')).toBeVisible();
    await expect(page.getByText('Static version')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Giuseppe Vitolo' })).toBeVisible();
    await page.locator('#pokoin').scrollIntoViewIfNeeded();
    await expect(page.locator('#pokoin .overlay')).toBeVisible();
    await ctx.close();
  });

  test('quality can be changed at runtime without leaking GPU resources', async ({ page }) => {
    await openExperience(page);
    await waitForCharacter(page);
    const start = await page.evaluate(() => window.__poko.info().memory);
    for (const label of ['Quality: auto', 'Quality: high', 'Quality: medium', 'Quality: low']) {
      await page.getByRole('button', { name: new RegExp(label.replace('Quality: ', 'Render quality: ')) }).click();
      await page.evaluate(() => window.__poko.renderNow());
    }
    const end = await page.evaluate(() => window.__poko.info().memory);
    expect(end.geometries).toBeLessThanOrEqual(start.geometries + 1);
    expect(end.textures).toBeLessThanOrEqual(start.textures + 2);
  });

  test('pointer look settles instead of tipping Poko over', async ({ page }) => {
    // Regression: the look layer used to stack onto last frame's rotation
    // whenever the animation mixer skipped an unchanged bone. At the end of the
    // intro (look on, idle still off) a real pointer made Poko tip over:
    // 19° → 44° → 69° → 94° in four seconds.
    await openExperience(page);
    await waitForCharacter(page);
    await page.evaluate(() => window.__poko.setProgress(0.068));
    await page.mouse.move(40, 40); // top-left corner, then hold still
    const bodyTilt = () =>
      page.evaluate(() => {
        const q = window.__poko.experience.rig.bone('body').quaternion;
        return (2 * Math.acos(Math.min(1, Math.abs(q.w))) * 180) / Math.PI;
      });
    // Wait in scene time: software WebGL renders only a few frames per second.
    const waitScene = async (seconds: number) => {
      const end = (await page.evaluate(() => window.__poko.experience.time)) + seconds;
      await page.waitForFunction((t) => window.__poko.experience.time >= t, end, { timeout: 60_000 });
    };
    await waitScene(2.5);
    const settled = await bodyTilt();
    await waitScene(2.5);
    const later = await bodyTilt();
    expect(settled).toBeLessThan(35);
    expect(Math.abs(later - settled)).toBeLessThan(2);
  });
});
