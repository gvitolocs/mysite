import {
  siCloudflare,
  siDart,
  siDocker,
  siFirebase,
  siFlutter,
  siGit,
  siGithub,
  siHtml5,
  siJavascript,
  siK3s,
  siKotlin,
  siKubernetes,
  siLinux,
  siMysql,
  siOpenjdk,
  siPostgresql,
  siPython,
  siReact,
  siRust,
  siSwift,
  siTokio,
  type SimpleIcon,
} from "simple-icons";
import { cn } from "@/lib/utils";

/** Labels as written in content.ts. Unmapped labels render no logo rather than a wrong one. */
const icons: Record<string, SimpleIcon> = {
  Rust: siRust,
  "Axum / Tokio / SQLx": siTokio,
  PostgreSQL: siPostgresql,
  Kubernetes: siKubernetes,
  "Kubernetes (k3s)": siK3s,
  React: siReact,
  Cloudflare: siCloudflare,
  Docker: siDocker,
  Linux: siLinux,
  Git: siGit,
  Python: siPython,
  JavaScript: siJavascript,
  Dart: siDart,
  Flutter: siFlutter,
  Firebase: siFirebase,
  Swift: siSwift,
  Kotlin: siKotlin,
  MySQL: siMysql,
  Java: siOpenjdk,
  JavaFX: siOpenjdk,
  "HTML/CSS": siHtml5,
};

/** Black brand marks (Rust, Tokio, OpenJDK) would vanish on the dark background, so they follow the text color. */
function brandColor(hex: string) {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.08 ? "currentColor" : `#${hex}`;
}

export function TechIcon(props: { name: string; class?: string }) {
  const icon = icons[props.name];
  if (!icon) return null;
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" class={cn("h-3.5 w-3.5 shrink-0", props.class)}>
      <path d={icon.path} fill={brandColor(icon.hex)} />
    </svg>
  );
}

export function GitHubIcon(props: { class?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" class={cn("h-4 w-4 shrink-0", props.class)}>
      <path d={siGithub.path} fill="currentColor" />
    </svg>
  );
}

/** LinkedIn is not in simple-icons; this is the stroke glyph lucide used before it dropped brand icons. */
export function LinkedInIcon(props: { class?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
      class={cn("h-4 w-4 shrink-0", props.class)}
    >
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
      <rect width="4" height="12" x="2" y="9" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  );
}
