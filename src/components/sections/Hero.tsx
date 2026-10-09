import type { JSX } from "solid-js";
import { Download, MapPin } from "lucide-solid";
import { Button } from "@/components/ui/Button";
import { AnimatedBackground } from "@/components/layout/AnimatedBackground";
import { hero, site } from "@/data/content";

export type Portrait = { src: string; srcset: string; width: number; height: number };

export function Hero(props: { portrait: Portrait; children?: JSX.Element }) {
  return (
    <section
      id="hero"
      class="relative min-h-[90svh] overflow-hidden border-b border-white/[0.04] pt-32 pb-20 md:pb-24"
    >
      <AnimatedBackground>{props.children}</AnimatedBackground>
      <div class="grain pointer-events-none" />

      <div class="relative z-10 mx-auto flex max-w-6xl flex-col gap-12 px-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-8">
        <div class="max-w-2xl">
          <p class="hero-in font-mono text-xs uppercase tracking-[0.22em] text-accent/90" style={{ "--d": "0s" }}>
            {site.role}
          </p>
          <h1
            class="hero-rise font-display mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl"
            style={{ "--d": "0.08s" }}
          >
            {hero.headline}
          </h1>
          <p class="hero-in mt-6 max-w-xl text-lg leading-relaxed text-muted md:text-xl" style={{ "--d": "0.16s" }}>
            {hero.subhead}
          </p>
          <div class="hero-in mt-10 flex flex-wrap gap-3" style={{ "--d": "0.24s" }}>
            <Button href={hero.primaryCta.href}>{hero.primaryCta.label}</Button>
            <Button
              href={hero.secondaryCta.href}
              variant="secondary"
              external
              icon={<Download class="h-4 w-4" aria-hidden="true" />}
            >
              {hero.secondaryCta.label}
            </Button>
          </div>
        </div>

        <div class="relative w-full max-w-md lg:max-w-sm">
          <div
            class="hero-in relative w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-elevated shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_-32px_rgba(45,212,191,0.25)]"
            style={{ "--d": "0.2s" }}
          >
            <div class="relative aspect-square w-full">
              <img
                src={props.portrait.src}
                srcset={props.portrait.srcset}
                sizes="(max-width: 480px) calc(100vw - 40px), (max-width: 1023px) 448px, 384px"
                width={props.portrait.width}
                height={props.portrait.height}
                alt="Portrait of Giuseppe Vitolo"
                fetchpriority="high"
                decoding="async"
                class="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            <div class="relative space-y-3 p-6">
              <div>
                <p class="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{hero.presence.label}</p>
                <p class="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground">
                  {site.name}
                  <span class="text-accent">.</span>
                </p>
              </div>
              <div class="space-y-2 text-sm text-muted">
                <p class="leading-relaxed">{hero.presence.line1}</p>
                <p class="inline-flex items-center gap-1.5 font-mono text-xs text-foreground/70">
                  <MapPin class="h-3.5 w-3.5" aria-hidden="true" />
                  {site.location}
                </p>
              </div>
            </div>
          </div>
          <div
            aria-hidden="true"
            class="animate-sway pointer-events-none absolute -right-6 -bottom-6 h-32 w-32 rounded-full border border-white/[0.06] bg-white/[0.02]"
          />
        </div>
      </div>
    </section>
  );
}
