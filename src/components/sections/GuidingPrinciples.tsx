import { Gauge, ShieldCheck, Sparkles, Users, Wrench, type LucideIcon } from "lucide-solid";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Section } from "@/components/layout/Section";
import { guidingPrinciples } from "@/data/content";
import { cn } from "@/lib/utils";

const principleIcon: Record<string, LucideIcon> = {
  evidence: Gauge,
  correctness: ShieldCheck,
  users: Users,
  ownership: Wrench,
};

export function GuidingPrinciples() {
  return (
    <Section id="principles" class="py-24 md:py-32">
      <Reveal>
        <SectionHeading
          eyebrow="Guiding principles"
          title="What I optimize for"
          description="Ideas and standards — not borrowed biographies. A concise map of how I think and work."
        />
      </Reveal>

      <div class="mt-16 grid gap-5 md:grid-cols-2">
        {guidingPrinciples.map((p, i) => {
          const Icon = principleIcon[p.id] ?? Sparkles;
          return (
            <Reveal>
              <article
                class={cn(
                  "group h-full rounded-2xl border border-white/[0.06] bg-surface/45 p-7",
                  "transition-[transform,border-color,box-shadow] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-safe:hover:-translate-y-1",
                  "hover:border-white/[0.1] hover:shadow-[0_24px_64px_-48px_rgba(0,0,0,0.85)] md:p-8",
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
                <h3 class="font-display mt-4 text-xl font-semibold tracking-tight text-foreground">{p.title}</h3>
                <p class="mt-3 text-sm leading-relaxed text-muted md:text-[15px]">{p.body}</p>
              </article>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
