import type { JSX } from "solid-js";
import { cn } from "@/lib/utils";

/** Fades content in as it scrolls into view. Pure CSS (scroll-driven animation), so it ships no JS. */
export function Reveal(props: { children: JSX.Element; class?: string }) {
  return <div class={cn("reveal", props.class)}>{props.children}</div>;
}
