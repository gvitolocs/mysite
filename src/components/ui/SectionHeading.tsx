import { cn } from "@/lib/utils";

type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  class?: string;
};

export function SectionHeading(props: SectionHeadingProps) {
  return (
    <div class={cn("max-w-2xl", props.align === "center" && "mx-auto text-center", props.class)}>
      {props.eyebrow ? (
        <p class="font-mono text-xs uppercase tracking-[0.2em] text-accent/90">{props.eyebrow}</p>
      ) : null}
      <h2 class="font-display mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">{props.title}</h2>
      {props.description ? (
        <p class="mt-4 text-base leading-relaxed text-muted md:text-lg">{props.description}</p>
      ) : null}
    </div>
  );
}
