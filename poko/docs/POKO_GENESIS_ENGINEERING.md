# POKO GENESIS — engineering guide

How the site works, why it is built this way, and where each idea lives in the
code. Read it top to bottom once; afterwards use it as a map.

> Measured numbers live in [PERFORMANCE_REPORT.md](./PERFORMANCE_REPORT.md).
> Research on Lusion's public techniques is in [research/](./research/).
> Asset origins and licences are in [ASSET_PROVENANCE.md](./ASSET_PROVENANCE.md).

---

## 0. The system in one picture

```
                         ┌──────────── build time ────────────┐
 pokoin-mascot@8x.png ─► pokoSprite.ts ─► pokoVoxelizer.ts ─┬─► export-poko-voxels.ts ─► Blender (bpy)
   (26×24 pixel art)      (palette grid)   (2 586 voxels,   │        build_poko.py: mesh, rig, 9 actions
                                            9 bones)        │        ─► poko_genesis.blend, poko_raw.glb
                                                            │        ─► gltfpack (meshopt) ─► poko.glb 94 KB
                                                            │
                         ┌──────────── runtime ─────────────┴──────────────────────────────────────┐
  scroll ─► ScrollController ─► u ─► evaluateStory(u) ─► StoryFrame (pure data)                     │
                (spring)                 story.ts          │                                        │
                                                           ├─► CameraTrack ─► camera                │
                                                           ├─► PokoAnimationController ─► bones ─┐  │
                                                           ├─► Environment, Effects              │  │
                                                           └─► VoxelEngine.setMorph ─────────────┤  │
                                                                                                 ▼  │
               formations (CPU, once) ─► DataArrayTextures ─► compute pass (GPU, 4 096 texels) ─► voxel draw (1 call)
                                                                                 │
                                                       skinned GLB (Representation A) ◄┘ same bones
                                                                                 ▼
                                               PostProcessing: HDR + MSAA ─► bloom ─► composite ─► canvas
```

The design rule behind everything: **the scene is a pure function of scroll
progress `u`**. Time-based motion (breathing, blinking, pointer reactions) is
layered on top and never feeds back into the state. That single decision buys
reversible scrolling, pixel-identical frames forward and backward (tested), an
offline-renderable walkthrough, refresh-safe deep links, and a reduced-motion
mode that is just "evaluate at a different `u`".

### Source map

| Area | Files |
|---|---|
| Pixel art → voxels | `src/character/pokoSprite.ts`, `src/character/pokoVoxelizer.ts` |
| Blender pipeline | `scripts/export-poko-voxels.ts`, `blender/scripts/build_poko.py`, `blender/scripts/validate_glb.py` |
| Character runtime | `src/character/PokoRig.ts`, `src/character/PokoAnimationController.ts` |
| Voxel engine | `src/voxel/VoxelEngine.ts`, `VoxelCompute.ts`, `FormationLibrary.ts`, `voxelMaterial.ts`, `correspondence.ts` |
| Shaders | `src/shaders/common.glsl`, `src/shaders/voxelState.glsl` (+ inline GLSL in `Effects.ts`, `Environment.ts`, `PostProcessing.ts`) |
| Formations | `src/voxel/formations/*.ts` |
| Story & camera | `src/experience/story.ts`, `CameraController.ts`, `src/content/chapters.ts` |
| Orchestration | `src/experience/Experience.ts`, `boot.ts`, `ScrollController.ts`, `InteractionController.ts` |
| Systems | `src/systems/QualityManager.ts`, `FrameScheduler.ts`, `PerformanceMonitor.ts`, `AssetManager.ts`, `capabilities.ts` |
| UI & pages | `src/app/*`, `src/components/*`, `src/styles/*`, `src/entry-*.tsx`, `scripts/prerender.mjs` |
| Tests | `tests/unit/*`, `tests/e2e/*`, `scripts/perf/measure.mjs` |

---

## 1. From pixel art to a voxel character

### 1.1 The source of truth

Poko is Pokoin's mascot: a 26 × 24 pixel coin with a face, hands and feet,
stored as `pokoin-mascot@8x.png` (each pixel an 8 × 8 block). The sprite grid in
`pokoSprite.ts` is that image sampled at cell centres and snapped to 10 swatches.
`tests/unit/pokoSprite.test.ts` decodes the PNG on every run and fails if any
cell differs from its swatch by more than 12/255 per channel, or if any 8 × 8
block is not uniform. The grid can never silently drift from the real mascot.

