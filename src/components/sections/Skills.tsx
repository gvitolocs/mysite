import { Code2, Database, Layers, Server, ShieldCheck, Download, type LucideIcon } from "lucide-solid";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { TechIcon } from "@/components/ui/TechIcon";
import { Section } from "@/components/layout/Section";
import { cv, skills } from "@/data/content";
import { cn } from "@/lib/utils";

const categoryIcon: Record<string, LucideIcon> = {
  Programming: Code2,
  "Backend & data": Database,
  "Infrastructure & web": Server,
  "Systems & security": ShieldCheck,
};

const marquee = [
  "Rust",
  "PostgreSQL",
  "Kubernetes",
  "SolidJS",
  "React",
  "Docker",
  "Cloudflare",
  "Python",
  "Linux",
  "Git",
  "Java",
  "Dart",
  "Flutter",
  "Swift",
  "Kotlin",
  "MySQL",
];

export function Skills() {
  return (
    <Section
      id="skills"
      class="border-t border-white/[0.04] bg-[linear-gradient(180deg,transparent,rgba(12,12,14,0.5))] py-24 md:py-32"
    >
      <div class="flex flex-col gap-12 lg:flex-row lg:items-end lg:justify-between">
        <Reveal class="max-w-xl">
          <SectionHeading eyebrow={skills.eyebrow} title={skills.title} description={skills.summary} />
        </Reveal>
        {cv.available ? (
          <Reveal>
            <a
              href={cv.href}
              class="inline-flex w-fit items-center justify-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-foreground transition-colors hover:border-accent/40 hover:bg-accent/5"
            >
              <Download class="h-4 w-4" aria-hidden="true" />
              Download CV
            </a>
          </Reveal>
        ) : null}
      </div>

      <Reveal class="mt-10 rounded-2xl border border-white/[0.06] bg-surface/35 p-6 md:p-8">
        <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-accent/90">Education</p>
        <ul class="mt-4 space-y-2 text-sm text-muted md:text-base">
          {skills.educationSummary.map((line) => (
            <li class="flex gap-2">
              <span class="text-accent/80">·</span>
              <span class="text-foreground/90">{line}</span>
            </li>
          ))}
        </ul>
        {!cv.available ? (
          <p class="mt-6 text-sm text-muted">Full CV available on request — use the contact section.</p>
        ) : null}
      </Reveal>

      <div class="mt-12 overflow-hidden [mask-image:linear-gradient(90deg,transparent,black_12%,black_88%,transparent)]">
        <div class="marquee flex w-max motion-reduce:w-full motion-reduce:flex-wrap motion-reduce:justify-center motion-reduce:gap-y-4">
          {/* Two copies, each item padded (not gapped), so translateX(-50%) lands exactly on the second copy. */}
          {[...marquee, ...marquee].map((n, i) => (
            <span
              aria-hidden={i >= marquee.length ? "true" : undefined}
              class={cn(
                "inline-flex items-center gap-2 pr-10 font-mono text-xs text-muted motion-reduce:px-3",
                i >= marquee.length && "motion-reduce:hidden",
              )}
            >
              <TechIcon name={n} class="h-5 w-5" />
              {n}
            </span>
          ))}
        </div>
      </div>

      <div class="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {skills.categories.map((cat) => {
          const Icon = categoryIcon[cat.name] ?? Layers;
          return (
            <Reveal>
              <div class="h-full rounded-2xl border border-white/[0.06] bg-surface/40 p-6 transition-colors hover:border-white/[0.1]">
                <span class="mb-4 grid h-8 w-8 place-items-center rounded-lg bg-accent/10 text-accent">
                  <Icon class="h-4 w-4" aria-hidden="true" />
                </span>
                <h3 class="font-mono text-[11px] uppercase tracking-[0.2em] text-accent/90">{cat.name}</h3>
                <ul class="mt-5 space-y-3">
                  {cat.items.map((item) => (
                    <li class="flex items-center gap-2.5 text-sm text-muted">
                      <TechIcon name={item} class="h-4 w-4" />
                      <span class="text-foreground/90">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </Reveal>
          );
        })}
      </div>

      <Reveal class="mt-12 text-center">
        <p class="text-sm text-muted">
          Prefer a direct line?{" "}
          <a href="#contact" class="font-medium text-accent hover:text-accent/85">
            Contact
          </a>
          .
        </p>
      </Reveal>
    </Section>
  );
}
