// Shared GLSL helpers: constants, easing, quaternions, hashing, noise.

#ifndef PI
#define PI 3.141592653589793
#endif
#define TAU 6.283185307179586

float easeInOutCubic(float t) {
  return t < 0.5 ? 4.0 * t * t * t : 1.0 - pow(-2.0 * t + 2.0, 3.0) * 0.5;
}

// sin(πt): zero at both ends. Any offset multiplied by it vanishes at t = 0 and
// t = 1, which is what makes every trajectory land exactly on its target.
float bell(float t) { return sin(PI * clamp(t, 0.0, 1.0)); }

// ---- quaternions (x, y, z, w) -------------------------------------------
vec3 qrotate(vec4 q, vec3 v) {
  return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}
vec4 qmul(vec4 a, vec4 b) {
  return vec4(a.w * b.xyz + b.w * a.xyz + cross(a.xyz, b.xyz), a.w * b.w - dot(a.xyz, b.xyz));
}
vec4 qaxis(vec3 axis, float angle) {
  float h = 0.5 * angle;
  return vec4(axis * sin(h), cos(h));
}
vec4 qslerp(vec4 a, vec4 b, float t) {
  float d = dot(a, b);
  if (d < 0.0) { b = -b; d = -d; }
  if (d > 0.9995) return normalize(mix(a, b, t));
  float th = acos(d);
  return (a * sin((1.0 - t) * th) + b * sin(t * th)) / sin(th);
}

// ---- hashing ------------------------------------------------------------
float hash11(float p) {
  p = fract(p * 0.1031);
  p *= p + 33.33;
  p *= p + p;
  return fract(p);
}
vec3 hash31(float p) {
  vec3 p3 = fract(vec3(p) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xxy + p3.yzz) * p3.zyx);
}

// ---- 3D simplex noise ---------------------------------------------------
// Ian McEwan, Stefan Gustavson (Ashima Arts). MIT License.
// https://github.com/ashima/webgl-noise
vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec4 permute(vec4 x) { return mod289(((x * 34.0) + 10.0) * x); }
vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

float snoise(vec3 v) {
  const vec2 C = vec2(1.0 / 6.0, 1.0 / 3.0);
  const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i = floor(v + dot(v, C.yyy));
  vec3 x0 = v - i + dot(i, C.xxx);
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min(g.xyz, l.zxy);
  vec3 i2 = max(g.xyz, l.zxy);
  vec3 x1 = x0 - i1 + C.xxx;
  vec3 x2 = x0 - i2 + C.yyy;
  vec3 x3 = x0 - D.yyy;
  i = mod289(i);
  vec4 p = permute(permute(permute(
            i.z + vec4(0.0, i1.z, i2.z, 1.0))
          + i.y + vec4(0.0, i1.y, i2.y, 1.0))
          + i.x + vec4(0.0, i1.x, i2.x, 1.0));
  float n_ = 0.142857142857;
  vec3 ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_);
  vec4 x = x_ * ns.x + ns.yyyy;
  vec4 y = y_ * ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4(x.xy, y.xy);
  vec4 b1 = vec4(x.zw, y.zw);
  vec4 s0 = floor(b0) * 2.0 + 1.0;
  vec4 s1 = floor(b1) * 2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw * sh.xxyy;
  vec4 a1 = b1.xzyw + s1.xzyw * sh.zzww;
  vec3 p0 = vec3(a0.xy, h.x);
  vec3 p1 = vec3(a0.zw, h.y);
  vec3 p2 = vec3(a1.xy, h.z);
  vec3 p3 = vec3(a1.zw, h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0, p0), dot(p1, p1), dot(p2, p2), dot(p3, p3)));
  p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
  vec4 m = max(0.5 - vec4(dot(x0, x0), dot(x1, x1), dot(x2, x2), dot(x3, x3)), 0.0);
  m = m * m;
  return 105.0 * dot(m * m, vec4(dot(p0, x0), dot(p1, x1), dot(p2, x2), dot(p3, x3)));
}

// Divergence-free "curl noise" (Bridson et al. 2007): the curl of a vector
// potential built from three decorrelated noise fields. Particles following it
// swirl without converging or diverging, which reads as fluid, not random.
// Potential psi = (snoise(p + O1), snoise(p + O2), snoise(p)).
// curl psi = (dpsi3/dy - dpsi2/dz, dpsi1/dz - dpsi3/dx, dpsi2/dx - dpsi1/dy)
vec3 curlNoise(vec3 p) {
  const float e = 0.1;
  const vec3 O1 = vec3(31.416, 0.0, 47.853);
  const vec3 O2 = vec3(-91.21, 12.77, 3.3);
  vec3 dx = vec3(e, 0.0, 0.0);
  vec3 dy = vec3(0.0, e, 0.0);
  vec3 dz = vec3(0.0, 0.0, e);
  float psi1_dy = snoise(p + O1 + dy) - snoise(p + O1 - dy);
  float psi1_dz = snoise(p + O1 + dz) - snoise(p + O1 - dz);
  float psi2_dx = snoise(p + O2 + dx) - snoise(p + O2 - dx);
  float psi2_dz = snoise(p + O2 + dz) - snoise(p + O2 - dz);
  float psi3_dx = snoise(p + dx) - snoise(p - dx);
  float psi3_dy = snoise(p + dy) - snoise(p - dy);
  return vec3(psi3_dy - psi2_dz, psi1_dz - psi3_dx, psi2_dx - psi1_dy) / (2.0 * e);
}
