import { Boxes, Network, Shield, Sparkles, type LucideIcon } from "lucide-solid";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Section } from "@/components/layout/Section";
import { vision } from "@/data/content";
import { cn } from "@/lib/utils";

const pillarIcon: Record<string, LucideIcon> = {
  Systems: Network,
  Security: Shield,
  Products: Boxes,
};

export function Vision() {
  return (
    <Section
      id="vision"
      class="border-t border-white/[0.04] bg-[radial-gradient(ellipse_80%_50%_at_50%_0%,rgba(45,212,191,0.08),transparent)] py-24 md:py-32"
    >
      <Reveal>
        <SectionHeading eyebrow={vision.eyebrow} title={vision.title} align="center" class="mx-auto" />
      </Reveal>

      <div class="mx-auto mt-12 max-w-3xl space-y-6 text-center">
        {vision.paragraphs.map((p) => (
          <Reveal>
            <p class="text-base leading-relaxed text-muted md:text-lg">{p}</p>
          </Reveal>
        ))}
      </div>

      <div class="mt-16 grid gap-5 md:grid-cols-3">
        {vision.pillars.map((pillar, i) => {
          const Icon = pillarIcon[pillar.title] ?? Sparkles;
          return (
            <Reveal>
              <div
                class={cn(
                  "group rounded-2xl border border-white/[0.06] bg-surface/40 p-6 text-left",
                  "transition-[transform,border-color] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:hover:-translate-y-1",
                  "hover:border-white/[0.1]",
                )}
              >
                <div class="flex items-center justify-between">
                  <p class="font-mono text-[11px] uppercase tracking-[0.2em] text-accent/90">
                    {String(i + 1).padStart(2, "0")}
                  </p>
                  <Icon
                    class="h-5 w-5 text-accent transition-transform duration-300 motion-safe:group-hover:scale-110"
                    aria-hidden="true"
                  />
                </div>
                <h3 class="font-display mt-3 text-lg font-semibold text-foreground">{pillar.title}</h3>
                <p class="mt-2 text-sm leading-relaxed text-muted">{pillar.body}</p>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
