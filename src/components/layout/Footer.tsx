import { Mail } from "lucide-solid";
import { GitHubIcon, LinkedInIcon } from "@/components/ui/TechIcon";
import { site, footer } from "@/data/content";

const link = "inline-flex items-center gap-2 text-muted transition-colors hover:text-foreground";

export function Footer() {
  const year = new Date().getFullYear();
  const linkedin = site.social.linkedin;

  return (
    <footer class="border-t border-white/[0.06] bg-background">
      <div class="mx-auto flex max-w-6xl flex-col gap-6 px-5 py-12 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div>
          <p class="text-sm text-muted">
            © {year} {site.name}. {footer.note}
          </p>
          <p class="mt-1 font-mono text-[11px] text-muted/70">
            Built with Astro + SolidJS · hero particle field in Rust → WebAssembly
          </p>
        </div>
        <div class="flex flex-wrap gap-6 text-sm">
          {linkedin ? (
            <a href={linkedin} target="_blank" rel="noopener noreferrer" class={link}>
              <LinkedInIcon />
              LinkedIn
            </a>
          ) : null}
          <a href={site.social.github} target="_blank" rel="noopener noreferrer" class={link}>
            <GitHubIcon />
            GitHub
          </a>
          <a href={`mailto:${site.email}`} class={link}>
            <Mail class="h-4 w-4" aria-hidden="true" />
            Email
          </a>
        </div>
      </div>
    </footer>
  );
}
