import { Briefcase, Flag, FlaskConical, GraduationCap, MapPin, type LucideIcon } from "lucide-solid";
import { Reveal } from "@/components/ui/Reveal";
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

const kindIcon: Record<string, LucideIcon> = {
  education: GraduationCap,
  work: Briefcase,
  internship: FlaskConical,
  milestone: Flag,
};

export function Experience() {
  return (
    <Section id="experience" class="border-t border-white/[0.04] bg-[linear-gradient(180deg,rgba(12,12,14,0.4),transparent)] py-24 md:py-32">
      <Reveal>
        <SectionHeading
          eyebrow="Trajectory"
          title="Education & engineering experience"
          description="Current software projects, B2B and industrial internships, and my studies in Italy and Denmark."
        />
      </Reveal>

      <div class="relative mt-16">
        <div
          class="absolute left-[11.5px] top-2 bottom-2 hidden w-px bg-gradient-to-b from-accent/50 via-white/10 to-transparent md:block"
          aria-hidden="true"
        />

        <ul class="space-y-8 md:space-y-10">
          {experience.map((item) => {
            const Icon = kindIcon[item.kind];
            return (
              <li class="reveal relative grid gap-6 md:grid-cols-[160px_1fr] md:gap-10">
                <div class="flex gap-4 md:block md:pt-1">
                  <span class="mt-1.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-accent/40 bg-background text-accent shadow-[0_0_12px_rgba(45,212,191,0.35)]">
                    <Icon class="h-3.5 w-3.5" aria-hidden="true" />
                  </span>
                  <div>
                    <p class="font-mono text-xs uppercase tracking-[0.16em] text-accent/90">
                      {kindLabel[item.kind]}
                    </p>
                    <p class="mt-2 font-mono text-sm text-muted">{item.period}</p>
                    <p class="mt-1 inline-flex items-center gap-1.5 text-sm text-muted/90">
                      <MapPin class="h-3.5 w-3.5" aria-hidden="true" />
                      {item.location}
                    </p>
                  </div>
                </div>

                <article
                  class={cn(
                    "group rounded-2xl border border-white/[0.06] bg-surface/60 p-6",
                    "transition-[transform,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:hover:-translate-y-1",
                    "hover:border-white/[0.1] hover:shadow-[0_0_0_1px_rgba(45,212,191,0.08),0_24px_64px_-40px_rgba(0,0,0,0.8)]",
                  )}
                >
                  <div class="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 class="font-display text-xl font-semibold tracking-tight text-foreground">
                      {item.title}
                    </h3>
                    <span class="text-sm font-medium text-foreground/80">{item.org}</span>
                  </div>
                  <p class="mt-4 text-sm leading-relaxed text-muted md:text-base">{item.summary}</p>
                  <ul class="mt-5 flex flex-wrap gap-2">
                    {item.tags.map((t) => (
                      <li class="rounded-full border border-white/[0.06] bg-white/[0.02] px-3 py-1 text-xs font-medium text-foreground/80">
                        {t}
                        </li>
                      ))}
                    </ul>
                  </article>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
