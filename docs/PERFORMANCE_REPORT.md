# Performance report

**Baseline**: the current production portfolio (Next.js 16, `main` at
`eb4c2ba`), built and served locally with `next start`.
**Final**: Poko Genesis (this branch), built and served locally with
`vite preview`.

Both were measured with the same harness, `scripts/perf/measure.mjs`, on
2026-10-09. Raw results are in [`docs/perf/*.json`](./perf/).

## Read this first: the measurement environment

* Headless Chromium 141 (Playwright 1.56.1) in a cloud container with
  **no GPU**. WebGL runs on **SwiftShader**, a CPU rasterizer that is 10–100×
  slower than any real GPU.
* As a result, **every GPU-bound number below (frame times, FPS, wheel-to-frame
  latency, time to first WebGL frame) is far worse than on real hardware.** It
  is useful only for comparing variants of the same build (tiers, A/B tests),
  never as an absolute claim. Re-run the harness on real devices before
  quoting FPS.
* CPU-side numbers (main-thread script time per frame, start-up phases, bytes,
  requests, FCP/LCP of the HTML) are meaningful.
* The servers are on loopback; "4G" applies a Chrome Fast-4G-like profile via
  CDP (9 Mbit/s down, 60 ms RTT).
* `vite preview` and `next start` compress responses differently, so transfer
  is compared as **gzip-equivalent bytes** (each text response gzipped at
  level 9; binaries counted raw).
* Only Chromium could be tested. Safari and Firefox are not installed in this
  environment; untested there.

## Summary table

| Metric | Baseline | Final | Notes |
|---|---|---|---|
| Cold load: first contentful paint | 472 ms | **128 ms** | desktop, loopback |
| Cold load: largest contentful paint | 1 296 ms | **128 ms** | baseline LCP is the 335 KB portrait |
| Cold load on Fast 4G: FCP / LCP | 600 / 1 880 ms | **304 / 304 ms** | |
| Warm load: FCP / LCP | 168 / 1 352 ms | **56 / 56 ms** | |
| First meaningful visual | LCP 1 296 ms | text at 128 ms; **first WebGL frame 594 ms** (1 029 ms on 4G) | WebGL time is SwiftShader-bound |
| Total transferred, gzip-equivalent | 374 KiB (18 requests) | 390 KiB (11 requests) | final: 211 KiB scripts (three.js 167 KiB gz), 73 KiB fonts, 94 KiB GLB |
| Bytes before readable content | ~374 KiB (hydration-gated) | ~100 KiB | HTML + CSS + fonts + 17 KiB app JS; three.js loads after |
| Warm reload transfer | 4 KiB | 2 KiB | immutable hashed assets |
| Average FPS during a full-story scroll | n/a: static DOM page, not instrumented | 3.2 (low tier), 1.2 (high) | **SwiftShader**; not representative |
| Frame time p50 / p95 / p99 | n/a | 317 / 600 / 883 ms (low) | **SwiftShader** |
| Main-thread CPU per frame, p50 / p95 | n/a | **0.7 / 4.7 ms** | the meaningful frame-cost number; budget 16.7 ms |
| Browser RAM (JS heap) | 4.6 MB | 4.7 MB | CDP `JSHeapUsedSize` after load |
| GPU memory | n/a (no WebGL) | ~28 MB (low) to ~140 MB (high, 1×); see below | **analytic estimate**, not measured |
| Draw calls per frame | 0 | 9 (low) / 22 (high) | finale frame, including post passes; all 4 096 voxels are 1 call |
| Triangles per frame | 0 | 54 k (low) / 108 k (high, + shadow pass) | |
| Main-thread blocking (TBT-style, during load) | 0 ms | 396 ms (2 long tasks) | WebGL program compilation on SwiftShader; see analysis |
| Main-thread script time during load | 68 ms | 32 ms | CDP `ScriptDuration` |
| Scroll responsiveness (wheel → next frame) | n/a | p50 999 ms / p95 1 619 ms | **SwiftShader**: dominated by frame time; scrolling itself is native and never blocked |
| Mobile FPS | n/a | 7.7 (Pixel 7 emulation, low tier, 350×713 buffer) | **SwiftShader** |

## Start-up breakdown (final, desktop, low tier)

| Phase | Time |
|---|---|
| HTML → first contentful paint (all text, navigation) | 128 ms |
| Build the 7 voxel formations (CPU, main thread) | 38 ms |
| Create the voxel engine (textures, compute pass, materials) | 40 ms |
| `Experience.create` → first WebGL frame | 408 ms |
| Blender character (94 KB GLB) loaded, compiled and swapped in | +63 ms after the first frame |

## Frame-interval distribution (scripted scroll through the whole story)

| Bucket | Desktop low | Desktop high | Mobile low |
|---|---|---|---|
| < 17 ms | 19 | 3 | 66 |
| 17–33 ms | 0 | 0 | 0 |
| 33–50 ms | 11 | 1 | 9 |
| 50–100 ms | 25 | 1 | 37 |
| > 100 ms | 383 | 320 | 310 |