### 1.2 Depth is reconstructed, not extruded

Extruding a sprite gives a flat cookie. The voxelizer instead asks *what the
pixels depict*. The sprite is a coin seen face-on, and pixel artists draw a
coin's raised rim with a dark ring at its foot: the bronze ring **is** the
rim's shadow. So:

1. **Region masks.** Hands (rows 10–14 at the far edges) and feet (rows 20–23)
   are split from the body.
2. **Flood fill.** From the coin's centre, fill through body pixels, stopping
   at the ring colours (and the highlight pixels that interrupt the ring).
   Pixels reached = the face field. Barrier pixels touching the field = the
   ring. Everything else = the lip. The eye catchlights are white like the rim
   highlight, so feature boxes are always passable (this was a real bug: each
   eye briefly had 5 voxels instead of 6).
3. **Relief.** Lip at z = 3, trough and ring at z = 2, a round central plateau
   (radius 5.6 px) at z = 3, face features engraved to z = 2. The back mirrors
   the relief without the face. The silhouette pixels become a navy band around
   the coin's edge, so the outline survives as a physical edge rather than a
   painted line.
4. **Limbs.** Hands are 3 voxels deep, feet 5, and the toes reach one voxel
   further forward so the feet read in profile.
5. **Surface depth.** A 6-neighbour BFS from empty space labels each voxel's
   distance to the surface. It later drives "outer voxels leave first" and
   "core reforms first".
6. **Shade.** A ±3 % per-voxel brightness from a coordinate hash makes
   individual cubes legible. It is applied identically in the GPU path and the
   Blender export.

Result: 2 586 voxels, deterministic (tested), left/right balanced, and every
sprite pixel is shown by exactly one front voxel in its own colour (tested).

### 1.3 Rig design

Nine bones: `root`, `body`, `eye_l`, `eye_r`, `mouth`, `hand_l`, `hand_r`,
`foot_l`, `foot_r`. They are rigid: each voxel belongs to exactly one bone,
which is what a voxel character wants (cubes should never shear). The feet hang
from `root`, not `body`, so squash and stretch of the coin does not deform them.

All bones point straight up with zero roll. In Blender a bone's local frame is
then exactly character space, so animation keys are written in intuitive axes.
`build_poko.py` asserts this at build time.

---

## 2. Blender pipeline (headless `bpy`)

`build_poko.py` runs inside Blender or with the `bpy` wheel. It:

* builds the **surface mesh**. A face between two voxels of the same bone is
  culled. Faces between different bones are kept: when the eye bone squashes
  for a blink, the gold behind the eye must exist.
* writes **per-face UVs** (0..1 on every face). The runtime bevel shader needs
  them.
* writes **vertex colours** (linear) and three Principled materials (gold,
  enamel, ceramic), matching the runtime material table.
* builds the **armature** and **rigid vertex groups**.
* authors **9 actions** in code: Idle, Blink, Walk, Hop, Surprise, Wave,
  LookAround, Float, Land. They use anticipation, squash and stretch,
  follow-through and overlapping action (the eyes lead and the body follows).
  Each action keys only the bones it needs; with
  `export_optimize_animation_keep_anim_armature=False` the GLB clips stay
  sparse, so clips blend without fighting.
* stages lights and a camera, renders previews with Cycles (`blender/renders`),
  saves `poko_genesis.blend` and exports `blender/exports/poko_raw.glb`.

`npm run poko:pack` then runs **gltfpack** (`-cc -kn -km -kv -vtf`) and
`validate_glb.py`. Three lessons, all now checked by the validator:

1. gltfpack drops `TEXCOORD_0` when no texture uses it. `-kv` keeps it, because
   our shader uses UVs procedurally.
2. Quantisation folds vertex dequantisation into the **inverse bind matrices**.
   The runtime therefore never reuses the GLB's inverse binds for the voxel
   particles; it keeps its own, built in the voxel rest space (`PokoRig.ts`).
