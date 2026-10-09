# Deployment and rollback

The site is a static build (`dist/`): prerendered HTML per route plus hashed,
immutable assets. There is no server code. It deploys to the existing Vercel
project `mysite` (production domain `gvitolo.vercel.app`), as before.

## What changed in the deployment setup

| | Before (main) | Poko Genesis |
|---|---|---|
| Framework | Next.js 16 | Vite 8 + SolidJS (static) |
| `vercel.json` | `framework: nextjs` | `framework: vite`, `buildCommand: npm run build`, `outputDirectory: dist`, immutable cache headers for `/assets/*` |
| Install | `npm ci` | `npm ci` (`.npmrc` sets `legacy-peer-deps=true` to avoid an npm arborist crash on Vitest's optional peers) |
| Node | 20+ | 22.18+ (`engines`) |

## Promote

1. Open the pull request from `claude/admiring-gates-mgebqm`. Vercel builds a
   **preview deployment** for it automatically. Review it on a real GPU,
   desktop and phone.
2. Check locally if wanted:
   ```sh
   npm ci && npm test && npm run build && npm run test:e2e
   ```
3. Merge to `main`. Vercel builds and promotes to production.
4. Smoke-test production: `/`, `/work/`, `/work/pokoin/`, `/about/`, `/cv.pdf`,
   `/sitemap.xml`, plus the home page with `?static` (fallback) and with
   reduced motion enabled.

## Roll back

Fastest, with no rebuild: in the Vercel dashboard (Project → Deployments),
pick the last Next.js production deployment and choose **Promote to
Production** (or `vercel rollback <deployment-url>` with the CLI). The domain
switches back instantly.

In git, so `main` matches what is live:

```sh
git revert -m 1 <merge-commit-sha>   # creates a revert commit; history stays intact
git push origin main
```

The Next.js site lives untouched on `main` until the merge, and in history
afterwards.

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
