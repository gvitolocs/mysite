import { Lock } from "lucide-solid";
import { CardVaultDiagram } from "@/components/diagrams/CardVaultDiagram";
import { HmiDiagram } from "@/components/diagrams/HmiDiagram";
import { PipelineDiagram } from "@/components/diagrams/PipelineDiagram";
import type { Project } from "@/data/content";

export type Shot = { src: string; srcset: string; width: number; height: number };
export type Shots = Record<"pokoin" | "cardrail" | "prduct", Shot>;

const diagrams = { pipeline: PipelineDiagram, cardvault: CardVaultDiagram, hmi: HmiDiagram };

const frame = "relative -mx-6 -mt-6 mb-6 overflow-hidden rounded-t-2xl border-b border-white/[0.06] bg-background";

/** Live screenshots sit in a browser frame; projects without one get a diagram that is labelled as such. */
export function ProjectMedia(props: { media: NonNullable<Project["media"]>; shots: Shots }) {
  const media = props.media;
  if (media.kind === "diagram") {
    const Diagram = diagrams[media.diagram];
    return (
      <div class={frame}>
        <div class="aspect-[16/9]">
          <Diagram />
        </div>
        <p class="absolute bottom-2 right-3 font-mono text-[10px] uppercase tracking-[0.18em] text-muted/60">
          Architecture diagram
        </p>
      </div>
    );
  }

  const shot = props.shots[media.image];
  return (
    <div class={frame}>
      <div class="flex h-8 items-center gap-1.5 border-b border-white/[0.06] px-3">
        <span class="h-2 w-2 rounded-full bg-white/15" />
        <span class="h-2 w-2 rounded-full bg-white/15" />
        <span class="h-2 w-2 rounded-full bg-white/15" />
        <span class="mx-auto inline-flex items-center gap-1.5 rounded-md bg-white/[0.04] px-3 py-0.5 font-mono text-[11px] text-muted">
          <Lock class="h-3 w-3" aria-hidden="true" />
          {media.host}
        </span>
        <span class="w-[42px]" aria-hidden="true" />
      </div>
      <img
        src={shot.src}
        srcset={shot.srcset}
        sizes="(max-width: 1024px) calc(100vw - 40px), 560px"
        width={shot.width}
        height={shot.height}
        alt={media.alt}
        loading="lazy"
        decoding="async"
        class="aspect-[16/9] w-full object-cover object-top transition-transform duration-700 ease-out motion-safe:group-hover:scale-[1.03]"
      />
    </div>
  );
}
