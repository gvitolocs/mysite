"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import { AnimatedBackground } from "@/components/layout/AnimatedBackground";
import { hero, site } from "@/data/content";

const container = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.12, delayChildren: 0.05 },
  },
};

const item = {
  hidden: { opacity: 0, y: 28 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.65, ease: [0.22, 1, 0.36, 1] as const },
  },
};

export function Hero() {
  const reduce = useReducedMotion();

  return (
    <section
      id="hero"
      className="relative min-h-[90svh] overflow-hidden border-b border-white/[0.04] pt-32 pb-20 md:pb-24"
    >
      <AnimatedBackground />
      <div className="grain pointer-events-none" />

      <div className="relative z-10 mx-auto flex max-w-6xl flex-col gap-12 px-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:gap-12 lg:px-8">
        {reduce ? (
          <div className="max-w-2xl">
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-accent/90">{site.role}</p>
            <h1 className="font-display mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl">
              {hero.headline}
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted md:text-xl">{hero.subhead}</p>
            <div className="mt-10 flex flex-wrap gap-3">
              <Button href={hero.primaryCta.href}>{hero.primaryCta.label}</Button>
              <Button href={hero.secondaryCta.href} variant="secondary" external>
                {hero.secondaryCta.label}
              </Button>
            </div>
          </div>
        ) : (
          <motion.div
            className="max-w-2xl"
            variants={container}
            initial="hidden"
            animate="show"
          >
            <motion.p
              variants={item}
              className="font-mono text-xs uppercase tracking-[0.22em] text-accent/90"
            >
              {site.role}
            </motion.p>
            <motion.h1
              variants={item}
              className="font-display mt-4 text-4xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-5xl md:text-6xl"
            >
              {hero.headline}
            </motion.h1>
            <motion.p
              variants={item}
              className="mt-6 max-w-xl text-lg leading-relaxed text-muted md:text-xl"
            >
              {hero.subhead}
            </motion.p>
            <motion.div variants={item} className="mt-10 flex flex-wrap gap-3">
              <Button href={hero.primaryCta.href}>{hero.primaryCta.label}</Button>
              <Button href={hero.secondaryCta.href} variant="secondary" external>
                {hero.secondaryCta.label}
              </Button>
            </motion.div>
          </motion.div>
        )}

        <div className="relative w-full max-w-md lg:max-w-sm">
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={reduce ? undefined : { opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            className="relative w-full overflow-hidden rounded-2xl border border-white/[0.08] bg-surface-elevated shadow-[0_0_0_1px_rgba(255,255,255,0.04),0_24px_80px_-32px_rgba(45,212,191,0.25)]"
          >
            <div className="relative aspect-square w-full">
              <Image
                src={site.avatarUrl}
                alt="Portrait of Giuseppe Vitolo"
                fill
                preload
                sizes="(max-width: 480px) calc(100vw - 40px), (max-width: 1023px) 448px, 384px"
                className="object-cover"
              />
            </div>
            <div className="relative space-y-3 p-6">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                  {hero.presence.label}
                </p>
                <p className="mt-2 font-display text-2xl font-semibold tracking-tight text-foreground">
                  {site.name}
                  <span className="text-accent">.</span>
                </p>
              </div>
              <div className="space-y-2 text-sm text-muted">
                <p className="leading-relaxed">{hero.presence.line1}</p>
                <p className="font-mono text-xs text-foreground/70">{site.location}</p>
              </div>
            </div>
          </motion.div>
          {!reduce ? (
            <motion.div
              aria-hidden
              className="pointer-events-none absolute -right-6 -bottom-6 h-32 w-32 rounded-full border border-white/[0.06] bg-white/[0.02]"
              animate={{ rotate: [0, 6, 0] }}
              transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
            />
          ) : null}
        </div>
      </div>
    </section>
  );
}
