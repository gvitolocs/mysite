import { onCleanup, onMount } from "solid-js";

type FieldExports = {
  memory: WebAssembly.Memory;
  init(width: number, height: number, seed: number): number;
  step(dtMs: number, pointerX: number, pointerY: number, pointerActive: number): void;
  particle_count(): number;
};

/** The canvas renders at half the CSS resolution; the browser's smooth upscale softens the trails. */
const SCALE = 0.5;
const MAX_W = 900;
const MAX_H = 600;

async function loadField(): Promise<FieldExports> {
  const url = "/wasm/hero_field.wasm";
  try {
    return (await WebAssembly.instantiateStreaming(fetch(url), {})).instance.exports as unknown as FieldExports;
  } catch {
    // instantiateStreaming needs the application/wasm MIME type; fall back if the host serves another one.
    const bytes = await (await fetch(url)).arrayBuffer();
    return (await WebAssembly.instantiate(bytes, {})).instance.exports as unknown as FieldExports;
  }
}

/**
 * Hero background island: the particle simulation and its pixels come from Rust (WebAssembly); this component
 * only sizes the canvas, forwards the pointer and copies the finished frame. Loads after the page is idle and
 * stays off for reduced motion or Save-Data, where the static gradient remains.
 */
export default function HeroField() {
  let canvas!: HTMLCanvasElement;
  let badge!: HTMLParagraphElement;

  onMount(() => {
    const nav = navigator as Navigator & { connection?: { saveData?: boolean } };
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || nav.connection?.saveData) return;

    let disposed = false;
    let frame = 0;
    let cleanup = () => {};
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 300));

    idle(async () => {
      if (disposed) return;
      const field = await loadField();
      if (disposed) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      let w = 0;
      let h = 0;
      let ptr = 0;
      let image: ImageData | null = null;
      let buffer: ArrayBuffer | null = null;
      const pointer = { x: 0, y: 0, active: 0, last: 0 };

      // Astro wraps islands in display:contents elements, so the canvas measures itself, not its parent.
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        w = Math.max(1, Math.min(MAX_W, Math.round(rect.width * SCALE)));
        h = Math.max(1, Math.min(MAX_H, Math.round(rect.height * SCALE)));
        canvas.width = w;
        canvas.height = h;
        ptr = field.init(w, h, (Math.random() * 2 ** 31) | 0);
        buffer = null;
      };

      const view = () => {
        // init() may grow WebAssembly memory, which detaches older views of it.
        if (buffer !== field.memory.buffer) {
          buffer = field.memory.buffer;
          image = new ImageData(new Uint8ClampedArray(buffer, ptr, w * h * 4), w, h);
        }
        return image!;
      };

      let stepTotal = 0;
      let stepCount = 0;
      let lastReport = 0;
      let last = performance.now();
      let ready = false;

      const tick = (now: number) => {
        const dt = Math.min(now - last, 50);
        last = now;
        if (pointer.active && now - pointer.last > 2000) pointer.active = 0;

        const t0 = performance.now();
        field.step(dt, pointer.x, pointer.y, pointer.active);
        stepTotal += performance.now() - t0;
        stepCount++;
        ctx.putImageData(view(), 0, 0);

        if (!ready) {
          ready = true;
          canvas.dataset.ready = "true";
          badge.dataset.ready = "true";
        }
        if (now - lastReport > 500) {
          const ms = (stepTotal / stepCount).toFixed(2);
          badge.textContent = `Particle field · Rust → WebAssembly · ${field.particle_count().toLocaleString("en")} particles · ${ms} ms/frame`;
          stepTotal = 0;
          stepCount = 0;
          lastReport = now;
        }
        frame = requestAnimationFrame(tick);
      };

      let visible = true;
      const run = () => {
        cancelAnimationFrame(frame);
        if (visible && !document.hidden) {
          last = performance.now();
          frame = requestAnimationFrame(tick);
        }
      };

      const onPointerMove = (e: PointerEvent) => {
        const rect = canvas.getBoundingClientRect();
        pointer.x = (e.clientX - rect.left) * SCALE;
        pointer.y = (e.clientY - rect.top) * SCALE;
        pointer.active = 1;
        pointer.last = performance.now();
      };
      const onPointerLeave = () => (pointer.active = 0);

      let resizeTimer = 0;
      const resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(resize, 150);
      });
      const intersection = new IntersectionObserver(([entry]) => {
        visible = entry.isIntersecting;
        run();
      });

      resize();
      resizeObserver.observe(canvas);
      intersection.observe(canvas);
      window.addEventListener("pointermove", onPointerMove, { passive: true });
      document.documentElement.addEventListener("pointerleave", onPointerLeave);
      document.addEventListener("visibilitychange", run);
      run();

      cleanup = () => {
        cancelAnimationFrame(frame);
        clearTimeout(resizeTimer);
        resizeObserver.disconnect();
        intersection.disconnect();
        window.removeEventListener("pointermove", onPointerMove);
        document.documentElement.removeEventListener("pointerleave", onPointerLeave);
        document.removeEventListener("visibilitychange", run);
      };
    });

    onCleanup(() => {
      disposed = true;
      cleanup();
    });
  });

  return (
    <>
      <canvas
        ref={canvas}
        aria-hidden="true"
        class="pointer-events-none absolute inset-0 h-full w-full opacity-0 mix-blend-screen transition-opacity duration-[1500ms] [mask-image:linear-gradient(100deg,rgba(0,0,0,0.28)_20%,black_75%)] data-[ready=true]:opacity-80"
      />
      <p
        ref={badge}
        class="absolute bottom-4 left-5 z-10 font-mono text-[10px] uppercase tracking-[0.18em] text-muted/70 opacity-0 transition-opacity duration-700 data-[ready=true]:opacity-100 sm:left-6 lg:left-8"
      />
    </>
  );
}
