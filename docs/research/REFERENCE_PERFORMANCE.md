# Reference Performance Measurements

> Research for POKO GENESIS, measured 2026-10-09 with [`scripts/research/capture-reference.mjs`](../../scripts/research/capture-reference.mjs).
> **Read this first:**
> 1. **lusion.co could not be measured.** The sandbox egress proxy denied it (HTTP 403 on CONNECT). Every lusion.co row below says **unavailable**. No number in this file describes lusion.co's production site.
> 2. What *was* measured: (a) Lusion's open-source **WebGL-Scroll-Sync** demo (commit `d2f2c84`, MIT), unmodified, served by a local static server; (b) a **synthetic voxel benchmark** I wrote to validate the instrumentation.
> 3. The machine has **no GPU**. WebGL ran on **SwiftShader** (CPU rasteriser). Frame times are **relative signals only** (A vs B on the same machine), never absolute FPS predictions for real devices.
> 4. Network numbers for the local runs reflect *my* test server (loopback, HTTP/1.1, gzip for text, `immutable` for images), not Lusion's CDN. Only the *payload composition* (which files, what formats, what sizes) is intrinsic to the demo.

---

## 1. Environment

| Item | Value |
|---|---|
| Date | 2026-10-09 (UTC 16:45–16:53 for the final demo run) |
| OS / kernel | Linux 6.18.44 (container) |
| CPU | 4 vCPU, Intel Xeon @ 2.10 GHz |
| RAM | 15.7 GB |
| Node | v22.22.0 |
| Playwright | 1.56.1 (bundled Chromium revision 1194) |
| Browser | Chromium **141.0.7390.37**, headless (Playwright headless shell) |
| WebGL renderer (unmasked) | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` |
| WebGL version | `WebGL 2.0 (OpenGL ES 3.0 Chromium)` |
| Launch flags | `--enable-unsafe-swiftshader --ignore-gpu-blocklist --enable-webgl --enable-precise-memory-info` |
| Network | loopback for local targets; lusion.co through the sandbox HTTPS proxy (blocked) |
| Instrumentation | WebGL/rAF/`addEventListener`/Worker/WebAssembly wrappers injected via `addInitScript`; CDP `Network`, `Performance`; Chromium trace (`devtools.timeline` and related categories) during the scripted scroll |

**WebGL2 capabilities reported:**

| Parameter | Value |
|---|---|
| `MAX_TEXTURE_SIZE` | 8192 |
| `MAX_RENDERBUFFER_SIZE` | 8192 |
| `MAX_3D_TEXTURE_SIZE` | 2048 |
| `MAX_ARRAY_TEXTURE_LAYERS` | 2048 |
| `MAX_SAMPLES` | 4 |
| `MAX_DRAW_BUFFERS` | 6 |
| `MAX_VERTEX_TEXTURE_IMAGE_UNITS` | 32 |
| `MAX_VERTEX_UNIFORM_VECTORS` | 4096 |

These are SwiftShader's values. Real mobile GPUs are often lower, so design to WebGL2 minimums (WEBGL_RENDERING_TECHNIQUES §3).

---

## 2. lusion.co (home and /about/)

| Measurement requested | Result |
|---|---|
| Screenshots (desktop/mobile, several scroll positions), video | **unavailable**: `page.goto: net::ERR_TUNNEL_CONNECTION_FAILED` (proxy 403) |
| HAR / request log, resource types, sizes, formats, compression, cache headers, CDN hints, waterfall | **unavailable** |
| Canvas count, sizes, positioning, scroll container, scroll-jacking | **unavailable** |
| WebGL context type, extensions, max texture size, programs, draws/frame, FBO passes | **unavailable** |
| three.js version, GSAP/Lenis, bundle sizes, workers, wasm | **unavailable** |
| Performance metrics, trace, frame times, long tasks, heap, FCP/LCP, cold vs warm | **unavailable** |
| Reduced-motion diff, keyboard nav, headings, alt text, no-WebGL behaviour | **unavailable** |
| Mobile adaptation | **unavailable** |

Attempts: `curl` → `CONNECT tunnel failed, response 403`; Chromium (Playwright, proxy from `HTTPS_PROXY`) → `net::ERR_TUNNEL_CONNECTION_FAILED` for all 8 runs (2 URLs × 4 variants); WebFetch → `getaddrinfo ENOTFOUND lusion.co`. Proxy status endpoint: `connect_rejected … gateway answered 403 to CONNECT (policy denial or upstream failure)` for `lusion.co:443` and `webgl-scroll-sync.lusion.co:443`. No bypass was attempted.

To collect these numbers on a machine with normal egress and a GPU:

```bash
npm i playwright@1.56.1          # in any folder; the script resolves playwright from the CWD
node scripts/research/capture-reference.mjs /tmp/lusion-capture            # defaults: lusion.co/ and /about/
node scripts/research/capture-reference.mjs /tmp/lusion-capture --save-shaders --save-bodies   # private analysis only
```

Keep the output outside the repository: it contains third-party screenshots, video, HAR, shaders and bundles.

---

## 3. Lusion WebGL-Scroll-Sync demo (local copy): main results

Setup: the cloned repo's `src/` and `public/` served as data by a small Node static server, which imitates Vite's `?raw` shader import and resolves `three` to `three@0.161.0` through an import map. Mode: "fixed with padding" (the demo's default). Scripted scroll: 5 checkpoints × 1200 px, as 100 px wheel steps every 40 ms on desktop, or touch swipes of about 45% of the viewport on mobile. Then back to the top, then keyboard keys (desktop and reduced only).

| Metric | desktop | mobile | reduced motion | WebGL blocked |
|---|---|---|---|---|
| Viewport (CSS) @DPR | 1440×900 @1 | 390×844 @3 | 1440×900 @1 | 1440×900 @1 |
| Canvas drawing buffer | 1440×1350 | **1170×3798** | 1440×1350 | 300×150 (never initialised) |
| TTFB (ms) | 5.5 | 2.4 | 3.8 | 4.0 |
| DOMContentLoaded = load (ms) | 111 | 103 | 159 | 133 |
| FCP (ms) | 80 | 52 | 76 | 104 |
| LCP (ms) / element | 80 / `h1#header__title01` | 52 / `h2#header__title02` | 76 / `h1` | 104 / `h1` |
| CLS | 0.143 | 0 | 0.143 | 0.143 |
| Requests | 16 | 16 | 16 | 8 |
| Transfer / decoded (bytes) | 880,261 / 1,919,940 | same | same | 300,335 / 1,341,648 |
| Idle: ≈fps; dt p50/p95/p99 (ms) | 53.3; 16.7/33.3/33.4 | 7.6; 133/217/267 | 51.0; 16.7/33.4/50 | 59.7; 16.7/16.7/16.8 |
| Scrolling: ≈fps; dt p50/p95/p99 (ms) | 16.4; 50/117/167 | 3.2; 317/417/483 | 13.6; 67/133/200 | 59.8; 16.7/16.8/16.8 |
| Scrolling: frames >33.4 ms / >50 ms | 234 / 145 of 278 | 497 / 497 of 497 | 230 / 182 of 261 | 1 / 0 of 556 |
| Draw calls/frame (idle) p50/p95/max | 0/0/0 | 1/1/1 | 0/0/0 | 0 |
| Draw calls/frame (scrolling) p50/p95/max | 3/5/7 | 3/3/3 | 3/5/7 | 0 |
| `renderer.render()` calls/frame | 1 | 1 | 1 | 0 |
| rAF registrations/frame | 1 | 1 | 1 | n/a |
| Framebuffer binds/frame | 0 | 0 | 0 | 0 |
| Long tasks: count / max / sum (ms) | 291 / 181 / 20,449 | 1196 / 570 / 335,712 | 354 / 235 / 28,710 | 0 / 0 / 0 |
| Trace `FireAnimationFrame` p50/p95/p99 (ms) | 0.22 / 0.73 / 4.83 | 0.22 / 0.88 / 5.21 | not traced | not traced |
| Trace main-thread tasks > 50 ms | 170 | 499 | not traced | not traced |
| Trace `GPUTask` total (ms) | 14,604 | 145,817 | not traced | not traced |
| JS heap used, CDP (bytes) | 4,218,628 | 3,920,220 | 4,125,112 | 3,181,640 |
| DOM nodes | 384 | 376 | 387 | 373 |
| Reversibility (mean abs pixel diff, first frame vs back-at-top) | 0.00 | 0.22 | 0.00 | 0.00 |

