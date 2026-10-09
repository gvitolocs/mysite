import type { JSX } from "solid-js";
import { cn } from "@/lib/utils";

type SectionProps = {
  id: string;
  children: JSX.Element;
  class?: string;
  containerClass?: string;
};

export function Section(props: SectionProps) {
  return (
    <section id={props.id} class={cn("relative scroll-mt-24", props.class)}>
      <div class={cn("mx-auto max-w-6xl px-5 sm:px-6 lg:px-8", props.containerClass)}>{props.children}</div>
    </section>
  );
}