3. gltfpack also quantises UVs and stores their rescale in
   `KHR_texture_transform`, which lives on textures. Poko has none, so the
   rescale was silently lost and UVs shrank to 0..0.0625. The bevel shader then
   treated every pixel as a cube edge: normals tilted up-left, seams vanished,
   and mesh A rendered flatter, brighter and more orange than voxels B, a
   visible pop wherever the story swaps representations (the intro → Poko
   boundary). `-vtf` keeps float UVs (+0.5 KB), and the validator fails on
   non-float `TEXCOORD_0`. After the fix, A and B render the same frame to
   within 0.1 of a unit of mean colour.

633 KB raw → 94 KB with meshopt → about 18 KB gzipped on the wire.

---

## 3. The GPU voxel engine

### 3.1 Two representations of one character

| | A — skinned mesh (`poko.glb`) | B — voxel particles (`VoxelEngine`) |
|---|---|---|
| Geometry | 2 116 exposed quads, 4 232 triangles | 4 096 cubes, 49 152 triangles |
| Skinning | three.js `SkinnedMesh` | bone TRS uniforms in the compute shader |
| Used when | Poko is whole and still (most of chapters 2 and 8) | awakening, disintegration, every morph |

Both use the same bones, the same palette and shade, and the same bevel and
seam shading, so the swap is invisible. Representation A costs about 1/10 of
B's vertex work, which is why it is preferred whenever nothing is in flight.

### 3.2 The pool and formations

There is one pool of `POOL_SIZE = 4096` voxels (64 × 64). A **formation** is an
arrangement of the whole pool: Poko, the halo, the portal, the Pokoin card, the
CardRail rack, the systems sculpture, the finale. Each is stored as one layer
of two `DataArrayTexture`s:

```
uFormPos  RGBA32F   64×64×7   xyz position (formation space), w = scale (0 = hidden, -1 = rig-bound)
uFormCol  SRGB8_A8  64×64×7   colour (the GPU decodes sRGB → linear on fetch), a = material id
uStatic   RGBA32F   64×64     bone + depth·0.99, seedA, seedB, clump seed
```

Array textures keep "which formation?" a plain integer and stay far inside
WebGL2's guaranteed limits (MAX_TEXTURE_SIZE ≥ 2048, MAX_ARRAY_TEXTURE_LAYERS ≥ 256).
Together they hold about 640 KB.

### 3.3 Correspondence: who goes where

If voxel *i* of Poko went to a random target in the card, every morph would be
noise. `correspondence.ts` sorts each formation's targets along a **3D Hilbert
curve** fitted to the formation's box (scaled uniformly, so thin axes stay
thin), then maps pool id *i* → target `floor(i·M/N)`. Every formation is ordered
the same way, so a voxel's rank means "roughly where" in all of them. Morphs
send neighbours to neighbours. A unit test asserts that consecutive pool voxels
land on targets less than 20 % as far apart as random pairs.

When a formation has fewer targets (M) than voxels (N), the extra voxels are
**twins**: placed at the same spot with scale 0. In flight they grow, so matter
appears to divide; on arrival they shrink back. Nothing pops. The Poko
formation has 1 510 twins, born during the disintegration. In the finale they
become the voxel name.

### 3.4 The morph is a pure function

`voxelState.glsl::computeVoxel(id)` is the heart of the system:

```glsl
a = endpoint(uFrom)                       // position, rotation, scale, colour
b = endpoint(uTo)
delay = weighted(axisSweep(a.pos), surfaceDepth, seed)
local = clamp((uMorph - delay·spread) / (1 - spread), 0, 1)   // this voxel's own progress
e  = easeInOutCubic(local)
bl = sin(π·local)                         // 0 at both ends, 1 mid-flight
p  = mix(a.pos, b.pos, e)
   + dir·explode·bl  + arc·bl  + swirl(bl)  + curlNoise(...)·bl
```

Every flight term is multiplied by `bl`, so **endpoints are exact**:
`local = 0` returns `a` and `local = 1` returns `b`, bit for bit. Reversibility
falls out for free. Notable details:

* **Curl noise** (Bridson 2007) is the curl of three decorrelated simplex
  fields. It is divergence-free, so swirls look fluid instead of jittery.
* **Clumps.** Early in flight the noise seed is the voxel's 3 × 3 × 3 clump id,
  later its own seed: chunks leave together, then dissolve into single voxels.
  That is the "partial fragmentation → full dispersion" progression.