**Reading the table:**

- **The JavaScript is cheap.** rAF callbacks take 0.22 ms at p50. Frame time is dominated by the GPU work, which here is SwiftShader rasterising on the CPU (`GPUTask` 14.6 s on desktop). With WebGL blocked, the same page holds 59.8 fps with zero long tasks.
- **Fill rate is the cost driver.** Idle desktop (0 draws, just clearing 1.94 MP) runs about 53 fps. Scrolling (3 large textured quads with a 5-tap glitch shader) drops to about 16 fps. Mobile at DPR 3 renders **4.44 MP per frame** (1170×3798, because the demo uses the raw `devicePixelRatio` and a 1.5× height) and drops to about 3–8 fps. The *ratio* is what matters: 2.3× the pixels of desktop gave about 6–8× worse frame time here (scrolling dt p50 50 → 317 ms; idle 16.7 → 133 ms). On real phones the ratio differs, but uncapped DPR × padding is a real risk.
- **The demo renders every frame**, even with nothing visible (idle desktop: 1 `render()`, 0 draws, a clear only). There is no render-on-demand.
- **CLS 0.143 on desktop.** Font swap (`font-display: swap`) on 170 px headings shifts layout once. On mobile the headline sizes differ and CLS was 0.
- **Without WebGL, the 8 images are never requested** (8 requests instead of 16). They exist only as `<noscript>` fallbacks, and `init()` throws before `TextureLoader` runs.
- **Reversibility.** Scrolling to the bottom (4,710 px on desktop; 6,000 px of wheel input was sent) and back to the top reproduced the first frame exactly on desktop. Mobile's 0.22 mean difference covers 0.3% of pixels (the glitch effect's random seeds).

