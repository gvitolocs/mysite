import { expect, test } from '@playwright/test';

const PAGES = [
  { path: '/work/', h1: 'Things I have built' },
  { path: '/work/pokoin/', h1: 'Pokoin' },
  { path: '/work/cardrail/', h1: 'CardRail' },
  { path: '/work/systems/', h1: 'Systems & data' },
  { path: '/about/', h1: 'Connecting software, data and the people who use it.' },
];

test.describe('text pages', () => {
  for (const p of PAGES) {
    test(`${p.path} is complete without JavaScript and indexable`, async ({ browser }) => {
      const ctx = await browser.newContext({ javaScriptEnabled: false });
      const page = await ctx.newPage();
      const res = await page.goto(p.path);
      expect(res?.status()).toBe(200);
      await expect(page.getByRole('heading', { level: 1, name: p.h1 })).toBeVisible();
      expect(await page.locator('h1').count()).toBe(1);
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', `https://gvitolo.vercel.app${p.path}`);
      expect((await page.locator('meta[name="description"]').getAttribute('content'))!.length).toBeGreaterThan(50);
      for (const img of await page.locator('img').all()) expect(await img.getAttribute('alt')).not.toBeNull();
      await ctx.close();
    });
  }

  test('case studies carry the measurement caveats', async ({ page }) => {
    await page.goto('/work/pokoin/');
    await expect(page.getByText('6.9 s → 26 ms')).toBeVisible();
    await expect(page.getByText(/not a claim about uncached SQL or a Rust-only speedup/)).toBeVisible();
  });

  test('hydrates without console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    for (const p of PAGES) await page.goto(p.path);
    expect(errors).toEqual([]);
  });

  test('unknown paths serve the 404 page', async ({ page }) => {
    await page.goto('/404');
    await expect(page.getByRole('heading', { name: 'Lost a pixel' })).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
  });

  test('sitemap and robots are generated', async ({ request }) => {
    const sitemap = await (await request.get('/sitemap.xml')).text();
    for (const p of ['/', ...PAGES.map((x) => x.path)]) expect(sitemap).toContain(`https://gvitolo.vercel.app${p}<`);
    expect(await (await request.get('/robots.txt')).text()).toContain('Sitemap:');
  });
});
