# WebGL Rendering Techniques for a GPU-instanced voxel mascot

> Research for POKO GENESIS, written 2026-10-09. Part of the Lusion study ([overview](./LUSION_DEEP_TECHNICAL_ANALYSIS.md)).
> API facts come from three.js docs pages read from the three.js repository (`docs/pages`, commit `43488e6`) and from `three@0.186.1` source (npm). threejs.org itself was blocked from this sandbox.
> Measured numbers come from the capture script (`scripts/research/capture-reference.mjs`) running on headless Chromium 141 with **SwiftShader** (no GPU). Timings are relative only.
> **All code snippets in this document are original** unless a source and license are stated.

---

## 0. Measured reference points

| Scene | Draws/frame | FB binds/frame | Notes |
|---|---|---|---|
| Lusion WebGL-Scroll-Sync (local copy, r161) | 0–7 (p50 3 while scrolling) | 0 | 1 program, 8 textures, 1 geometry, no post |
| Synthetic bench: 8,000 voxels, CPU `setMatrixAt` | 1 (instanced, 8,000 instances, 96,000 tris) | 0 | **512,000 bytes uploaded per frame** |
| Synthetic bench: 8,000 voxels, GPU-driven (attributes + uniform) | 1 | 0 | **0 bytes uploaded per frame** |
| Same + `EffectComposer` (MSAA×4 HalfFloat) + `UnrealBloomPass` + `OutputPass` | 15 | 21 | 10 programs, 4 multisampled renderbuffers, 13 textures |

That last row is the hidden cost of an "off-the-shelf" post stack. Section 9 shows a cheaper one.

---

## 1. Instancing: `InstancedMesh` vs `InstancedBufferGeometry`

**`InstancedMesh(geometry, material, count)`** (docs): one draw call for `count` copies.
- Per-instance data is `instanceMatrix` (an `InstancedBufferAttribute` of `mat4`: **64 bytes and 4 vertex-attribute slots per instance**), plus an optional `instanceColor` (`vec3` float, 12 B) and `morphTexture`.
- You write with `setMatrixAt` / `setColorAt` and must set `needsUpdate = true`. By default that re-uploads the whole buffer. `BufferAttribute.addUpdateRange(start, count)` restricts uploads to dirty ranges.
- `raycast` reports `instanceId`.
- `computeBoundingSphere()` covers all instances. If the vertex shader moves instances, set `frustumCulled = false` or enlarge the bounds.

**`InstancedBufferGeometry`** plus **`InstancedBufferAttribute(array, itemSize, normalized, meshPerAttribute)`** gives you *your own* compact per-instance attributes. `meshPerAttribute = 2` reuses one value for two consecutive instances. `instanceCount` limits how many are drawn.

You can also add extra `InstancedBufferAttribute`s to the geometry of an `InstancedMesh`. That keeps three's built-in lighting and shadow integration (`USE_INSTANCING`) and adds custom data. The synthetic bench does this.

**When to choose which:**

| Need | Use |
|---|---|
| Arbitrary per-instance transforms set from JS, few updates | `InstancedMesh` |
| Thousands of instances animated every frame | **custom compact attributes + vertex-shader animation** (identity `instanceMatrix`, or `InstancedBufferGeometry`) |
| Many *different* meshes in one draw (sculptures made of distinct parts) | `BatchedMesh` (multi-draw) |
| Per-instance data larger than the attribute budget | a data texture indexed by `gl_InstanceID` (§3) |