* **Shiver.** Just before departure a voxel vibrates. The *amplitude* is a
  function of progress; only the oscillation is time-based and zero-mean.
* **Near-lens fade.** A 10 cm cube 20 cm from the lens fills the screen, so
  voxels shrink within 1.6 m of the camera (`uCameraPos`).
* **Rig-bound voxels.** Scale = −1 in a formation means "place me with the
  skeleton". That is how the finale holds a living, animated Poko and a static
  name in one formation.

### 3.5 GPGPU compute pass

The voxel mesh draws 24 vertices per cube. Evaluating `computeVoxel` (12
simplex samples for curl noise alone) per vertex would repeat it 24 times per
voxel, and again for the shadow pass. `VoxelCompute.ts` instead renders one
full-screen triangle into a 64 × 64 target with **4 colour attachments (MRT)**:

```
location 0: position.xyz          location 2: scale.xyz, glow
location 1: rotation quaternion   location 3: colour.rgb, material
```

The voxel vertex shader does four `texelFetch(…, gl_InstanceID)`. The maths now
runs 4 096 times per frame instead of about 200 000. It requires rendering to
RGBA32F (`EXT_color_buffer_float`, near-universal on WebGL2); otherwise
`VOXEL_INLINE` compiles the same function into the vertex shader.

### 3.6 Instancing without per-instance attributes

`InstancedBufferGeometry` with `instanceCount = 4096`, no instanced attributes
and `gl_InstanceID` as the voxel id: **one draw call** for all voxels (plus one
in the shadow pass). There is no `InstancedMesh` and no CPU matrix uploads. The
CPU writes about 40 uniforms per frame and never touches a voxel. The research
benchmark (`docs/research/WEBGL_RENDERING_TECHNIQUES.md`) measured the
alternative, updating 8 000 instance matrices on the CPU, at 512 KB uploaded
per frame.

### 3.7 Materials

`voxelMaterial.ts` patches `MeshStandardMaterial` with `onBeforeCompile`
instead of writing a shader from scratch. That keeps three.js's PBR lighting,
PMREM reflections, fog, shadow receiving and colour management, and replaces
only:

* **vertex**: the instance transform, read from the compute textures
  (`normal / scale` before rotation, which is the correct normal transform for
  non-uniform scale);
* **fragment**: per-voxel colour and material (a small roughness/metalness
  table), emissive glow, and a **procedural bevel**. Near each face edge the
  normal tilts outward through a derivative-based tangent frame, as if the cube
  were chamfered, and the seam darkens slightly. Both fade out when a voxel is
  only a few pixels wide, to avoid shimmer.

The shadow pass uses a `MeshDepthMaterial` patched with the same transform
(`customDepthMaterial`). Representation A gets the identical bevel chunk
(`patchSkinnedVoxelMaterial`).

Gold is **lacquered**, not mirror metal (metalness 0.5). A fully metallic
surface has no diffuse term, so in a dark set it reflected only darkness and
read as olive. The art-direction screenshots in the commit history show the
before and after.

---

## 4. The story

### 4.1 Chapters

`src/content/chapters.ts` is the single table read by the DOM (section heights,
copy) and the WebGL story (progress boundaries):

```
awakening 2.0 · disintegration 2.4 · portal 2.0 · pokoin 2.2 · cardrail 2.0 · systems 2.0 · reconstruction 1.8 · finale 1.6   (viewport heights)
```

The page is genuinely 16 viewports tall. Scroll progress `u = scrollY /
(scrollHeight − innerHeight)`; chapter *i* starts at `top_i / (16 − 1)`. The
story is authored per chapter in local time `t ∈ [0, 1]`, so changing a chapter
length never breaks the script.

### 4.2 `evaluateStory(u)` in `story.ts`

It resets a `StoryFrame` to defaults, finds the chapter and local time, and
lets that chapter's writer fill in morph, camera hints, clips, environment and
effects. Two unit tests protect the contract:

* **Purity**: 401 samples swept forward and backward produce byte-identical
  frames, even when one frame object is reused.
* **Continuity**: at every chapter boundary, the formation and placement the
  previous chapter *ends* with equal the ones the next chapter *starts* from.

### 4.3 The sequences

