/**
 * Static site generation: render every route with Solid's SSR build and write
 * dist/<route>/index.html, so each page ships real HTML (SEO, no-JS, fast first
 * paint) and then hydrates.
 *
 *   npm run build  →  vite build (client) → vite build --ssr → this script
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
// Sub-path deployment (BASE_PATH=/poko/): the same value vite.config.ts uses.
const base = (process.env.BASE_PATH ?? '/').replace(/\/$/, '');
const template = readFileSync(join(dist, 'index.html'), 'utf8');
const { render, ROUTES } = await import(pathToFileURL(join(root, 'dist-ssr', 'entry-server.js')).href);

// Preload the two fonts visible above the fold (hashed filenames from the client build).
const assets = readdirSync(join(dist, 'assets'));
const font = (prefix) => assets.find((f) => f.startsWith(prefix) && f.endsWith('.woff2'));
const preloads = ['inter-tight-latin-wght-normal', 'instrument-serif-latin-400-normal', 'silkscreen-latin-400-normal']
  .map(font)
  .filter(Boolean)
  .map((f) => `<link rel="preload" href="${base}/assets/${f}" as="font" type="font/woff2" crossorigin>`)
  .join('\n    ');

const urls = [];
for (const route of ROUTES) {
  const out = render(route.path);
  const html = template
    .replace('<!--app-head-->', `${out.head}\n    ${preloads}`)
    .replace('<!--hydration-script-->', out.hydration)
    .replace('<!--app-html-->', out.html)
    .replace('<body>', `<body data-page="${out.route.page}" data-path="${out.route.path}">`);
  const file = route.page === 'notfound' ? join(dist, '404.html') : join(dist, route.path, 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  if (route.page !== 'notfound') urls.push(route.path);
  console.log(`prerendered ${route.path} → ${file.replace(root + '/', '')} (${(html.length / 1024).toFixed(1)} KiB)`);
}

const site = 'https://gvitolo.vercel.app';
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${site}${base}${u}</loc></url>`).join('\n')}\n</urlset>\n`,
);
// robots.txt only means something at the domain root.
if (!base) writeFileSync(join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${site}/sitemap.xml\n`);
rmSync(join(root, 'dist-ssr'), { recursive: true, force: true });