On SwiftShader most frames take more than 100 ms because the GPU work runs
on the CPU. The < 17 ms frames are frames where only cheap work was needed.
On real GPUs, 49 k–108 k triangles and a 1–2 MP fill should sit well inside
16.7 ms, but **this has not been verified here**.

## GPU memory (analytic estimate)

`renderer.info` reports resource counts, not bytes (12 textures and 12
geometries on low; 22 and 12 on high; no growth after cycling all tiers,
which is tested). Estimated bytes:

| Resource | Low, 1224×765 | High, 1440×900 @1× | High, 2880×1800 @2× |
|---|---|---|---|
| Canvas colour (no depth: removed) | 3.7 MB | 5.2 MB | 20.7 MB |
| HDR scene target (RGBA16F) + depth | 11.2 MB | 15.6 MB | 62.2 MB |
| MSAA renderbuffers | — | 62 MB (4×) | — (MSAA off above 1.25× density) |
| Bloom chain (10 targets) | — | 6.9 MB | 27.6 MB |
| Shadow map 2048² | — | ~17–34 MB | ~17–34 MB |
| PMREM environment (cube-UV, half float) | ~6 MB | ~6 MB | ~6 MB |
| Formations, static data, compute targets | 0.9 MB | 0.9 MB | 0.9 MB |
| Geometry (voxel cube, GLB, floor, sky, dust) | < 2 MB | < 2 MB | < 2 MB |
| **Total (approx.)** | **~25 MB** | **~115–135 MB** | **~135–155 MB** |

Before gating MSAA by pixel density, the 2× column would have included
about 250 MB of multisample buffers.

## Analysis

### What improved

* **Content first.** The baseline hydrates a React app before its LCP image
  (the portrait) settles at about 1.3 s. Poko Genesis ships prerendered HTML,
  so the name, statement and navigation are readable at about 130 ms (300 ms
  on 4G). The 3D layer then arrives without blocking content.
* **Fewer requests, cacheable assets.** 11 vs 18 requests; every asset is
  content-hashed and `immutable`, so repeat visits transfer about 2 KiB.
* **CPU per frame is tiny.** 0.7 ms p50 and 4.7 ms p95 of main-thread work per
  frame, with 4 096 independently animated voxels. That is the dividend of
  doing all per-voxel work in one GPU compute pass and keeping the DOM off the
  frame loop.
* **The character asset.** 633 KB → 94 KB (meshopt + quantisation, `-kv` to
  keep UVs).

### What regressed or is unknown

* **Main-thread blocking at load: about 400 ms vs 0.** The cost is WebGL
  program compilation and uniform reflection. The trace shows it inside
  three.js's `WebGLUniforms` constructor, waiting on Chrome's GPU process.
  SwiftShader lacks `KHR_parallel_shader_compile` and compiles on the CPU, so
  this is a worst case. It happens after the content is readable and does not
  block scrolling, which is native and off the main thread in Chromium. It does
  delay the first WebGL frame and any input handled during that window.
* **Experiments recorded honestly:**
  * `compileAsync` on the whole scene made blocking *worse* on SwiftShader
    (one blocking compile of everything).
  * An object-by-object warm-up cut blocking about 25 % on the low tier but
    made the high tier's first frame 6–8× slower (4.6–6.2 s vs 0.57–0.81 s in
    an A/B on the same build). **It was removed.**
  * Skipping three.js's synchronous shader status queries in production
    (`debug.checkShaderErrors`) is kept: it cannot hurt, and on GPUs with
    parallel compilation it lets programs compile in the background.
* **Real-GPU frame rates are unmeasured.** Run the harness on target devices:

  ```sh
  npm run build && npx vite preview --port 4180
  node scripts/perf/measure.mjs http://127.0.0.1:4180/ genesis --experience
  node scripts/perf/measure.mjs http://127.0.0.1:4180/ genesis --experience --quality=high
  ```

  On a real GPU the harness's frame percentiles and wheel-to-frame latency
  become meaningful. Adaptive quality drops a tier automatically if p90 frame
  time exceeds 22.5 ms.

### Power

The scene renders on demand: 60 fps while scrolling or interacting, 30 fps
after 6 s of quiet, and the loop stops completely after 24 s (the canvas keeps
its last image). Hidden tabs do no work. Energy was not measured: no power
instrumentation is available in this environment, and no savings are claimed
from bundle size.

## Reproduce

```sh
npm run build && npx vite preview --port 4180 &
# baseline: check out main, npm ci && npx next build && npx next start -p 4190
node scripts/perf/measure.mjs http://127.0.0.1:4190/ baseline --out=docs/perf/baseline-desktop.json
node scripts/perf/measure.mjs http://127.0.0.1:4180/ genesis --experience --out=docs/perf/genesis-desktop.json
# variants: --network=4g, --mobile, --quality=high|medium|low
```