1. **Pixel awakening.** The camera starts on a long lens (21°), which flattens
   perspective. `uDepth` grows ring by ring from the centre (`uDepthStagger`):
   z positions and z-scale go from 3.5 % to 100 %. The key light rises from 55 %
   to 100 % exposure as the floor fades in, so light literally reveals the cubes.
2. **Disintegration.** Poko hops (Hop), glances (LookAround), notices the rift
   and startles (Surprise, held). Then `poko → cloud`, ordered by an axis sweep
   (top first), surface depth (outer first) and seed, with shiver, clumps,
   tumbling and an in-flight glow. The halo keeps each voxel's colour, and
   Poko's upper-left becomes the halo's upper-left.
3. **Portal.** `cloud → stream`: a procedural tube along a cubic Bézier,
   flowing with progress. Then `stream → portal`: the voxels build twelve
   twisting square frames, nearest first, and the camera flies through. A pixel
   event horizon waits at the far end; crossing it flashes and warps the image.
4. **Worlds.** `portal → pokoin → cardrail → systems`. Each flight has its own
   delay axis, arc and a deliberately small swirl. A pivot far from the voxels
   multiplies the swing by the lever arm, which first sent cubes through the
   camera.
5. **Reconstruction.** `systems → finale`. Delay is inverted surface depth
   (core first) with a wide spiral; the rig floats (Float) and then lands
   (Land). The twins assemble the name.
6. **Finale.** Representation A draws Poko (idle, blink, gaze, a wave), and the
   pool draws only the name (`uHideRigged`). The DOM carries contact links.

### 4.4 Camera

`CameraController.ts` places keyframes on the story timeline. Positions and
look-at targets each lie on a **centripetal Catmull-Rom** spline. It passes
through every key without cusps or self-intersections, unlike the uniform
variant on unevenly spaced points. Between keys an easing maps time to spline
parameter:

* `settle` (sine in-out): arrive, rest, leave. Used for hero shots.
* `glide` (linear): constant parametric speed. Used for fly-throughs.
* `out` / `in`: decelerate into or accelerate out of a world. Used for
  tracking shots that follow voxels in flight.

FOV interpolates per segment. On aspect ratios below 1.25 the camera backs away
along its view direction by `(1.25 / aspect)^0.72`, and portrait screens can
override any key. A unit test asserts that the camera never jumps more than
25 cm between 4 000 neighbouring scroll positions, and that FOV stays within
15–60° on any aspect.

---

## 5. Scroll, input and reversibility

### 5.1 Native scroll, never hijacked

The browser scrolls a real document: wheel, trackpad, touch, keyboard,
scrollbar, find-in-page and assistive tech all just work. `ScrollController`
only **reads** `scrollY`. The canvas is `position: fixed` with
`pointer-events: none`, and all listeners are passive.

### 5.2 Smoothing that cannot change the destination

The visual progress follows the scroll position with a **critically damped
spring**, solved analytically per frame:

```
x(t) = (x₀ + (v₀ + ω x₀) t) e^(−ω t)          (x = value − target, ω = 9 rad/s)
v(t) = (v₀ − (v₀ + ω x₀) ω t) e^(−ω t)
```

It never overshoots and is exactly frame-rate independent (tested: one 1/30 s
step equals two 1/60 s steps to 12 decimals). It decides *how fast* the scene
catches up, never *where it ends*.

### 5.3 Layers that must not leak

Pointer gaze, voxel push and click ripples are additive and decay to zero. An
end-to-end test caught a real leak: `presence` started "active" on page load,
so voxels leaned away from a phantom pointer and the result depended on frame
history. Now the pointer layer is inert until real input
(`idleTime = Infinity`), and forward and backward frames are pixel-identical in
the browser.

A second leak needed a real pointer to show. three.js's `PropertyMixer` writes
a bone only when the mixed clip value *changed* since the last frame. While
the clips hold still (end of the intro: look on, idle not yet), the bone kept
last frame's look rotation and the look layer stacked another on top: Poko
tipped over (19° → 44° → 69° → 94° in four seconds), and as the look faded out
the decaying rotations summed to many times the look angle (at 60 fps about
13×). `PokoAnimationController` now saves the clip pose of everything the look
layer touches and restores it before the mixer runs, so the layer is
additive on the clip pose, never on its own output. The e2e test "pointer look
settles instead of tipping Poko over" holds a real pointer still and fails on
the old code.

### 5.4 Keyboard, links, touch