**Attribute budget.** WebGL2 guarantees `MAX_VERTEX_ATTRIBS ≥ 16` (OpenGL ES 3.0 minimum; the spec wasn't re-fetched in this session). A typical lit voxel uses `position` (1) + `normal` (1) + `instanceMatrix` (4) + `instanceColor` (1) = 7 slots, leaving 9 for custom data.

**Memory for POKO voxels (N = 20,000):**

| Layout | Bytes/instance | Total | Per-frame upload if CPU-animated |
|---|---|---|---|
| `instanceMatrix` (float mat4) + `instanceColor` (float vec3) | 76 | 1.52 MB | 1.28 MB (matrices) |
| Custom: `Int16x3` grid position (normalised) + `Uint8` palette index + `Uint8` bone index + `Uint16` seed | 10 → pad to 12 | 240 KB | 0 (animation in shader) |
| Custom + 1 `vec4` float "target" for the current formation | 28 | 560 KB | 0 (targets via data texture instead, §3) |

Integer attributes: three binds an attribute with `vertexAttribIPointer` when its type is `INT`/`UNSIGNED_INT` or `attribute.gpuType === THREE.IntType` (`WebGLBindingStates.js`). Declare it as `in uint`/`in int` in GLSL3 to read exact integers (palette and bone indices). Otherwise use normalised `Uint8`/`Int16` and rescale in the shader.

---

## 2. GPU-driven animation in the vertex shader

Principle: upload **static** per-instance data once, and animate with a few **uniforms** (`uProgress`, `uTime`). The vertex shader evaluates a closed-form function of `(instance data, progress)`. This keeps the state reversible, as required in INTERACTION_ENGINEERING §6.

```js
// Original snippet: MeshStandardMaterial + instanced voxels animated by progress.
const uniforms = { uProgress: { value: 0 }, uTime: { value: 0 }, uPortal: { value: new THREE.Vector4(0, 0, -20, 6) } };
const material = new THREE.MeshStandardMaterial({ vertexColors: false, roughness: 0.55 });
material.onBeforeCompile = (shader) => {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', /* glsl */ `#include <common>
      attribute vec3 aHome;      // rest position in Poko space (voxel grid units)
      attribute float aSeed;     // 0..1, deterministic per voxel
      uniform float uProgress, uTime;
      uniform vec4 uPortal;      // xyz = portal centre, w = radius
      vec3 hash3(float s){ return fract(sin(vec3(s*127.1, s*311.7, s*74.7))*43758.5453)*2.-1.; }
      mat3 rotY(float a){ float c=cos(a), s=sin(a); return mat3(c,0.,-s, 0.,1.,0., s,0.,c); }`)
    .replace('#include <beginnormal_vertex>', /* glsl */ `#include <beginnormal_vertex>
      float tDel = smoothstep(aSeed*0.6, aSeed*0.6 + 0.4, uProgress);   // staggered start
      mat3 R = rotY(tDel * 6.2831 * (aSeed - 0.5) * 4.0);
      objectNormal = R * objectNormal;                                    // keep lighting correct`)
    .replace('#include <begin_vertex>', /* glsl */ `#include <begin_vertex>
      vec3 scatter = aHome + hash3(aSeed) * 18.0 * tDel;                  // fly apart
      vec3 toPortal = mix(scatter, uPortal.xyz, smoothstep(0.5, 1.0, tDel));
      transformed = R * transformed * (1.0 - 0.6 * tDel) + toPortal;`);
};
material.customProgramCacheKey = () => 'poko-voxel-v1'; // docs: identify onBeforeCompile variants
```

Notes:
- **Normals.** If you rotate or scale per instance in the shader, transform `objectNormal` in `beginnormal_vertex` too, or lighting will be wrong.
- **Bounds.** `mesh.frustumCulled = false`, or set a bounding sphere large enough for the scattered state.
- **Precision.** `highp` everywhere in vertex shaders. Mobile `mediump` breaks large coordinates.
- **Future path.** The docs now say `onBeforeCompile` is WebGLRenderer-only and recommend `WebGPURenderer` + TSL node materials for new customisations. For a WebGL2-first project shipping in 2026, `onBeforeCompile` is still the most direct route. Keep the injected GLSL small so it can be ported to TSL later.

### 2.1 Rigid skinning of voxels (Poko's animation)

Poko is authored as an armature in Blender (ASSET_PRODUCTION_WORKFLOW §2). At runtime there's no need for a `SkinnedMesh` with 20k × 24 vertices. Treat each **voxel as an instance rigidly attached to one bone**:

```glsl
// Original snippet (vertex shader, GLSL3). uBones: RGBA32F texture, 4 texels per bone (mat4 columns).
uniform highp sampler2D uBones;
in uint aBone;            // gpuType = IntType
in vec3 aLocal;           // voxel centre in the bone's rest space
mat4 boneMatrix(uint i) {
  int x = int(i) * 4;
  return mat4(texelFetch(uBones, ivec2(x, 0), 0), texelFetch(uBones, ivec2(x + 1, 0), 0),
              texelFetch(uBones, ivec2(x + 2, 0), 0), texelFetch(uBones, ivec2(x + 3, 0), 0));
}
// in main(): vec4 posed = boneMatrix(aBone) * vec4(aLocal + position * uVoxelSize, 1.0);
```

Each frame, upload only the bone texture: (bones × 64 B), e.g. 30 bones = 1.9 KB. Compute the bone matrices on the CPU from a `THREE.Skeleton` driven by an `AnimationMixer` (sampled at `t = f(progress)`), as `bone.matrixWorld × boneInverse`. This is the same thing three's own skinning does (`boneTexture`), but with one bone per voxel instead of 4 weights per vertex.

---

## 3. Data textures: `DataTexture`, `DataArrayTexture`, `texelFetch`

Use data textures when per-instance data is too large or too numerous for attributes. A typical case for POKO: **formation targets**, i.e. where each voxel goes for "Poko", "portal ring", "project 1 sculpture", … "project 6".

```js
// Original snippet: one layer per formation; texel (x,y) = voxel id; RGBA32F = xyz target + w scale.
const W = 256, H = Math.ceil(N / W), LAYERS = formations.length;
const data = new Float32Array(W * H * LAYERS * 4);
formations.forEach((f, layer) => f.forEach((p, id) => data.set([p.x, p.y, p.z, p.s], ((layer * H * W) + id) * 4)));
const targets = new THREE.DataArrayTexture(data, W, H, LAYERS);
targets.type = THREE.FloatType;           // RGBA32F; HalfFloatType halves memory (precision ±0.03 at 50 units)
targets.needsUpdate = true;               // docs: DataArrayTexture defaults: NearestFilter, no mipmaps, flipY false, unpackAlignment 1
```

```glsl
// Original snippet (vertex shader): blend between two formations chosen by progress.
uniform highp sampler2DArray uTargets;
uniform ivec2 uLayerAB;     // e.g. (0 = Poko, 3 = project 2)
uniform float uMix;         // 0..1
vec4 fetchTarget(int layer) {
  int id = gl_InstanceID;
  return texelFetch(uTargets, ivec3(id % 256, id / 256, layer), 0);
}
// vec4 a = fetchTarget(uLayerAB.x), b = fetchTarget(uLayerAB.y); vec3 target = mix(a.xyz, b.xyz, uMix);
```

`texelFetch` uses integer coordinates, with no filtering and no normalisation, which is exactly right for lookup tables. `gl_InstanceID` is WebGL2/GLSL3 only.

**Size math (N = 20,000, W = 256, so H = 79):**
- 10 formations × 256 × 79 texels × 16 B (RGBA32F) = **3.2 MB** VRAM.
- RGBA16F halves it.
- If voxel targets are grid coordinates ≤ 255, RGBA8UI cuts it to **0.8 MB** (read with `usampler2DArray`).

**WebGL2 limits.** OpenGL ES 3.0 / WebGL2 guaranteed minimums (from the ES 3.0 spec's state tables, quoted from knowledge; Khronos was blocked here, so verify before relying on edge values), next to what this machine reported:

| Parameter | Guaranteed minimum | Measured (SwiftShader) |
|---|---|---|
| `MAX_TEXTURE_SIZE` | 2048 | 8192 |
| `MAX_ARRAY_TEXTURE_LAYERS` | 256 | 2048 |
| `MAX_3D_TEXTURE_SIZE` | 256 | 2048 |
| `MAX_VERTEX_TEXTURE_IMAGE_UNITS` | 16 | 32 |
| `MAX_SAMPLES` | 4 | 4 |
| `MAX_DRAW_BUFFERS` | 4 | 6 |
| `MAX_VERTEX_UNIFORM_VECTORS` | 256 | 4096 |

Design to the minimums: W = 256 and H ≤ 2048 lets one texture address 524,288 voxels.

**Float texture rules (WebGL2):**
- *Sampling* `RGBA16F`/`RGBA32F` with `NEAREST` is core.
- *Linear filtering* of 32F needs `OES_texture_float_linear`; 16F linear filtering is core.
- *Rendering into* float or half-float colour attachments needs `EXT_color_buffer_float`. Some mobile GPUs expose only `EXT_color_buffer_half_float`.
- *Blending* into 32F targets needs `EXT_float_blend`.

The extensions three.js queried on this machine were `EXT_color_buffer_float`, `EXT_color_buffer_half_float`, `OES_texture_float_linear`, `WEBGL_multisampled_render_to_texture`, `KHR_parallel_shader_compile`, `EXT_texture_filter_anisotropic` and `WEBGL_clip_cull_distance`.

---

## 4. GPGPU ping-pong, and when you don't need it

**Pattern** (three's `examples/jsm/misc/GPUComputationRenderer.js`; Edan Kwan's The-Spirit, MIT):
- keep two float render targets A and B holding particle state;
- each frame, draw a full-screen quad with a simulation shader that reads A and writes B, then swap;
- render particles with a vertex shader that reads the latest texture at a per-particle UV.

The-Spirit stores **position in RGB and remaining life in A**. When life < 0 the particle respawns near the pointer-driven follow point; otherwise it is advected by curl noise and an attraction term:

```
(paraphrase of The-Spirit position.frag, MIT © 2015 Edan Kwan)
life -= dieSpeed
if life < 0: position = defaultPosition * radius + followPosition; life = 0.5 + fract(seed + time)
else:        position += (follow - position) * attraction…; position += curl(position * curlSize, time, …) * speed
```

**When GPGPU is necessary:**
- the state depends on *history*: user forces, collisions, fluids, flocking;
- the field is interactive (the pointer stirs voxels and they keep drifting).

**When it is unnecessary (most of POKO):**
- disintegrate → portal → reassemble can be a **closed form** of `(seed, home, target, progress)`. It is cheaper (no float render targets, no extra passes) and **reversible**. A ping-pong simulation driven by scroll is path-dependent, so scrolling back would not undo it.

**Hybrid:** a closed-form base trajectory plus a *small* GPGPU "disturbance" layer (pointer stirring) that decays to zero. Reversibility then holds at rest.

Cost: one full-screen pass per simulation step over N texels (20k texels is trivial), plus the float render target requirements from §3. Half-float positions quantise: fp16 has a 10-bit mantissa, so at |x| = 50 the step is about 0.03 units.

---

## 5. Curl noise

Curl noise (Bridson, Hourihan, Nordenstam, "Curl-Noise for Procedural Fluid Flow", SIGGRAPH 2007) builds a velocity field as the **curl of a vector potential** ψ:

```
v = ∇ × ψ = ( ∂ψz/∂y − ∂ψy/∂z,  ∂ψx/∂z − ∂ψz/∂x,  ∂ψy/∂x − ∂ψx/∂y )
```

The divergence of a curl is zero, so the flow has no sources or sinks. Particles swirl and never clump or vanish. That is the "smoky" look of The-Spirit and the Lusion tubes.

```glsl
// Original snippet: finite-difference curl of three offset noise fields.
// Assumes a 3D noise 'snoise(vec3)' (e.g. Ashima/Gustavson webgl-noise, MIT).
vec3 potential(vec3 p) {
  return vec3(snoise(p), snoise(p + vec3(31.4, 47.2, 12.7)), snoise(p + vec3(-23.1, 11.9, 57.3)));
}
vec3 curlNoise(vec3 p) {
  const float e = 0.1;
  vec3 dx = vec3(e, 0., 0.), dy = vec3(0., e, 0.), dz = vec3(0., 0., e);
  vec3 px0 = potential(p - dx), px1 = potential(p + dx);
  vec3 py0 = potential(p - dy), py1 = potential(p + dy);
  vec3 pz0 = potential(p - dz), pz1 = potential(p + dz);
  return vec3((py1.z - py0.z) - (pz1.y - pz0.y),
              (pz1.x - pz0.x) - (px1.z - px0.z),
              (px1.y - px0.y) - (py1.x - py0.x)) / (2.0 * e);
}
```

**Cost:** 18 noise evaluations per call. In a vertex shader for 20k instances that is fine. In a per-pixel pass, use analytical-derivative noise instead: The-Spirit uses `simplexNoiseDerivatives4` + `curl4`, which returns the gradient with the value. Alternatively, precompute the field into a small 3D texture (`Data3DTexture`, 32³ RGBA16F = 256 KB) and sample it.

**For reversibility, sample rather than integrate:**
```
offset = curlNoise(home * f + vec3(0, 0, progress * k)) * amp(progress)
```
This gives swirly, deterministic, scrubbable motion.

---

## 6. Portal and tunnel shaders

Three approaches, which can be combined:

1. **Stencil portal.** Draw the portal disc with `stencilWrite: true, stencilRef: 1, stencilZPass: ReplaceStencilOp, colorWrite: false`. Then draw the "other world" with `stencilFunc: EqualStencilFunc`. Cost is low (no extra target), but there is no distortion of the inside.
2. **Render-target portal.** Render the destination scene into a (half-resolution) render target *only while the portal is visible*, then sample it in the portal material with **screen-space UVs**, so the inside looks like a window into a world with its own camera. You can distort the UVs (swirl), add chromatic fringe at the rim, and fade with a noise mask. This is the right fit for a "passes through a portal" moment.
3. **Tunnel.** A full-screen fragment shader in polar coordinates, or a cylinder with scrolling UVs. It is a classic, cheap fly-through.

```glsl
// Original snippet: portal disc fragment — RT sampled in screen space, swirl + rim glow + noise edge.
uniform sampler2D uOtherWorld; uniform vec2 uResolution; uniform float uOpen, uTime;
varying vec2 vUv;                         // disc UV, centre (0.5, 0.5)
void main() {
  vec2 c = vUv - 0.5; float r = length(c) * 2.0;               // 0 centre … 1 rim
  float edge = r + 0.08 * sin(atan(c.y, c.x) * 7.0 + uTime * 2.0);
  if (edge > uOpen) discard;                                   // opening animation (progress-driven)
  float swirl = (1.0 - r) * 1.5 * (1.0 - uOpen);
  vec2 s = gl_FragCoord.xy / uResolution - 0.5;
  s = mat2(cos(swirl), -sin(swirl), sin(swirl), cos(swirl)) * s + 0.5;
  vec3 col = texture2D(uOtherWorld, s).rgb;
  col += vec3(1.0, 0.8, 0.3) * smoothstep(uOpen - 0.12, uOpen, edge) * 2.0;   // HDR rim → bloom
  gl_FragColor = vec4(col, 1.0);
}
```

```glsl
// Original snippet: polar tunnel (full-screen), speed driven by progress-derived "travel".
uniform float uTravel; uniform sampler2D uTex; varying vec2 vUv;
void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float a = atan(p.y, p.x) / 6.2831853 + 0.5, r = length(p);
  vec2 uv = vec2(a * 4.0, 0.3 / max(r, 1e-3) + uTravel);      // depth = 1/r
  vec3 col = texture2D(uTex, uv).rgb * smoothstep(0.0, 0.6, r);  // fade the vanishing point
  gl_FragColor = vec4(col, 1.0);
}
```

**Voxels crossing the portal.** Per voxel, compute its signed distance to the portal plane in the vertex shader. Shrink, or dither-discard, voxels on the far side, and let the render-target world show their "arrived" counterparts. Alternatively, use three's `material.clippingPlanes` with `renderer.localClippingEnabled = true`.

---

## 7. PBR on custom geometry via `onBeforeCompile`; PMREM environment

The docs describe `onBeforeCompile(shaderobject, renderer)` as "executed immediately before the shader program is compiled… useful for the modification of built-in materials". `customProgramCacheKey()` must return a key that distinguishes different injected variants, otherwise three may reuse a cached program. Useful chunk hooks (from `src/renderers/shaders/ShaderChunk/`):

| Chunk | Use |
|---|---|
| `common` | declare attributes, uniforms, helper functions |
| `beginnormal_vertex` | transform `objectNormal` |
| `begin_vertex` | displace `transformed` |
| `project_vertex` / `worldpos_vertex` | post-transform hooks |
| `color_fragment` | palette lookup into `diffuseColor` |

**Environment without downloads.** `new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04)` gives soft studio IBL in code. Assign the result's `.texture` to `scene.environment`.

For an HDR look, load a 1k equirect with `HDRLoader` (three r186 ships `HDRLoader.js` alongside `RGBELoader.js`) and call `fromEquirectangular`. The docs say "the ideal input image size is 1k (1024 × 512), as this matches best with the 256 × 256 cubemap output", and recommend `compileEquirectangularShader()` while the file downloads. PMREM prefiltering uses GGX VNDF importance sampling. Dispose the generator afterwards.

For a pixel-art mascot, IBL mostly provides gentle shape definition. Keep `envMapIntensity` low so palette colours stay readable.

---

## 8. Shadows for instanced and displaced meshes

- **Plain `InstancedMesh`.** three's depth and distance materials already compile with `USE_INSTANCING`, so per-instance *matrices* cast correct shadows.
- **Displaced in the shader.** The shadow pass uses `MeshDepthMaterial` (directional/spot) or `MeshDistanceMaterial` (point), which **do not** contain your injected displacement. Give the mesh a `customDepthMaterial` (and a `customDistanceMaterial` for point lights) with the *same* injection. This is exactly what The-Spirit does: its `customDistanceMaterial` samples the same position texture.

```js
// Original snippet
const depthMat = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking });
depthMat.onBeforeCompile = (shader) => { /* same uniforms + same #include <begin_vertex> replacement as §2 */ };
depthMat.customProgramCacheKey = () => 'poko-voxel-depth-v1';
voxels.customDepthMaterial = depthMat;
voxels.castShadow = true; voxels.receiveShadow = true;
```

Budget tips:
- one directional light;
- a tight orthographic shadow camera around Poko (not the whole world);
- `shadow.mapSize` 1024 on desktop and 512 on mobile;
- `renderer.shadowMap.autoUpdate = false`, setting `needsUpdate = true` only when progress or animation changed. This halves the cost on idle frames.

Cheaper still: a **contact-shadow blob** (a soft radial texture on the floor, scaled by Poko's height). The My Little Storybook case study (excerpt) lists "shadows" among its *instanced* assets, which suggests fake shadow decals.

---

## 9. Post-processing chain

**Measured: `UnrealBloomPass` (three r161) at 1440×900.**

```
MSAA×4 HalfFloat scene RT (1440×900)
 → bright pass (720×450)
 → 5 mips × {horizontal, vertical} separable Gaussian: 720×450, 360×225, 180×113, 90×57, 45×29   (10 draws)
 → composite (720×450)
 → additive copy back into the scene RT (1440×900)
 → OutputPass to screen (tone mapping + sRGB)
 = 15 draws, 21 framebuffer binds, 10 linked programs
