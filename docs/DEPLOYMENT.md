# Deployment and rollback

The site is a static build (`dist/`): prerendered HTML per route plus hashed,
immutable assets. There is no server code.

## Where it is live: `/poko/` next to the main site

Poko Genesis currently ships as a sub-path of the main portfolio, in the
existing Vercel project `mysite` (production domain `gvitolo.vercel.app`):

* the repository root is the main site (Astro); this project lives in `poko/`;
* the root `npm run build` runs `astro build`, then builds this project with
  `BASE_PATH=/poko/` and copies its `dist/` to `dist/poko/`;
* the root `vercel.json` adds immutable caching for `/poko/assets/*` and
  redirects `/poko` to `/poko/`.

`BASE_PATH` (default `/`) sets Vite's `base`. Internal links go through
`withBase()` in `src/app/base.ts`, so the same source builds for the domain
root or any sub-path. The canonical URLs, Open Graph image and sitemap use the
base; `robots.txt` is only written for a root deployment.

```sh
cd poko && BASE_PATH=/poko/ npm run build    # dist/ for /poko/
BASE_PATH=/poko/ npx vite preview            # serves it at /poko/
```

The e2e suite runs against a root build (`npm run build && npm run test:e2e`).

## Promote to the domain root (replacing the main site)

1. Move this project's files back to the repository root (or point the Vercel
   project's root directory at `poko/`) and restore its own `vercel.json`
   (`framework: vite`, `outputDirectory: dist`, immutable `/assets/*`).
2. Build with the default `BASE_PATH` and run
   `npm ci && npm test && npm run build && npm run test:e2e`.
3. Review the Vercel preview on a real GPU, desktop and phone, then merge to
   `main`.
4. Smoke-test production: `/`, `/work/`, `/work/pokoin/`, `/about/`, `/cv.pdf`,
   `/sitemap.xml`, plus the home page with `?static` (fallback) and with
   reduced motion enabled.

## Roll back

Fastest, with no rebuild: in the Vercel dashboard (Project → Deployments),
pick the previous production deployment and choose **Promote to Production**
(or `vercel rollback <deployment-url>` with the CLI). The domain switches back
instantly.

In git, so `main` matches what is live:

```sh
git revert -m 1 <merge-commit-sha>   # creates a revert commit; history stays intact
git push origin main
```

To take down only `/poko/`, remove the `poko:build` step from the root
`build` script; the main site is unaffected.

## Cloudflare Pages (alternative)

The build is plain static output, so it also deploys to Cloudflare Pages:
build command `npm run build`, output directory `dist`, Node 22. Add a
`_headers` file with `Cache-Control: public, max-age=31536000, immutable` for
`/assets/*`.

## Cache behaviour

* `/assets/*`: content-hashed filenames, `immutable`, cached for a year. A new
  deploy produces new names, so there is no stale code.
* HTML: default revalidation, so a new deploy is visible on the next request.
* `cv.pdf`, `favicon.svg` and the portrait: not hashed, default caching.
