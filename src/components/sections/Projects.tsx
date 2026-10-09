"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { MotionReveal } from "@/components/ui/MotionReveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Section } from "@/components/layout/Section";
import { projects } from "@/data/content";
import { cn } from "@/lib/utils";

export function Projects() {
  const reduce = useReducedMotion();

  return (
    <Section id="projects" className="py-24 md:py-32">
      <MotionReveal>
        <SectionHeading
          eyebrow="Portfolio"
          title="Recent projects"
          description="Marketplace services, card inventory, large datasets and B2B product tools."
        />
      </MotionReveal>

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        {projects.map((p, i) => (
          <MotionReveal key={p.id} delay={i * 0.06}>
            <motion.article
              whileHover={
                reduce
                  ? undefined
                  : {
                      y: -6,
                      transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1] },
                    }
              }
              className={cn(
                "flex h-full flex-col rounded-2xl border border-white/[0.06] bg-surface/50 p-6 transition-shadow duration-300",
                "hover:border-white/[0.1]",
                p.accent === "teal" &&
                  "hover:shadow-[0_0_0_1px_rgba(45,212,191,0.12),0_28px_80px_-48px_rgba(45,212,191,0.35)]",
                p.accent === "violet" &&
                  "hover:shadow-[0_0_0_1px_rgba(129,140,248,0.12),0_28px_80px_-48px_rgba(129,140,248,0.3)]",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Project</p>
                  <h3 className="font-display mt-2 text-xl font-semibold tracking-tight text-foreground">
                    {p.name}
                  </h3>
                </div>
                <span
                  className={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium",
                    p.accent === "teal" && "bg-accent/10 text-accent",
                    p.accent === "violet" && "bg-accent-secondary/10 text-accent-secondary",
                  )}
                >
                  {p.tagline}
                </span>
              </div>

              <p className="mt-4 text-sm font-medium text-foreground/90">{p.outcome}</p>
              <p className="mt-3 flex-1 text-sm leading-relaxed text-muted">{p.description}</p>

              {p.metrics ? (
                <div className="mt-6 border-y border-white/[0.06] py-5">
                  <dl className="grid gap-4 sm:grid-cols-2">
                    {p.metrics.map((metric) => (
                      <div key={metric.label}>
                        <dt className="text-xs text-muted">{metric.label}</dt>
                        <dd className="mt-1 text-lg font-semibold text-foreground">{metric.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {p.measurementNote ? (
                    <p className="mt-4 text-xs leading-relaxed text-muted">{p.measurementNote}</p>
                  ) : null}
                </div>
              ) : null}

              <ul className="mt-6 flex flex-wrap gap-2">
                {p.stack.map((s) => (
                  <li
                    key={s}
                    className="rounded-md border border-white/[0.06] bg-background/40 px-2 py-1 font-mono text-[11px] text-muted"
                  >
                    {s}
                  </li>
                ))}
              </ul>

              {p.links.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-3 border-t border-white/[0.06] pt-5">
                  {p.links.map((l) => (
                    <Link
                      key={l.label}
                      href={l.href}
                      target={l.href.startsWith("http") ? "_blank" : undefined}
                      rel={l.href.startsWith("http") ? "noopener noreferrer" : undefined}
                      className="text-sm font-medium text-accent transition-colors hover:text-accent/80"
                    >
                      {l.label}
                      <span className="text-accent/60"> ↗</span>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="mt-6 border-t border-white/[0.06] pt-5 text-xs text-muted">
                  No public link — details on request where appropriate.
                </p>
              )}
            </motion.article>
          </MotionReveal>
        ))}
      </div>
    </Section>
  );
}
