# Interaction Engineering: scroll, pointer, keyboard, motion

> Research for POKO GENESIS, written 2026-10-09. Part of the Lusion study ([overview](./LUSION_DEEP_TECHNICAL_ANALYSIS.md)).
> Primary sources read directly:
> - `lusionltd/WebGL-Scroll-Sync` (MIT © 2025 Lusion Ltd), commit `d2f2c84`;
> - GSAP `ScrollTrigger.js` from npm `gsap@3.15.0` ("Standard no-charge license");
> - Lenis `lenis@1.3.26` (MIT © 2024 darkroom.engineering);
> - the three.js manual page *Multiple Canvases, Multiple Scenes* (repo `manual/pages/multiple-scenes.html`, MIT).
>
> gsap.com, threejs.org and the live Lusion demo were blocked from this sandbox, so the shipped source code was read instead.

---

## 1. The three scroll models

```
                 ┌───────────────────────────── main thread ─────────────────────────────┐
 NATIVE          │ rAF: read scrollY → progress → render                                  │
 (browser owns   │                         ▲ (value may be up to 1 frame stale)           │
  scrolling)     └─────────────────────────┼──────────────────────────────────────────────┘
                 compositor thread: wheel/touch → scroll offset → composite DOM layers immediately

 VIRTUAL         wheel/touch (preventDefault, non-passive) → target += delta
 (JS owns        rAF: current = damp(current, target) → translate3d(content, -current) → render
  scrolling)     body { overflow:hidden }  — DOM and WebGL move in the same frame (always in sync)

 HYBRID (Lenis)  wheel (preventDefault) → target += delta
                 rAF: current = damp(current, target) → window.scrollTo(current) → native scroll position
                 keyboard / scrollbar / find-in-page still use native scroll
```

| | Native | Virtual (transform) | Hybrid (Lenis-style) |
|---|---|---|---|
| DOM↔WebGL sync | can drift ≤ 1 frame unless canvas tricks (§4) | perfect (same frame) | perfect while smoothing, native otherwise |
| Feels like the OS | yes (momentum, overscroll, accessibility settings) | no (custom inertia) | wheel: no; touch: yes unless `syncTouch` |
| Keyboard, find-in-page, anchors, scrollbar | work | must be re-implemented | mostly work |
| `position: sticky` | works | breaks (content is transformed) | works |
| Main-thread jank | scroll stays smooth | scroll freezes | wheel scroll freezes |
| Cost | none | full-page transform every frame | `scrollTo` every frame |

Lusion's README calls this out directly: scroll-jacking is popular on award sites (including theirs) because it "solves a key synchronization issue — especially on mobile". Their open demo shows how to keep native scroll and still avoid drift (§4). **Recommendation for POKO:** native scroll, plus a deterministic progress mapping, plus smoothing applied only to the *visual* progress.

---

## 2. Scroll → progress: the mapping math

### 2.1 Measure once, compute every frame

Layout reads (`getBoundingClientRect`, `offsetTop`) force style and layout. Do them **only on resize or content change**, cache document-space offsets, and compute progress each frame from `scrollY` alone. Lusion's demo does exactly this: `updateItemPositions()` runs from `resize` and `ResizeObserver`, and the per-frame loop only reads `window.scrollY`.

```ts
// Original snippet (POKO research). Document-space ranges, measured on resize.
type Range = { start: number; end: number };

function measureSection(el: HTMLElement, vh: number, enterAt = 1, leaveAt = 0): Range {
  const r = el.getBoundingClientRect();
  const top = r.top + window.scrollY;           // document coordinates
  return {
    start: top - vh * enterAt,                  // section top touches viewport bottom (enterAt = 1)
    end: top + r.height - vh * leaveAt,         // section bottom touches viewport top (leaveAt = 0)
  };
}

const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
const progressOf = (y: number, { start, end }: Range) => clamp01((y - start) / Math.max(1, end - start));
```

For a **pinned stage** (a `position: sticky` 100vh element inside a tall section), use `enterAt = 0, leaveAt = 1`. Progress then runs 0→1 while the stage is stuck, which is exactly ScrollTrigger's `start: "top top", end: "bottom bottom"`.

### 2.2 One global progress, many acts

POKO's narrative is a single timeline, so use one global `P ∈ [0,1]` and derive each act's local progress from it:

