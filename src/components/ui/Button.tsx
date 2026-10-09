import type { JSX } from "solid-js";
import { cn } from "@/lib/utils";

type ButtonProps = {
  href: string;
  children: JSX.Element;
  variant?: "primary" | "secondary" | "ghost";
  class?: string;
  external?: boolean;
  icon?: JSX.Element;
};

const base =
  "relative inline-flex items-center justify-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium tracking-tight transition-[color,background-color,border-color,box-shadow,transform] duration-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent motion-safe:hover:-translate-y-px motion-safe:active:scale-[0.98]";

const styles = {
  primary:
    "bg-accent text-zinc-950 shadow-[0_0_0_1px_rgba(45,212,191,0.35)] hover:shadow-[0_0_32px_-4px_rgba(45,212,191,0.45)]",
  secondary: "border border-white/10 bg-white/[0.03] text-foreground hover:border-white/18 hover:bg-white/[0.06]",
  ghost: "text-muted hover:text-foreground",
} as const;

export function Button(props: ButtonProps) {
  const newTab = () => Boolean(props.external) && props.href.startsWith("http");
  return (
    <a
      href={props.href}
      target={newTab() ? "_blank" : undefined}
      rel={newTab() ? "noopener noreferrer" : undefined}
      class={cn(base, styles[props.variant ?? "primary"], props.class)}
    >
      {props.icon}
      {props.children}
    </a>
  );
}
