"use client";

import { motion, useReducedMotion } from "framer-motion";
import { MotionReveal } from "@/components/ui/MotionReveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Section } from "@/components/layout/Section";
import { experience } from "@/data/content";
import { cn } from "@/lib/utils";

const kindLabel = {
  education: "Education",
  work: "Experience",
  internship: "Internship",
  milestone: "Milestone",
} as const;

export function Experience() {
  const reduce = useReducedMotion();

  return (
    <Section id="experience" className="border-t border-white/[0.04] bg-[linear-gradient(180deg,rgba(12,12,14,0.4),transparent)] py-24 md:py-32">
      <MotionReveal>
        <SectionHeading
          eyebrow="Trajectory"
          title="Education & engineering experience"
          description="Current software projects, B2B and industrial internships, and my studies in Italy and Denmark."
        />
      </MotionReveal>

      <div className="relative mt-16">
        <div
          className="absolute left-[11px] top-2 bottom-2 hidden w-px bg-gradient-to-b from-accent/50 via-white/10 to-transparent md:block"
          aria-hidden
        />

        <ul className="space-y-8 md:space-y-10">
          {experience.map((item, i) => (
            <MotionReveal key={item.id} delay={i * 0.05}>
              <li className="relative grid gap-6 md:grid-cols-[160px_1fr] md:gap-10">
                <div className="flex gap-4 md:block md:pt-1">
                  <span className="mt-1.5 hidden h-2 w-2 shrink-0 rounded-full bg-accent shadow-[0_0_12px_rgba(45,212,191,0.6)] md:block" />
                  <div>
                    <p className="font-mono text-xs uppercase tracking-[0.16em] text-accent/90">
                      {kindLabel[item.kind]}
                    </p>
                    <p className="mt-2 font-mono text-sm text-muted">{item.period}</p>
                    <p className="mt-1 text-sm text-muted/90">{item.location}</p>
                  </div>
                </div>

                <motion.article
                  whileHover={
                    reduce
                      ? undefined
                      : { y: -4, transition: { duration: 0.25, ease: [0.22, 1, 0.36, 1] } }
                  }
                  className={cn(
                    "group rounded-2xl border border-white/[0.06] bg-surface/60 p-6 transition-shadow duration-300",
                    "hover:border-white/[0.1] hover:shadow-[0_0_0_1px_rgba(45,212,191,0.08),0_24px_64px_-40px_rgba(0,0,0,0.8)]",
                  )}
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="font-display text-xl font-semibold tracking-tight text-foreground">
                      {item.title}
                    </h3>
                    <span className="text-sm font-medium text-foreground/80">{item.org}</span>
                  </div>
                  <p className="mt-4 text-sm leading-relaxed text-muted md:text-base">{item.summary}</p>
                  <ul className="mt-5 flex flex-wrap gap-2">
                    {item.tags.map((t) => (
                      <li
                        key={t}
                        className="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-xs font-medium text-foreground/80"
                      >
                        {t}
                      </li>
                    ))}
                  </ul>
                </motion.article>
              </li>
            </MotionReveal>
          ))}
        </ul>
      </div>
    </Section>
  );
}
