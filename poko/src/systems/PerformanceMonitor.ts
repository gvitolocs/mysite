/**
 * Frame-time statistics. Records the interval between rendered frames and the
 * CPU time spent producing each one, in fixed ring buffers (no allocation per
 * frame), and reports percentiles: averages hide the stutters people notice.
 */
export interface FrameStats {
  frames: number;
  fps: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  /** Frames longer than 1.5× the median interval. */
  jank: number;
  cpuP50: number;
  cpuP95: number;
}

export class PerformanceMonitor {
  private readonly intervals: Float32Array;
  private readonly cpu: Float32Array;
  private count = 0;
  private head = 0;
  private scratch: Float32Array;

  constructor(private readonly size = 600) {
    this.intervals = new Float32Array(size);
    this.cpu = new Float32Array(size);
    this.scratch = new Float32Array(size);
  }

  record(intervalMs: number, cpuMs: number): void {
    this.intervals[this.head] = intervalMs;
    this.cpu[this.head] = cpuMs;
    this.head = (this.head + 1) % this.size;
    this.count = Math.min(this.count + 1, this.size);
  }

  reset(): void {
    this.count = 0;
    this.head = 0;
  }

  private percentiles(src: Float32Array, n: number, ps: number[]): number[] {
    const a = this.scratch.subarray(0, n);
    for (let i = 0; i < n; i++) a[i] = src[(this.head - n + i + this.size) % this.size];
    a.sort();
    return ps.map((p) => a[Math.min(n - 1, Math.floor(p * (n - 1)))]);
  }

  /** Stats over the most recent `window` frames (default: all retained). */
  stats(window = this.count): FrameStats {
    const n = Math.min(window, this.count);
    if (n === 0) return { frames: 0, fps: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, jank: 0, cpuP50: 0, cpuP95: 0 };
    const [p50, p90, p95, p99, max] = this.percentiles(this.intervals, n, [0.5, 0.9, 0.95, 0.99, 1]);
    let jank = 0;
    let sum = 0;
    for (let i = 0; i < n; i++) {
      const v = this.intervals[(this.head - n + i + this.size) % this.size];
      sum += v;
      if (v > p50 * 1.5) jank++;
    }
    const [cpuP50, cpuP95] = this.percentiles(this.cpu, n, [0.5, 0.95]);
    return { frames: n, fps: 1000 / (sum / n), p50, p90, p95, p99, max, jank, cpuP50, cpuP95 };
  }

  /** Raw interval samples, oldest first (for histograms in tests). */
  samples(): number[] {
    const out: number[] = [];
    for (let i = 0; i < this.count; i++) out.push(this.intervals[(this.head - this.count + i + this.size) % this.size]);
    return out;
  }
}
