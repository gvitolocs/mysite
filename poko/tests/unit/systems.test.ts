import { describe, expect, it } from 'vitest';
import { PerformanceMonitor } from '../../src/systems/PerformanceMonitor.ts';
import { QualityManager, initialTier } from '../../src/systems/QualityManager.ts';
import { damp } from '../../src/math/easing.ts';

/** The ScrollController spring, isolated (same maths, no DOM). */
function spring(x0: number, v0: number, target: number, w: number, dt: number): [number, number] {
  const x = x0 - target;
  const e = Math.exp(-w * dt);
  return [target + (x + (v0 + w * x) * dt) * e, (v0 - (v0 + w * x) * w * dt) * e];
}

describe('smoothing is frame-rate independent', () => {
  it('critically damped spring: 1 × 1/30 s equals 2 × 1/60 s', () => {
    const [a] = spring(0, 0, 1, 9, 1 / 30);
    let s: [number, number] = [0, 0];
    s = spring(s[0], s[1], 1, 9, 1 / 60);
    s = spring(s[0], s[1], 1, 9, 1 / 60);
    expect(s[0]).toBeCloseTo(a, 12);
  });

  it('spring never overshoots the target', () => {
    let s: [number, number] = [0, 0];
    for (let i = 0; i < 600; i++) {
      s = spring(s[0], s[1], 1, 9, 1 / 60);
      expect(s[0]).toBeLessThanOrEqual(1 + 1e-12);
    }
    expect(s[0]).toBeCloseTo(1, 6);
  });

  it('exponential damp: 1 × dt equals 4 × dt/4', () => {
    let v = 0;
    for (let i = 0; i < 4; i++) v = damp(v, 10, 5, 0.05);
    expect(v).toBeCloseTo(damp(0, 10, 5, 0.2), 12);
  });
});

describe('PerformanceMonitor', () => {
  it('reports percentiles and jank from a ring buffer', () => {
    const m = new PerformanceMonitor(100);
    for (let i = 0; i < 95; i++) m.record(16.7, 2);
    for (let i = 0; i < 5; i++) m.record(50, 9);
    const s = m.stats();
    expect(s.frames).toBe(100);
    expect(s.p50).toBeCloseTo(16.7, 1);
    expect(s.p99).toBeCloseTo(50, 1);
    expect(s.jank).toBe(5);
    expect(s.cpuP95).toBeGreaterThanOrEqual(2);
  });
});

describe('QualityManager', () => {
  it('steps down fast on slow frames and up slowly on fast ones', () => {
    const q = new QualityManager('high');
    const changes: string[] = [];
    q.onChange((s) => changes.push(s.tier));
    q.evaluate(40, 16.7);
    expect(q.settings.tier).toBe('medium');
    for (let i = 0; i < 7; i++) q.evaluate(6, 16.7);
    expect(q.settings.tier).toBe('medium');
    q.evaluate(6, 16.7);
    expect(q.settings.tier).toBe('high');
    expect(changes).toEqual(['medium', 'high']);
  });

  it('respects a manual lock', () => {
    const q = new QualityManager('low', true);
    q.evaluate(4, 16.7);
    for (let i = 0; i < 20; i++) q.evaluate(4, 16.7);
    expect(q.settings.tier).toBe('low');
  });

  it('starts conservatively on software renderers and phones', () => {
    expect(initialTier({ mobile: false, cores: 16, memoryGb: 16, gpu: 'Google SwiftShader', screenPixels: 4e6 })).toBe('low');
    expect(initialTier({ mobile: true, cores: 4, memoryGb: 3, gpu: 'Mali-G57', screenPixels: 3e6 })).toBe('low');
    expect(initialTier({ mobile: false, cores: 8, memoryGb: 8, gpu: 'Apple M2', screenPixels: 4e6 })).toBe('high');
  });
});