### 3.1 Payload composition (intrinsic to the demo)

| Type | Count | Transfer (bytes) | Decoded (bytes) | Notes |
|---|---|---|---|---|
| Document | 1 | 1,889 | 6,561 | |
| Stylesheet | 2 | 3,688 | 14,067 | reset + style |
| Script | 4 | 263,574 | 1,290,040 | `main.js`, two shader `?raw` modules (411 B and 1,214 B), unminified `three.module.js` r161 (1.29 MB). In Lusion's real Vite build three would be minified and tree-shaken; `three.module.min.js` r161 gzips to 167,827 B |
| Font | 1 | 31,184 | 30,980 | WOFF2 (Boldonse) |
| Image | 8 | 579,926 | 578,292 | WebP (VP8), all 1024×1536, 31.7–133.7 KB each |
| **Total** | **16** | **880,261** | **1,919,940** | all requested within the first second |

- **GPU memory (calculated):** 8 textures × 1024×1536×4 B × 4/3 for mips ≈ **67 MB**, against 0.58 MB downloaded.
- **WebGL calls at init:** `createTexture` 12, `texStorage2D` 8, `texSubImage2D` 8, `generateMipmap` 8, `createProgram` 1, `createShader` 2, `createBuffer` 4, `createVertexArray` 1.
- **Main-thread image decode:** 8 `Decode Image` trace events, 110 ms total.

### 3.2 Cold vs warm (same browser context, desktop)

| | Cold | Warm |
|---|---|---|
| Requests | 16 | 16 |
| Served from HTTP cache | 0 | **10** (the `immutable` ones) |
| Transfer (bytes) | 880,261 | **9,570** |
| `load` event (ms after navigation start) | 111 | 112 |
| FCP (ms) | 80 | 140 |

Warm FCP isn't better here because loopback makes transfer free and the variance of SwiftShader frame scheduling dominates. The transfer reduction is the meaningful number.

### 3.3 Composition and accessibility observations (same runs)