```

The source comment describes it as "a mip map chain of bloom textures [blurred] with different radii". The kernel sizes are `[6, 10, 14, 18, 22]`.

**Cheaper: dual-filter / mip-chain bloom.** This is the down/up sampling approach from Marius Bjørge's "Bandwidth-Efficient Rendering" (ARM, SIGGRAPH 2015). pmndrs `postprocessing@6.39.5` implements the family as `MipmapBlurPass`, "based on an article by Fabrice Piquet" (froyok.fr, UE4 custom bloom), and `KawaseBlurPass`, "based on the GDC2003 presentation by Masaki Kawase … and an article by Filip Strugar, Intel" (Zlib license). There is one draw per level down and one per level up, with bilinear taps doing the work of a wide kernel:

```glsl
// Original snippet: dual-filter 5-tap downsample and 8-tap tent upsample (bilinear taps do the averaging).
// uTexel = offset step; Bjørge's original uses half-texel offsets of the source level — tune to taste.
uniform sampler2D uSrc; uniform vec2 uTexel; varying vec2 vUv;
vec3 down() {
  vec3 s = texture2D(uSrc, vUv).rgb * 4.0;
  s += texture2D(uSrc, vUv + uTexel * vec2(-1., -1.)).rgb;
  s += texture2D(uSrc, vUv + uTexel * vec2( 1., -1.)).rgb;
  s += texture2D(uSrc, vUv + uTexel * vec2(-1.,  1.)).rgb;
  s += texture2D(uSrc, vUv + uTexel * vec2( 1.,  1.)).rgb;
  return s / 8.0;
}
vec3 up() {
  vec3 s = vec3(0.0);
  s += texture2D(uSrc, vUv + uTexel * vec2(-2., 0.)).rgb + texture2D(uSrc, vUv + uTexel * vec2(2., 0.)).rgb;
  s += texture2D(uSrc, vUv + uTexel * vec2(0., -2.)).rgb + texture2D(uSrc, vUv + uTexel * vec2(0., 2.)).rgb;
  s += (texture2D(uSrc, vUv + uTexel * vec2(-1., -1.)).rgb + texture2D(uSrc, vUv + uTexel * vec2(1., -1.)).rgb
      + texture2D(uSrc, vUv + uTexel * vec2(-1.,  1.)).rgb + texture2D(uSrc, vUv + uTexel * vec2(1.,  1.)).rgb) * 2.0;
  return s / 12.0;
}
```

With 5 levels that is about 10 draws at progressively tiny sizes, versus about 13 draws for UnrealBloom. More importantly, each draw touches a quarter of the previous level's pixels, and the weights are easy to tune.

**Tone mapping:**

| Operator | Character | In three |
|---|---|---|
| ACES Filmic | contrasty, filmic. Bright saturated colours shift hue and desaturate (a yellow coin can drift toward white/orange) | yes (`ACESFilmicToneMapping`) |
| AgX | Blender 4.x default view transform; smoother highlight roll-off, better hue preservation | **present in r161** (`AgXToneMapping = 6` in `src/constants.js`) |
| Neutral (Khronos PBR Neutral) | designed to keep base colours close to authored sRGB values; ideal for brand and pixel-art palettes | **not in r161, present in r186** (`NeutralToneMapping` imported by `OutputPass.js`) |

For Poko's palette, prefer **Neutral** or AgX, and match whatever view transform the Blender previews use (AgX by default in Blender 4.x). Keep HTML UI colours outside the tone-mapped canvas.

**Final "uber" pass.** Merge into one full-screen draw: bloom composite, exposure, tone map, sRGB encode, vignette, film grain (hash noise animated per frame) and an 8-bit dither to kill banding. That is one pass instead of three or four.

```glsl
// Original snippet: final pass (inputs linear HDR); grain after tone mapping, dither last.
uniform sampler2D uScene, uBloom; uniform float uBloomStrength, uTime; varying vec2 vUv;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec3 linearToSRGB(vec3 c){ return mix(c * 12.92, 1.055 * pow(c, vec3(1.0/2.4)) - 0.055, step(0.0031308, c)); }
void main() {
  vec3 hdr = texture2D(uScene, vUv).rgb + texture2D(uBloom, vUv).rgb * uBloomStrength;
  vec3 col = hdr / (1.0 + hdr);                         // placeholder: swap in AgX / Neutral
  float v = smoothstep(1.1, 0.35, length(vUv - 0.5));   // vignette
  col *= mix(0.8, 1.0, v);
  col += (hash(vUv * 1024.0 + uTime) - 0.5) * 0.03;     // grain
  col = linearToSRGB(clamp(col, 0.0, 1.0));
  col += (hash(gl_FragCoord.xy + 0.5) - 0.5) / 255.0;   // dither
  gl_FragColor = vec4(col, 1.0);
}
```

---

## 10. MSAA render targets

- `WebGLRenderTarget(w, h, { samples: 4, type: HalfFloatType })` (docs: "The number of MSAA samples. A value of 0 disables MSAA"). This is WebGL2 only. three renders into multisampled renderbuffers and resolves with `blitFramebuffer`.
- `RenderTarget.resolveDepthBuffer = false` skips the depth resolve when post passes don't need depth (docs).
- **Measured pitfall.** `EffectComposer` clones the render target you pass in (read and write buffers), so `samples: 4` allocated **4 multisampled renderbuffers** (colour + depth × 2). Put MSAA only on the scene pass target, and keep the ping-pong targets non-MSAA.
- When rendering through a composer, create the renderer with `antialias: false`. The default framebuffer's MSAA is wasted, because the final pass draws a full-screen triangle.
- `MAX_SAMPLES` is guaranteed ≥ 4 in WebGL2; 4 was measured here. On low tiers, drop MSAA and use FXAA/SMAA in the final pass. For voxels with hard silhouettes, MSAA is clearly better than FXAA.

---

## 11. The Codrops "curly tubes from the Lusion website" technique

> The Codrops page and its YouTube video were not reachable from this sandbox. Search excerpts confirm it is a live-coding session by Yuri Artiukh (streamed 2021-05-16), recreating "the curly noise tubes with light scattering" from Lusion's site in three.js. The explanation below is a **reconstruction of the standard technique**, not a transcript of the tutorial.

1. **Paths.** For each of ~50–200 tubes, pick a random start point and *integrate a curl-noise field* on the CPU at load time (e.g. 300 steps of `p += curl(p * scale) * step`). The resulting polyline swirls without self-collapsing, because curl fields are divergence-free (§5).
2. **Geometry.** `new THREE.CatmullRomCurve3(points)` → `new THREE.TubeGeometry(curve, tubularSegments, radius, radialSegments)`. TubeGeometry builds its rings from `curve.computeFrenetFrames()`. Despite the name, three's implementation propagates the normal along the curve following Hanson & Ma's *parallel transport* report (TR425, cited in `Curve.js`), which avoids sudden frame flips. Merge all tubes into **one** `BufferGeometry` (`BufferGeometryUtils.mergeGeometries`) so they draw in one call.
3. **Growth animation.** `TubeGeometry` UVs run 0→1 along the length (`uv.x`). In the fragment shader, `if (vUv.x > uProgress + offset) discard;` or `smoothstep` the alpha. Give each tube an offset so they draw on at different times.
4. **"Light scattering" shading** (fake subsurface or volumetric feel):
   - a point light near the cursor, projected into the scene (§ INTERACTION_ENGINEERING 7);
   - per fragment, intensity ∝ `1 / (1 + k·d²)` from the light, plus **wrap diffuse** `max(0, (dot(N,L) + w) / (1 + w))` so light bleeds around the thin tubes;
   - plus a **fresnel/rim** term `pow(1 − dot(N,V), 3)`;
   - optionally, depth-based colour so far tubes fade into the background.

   Thin, bright, additive-ish lines then bloom nicely.
5. **Cost.** 100 tubes × 300 segments × 8 radial = 240k vertices in one draw is fine on desktop. Halve the segments on mobile.

For POKO, the same recipe gives "energy filaments" between the disintegrating voxels and the portal.

---

## 12. Transparency and overdraw

- Transparent objects in three are sorted back-to-front per object, not per instance, and don't write depth by default. 20k semi-transparent instances will sort incorrectly *and* cost overdraw.
- For fading voxels use **opaque + dithered discard**. three has `material.alphaHash` (hashed alpha test, present in r186 `Material.js`), or `alphaToCoverage` when MSAA is on. Depth stays correct, there's no sorting, and grain or TAA hides the dither.
- Additive particles (sparks around the portal) are fine unsorted. Keep them small on screen, since fill rate is the cost.
- Measure overdraw by rendering with an additive flat-colour override material into a float target and reading the max. Or use Spector.js in a real browser.

## 13. Draw-call and fill-rate budget for POKO

| Item | Draws | Notes |
|---|---|---|
| Poko voxels (instanced, rigid-skinned) | 1 (+1 shadow) | 20k instances |
| Project sculptures (same instanced mesh, other formation) | 0–1 | reuse the voxel mesh via a formation texture |
| Portal (RT pass while visible) | 1 + destination scene draws at half res | only during the portal act |
| Background, floor, contact shadow | 2–3 | |
| Filaments (merged tubes) | 1 | |
| Bloom (dual filter, 5 levels) | ~10 at ≤ ½ res | |
| Final uber pass | 1 | |
| **Total** | **~20–30** | well within mobile budgets; the real constraint is **fill rate × DPR** |

Targets: DPR cap 1.5 on mobile and 2 on desktop. Bloom from half resolution. At most one MSAA target. No per-frame buffer uploads beyond the bone texture and uniforms. `renderer.compileAsync(scene, camera)` during the loader so programs don't compile mid-scroll.

---

## Sources

All accessed 2026-10-09.

- three.js docs (read from repo `docs/pages/*.html.md`, commit 43488e6): InstancedMesh https://threejs.org/docs/#api/en/objects/InstancedMesh ; InstancedBufferGeometry https://threejs.org/docs/#api/en/core/InstancedBufferGeometry ; InstancedBufferAttribute https://threejs.org/docs/#api/en/core/InstancedBufferAttribute ; DataArrayTexture https://threejs.org/docs/#api/en/textures/DataArrayTexture ; ShaderMaterial https://threejs.org/docs/#api/en/materials/ShaderMaterial ; Material.onBeforeCompile / customProgramCacheKey https://threejs.org/docs/#api/en/materials/Material ; PMREMGenerator https://threejs.org/docs/#api/en/extras/PMREMGenerator ; RenderTarget.samples / resolveDepthBuffer https://threejs.org/docs/#api/en/core/RenderTarget ; WebGLRenderer.info https://threejs.org/docs/#api/en/renderers/WebGLRenderer
- three.js source `three@0.186.1` (MIT): `src/core/BufferAttribute.js` (gpuType, addUpdateRange), `src/renderers/webgl/WebGLBindingStates.js` (integer attributes), `src/extras/core/Curve.js` (computeFrenetFrames, TR425), `examples/jsm/postprocessing/UnrealBloomPass.js`, `OutputPass.js`, `examples/jsm/misc/GPUComputationRenderer.js`, `examples/jsm/loaders/HDRLoader.js`
- three.js `three@0.161.0` `src/constants.js` (AgXToneMapping present; NeutralToneMapping absent)
- pmndrs postprocessing `postprocessing@6.39.5` (Zlib): MipmapBlurPass and KawaseBlurMaterial attribution comments
- Edan Kwan, The-Spirit (MIT): https://github.com/edankwan/The-Spirit (`src/glsl/position.frag`, `src/3d/particles.js`, `src/3d/postprocessing/*`)
- Codrops, Curly Tubes from the Lusion Website with Three.js (Y. Artiukh, 2021): https://tympanus.net/codrops/2021/05/17/curly-tubes-from-the-lusion-website-with-three-js/ (blocked; search excerpts only)
- Codrops, Drawing With Light: Lit GPU Tubes with TSL and WebGPU (2026): https://tympanus.net/codrops/2026/09/07/drawing-with-light-an-exploration-of-lit-gpu-tubes-with-tsl-and-webgpu/ (search excerpt)
- R. Bridson, J. Hourihan, M. Nordenstam, "Curl-Noise for Procedural Fluid Flow", SIGGRAPH 2007 (cited from knowledge)
- M. Bjørge, "Bandwidth-Efficient Rendering", ARM, SIGGRAPH 2015 (cited from knowledge); F. Piquet, UE4 custom bloom: https://www.froyok.fr/blog/2021-12-ue4-custom-bloom/ (as cited in pmndrs source)
- A. J. Hanson, H. Ma, "Parallel Transport Approach to Curve Framing", Indiana Univ. TR425: http://www.cs.indiana.edu/pub/techreports/TR425.pdf (as cited in three.js source)
- Ashima Arts / Stefan Gustavson, webgl-noise (MIT): https://github.com/ashima/webgl-noise (cited from knowledge)