* `[` / `]` step between chapters. Page Up/Down, arrows and Space scroll
  natively. A skip link jumps to contact. The chapter index uses real anchors.
* Hidden overlays use `opacity` + `pointer-events: none`, **not**
  `visibility: hidden`: hidden links stay in the tab order, and focusing one
  reveals its overlay through `:focus-within`. This was another bug found by
  e2e tests.
* A tap is a short press that did not travel (< 8 px, < 400 ms) and did not
  land on a link or button, so scrolling a phone never "clicks" Poko.

---

## 6. Rendering pipeline and art direction

* **Environment** (`Environment.ts`): gold needs bright things to reflect, so
  a tiny virtual photo studio (dark room, warm key softbox, cool rim strip,
  overhead panel, cyan accent line) is rendered once into a **PMREM** cube.
  Lights: a warm key (the only shadow caster; its shadow frustum follows the
  current stage), a cool rim that separates silhouettes from the dark, and a
  faint hemisphere fill. The floor is dark lacquer with a faint pixel grid near
  the stage and a warm pool of light. A gradient sky dome follows the camera,
  with fog matched to its horizon.
* **Effects** (`Effects.ts`): the rift, the portal horizon and the scan beam
  are single additive quads whose UVs are quantised to a pixel grid, so they
  speak the same pixel language as Poko.
* **Post-processing** (`PostProcessing.ts`): scene → half-float target with
  MSAA → **dual-filter bloom** (Bjørge 2015; 5 down + 4 up passes reading 5 or 8
  bilinear taps) → one composite (barrel warp and chromatic aberration while
  flying, flash, **Khronos PBR Neutral** tone mapping, vignette, grain and
  dither, sRGB). PBR Neutral keeps Poko's brand gold close to `#ffcb03`: ACES
  pushes yellows orange and AgX desaturates them. The bloom threshold (1.6) is
  above lit gold, so only emissive accents and real highlights bloom. A lower
  value made the whole card glow like neon.
* **Typography**: Instrument Serif (organic, luxurious) for names and titles,
  Inter Tight for interface and body, and Silkscreen for pixel-native micro
  labels only. Palette: midnight navy, ivory ink, Poko's gold, one cyan accent.

---

## 7. Performance engineering

* **Constant voxel count, variable fill rate.** 4 096 cubes is about 49 k
  triangles, trivial for any WebGL2 GPU. Tiers (`QualityManager.ts`) trade what
  actually costs: resolution (DPR cap × resolution scale), MSAA (4/2/0, and
  only at effective pixel ratios ≤ 1.25, since denser screens antialias by
  themselves and 4× MSAA on a 2880×1800 half-float target costs about 250 MB),
  shadows (2048/1024/off) and bloom (on/on/off). The canvas has no depth buffer:
  only the composite pass draws to it.
* **Adaptive quality with hysteresis.** Drop a tier when the p90 frame time
  over 90 frames exceeds 1.35 × budget. Rise only after 8 consecutive
  comfortable windows (p90 < 0.6 × budget). A manual choice locks it.
* **First guess.** SwiftShader, llvmpipe and older Mali, Adreno or Intel
  starts on low, phones on medium or low (`initialTier`, unit-tested).
* **Render on demand** (`FrameScheduler.ts`). Every frame while something can
  change; 30 fps ambient after 6 s of quiet; the loop **stops** after 24 s (the
  canvas keeps its last image) until any input wakes it. Hidden tabs cost nothing.
* **No per-voxel JavaScript.** Per frame the CPU evaluates the story (one
  object), 9 bone decompositions and about 40 uniforms. Measured CPU per frame:
  0.7–0.8 ms p50, 3.7–5.3 ms p95.
* **No per-frame DOM work.** Solid signals change on chapter changes only, and
  overlays fade with CSS.
* **Progressive loading.**
  1. Stage 1 is prerendered HTML, CSS and preloaded fonts: readable at about
     130 ms (FCP = LCP).
  2. Stage 2 is the experience chunk and three.js, loaded with a dynamic import
     after hydration; the first WebGL frame lands at about 0.6–0.9 s on
     SwiftShader.
  3. Stage 3 is the Blender character (94 KB, meshopt), which replaces the
     voxel Poko seamlessly when it arrives.
  Everything is content-hashed and served `immutable`.
