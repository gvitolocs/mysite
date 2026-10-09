// Per-voxel state: the single function that decides where every voxel is.
//
// computeVoxel(id) is a pure function of (uniforms, static textures, id).
// Given the same morph progress it returns the same answer, frame after frame,
// whether the user scrolled forward or backward to get there. That property is
// what makes the cinematic scrubbable and reversible.
//
// Requires: common.glsl. Included by voxelCompute.frag (GPGPU path) and by the
// voxel vertex shader when float render targets are unavailable.

#define POOL_TEX 64
#define LAYER_POKO 0
#define LAYER_STREAM -1
#define BONE_COUNT 9

uniform highp sampler2DArray uFormPos;   // xyz position (world units, formation space), w scale
uniform highp sampler2DArray uFormCol;   // sRGB colour (decoded to linear by the GPU), a = material id / 255
uniform highp sampler2D uStatic;         // r = bone + depth * 0.99, g = seedA, b = seedB, a = cluster seed

uniform int uFrom;
uniform int uTo;
uniform vec4 uFromT;                     // formation placement: xyz translation, w uniform scale
uniform vec4 uFromQ;                     // formation rotation (quaternion)
uniform vec4 uToT;
uniform vec4 uToQ;

uniform float uMorph;                    // 0..1 progress of the active morph
uniform float uSpread;                   // share of the morph used for staggering voxel departures
uniform vec4 uDelayAxis;                 // key = dot(fromPos, xyz) + w, expected in 0..1
uniform vec4 uDelayW;                    // weights: x axis, y surface depth, z seed; w > 0.5 inverts
uniform vec3 uCenter;                    // explosion / attraction centre
uniform float uExplode;
uniform vec3 uArc;
uniform vec4 uSwirl;                     // xyz axis, w angle (radians) at mid-flight
uniform vec3 uSwirlCenter;
uniform vec3 uNoise;                     // x amplitude, y frequency, z clump coherence (1 = move in clumps)
uniform float uSpin;                     // tumble angle at mid-flight
uniform float uTransitScale;             // voxel scale multiplier at mid-flight
uniform float uVibrate;                  // shiver amplitude just before a voxel departs
uniform float uGlow;                     // emissive kick while in flight
uniform float uIdle;                     // ambient drift amplitude (time based, small)
uniform float uTime;

// Poko's rig, decomposed skinning matrices (bone world * inverse bind).
uniform vec4 uBoneT[BONE_COUNT];
uniform vec4 uBoneQ[BONE_COUNT];
uniform vec4 uBoneS[BONE_COUNT];
uniform float uDepth;                    // awakening: 0 = flat pixel art, 1 = full volume
uniform float uDepthStagger;
uniform vec3 uPokoCenter;                // Poko's centre in character space (world units)

// Procedural stream: a tube along a cubic Bézier, flowing with uStream.x.
uniform vec3 uStreamP0;
uniform vec3 uStreamP1;
uniform vec3 uStreamP2;
uniform vec3 uStreamP3;
uniform vec4 uStream;                    // x flow phase, y radius, z twist turns, w voxel scale

// Interaction (additive, decays to zero; never changes the scroll-defined state).
uniform vec3 uRayOrigin;
uniform vec3 uRayDir;
uniform vec2 uPush;                      // x strength, y radius
uniform vec4 uRipple;                    // xyz origin, w age in seconds (< 0: inactive)

struct Endpoint {
  vec3 pos;
  vec4 quat;
  vec3 scale;
  vec3 color;
  float mat;
};

struct VoxelState {
  vec3 pos;
  vec4 quat;
  vec3 scale;
  vec3 color;
  float mat;
  float glow;
};

vec3 bezier3(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
  float s = 1.0 - t;
  return s * s * s * a + 3.0 * s * s * t * b + 3.0 * s * t * t * c + t * t * t * d;
}
vec3 bezier3Tangent(vec3 a, vec3 b, vec3 c, vec3 d, float t) {
  float s = 1.0 - t;
  return normalize(3.0 * s * s * (b - a) + 6.0 * s * t * (c - b) + 3.0 * t * t * (d - c));
}

