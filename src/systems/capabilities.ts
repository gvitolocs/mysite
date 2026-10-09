/** What can this browser do? Decides between the WebGL experience and the static page. */
import type { DeviceProfile } from './QualityManager.ts';

export interface Capabilities {
  webgl2: boolean;
  reducedMotion: boolean;
  saveData: boolean;
  device: DeviceProfile;
}

export function detectCapabilities(): Capabilities {
  let webgl2 = false;
  let gpu = 'unknown';
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false });
    if (gl) {
      webgl2 = true;
      const info = gl.getExtension('WEBGL_debug_renderer_info');
      gpu = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch {
    webgl2 = false;
  }
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && Math.min(screen.width, screen.height) < 820);
  return {
    webgl2,
    reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
    saveData: Boolean(nav.connection?.saveData),
    device: {
      mobile,
      cores: navigator.hardwareConcurrency || 4,
      memoryGb: nav.deviceMemory ?? null,
      gpu,
      screenPixels: screen.width * screen.height * (devicePixelRatio || 1) ** 2,
    },
  };
}
