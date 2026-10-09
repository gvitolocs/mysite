# Working on this repository

Giuseppe Vitolo's portfolio, "Poko Genesis": SolidJS + Vite + three.js,
prerendered to static HTML. **This is not a Next.js project any more** (the
Next.js site lives in git history and on `main` until the redesign is merged).

Read `docs/POKO_GENESIS_ENGINEERING.md` before changing the 3D experience.

## Rules

- The scene must stay a pure function of scroll progress: `evaluateStory(u)` in
  `src/experience/story.ts` may not read time, previous frames or scroll
  direction. Time-based motion goes in additive layers that decay to zero.
  `tests/unit/story.test.ts` and the e2e determinism tests enforce this.
- Chapter lengths, copy and overlay windows live in `src/content/chapters.ts`.
  Project facts live in `src/content/content.ts` / `caseStudies.ts` and must
  keep their measurement caveats. Never invent figures.
- Poko comes from `src/assets/poko/pokoin-mascot@8x.png` (a copy of the Pokoin
  brand asset). Do not redraw the mascot; change the voxelizer instead.
- After changing the voxelizer or rig: `npm run poko:voxels`, rebuild with
  Blender (`python blender/scripts/build_poko.py` with `bpy` installed), then
  `npm run poko:pack`. The validator must pass.
- Keep the WebGL experience optional: every page must work without JavaScript
  and without WebGL.

## Commands

```sh
npm ci
npm run dev          # dev server; /lab/ renders single engine states
npm run typecheck
npm test             # Vitest
npm run build        # dist/ (client + SSR + prerender)
npm run test:e2e     # Playwright against the build
```