Endpoint pokoEndpoint(ivec2 tc, vec4 st) {
  vec4 rest = texelFetch(uFormPos, ivec3(tc, LAYER_POKO), 0);
  vec4 col = texelFetch(uFormCol, ivec3(tc, LAYER_POKO), 0);
  int bone = int(st.r);
  // Awakening: the pixel art starts flat and gains depth ring by ring.
  float ring = clamp(length(rest.xy - uPokoCenter.xy) / 1.35, 0.0, 1.0);
  float d = clamp((uDepth - ring * uDepthStagger) / max(1.0 - uDepthStagger, 1e-4), 0.0, 1.0);
  d = d * d * (3.0 - 2.0 * d);
  float zScale = mix(0.035, 1.0, d);
  vec3 p = vec3(rest.xy, rest.z * zScale);
  vec4 bt = uBoneT[bone];
  vec4 bq = uBoneQ[bone];
  vec3 bs = uBoneS[bone].xyz;
  Endpoint e;
  e.pos = bt.xyz + qrotate(bq, bs * p);
  e.quat = bq;
  e.scale = bs * vec3(1.0, 1.0, zScale) * rest.w;
  e.color = col.rgb;
  e.mat = floor(col.a * 255.0 + 0.5);
  return e;
}

Endpoint streamEndpoint(float seedA, float seedB, float cluster) {
  float u = fract(seedA + uStream.x);
  vec3 c = bezier3(uStreamP0, uStreamP1, uStreamP2, uStreamP3, u);
  vec3 t = bezier3Tangent(uStreamP0, uStreamP1, uStreamP2, uStreamP3, u);
  vec3 n = normalize(cross(t, abs(t.y) < 0.95 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
  vec3 b = cross(t, n);
  float ang = seedB * TAU + u * uStream.z * TAU;
  float r = uStream.y * sqrt(fract(cluster * 7.31 + seedB));
  Endpoint e;
  e.pos = c + (n * cos(ang) + b * sin(ang)) * r;
  e.quat = qaxis(normalize(hash31(seedA * 113.0) - 0.5), u * 9.0 + seedB * TAU);
  // Fade in and out at the ends of the tube so the wrap-around is invisible.
  float edge = smoothstep(0.0, 0.07, u) * (1.0 - smoothstep(0.9, 1.0, u));
  e.scale = vec3(uStream.w * (0.55 + 0.45 * seedB) * edge);
  e.color = vec3(0.0);   // keeps the colour of the formation it came from (see below)
  e.mat = -1.0;
  return e;
}

Endpoint formationEndpoint(int layer, vec4 T, vec4 Q, ivec2 tc, vec4 st) {
  if (layer == LAYER_POKO) return pokoEndpoint(tc, st);
  if (layer == LAYER_STREAM) return streamEndpoint(st.g, st.b, st.a);
  vec4 p = texelFetch(uFormPos, ivec3(tc, layer), 0);
  vec4 col = texelFetch(uFormCol, ivec3(tc, layer), 0);
  Endpoint e;
  e.pos = T.xyz + qrotate(Q, p.xyz * T.w);
  e.quat = Q;
  e.scale = vec3(p.w * T.w);
  e.color = col.rgb;
  e.mat = floor(col.a * 255.0 + 0.5);
  return e;
}

VoxelState computeVoxel(int id) {
  ivec2 tc = ivec2(id % POOL_TEX, id / POOL_TEX);
  vec4 st = texelFetch(uStatic, tc, 0);
  float depth01 = fract(st.r) / 0.99;
  float seedA = st.g;
  float seedB = st.b;
  float cluster = st.a;

  Endpoint a = formationEndpoint(uFrom, uFromT, uFromQ, tc, st);
  Endpoint b = a; // WebGL forbids ?: on structs
  if (uTo != uFrom) b = formationEndpoint(uTo, uToT, uToQ, tc, st);
  // The stream has no colour of its own: voxels keep the colour they arrived with.
  if (b.mat < 0.0) { b.color = a.color; b.mat = a.mat; }
  if (a.mat < 0.0) { a.color = b.color; a.mat = b.mat; }

  // Staggered departure. Each voxel's own progress ("local") starts at a delay
  // derived from where it is (axis sweep), how deep it is (surface first) and
  // its seed; uSpread controls how much of the morph the stagger occupies.
  float axisKey = clamp(dot(a.pos, uDelayAxis.xyz) + uDelayAxis.w, 0.0, 1.0);
  float wsum = max(uDelayW.x + uDelayW.y + uDelayW.z, 1e-4);
  float delay = (uDelayW.x * axisKey + uDelayW.y * depth01 + uDelayW.z * seedA) / wsum;
  if (uDelayW.w > 0.5) delay = 1.0 - delay;
  float start = delay * uSpread;
  float local = clamp((uMorph - start) / max(1.0 - uSpread, 1e-4), 0.0, 1.0);
  float e = easeInOutCubic(local);
  float bl = bell(local);

  vec3 p = mix(a.pos, b.pos, e);

  // Flight shaping. Every term is scaled by bl, so endpoints are exact.
  vec3 away = a.pos - uCenter;
  float awayLen = length(away);
  vec3 dir = awayLen > 1e-4 ? away / awayLen : normalize(hash31(seedA * 71.0) - 0.5);
  p += dir * uExplode * bl * (0.35 + 0.9 * seedB);
  p += uArc * bl * (0.55 + 0.9 * seedA);
  if (abs(uSwirl.w) > 1e-5) {
    vec4 sq = qaxis(uSwirl.xyz, uSwirl.w * bl * (0.55 + 0.9 * seedB));
    p = uSwirlCenter + qrotate(sq, p - uSwirlCenter);
  }
  if (uNoise.x > 0.0) {
    // Early in flight voxels move in clumps (shared cluster seed), later each on its own.
    float own = mix(1.0 - uNoise.z, 1.0, local);
    vec3 nseed = mix(vec3(cluster * 37.1, cluster * 11.3, cluster * 23.7), vec3(seedA * 91.7, seedB * 53.3, seedA * 17.9), own);
    p += curlNoise(a.pos * uNoise.y + nseed + vec3(0.0, local * 1.3, 0.0)) * uNoise.x * bl;
  }

  // Shiver just before leaving: amplitude is a function of progress; the
  // oscillation itself is time based and zero-mean.
  float about = smoothstep(start - 0.06, start, uMorph) * (1.0 - smoothstep(0.0, 0.12, local));
  if (uVibrate > 0.0 && about > 0.0) {
    vec3 w = vec3(sin(uTime * 61.0 + seedA * 40.0), sin(uTime * 53.0 + seedB * 40.0), sin(uTime * 47.0 + cluster * 40.0));
    p += w * uVibrate * about;
  }

  if (uIdle > 0.0) {
    p += vec3(sin(uTime * 0.37 + seedA * TAU), sin(uTime * 0.51 + seedB * TAU), sin(uTime * 0.43 + cluster * TAU)) * uIdle;
  }

  // Pointer: voxels near the pointer ray lean away from it.
  if (uPush.x > 0.0) {
    vec3 rel = p - uRayOrigin;
    vec3 closest = uRayOrigin + uRayDir * max(dot(rel, uRayDir), 0.0);
    vec3 off = p - closest;
    float dl = length(off);
    if (dl > 1e-4) p += off / dl * uPush.x * exp(-(dl * dl) / (uPush.y * uPush.y));
  }
  // Click ripple: a decaying spherical wave.
  if (uRipple.w >= 0.0 && uRipple.w < 2.0) {
    vec3 off = p - uRipple.xyz;
    float dl = length(off);
    float wave = sin(dl * 9.0 - uRipple.w * 14.0) * exp(-uRipple.w * 2.6) * exp(-dl * 1.4);
    if (dl > 1e-4) p += off / dl * wave * 0.07;
  }

  VoxelState s;
  s.pos = p;
  vec4 spin = qaxis(normalize(hash31(seedA * 131.0 + 7.0) - 0.5), uSpin * bl * (seedB * 2.0 - 1.0));
  s.quat = normalize(qmul(spin, qslerp(a.quat, b.quat, e)));
  float sc = smoothstep(0.0, 1.0, local);
  s.scale = mix(a.scale, b.scale, sc) * mix(1.0, uTransitScale, bl);
  s.color = mix(a.color, b.color, smoothstep(0.3, 0.7, local));
  s.mat = local < 0.5 ? a.mat : b.mat;
  s.glow = clamp(uGlow * bl * (0.4 + 0.6 * seedB), 0.0, 0.99);
  return s;
}
