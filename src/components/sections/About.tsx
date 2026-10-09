import { GraduationCap, MapPin, Sparkles, Wrench } from "lucide-solid";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Section } from "@/components/layout/Section";
import { about } from "@/data/content";

const highlightIcons = { Education: GraduationCap, "Based in": MapPin, "Working with": Wrench } as const;

export function About() {
  return (
    <Section id="about" class="py-24 md:py-32">
      <Reveal>
        <SectionHeading eyebrow={about.eyebrow} title={about.title} />
      </Reveal>

      <div class="mt-14 grid gap-12 lg:grid-cols-[1.1fr_0.9fr] lg:items-start">
        <div class="space-y-6">
          {about.paragraphs.map((p) => (
            <Reveal>
              <p class="text-base leading-relaxed text-muted md:text-lg">{p}</p>
            </Reveal>
          ))}
        </div>

        <Reveal class="rounded-2xl border border-white/[0.06] bg-surface/80 p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] backdrop-blur-sm md:p-8">
          <div class="space-y-6">
            {about.highlights.map((h) => {
              const Icon = highlightIcons[h.label as keyof typeof highlightIcons] ?? Sparkles;
              return (
                <div class="flex items-start gap-4 border-b border-white/[0.06] pb-5 last:border-0 last:pb-0">
                  <span class="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
                    <Icon class="h-4 w-4" aria-hidden="true" />
                  </span>
                  <div class="flex flex-col gap-1">
                    <span class="font-mono text-[11px] uppercase tracking-[0.18em] text-muted">{h.label}</span>
                    <span class="text-base font-medium text-foreground">{h.value}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Reveal>
      </div>
    </Section>
  );
}