| Check | Observation |
|---|---|
| Canvases | 1 × WebGL2 (`antialias:true, alpha:true, depth, stencil, premultipliedAlpha, powerPreference:"default"`), `position:absolute`, `z-index:-1`, `pointer-events:none`, `transform: matrix(1,0,0,1,0,-225)` at `scrollY = 0` (−211 on mobile) |
| Scroll container | native: `scrollingElement = html`, `body` `overflow: hidden/auto`, document height 5610 px (desktop) |
| Scroll/input listeners | only `resize` on `window`: no wheel, touch or scroll handlers, so no scroll-jacking |
| Workers / WebAssembly | none / none |
| Keyboard | Tab order starts with 5 off-screen overlay links (`inViewport: false`), then the visible "GitHub" link. `:focus-visible` matches but the outline is `none 0px`. PageDown/Space/ArrowDown/End scrolled 0 → 4710 px |
| Headings | `h2` (hidden overlay) before `h1` in DOM order; no `main`/`nav` landmarks; `lang="en"` |
| Images | 0 `<img>` in the JS-enabled DOM (all inside `<noscript>`), so WebGL-drawn images have no text alternative |
| Reduced motion | screenshot diff vs normal at three positions: mean abs 0.00 / 0.08 / 0.17, i.e. no behavioural difference (preference ignored) |
| No WebGL | `THREE.WebGLRenderer: Error creating WebGL context.` + uncaught `Error`; image frames render empty (diff vs normal at the top = 0.01, because no image is in the first viewport) |
| Mobile | same JS path; CSS single-column layout below 1024 px; DPR not capped |

---

## 4. Synthetic voxel benchmark (validates the instrumentation)

This is **not Lusion code**. It is a page I wrote: three r161, 8,000 `BoxGeometry` instances, `MeshStandardMaterial`, ACES tone mapping, progress = native scroll fraction, DPR cap 1.5 (1 here). Desktop 1440×900, same machine and settings.

| Variant | ≈fps (scroll) | draws/frame | instanced draws × instances | buffer bytes uploaded/frame | FB binds/frame | `renderer.render()`/frame | rAF script p50 / p95 (ms) | programs |
|---|---|---|---|---|---|---|---|---|
| CPU: `setMatrixAt` × 8000 + `needsUpdate` | 3.5 | 1 | 1 × 8000 | **512,000** | 0 | 1 | **0.47 / 1.77** | 1 |
| GPU: static attributes + `onBeforeCompile` vertex animation | 3.4 | 1 | 1 × 8000 | **0** | 0 | 1 | **0.23 / 0.46** | 1 |
| GPU + `EffectComposer` (MSAA×4 HalfFloat) + `UnrealBloomPass` + `OutputPass` | 1.6 | **15** | 1 × 8000 | 0 | **21** | **15** | 0.49 / 1.76 | 10 |

**Post chain reconstructed by the instrumentation** (per-frame sequence of render targets and viewports):

```
fb14 1440×900 MSAA×4 HalfFloat  ← scene (1 draw)
fb3  720×450                     ← bright pass
fb4/fb5 720×450 → fb6/fb7 360×225 → fb8/fb9 180×113 → fb10/fb11 90×57 → fb12/fb13 45×29   (H+V blur per mip)
fb4  720×450                     ← composite
fb14 1440×900                    ← additive copy back
screen 1440×900                  ← OutputPass (ACES_FILMIC_TONE_MAPPING + SRGB_TRANSFER defines detected)
```

Plus 4 `renderbufferStorageMultisample(samples=4)` calls: `EffectComposer` cloned the MSAA target, doubling MSAA storage.

**Takeaways:**
- With 8,000 instances, CPU matrix updates cost 64 B × N of upload per frame and about 2× the rAF script time. Both scale linearly with N: about 1.28 MB per frame at 20k voxels.
- GPU-driven animation has zero upload and is reversible.
- A stock bloom stack multiplies draws (1 → 15) and framebuffer switches (0 → 21), and halved throughput on this fill-rate-bound rasteriser.

Under SwiftShader the 8,000 lit cubes, about 96,000 triangles, dominate everything, which is why CPU and GPU variants show the same fps. On a real GPU the CPU variant's JS and upload cost would be the visible difference.

---

## 5. Attempted: WebGL-vs-DOM drift under main-thread jank

**Goal.** Reproduce the README's claim: with a `fixed` canvas, compositor-thread scrolling during main-thread work makes WebGL lag behind DOM; with the `absolute` canvas it doesn't.

