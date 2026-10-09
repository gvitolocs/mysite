import { ArrowUpRight } from "lucide-solid";
import { ProjectMedia, type Shots } from "@/components/projects/ProjectMedia";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TechIcon } from "@/components/ui/TechIcon";
import { Section } from "@/components/layout/Section";
import { projects, type Project } from "@/data/content";
import { cn } from "@/lib/utils";

const fmt = (v: number) => v.toLocaleString("en");

/** Bars on a linear scale: the honest picture is that the "after" bar for latency is barely visible. */
function CompareBars(props: { rows: NonNullable<Project["compare"]> }) {
  return (
    <div class="mb-5 space-y-5">
      {props.rows.map((row) => {
        const max = Math.max(row.before, row.after);
        const pct = (v: number) => `${Math.max((v / max) * 100, 1.2)}%`;
        const line = (name: string, v: number, fill: string) => (
          <div class="grid grid-cols-[92px_1fr_80px] items-center gap-3 text-xs">
            <span class="text-muted">{name}</span>
            <span class="h-1.5 overflow-hidden rounded-full bg-white/[0.05]">
              <span class={cn("bar-grow block h-full rounded-full", fill)} style={{ width: pct(v) }} />
            </span>
            <span class="text-right font-mono text-foreground/90">
              {fmt(v)} {row.unit}
            </span>
          </div>
        );
        return (
          <div>
            <p class="mb-2 text-xs text-muted">{row.label}</p>
            <div class="space-y-1.5">
              {line(row.beforeLabel, row.before, "bg-white/25")}
              {line(row.afterLabel, row.after, "bg-accent")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Projects(props: { shots: Shots }) {
  return (
    <Section id="projects" class="py-24 md:py-32">
      <Reveal>
        <SectionHeading
          eyebrow="Portfolio"
          title="Recent projects"
          description="Marketplace services, card inventory, large datasets and B2B product tools."
        />
      </Reveal>

      <div class="mt-12 grid gap-6 lg:grid-cols-2">
        {projects.map((p) => (
          <Reveal>
            <article
              class={cn(
                "group flex h-full flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-surface/50 p-6",
                "transition-[transform,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:hover:-translate-y-1.5",
                "hover:border-white/[0.1]",
                p.accent === "teal" &&
                  "hover:shadow-[0_0_0_1px_rgba(45,212,191,0.12),0_28px_80px_-48px_rgba(45,212,191,0.35)]",
                p.accent === "violet" &&
                  "hover:shadow-[0_0_0_1px_rgba(129,140,248,0.12),0_28px_80px_-48px_rgba(129,140,248,0.3)]",
              )}
            >
              {p.media ? <ProjectMedia media={p.media} shots={props.shots} /> : null}

              <div class="flex items-start justify-between gap-3">
                <div>
                  <p class="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">Project</p>
                  <h3 class="font-display mt-2 text-xl font-semibold tracking-tight text-foreground">{p.name}</h3>
                </div>
                <span
                  class={cn(
                    "rounded-full px-2.5 py-1 text-[11px] font-medium",
                    p.accent === "teal" && "bg-accent/10 text-accent",
                    p.accent === "violet" && "bg-accent-secondary/10 text-accent-secondary",
                  )}
                >
                  {p.tagline}
                </span>
              </div>

              <p class="mt-4 text-sm font-medium text-foreground/90">{p.outcome}</p>
              <p class="mt-3 flex-1 text-sm leading-relaxed text-muted">{p.description}</p>

              {p.metrics ? (
                <div class="mt-6 border-y border-white/[0.06] py-5">
                  {p.compare ? <CompareBars rows={p.compare} /> : null}
                  <dl class="grid gap-4 sm:grid-cols-2">
                    {p.metrics.map((metric) => (
                      <div>
                        <dt class="text-xs text-muted">{metric.label}</dt>
                        <dd class="mt-1 text-lg font-semibold text-foreground">{metric.value}</dd>
                      </div>
                    ))}
                  </dl>
                  {p.measurementNote ? (
                    <p class="mt-4 text-xs leading-relaxed text-muted">{p.measurementNote}</p>
                  ) : null}
                </div>
              ) : null}

              <ul class="mt-6 flex flex-wrap gap-2">
                {p.stack.map((s) => (
                  <li class="inline-flex items-center gap-1.5 rounded-md border border-white/[0.06] bg-background/40 px-2 py-1 font-mono text-[11px] text-muted">
                    <TechIcon name={s} />
                    {s}
                  </li>
                ))}
              </ul>

              {p.links.length > 0 ? (
                <div class="mt-6 flex flex-wrap gap-4 border-t border-white/[0.06] pt-5">
                  {p.links.map((l) => {
                    const external = l.href.startsWith("http");
                    return (
                      <a
                        href={l.href}
                        target={external ? "_blank" : undefined}
                        rel={external ? "noopener noreferrer" : undefined}
                        class="group/link inline-flex items-center gap-1 text-sm font-medium text-accent transition-colors hover:text-accent/80"
                      >
                        {l.label}
                        <ArrowUpRight
                          class="h-3.5 w-3.5 text-accent/70 transition-transform motion-safe:group-hover/link:-translate-y-0.5 motion-safe:group-hover/link:translate-x-0.5"
                          aria-hidden="true"
                        />
                      </a>
                    );
                  })}
                </div>
              ) : (
                <p class="mt-6 border-t border-white/[0.06] pt-5 text-xs text-muted">
                  No public link — details on request where appropriate.
                </p>
              )}
            </article>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