```ts
// Original snippet. Acts are fixed fractions of the global timeline.
const ACTS = { intro: [0.0, 0.12], disintegrate: [0.12, 0.3], portal: [0.3, 0.42],
               projects: [0.42, 0.85], rebuild: [0.85, 1.0] } as const;
const local = (P: number, [a, b]: readonly [number, number]) => clamp01((P - a) / (b - a));
```

Alternatively, derive each act from its own DOM section (§2.1). That keeps text and visuals aligned when content length changes. Either way, the mapping is a **pure function of `scrollY`**.

### 2.3 Mobile viewport height

On mobile, `innerHeight` changes as the URL bar collapses, which would rescale every range mid-gesture. Mitigations:
- size sections in `lvh`/`svh` CSS units so layout doesn't change;
- recompute ranges only when **width** changes, or when the height change exceeds a threshold;
- base the WebGL canvas size on `lvh` plus a little padding rather than tracking every `innerHeight` change.

---

## 3. Smoothing that is frame-rate independent

### 3.1 Why `x += (target − x) * 0.1` is wrong

That update removes 10% of the remaining distance **per frame**. After 100 ms:

| Refresh rate | Frames in 100 ms | Remaining distance |
|---|---|---|
| 60 Hz | 6 | 0.9⁶ = **0.531** |
| 120 Hz | 12 | 0.9¹² = **0.282** |

A 120 Hz display therefore feels twice as "tight". Physically, smoothing should solve the ODE `dx/dt = k·(target − x)`. Over a step `dt` with constant target, its exact solution is:

```
x(t+dt) = target + (x(t) − target)·e^(−k·dt)
        = lerp(x, target, 1 − e^(−k·dt))
```

Useful conversions:
- **Half-life** `h` (time to halve the error): `k = ln 2 / h`.
- From a legacy per-frame factor `α` at reference rate `f`: `k = −ln(1 − α)·f`. For α = 0.1 at 60 Hz, k ≈ 6.32 s⁻¹, about 110 ms half-life.

Lenis implements exactly this (MIT © darkroom.engineering, `lenis@1.3.26` `dist/lenis.mjs`):

```js
function damp(x, y, lambda, deltaTime) {
	return lerp(x, y, 1 - Math.exp(-lambda * deltaTime));
}
// ...and in Animate.advance(): this.value = damp(this.value, this.to, this.lerp * 60, deltaTime);
```

With the default `lerp = 0.1`, `λ = 6`, which is close to the 6.32 equivalent above. Lusion's demo uses the same form for decay: `strength *= Math.exp(-dt * 10)`.

```ts
// Original snippet: frame-rate independent smoothing with settle detection (for render-on-demand).
export function damp(current: number, target: number, k: number, dt: number) {
  return target + (current - target) * Math.exp(-k * dt);
}
export function smoothProgress(s: { v: number }, target: number, dt: number, k = 8, eps = 1e-4) {
  s.v = damp(s.v, target, k, Math.min(dt, 1 / 20)); // clamp dt: a backgrounded tab must not teleport
  const settled = Math.abs(s.v - target) < eps;
  if (settled) s.v = target;
  return settled; // when true (and nothing else animates) you can stop rendering
}
```

### 3.2 Critically damped spring: smoothing with continuous velocity

Exponential smoothing has a velocity **discontinuity** whenever the target jumps: the velocity is instantly `k·(target − x)`. For a camera, or for Poko's head tracking the pointer, a second-order system feels better:

```
x'' = −ω²(x − target) − 2ω·x'        (critically damped: ζ = 1, no overshoot)
```

Its exact solution over `dt`, with constant target, is (`c = x − target`):

```
x(t) = target + (c + (v + ω c)·t)·e^(−ω t)
v(t) = (v − ω (v + ω c)·t)·e^(−ω t)
```

```ts
// Original snippet: exact critically damped step (stable for any dt).
export function springStep(s: { x: number; v: number }, target: number, omega: number, dt: number) {
  const c = s.x - target;
  const j = s.v + omega * c;
  const e = Math.exp(-omega * dt);
  s.x = target + (c + j * dt) * e;
  s.v = (s.v - omega * j * dt) * e;
}
// From rest the remaining error is (1 + ωt)·e^(−ωt): ωt = 4 → 91% settled, 5 → 96%, 6 → 98%.
// So omega ≈ 6 / settleTime gives ~98% settled after settleTime seconds.
```

