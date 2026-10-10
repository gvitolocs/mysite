/**
 * Quality tiers and adaptive switching.
 *
 * Fill rate (pixels × passes) dominates this scene's cost, not geometry:
 * 4096 cubes are ~49k triangles, trivial for any WebGL2 GPU. So tiers trade
 * resolution, MSAA, shadows and bloom, never the voxel count. The pool size is
 * constant across tiers, which keeps every formation and correspondence
 * identical on every device.
 *
 * Adaptation uses frame-time percentiles with hysteresis: step down quickly
 * when p90 frame time exceeds the budget, step up slowly after a long run of
 * comfortable frames. A manual override (?quality=, or the UI toggle) disables
 * adaptation.
 */
export type QualityTier = 'low' | 'medium' | 'high';

export interface QualitySettings {
  tier: QualityTier;
  maxPixelRatio: number;
  msaa: number;
  shadows: boolean;
  shadowMapSize: number;
  bloom: boolean;
  dustCount: number;
  /** Render-resolution multiplier applied on top of the pixel-ratio cap. */
  resolutionScale: number;
  /**
   * Optional cap on rendered megapixels. A small phone screen can then render
   * sharp (high pixel ratio) while a large desktop window on the same tier
   * stays cheap: cost follows pixels, not the ratio.
   */
  pixelBudget?: number;
}

export const TIERS: Record<QualityTier, QualitySettings> = {
  high: { tier: 'high', maxPixelRatio: 2, msaa: 4, shadows: true, shadowMapSize: 2048, bloom: true, dustCount: 420, resolutionScale: 1 },
  medium: { tier: 'medium', maxPixelRatio: 1.5, msaa: 2, shadows: true, shadowMapSize: 1024, bloom: true, dustCount: 260, resolutionScale: 1 },
  // ~0.95 MP: a 1440 × 900 window renders at ~0.86× (as before); a phone at ~1.9× instead of 0.85×.
  low: { tier: 'low', maxPixelRatio: 2, msaa: 0, shadows: false, shadowMapSize: 512, bloom: false, dustCount: 120, resolutionScale: 1, pixelBudget: 0.95 },
};

const ORDER: QualityTier[] = ['low', 'medium', 'high'];

export interface DeviceProfile {
  mobile: boolean;
  cores: number;
  memoryGb: number | null;
  gpu: string;
  screenPixels: number;
}

/** First guess before any frame is measured. Conservative on phones. */
export function initialTier(device: DeviceProfile): QualityTier {
  const gpu = device.gpu.toLowerCase();
  const weakGpu = /swiftshader|llvmpipe|software|mali-4|mali-t|adreno \(tm\) [345]\d\d|powervr|intel\(r\) (hd|uhd) graphics [2-5]\d{2}\b/.test(gpu);
  if (weakGpu) return 'low';
  // iOS Safari reports neither real core counts nor memory; Apple GPUs handle the medium tier.
  if (device.mobile && /apple/.test(gpu)) return 'medium';
  if (device.mobile) return device.cores >= 6 && (device.memoryGb ?? 4) >= 4 ? 'medium' : 'low';
  if (device.cores <= 4 || (device.memoryGb !== null && device.memoryGb < 4)) return 'medium';
  return 'high';
}

export class QualityManager {
  private index: number;
  private locked: boolean;
  private comfortable = 0;
  private listeners = new Set<(s: QualitySettings) => void>();

  constructor(initial: QualityTier, locked = false) {
    this.index = ORDER.indexOf(initial);
    this.locked = locked;
  }

  get settings(): QualitySettings {
    return TIERS[ORDER[this.index]];
  }

  get isLocked(): boolean {
    return this.locked;
  }

  onChange(fn: (s: QualitySettings) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  set(tier: QualityTier, lock = true): void {
    this.locked = lock;
    this.apply(ORDER.indexOf(tier));
  }

  /**
   * Feed a window of frame times (ms). `budget` is the target frame time,
   * e.g. 16.7 for 60 Hz. Called about once a second by the experience.
   */
  evaluate(p90: number, budget: number): void {
    if (this.locked) return;
    if (p90 > budget * 1.35 && this.index > 0) {
      this.comfortable = 0;
      this.apply(this.index - 1);
    } else if (p90 < budget * 0.6) {
      if (++this.comfortable >= 8 && this.index < ORDER.length - 1) {
        this.comfortable = 0;
        this.apply(this.index + 1);
      }
    } else {
      this.comfortable = 0;
    }
  }

  private apply(index: number): void {
    if (index === this.index) return;
    this.index = index;
    for (const fn of this.listeners) fn(this.settings);
  }
}