* **Shader compilation.** In production, three.js's synchronous shader status
  queries are skipped, because each is a blocking round trip to Chrome's GPU
  process. The Blender character's materials are compiled before it is swapped
  in. An object-by-object warm-up pass was built and measured, then
  **removed**: it trimmed about 25 % of blocking time on the low tier but
  made the high tier 6–8× slower to its first frame (A/B in the report).
* **Disposal.** `Experience.dispose()` releases every geometry, material,
  texture and render target. An e2e test cycles all quality tiers and asserts
  that GPU resource counts do not grow.

---

## 8. Accessibility, SEO and fallbacks

* Every chapter is a real `<section>` with a heading, in document order. One
  `<h1>`; the finale's visible heading is replaced by the voxel name but remains
  for screen readers (`titleHidden`).
* Pages are **prerendered** (Solid `renderToString` at build time) and hydrate.
  Without JavaScript the full text, links and a pixel-art Poko are present
  (tested). Case studies, the work index and the about page are plain fast
  pages with canonical URLs, descriptions, Open Graph tags, JSON-LD (Person),
  a sitemap and robots.txt.
* **Reduced motion** (system setting or the toggle, remembered locally) shows
  each chapter's settled state with no journey between. Within a chapter the
  scene holds still (tested by checksum), with no flashes, warps or idle motion.
* **No WebGL / failure / timeout (9 s)** gives the static page: the same DOM,
  pixel-art Poko, and all content and navigation (tested by stubbing
  `getContext`). A lost GPU context switches to static mode too.
* Visible focus rings everywhere, contrast-safe ivory on midnight, and a text
  scrim behind overlays on small screens.

---

## 9. Mathematics reference

| Concept | Where | Formula / idea |
|---|---|---|
| Linear interpolation | everywhere | `mix(a, b, t) = a + (b − a) t` |
| Smoothstep | story, shaders | `t²(3 − 2t)` after clamping to [0, 1] |
| Bell envelope | voxelState | `sin(π t)`: zero at both ends, so offsets vanish at endpoints |
| Quaternion rotation | common.glsl `qrotate` | `v + 2 q.xyz × (q.xyz × v + q.w v)` (no matrix needed) |
| Slerp | common.glsl `qslerp` | `(sin((1−t)θ) a + sin(tθ) b) / sin θ`, shortest arc, nlerp when nearly parallel |
| Skinning | PokoRig | `x_world = B_world · B_bind⁻¹ · x_rest`, decomposed to T/R/S per bone |
| Normal transform | voxelMaterial | normals use `(M⁻¹)ᵀ`; for rotation × scale that is `R · (n / s)` |
| Catmull-Rom (centripetal) | CameraController | knot spacing `|Pᵢ₊₁ − Pᵢ|^0.5`, which avoids cusps |
| Critically damped spring | ScrollController | see §5.2 |
| Exponential damping | gaze, presence | `x += (target − x)(1 − e^(−λ dt))` |
| Curl noise | common.glsl | `∇ × ψ`, with ψ three offset simplex fields |
| Hilbert curve | math/hilbert.ts | Skilling's transpose/Gray-code algorithm, 10 bits per axis |
| Projection | three.js | perspective: `x_ndc = (f / aspect) x / −z`, with `f = cot(fov/2)` |

---

## 10. How to work on it

```sh
npm ci
npm run dev                # http://127.0.0.1:5173/  (and /lab/ for single engine states)
npm test                   # Vitest
npm run build              # client + SSR + prerender → dist/
npm run test:e2e           # Playwright against the build (vite preview on :4180)
npm run perf -- http://127.0.0.1:4180/ genesis --experience
node scripts/story-shots.mjs out/ http://127.0.0.1:4180/ 0,0.25,0.5,0.75,1
node scripts/record-walkthrough.mjs walkthrough.mp4

# Character pipeline (bpy: pip install bpy==5.1.2, Python 3.13; or blender -b -P)
npm run poko:voxels        # voxelizer → blender/data/poko_voxels.json
python blender/scripts/build_poko.py   # .blend, raw GLB, preview renders
npm run poko:pack          # gltfpack + validation → src/assets/poko/poko.glb
```

Debug API (`?debug`): `window.__poko.setProgress(u)`, `freeze(t)`,
`info()`, `voxelChecksum()`, `samples()`.
