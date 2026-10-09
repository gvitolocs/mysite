/** Easing and remapping helpers. All pure; GLSL twins live in `src/shaders/common.glsl`. */

export const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x);
export const clamp = (x: number, lo: number, hi: number) => (x < lo ? lo : x > hi ? hi : x);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Map x from [a, b] to [0, 1], clamped. The workhorse of the story timeline. */
export const range = (x: number, a: number, b: number) => clamp01((x - a) / (b - a));

export const smoothstep = (a: number, b: number, x: number) => {
  const t = range(x, a, b);
  return t * t * (3 - 2 * t);
};

export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);
export const easeInCubic = (t: number) => t * t * t;
export const easeInOutSine = (t: number) => -(Math.cos(Math.PI * t) - 1) / 2;
export const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));

/** sin(πt): 0 at both ends, 1 in the middle. Offsets scaled by it vanish at endpoints. */
export const bell = (t: number) => Math.sin(Math.PI * clamp01(t));

/**
 * Frame-rate independent exponential smoothing.
 * Moves `current` towards `target` so that after 1/lambda seconds ~63 % of the
 * gap is closed, regardless of how the elapsed time was split into frames.
 */
export const damp = (current: number, target: number, lambda: number, dt: number) =>
  lerp(current, target, 1 - Math.exp(-lambda * dt));