**Method.** For each of the demo's 3 modes:
1. scroll to y = 1550;
2. start a 2.5 s busy loop on the main thread;
3. 300 ms later, send a CDP `mouseWheel` (deltaY 240) without waiting;
4. 600 ms later, take a CDP screenshot;
5. analyse one pixel column to locate the DOM border (mint `#82e7c2`) against the WebGL image rows.

| Mode | wheel ack (ms after send) | screenshot returned (ms) | border row / image start row in screenshot | `scrollY` after jank |
|---|---|---|---|---|
| fixed with padding (absolute canvas) | ~2,430 | ~2,430 | 192 / 200 | 1790 |
| fixed without padding (absolute canvas) | ~2,400 | ~2,400 | 192 / 200 | 1790 |
| no fix (`position: fixed`) | ~2,415 | ~2,415 | 192 / 200 | 1790 |

**Result: inconclusive.** In headless Chromium (both headless-shell and `channel: "chromium"` new headless), the CDP input and the screenshot were both serviced only after the main thread was free. The screenshot showed the *pre-scroll* state, and the scroll was applied afterwards (1550 → 1790). The compositor-only scroll the effect depends on could not be observed. **Unverified here.** Next step: a headed Chrome on real hardware (or a phone), with a screen recording during a forced long task.

---

## 6. Limits of these measurements

- **SwiftShader.** GPU-bound numbers (fps, frame dt, `GPUTask`, long tasks caused by GL work) are not representative of any real device. Use them only for A/B comparisons in this environment.
- **Instrumentation overhead.** Every WebGL call is wrapped, adding small CPU costs, and three's `render()` is wrapped for per-pass bookkeeping.
- **Headless input.** Wheel and touch input is synthetic, and headless Chromium doesn't exercise compositor-thread scrolling the way a real browser does (§5).
- **Local server.** Transfer sizes include my server's gzip (text) and headers. Caching behaviour reflects my headers, and HTTP/1.1 on loopback has no latency.
- **Single run per variant.** No repetitions, so no confidence intervals. Frame distributions come from 200–1200 frames per phase.
- **Not measured at all:** real-device GPU frame time (needs `EXT_disjoint_timer_query_webgl2`, not exposed by SwiftShader), battery and thermal behaviour, Safari/Firefox, lusion.co anything.

## 7. Reproduce

```bash
# scratch folder (outside the repo)
mkdir -p ~/scratch/lusion && cd ~/scratch/lusion && npm init -y && npm i playwright@1.56.1
git clone --depth 1 https://github.com/lusionltd/WebGL-Scroll-Sync demo   # MIT
# serve demo/src + demo/public with any static server that maps `*.vert?raw` to `export default "<text>"`
# and adds an import map for "three" (or simply run the demo's own `npm i && npm run dev`)
node /path/to/mysite/scripts/research/capture-reference.mjs ./out --url http://127.0.0.1:4173/ --segments 5 --segment-px 1200
cat out/summary.json
```

Output per URL and variant:
- `result.json`: everything summarised: DOM, network, frames, trace summary, WebGL and three.js probes, keyboard, comparisons;
- `frames.json`: per-frame counters;
- `requests.json` and `network.har`;
- `trace.json`;
- `scroll-NN.png`, `return-top.png` and `scroll.webm`;
- `aria-snapshot.yml`;
- `shaders-meta.json` (or `shaders-full.json` with `--save-shaders`).

## Sources

All accessed 2026-10-09.

- Lusion WebGL-Scroll-Sync (MIT): https://github.com/lusionltd/WebGL-Scroll-Sync , demo https://webgl-scroll-sync.lusion.co/ (blocked; run locally)
- lusion.co: https://lusion.co/ , https://lusion.co/about/ (blocked)
- Playwright 1.56.1 (npm), Chromium 141.0.7390.37 (revision 1194)
- three.js r161 (`three@0.161.0`, npm) used by both local targets
- Method details: [LUSION_DEEP_TECHNICAL_ANALYSIS.md §1](./LUSION_DEEP_TECHNICAL_ANALYSIS.md#1-method)