| | Exponential (1st order) | Critically damped (2nd order) | Under-damped spring |
|---|---|---|---|
| Overshoot | none | none | yes (bouncy) |
| Velocity continuity | no | yes | yes |
| Lag behind steady scroll | `v/k` | `2v/ω` | depends |
| Use in POKO | visual progress | camera, look-at, pointer follow | playful UI only, never for progress |

### 3.3 Smooth the progress, not the scroll

Keep the scroll position native and **un-smoothed** (the user's input). Smooth the *derived* visual progress `P̃ = damp(P̃, P, k, dt)`. All animation then reads `P̃`. This keeps keyboard, scrollbar and assistive tech intact, and it is how a "scrub with lag" (ScrollTrigger `scrub: 1`) works without hijacking.

---

## 4. WebGL-Scroll-Sync explained

Source: `src/js/main.js`, `src/shaders/img.vert`, `src/shaders/img.frag`, `src/css/style.css` (MIT © 2025 Lusion Ltd). Short quotations below are under that license.

### 4.1 The problem

A `position: fixed` full-screen canvas that redraws 3D objects at `domRect − scrollY` every rAF is **one frame late** whenever the compositor thread scrolls between two rAFs. Chromium and Safari scroll on the compositor when no blocking (non-passive) wheel or touch listener is registered. DOM layers move immediately, but the canvas contents only change when the main thread renders the next frame, so the WebGL images "swim" relative to their DOM borders. The three.js manual describes the same symptom: "the position of the scenes drawn into the canvas will lag behind the rest of the page".

### 4.2 The trick

Make the canvas **scroll with the document** (`position: absolute` inside the page), and every rAF translate it so it covers the current viewport:

```css
#wrapper { position: relative; overflow: hidden; }
#canvas  { pointer-events: none; position: absolute; left: 0; z-index: -1; }
html.no-fix #canvas { position: fixed; top: 0; }       /* the "naive" mode, for comparison */
```

```js
// main.js (MIT © Lusion): every frame
scrollOffset.set(window.scrollX, scrollY - viewportHeight * padding);
canvas.style.transform = `translate(${scrollOffset.x}px, ${scrollOffset.y}px)`;
```

If the compositor scrolls by Δ before the next rAF, the canvas moves by Δ *with* the DOM, so what is already drawn stays glued to its boxes. The only artefact is that up to Δ pixels at the top or bottom edge of the viewport are not covered by the canvas (clipping). The three.js manual calls this tradeoff "only the edges of the window will show some un-rendered bits for a moment".

### 4.3 Padding: buying scroll headroom with pixels

With `padding = 0.25`, the canvas is `1.5 × innerHeight` tall and starts `0.25·vh` above the viewport. Clipping only becomes visible if the page scrolls more than `0.25·vh` between two rendered frames: 225 px at vh = 900, which is **13,500 px/s at 60 fps**. The price is 1.5× the pixels per frame. Measured: 1440×1350 desktop, and 1170×3798 on a DPR-3 phone, because the demo does not cap DPR. The README suggests the cheaper alternative: render a viewport-sized framebuffer and fade the edges.

### 4.4 Walking through the code

| Step (function) | What it does | Why it matters |
|---|---|---|
| `requestAnimationFrame(init)` | waits one frame before init | CSS custom properties are resolved before `getComputedStyle(--color-background)` |
| `setupThreeJS()` | `new THREE.Camera()` (identity), `WebGLRenderer({antialias:true})`, one `PlaneGeometry(1,1)` | No projection math: the vertex shader writes clip space directly |
| `createImageMeshes()` | one `Mesh` + `ShaderMaterial` per `.image` div; shared uniforms by reference (`u_resolution`, `u_scrollOffset`, `u_time`, `u_strength`); `frustumCulled = false` | Uniform objects shared between materials update all meshes at once; three's frustum culling is meaningless with an identity camera |
| `onResize()` (resize + ResizeObserver) | `canvasHeight = vh·(1+2·padding)`; `renderer.setSize(w·dpr, h·dpr)` then override CSS size; caches each box's document-space `x, y, w, h` | All layout reads happen here, never per frame |
| `animate()` | reads `scrollY`, computes `dt`, updates strength and uniforms, moves the canvas, culls, renders | The only per-frame DOM write is one `transform` (composite-only, no layout) |
| `updateStrength()` | `strength *= exp(−10·dt); strength += min(|Δscroll|·10/vh, 5)` | Scroll velocity drives the glitch. The decay is frame-rate independent; the impulse is per frame, so it is not |
| `updateMeshes()` | `u_domXY = (x, y)`; re-randomises `u_rands` with probability `1 − exp(−25·dt·(1+strength))`; `visible = box overlaps [canvasTop, canvasBottom]` | Poisson-style random refresh (frame-rate independent); pixel-space culling |
| `img.vert` | `pixelXY = domXY − scrollOffset + domWH/2; y flipped; += position.xy·domWH; clip = pixel/resolution·2−1` | Converts a DOM rect to clip space exactly. `resolution` is the canvas (not viewport) size, which already includes the padding |
| `img.frag` | white-noise per pixel + band-quantised random UV offset, 5 taps, brightness `1 + 2·strength` | The effect strength follows scroll speed |

The vertex shader in full is five lines (MIT © Lusion):

```glsl
vec2 pixelXY = u_domXY - u_scrollOffset + u_domWH * 0.5;
pixelXY.y = u_resolution.y - pixelXY.y;
pixelXY += position.xy * u_domWH;
vec2 xy = pixelXY / u_resolution * 2. - 1.;
gl_Position = vec4(xy, 0., 1.0);
```

Small things I noticed reading it (not bugs that matter for a demo):
- `itemList` entries are created with `top`, but `y` is what is later written and read;
- a `new THREE.Vector4` is allocated on every random refresh (GC churn in a hot loop);
- `setSize(w·dpr, h·dpr)` with the renderer's pixel ratio left at 1, which is why `renderer.getPixelRatio()` reports 1 while the buffer is 3× on mobile.

### 4.5 What I could and couldn't verify

- **Measured (E1):** in "fixed with padding" mode the canvas is `absolute`, `transform: matrix(1,0,0,1,0,−225)` at `scrollY = 0` on desktop (−211 on 844-px mobile). Draw calls go 0 → 7 as boxes enter the padded window. Scrolling down and back to the top reproduced the first frame pixel-exactly (mean absolute difference 0.00).
- **Not verified:** the drift itself. I tried to show it by blocking the main thread for 2.5 s, injecting a wheel event through CDP and screenshotting mid-jank, in all three modes. Headless Chromium (both headless-shell and new headless) delivered the wheel ack about 2.35–2.45 s later and produced the screenshot only after the busy loop, so compositor-only scrolling never showed up. Seeing the effect needs a headed browser on real hardware, ideally a phone and a screen recording. The mechanism is well established (README, three.js manual, compositor-thread scrolling), but my run did not reproduce it.

---

## 5. GSAP ScrollTrigger internals vs a hand-rolled mapper

Read from `gsap@3.15.0/ScrollTrigger.js`. Facts:

1. **Positions are measured in `refresh()`.** `start` and `end` are resolved to scroll offsets (layout reads, pin-spacer insertion) on load and resize, then cached. `change = end − start`.
2. **Progress is a clamp.** In `self.update()`:

   ```js
   p = reset ? 0 : (scroll - start) / change,
   clipped = p < 0 ? 0 : p > 1 ? 1 : p || 0,
   ```

3. **`scrub: true`** sets `animation.totalProgress(clipped)` directly: playhead = progress, no smoothing.
4. **`scrub: <number>`** creates **one paused tween** on the animation's `totalProgress` with `ease: "expo"` and `duration = scrub`. Every update re-targets it with `scrubTween.resetTo("totalProgress", clipped, …)`. The smoothing is therefore "restart an expo-out tween of fixed duration from the current value toward the new target". That is *not* a first-order exponential filter, but it behaves similarly: fast start, long tail, roughly frame-rate independent because tweens are time-based.
5. **Update scheduling.** A `scroll` listener calls `_updateAll()` *synchronously* inside the scroll event. The code comments that Safari needs this. With `normalizeScroll`, updates are batched to the next rAF instead. When scrolling up (`_direction < 0`) the triggers are iterated in reverse, so callbacks fire in a sensible order.
6. **`anticipatePin`** predicts the pin moment from recent scroll velocity, because "most browsers do scrolling on a separate thread (not synced with requestAnimationFrame)". This is the same root cause Lusion's README describes.
7. **Snapping** waits for low velocity, then tweens the scroll position, with an inertia-based duration clamp.

| Concern | ScrollTrigger | Hand-rolled (this doc) |
|---|---|---|
| Measuring ranges | automatic, `refresh()` on resize, handles pins | you own it (ResizeObserver, §2.1) |
| Pinning | pin spacers, `pinSpacing`, `anticipatePin` | CSS `position: sticky` in a tall section (no JS) |
| Scrub smoothing | re-targeted expo tween | explicit `damp` or spring per frame (§3) |
| Determinism | progress is pure; scrubbed tweens are pure functions of playhead | pure by construction |
| DOM choreography (text reveals, class toggles) | excellent | write it yourself |
| WebGL uniforms from progress | possible (tween a proxy object) | trivial |
| Bundle | `gsap.min.js` 72.9 KB + `ScrollTrigger.min.js` 44.6 KB (28.3 + 18.0 KB gzip -9; measured from the npm 3.15.0 `dist/`) | ~1 KB |

**For POKO:** use CSS sticky plus a hand-rolled mapper for the WebGL timeline, since it must be deterministic, smoothed per frame and cheap. Bring in GSAP only if heavy DOM choreography is wanted. If so, drive WebGL from the *same* progress source rather than from GSAP tweens, so there is one source of truth.

---

## 6. Reversibility and determinism

**Rule:** every visual quantity `V` is `V = f(P̃, staticData) + g(t)·m`, where:
- `f` is a pure function of smoothed progress and baked data;
- `g(t)` is an optional bounded *time* layer (idle wobble, sparkles) that never accumulates;
- `m` is that layer's amplitude, forced to 0 under reduced motion.

What breaks determinism:
- **integrators** (`pos += vel·dt`) and GPGPU feedback loops: the result depends on the path and speed of scrolling;
- `Math.random()` at runtime;
- events fired on threshold crossing that mutate state ("onEnter: start explosion");
- tweens started by scroll events with their own clock.

What preserves it:
- **Closed-form motion:** `pos_i(P) = mix(home_i, target_i, ease(local(P, delay_i)))`, plus an analytic offset such as `curl(seed_i + P·k)·amp(P)`. That is noise *sampled* at a progress-dependent coordinate, not integrated.
- **Baked simulations** (cloth, shatter, flocking) stored as keyframes or textures and sampled at `t = P·T`. This is what Lusion did in 2019 with Houdini VAT/ArrayBuffers.
- **Seeded PRNG** at load time (e.g. mulberry32 seeded by voxel index).
- **Animation clips** sampled by setting time from progress: `mixer.setTime(P * clip.duration)`, or `action.time = …` followed by `mixer.update(0)`.

```ts
// Original snippet: a pure evaluate() — the whole scene state from one number.
export function evaluate(P: number) {
  const d = local(P, ACTS.disintegrate), o = local(P, ACTS.portal), r = local(P, ACTS.rebuild);
  return {
    pokoPoseTime: local(P, ACTS.intro) * 2.0,           // seconds into the "wave" clip
    scatter: d * (1 - r),                               // voxel scatter amount
    portalOpen: smoothstep(0, 0.4, o) * (1 - smoothstep(0.6, 1, o)),
    projectIndex: Math.min(5, Math.floor(local(P, ACTS.projects) * 6)),
    rebuild: r,
  };
}
const smoothstep = (a: number, b: number, x: number) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
```

**Test:** render at `P = 0.37` after scrolling down, and again after scrolling up from the bottom; the images must match. The capture script automates a version of this (`reversibility` = pixel diff between the first frame and the frame after returning to the top). Lusion's demo scored 0.00 mean absolute difference.

---

## 7. Pointer → NDC → raycast

```ts
// Original snippet. Canvas may be larger than the viewport (padding) — always use its own rect.
const ndc = new THREE.Vector2();
function toNDC(e: PointerEvent, canvas: HTMLCanvasElement) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1));
  return ndc;
}
window.addEventListener('pointermove', (e) => { pointer.target.copy(toNDC(e, renderer.domElement)); }, { passive: true });
```

- **Do not raycast every frame against 20k instances.** `Raycaster` on an `InstancedMesh` tests every instance (it returns `instanceId`, but at O(N) cost). Better options:
  1. a proxy collider (sphere or box around Poko), then refine only if needed;
  2. ray against a plane at Poko's depth for "look at cursor";
  3. for voxel picking, an analytic **grid traversal** (Amanatides & Woo, 1987): step the ray cell by cell through the voxel grid using `tMax`/`tDelta` per axis and stop at the first occupied cell. That is O(cells crossed), not O(N).
- **Smooth the pointer target** with the spring from §3.2 so Poko's head turns organically, and decay to a rest pose when the pointer leaves.
- **Coalesced events** (`e.getCoalescedEvents()`) only matter for drawing interactions; for look-at, the latest sample per frame is enough.
- Keep the canvas `pointer-events: none` (as Lusion does) so DOM text stays selectable and links stay clickable. Listen on `window`.

## 8. Touch

- Listeners are **passive**; never `preventDefault` on `touchmove`, or native scrolling is lost.
- Use `touch-action: pan-y` on interactive overlays that need horizontal drags.
- No hover on touch. Map "pointer follow" to the last touch point and let it decay back. Expose any hover-only information in text.
- Treat a press under ~10 px movement and ~300 ms as a tap; above that it is a scroll. Don't start interactions on `pointerdown` alone.
- iOS momentum scrolling updates `scrollY` during the fling, so a rAF loop reading `scrollY` keeps up. Don't rely on `scroll` events to drive rendering.

## 9. Keyboard

Native scroll gives PageUp/PageDown, Space, arrow keys and Home/End for free. Measured on Lusion's demo: these keys reached the bottom (`scrollY` 0 → 4710).

For POKO, add:
- a **skip link** and per-act anchors (`<a href="#projects">`) with `scroll-margin-top`;
- a visible project list (real `<a>`/`<button>` elements). Activating one scrolls to its section, and the WebGL state follows automatically because state = f(progress);
- `:focus-visible` outlines. Lusion's demo removes outlines (`a { outline: none }`) and lets hidden overlay links take focus first; use `inert` on hidden overlays.
- No key hijacking (no arrow-key "next slide" handlers on the document).

## 10. Reduced motion

```ts
// Original snippet
const mq = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = mq.matches;
mq.addEventListener('change', (e) => { reduced = e.matches; });
```

| Element | Default | Reduced motion |
|---|---|---|
| Visual progress smoothing | `k ≈ 8` | `k = ∞` (snap to P) |
| Disintegration | voxels fly along curl paths | voxels fade or scale in place (dither), no travel |
| Portal travel | camera flies through tunnel | crossfade between scenes |
| Idle wobble, particles | on | off (`m = 0`) |
| Scroll-velocity effects (glitch) | on | off |
| Project sculptures | assemble | appear assembled |

Lusion's demo ignores the preference: identical behaviour, measured by screenshot diff. Lenis 1.3.26 has a `respectReducedMotion` option (default `true`) that only makes *programmatic* `scrollTo` immediate. Wheel smoothing stays on, so a library default is not a complete answer.

## 11. Avoiding scroll-jacking: checklist

- [ ] No non-passive `wheel`/`touchmove` listeners on `window`/`document`.
- [ ] `html` is the scroller; no `overflow: hidden` on `body` except for genuine modals.
- [ ] Pinned stages via `position: sticky` in tall sections, not JS pinning.
- [ ] Progress derived from cached ranges plus `scrollY`; smoothing applied to visuals only.
- [ ] Canvas `pointer-events: none`; DOM text selectable; find-in-page works.
- [ ] Anchors and keyboard navigation reach every act; browser back/forward restores position (`history.scrollRestoration` left at `auto`).
- [ ] If DOM-attached 3D must not swim: absolute canvas plus per-frame transform (Lusion's trick), with padding sized to `max px/frame` and a DPR cap.

---

## Sources

All accessed 2026-10-09.

- Lusion, WebGL-Scroll-Sync (README, `src/js/main.js`, shaders, CSS; MIT): https://github.com/lusionltd/WebGL-Scroll-Sync ; demo https://webgl-scroll-sync.lusion.co/ (blocked here; run locally)
- three.js manual, Multiple Canvases Multiple Scenes, "Syncing up": https://threejs.org/manual/#en/multiple-scenes (read from repo `manual/pages/multiple-scenes.html`)
- GSAP ScrollTrigger docs: https://gsap.com/docs/v3/Plugins/ScrollTrigger/ (blocked; source `gsap@3.15.0/ScrollTrigger.js` read via npm)
- Lenis source `lenis@1.3.26` `dist/lenis.mjs` (MIT): https://github.com/darkroomengineering/lenis ; the damping reference cited in its source: http://www.rorydriscoll.com/2016/03/07/frame-rate-independent-damping-using-lerp/
- three.js docs, InstancedMesh (raycast returns `instanceId`): https://threejs.org/docs/#api/en/objects/InstancedMesh
- J. Amanatides, A. Woo, "A Fast Voxel Traversal Algorithm for Ray Tracing", Eurographics 1987 (cited from knowledge; not fetched)
