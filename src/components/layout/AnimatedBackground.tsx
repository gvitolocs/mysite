import type { JSX } from "solid-js";

/** Static gradient backdrop; also the fallback when the WebAssembly field is off (no JS or reduced motion). */
export function AnimatedBackground(props: { children?: JSX.Element }) {
  return (
    <div class="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <div class="absolute -left-1/4 top-0 h-[520px] w-[520px] rounded-full bg-accent/15 blur-[120px] animate-pulse-glow" />
      <div class="absolute -right-1/4 top-1/3 h-[420px] w-[420px] rounded-full bg-accent-secondary/12 blur-[110px] animate-float-slow" />
      <div class="absolute left-1/2 top-[18%] h-[280px] w-[280px] -translate-x-1/2 rounded-full bg-white/[0.03] opacity-40 blur-[90px] animate-breathe" />
      <div class="absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,rgba(45,212,191,0.12),transparent)]" />
      {props.children}
    </div>
  );
}
