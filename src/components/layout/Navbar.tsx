import { createSignal, For, onCleanup, onMount, Show } from "solid-js";
import { GitHubIcon } from "@/components/ui/TechIcon";
import { site } from "@/data/content";
import { cn } from "@/lib/utils";

const navLinks = [
  { label: "About", href: "#about" },
  { label: "Experience", href: "#experience" },
  { label: "Projects", href: "#projects" },
  { label: "Skills", href: "#skills" },
  { label: "Principles", href: "#principles" },
  { label: "Vision", href: "#vision" },
  { label: "Contact", href: "#contact" },
];

/** The page's one eagerly hydrated island: scroll state, mobile menu and the active-section highlight. */
export default function Navbar() {
  const [open, setOpen] = createSignal(false);
  const [scrolled, setScrolled] = createSignal(false);
  const [active, setActive] = createSignal("");

  onMount(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    const onResize = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("keydown", onKey);

    // A section is active while it crosses the middle band of the viewport.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) setActive(entry.target.id);
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 },
    );
    for (const l of navLinks) {
      const section = document.getElementById(l.href.slice(1));
      if (section) observer.observe(section);
    }

    onCleanup(() => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
      observer.disconnect();
    });
  });

  const isActive = (href: string) => active() === href.slice(1);

  return (
    <header
      class={cn(
        "fixed inset-x-0 top-0 z-[100] border-b transition-[background-color,border-color,backdrop-filter] duration-300",
        scrolled()
          ? "border-white/[0.1] bg-[color-mix(in_oklab,var(--background)_88%,transparent)] backdrop-blur-xl"
          : "border-transparent bg-[color-mix(in_oklab,var(--background)_70%,transparent)] backdrop-blur-md",
      )}
    >
      <div aria-hidden="true" class="scroll-progress" />
      <nav class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-6 lg:px-8">
        <a
          href="#hero"
          class="font-display text-sm font-semibold tracking-tight text-foreground transition-colors hover:text-accent"
        >
          {site.firstName}
          <span class="text-muted">.</span>
        </a>

        <ul class="hidden items-center gap-0.5 lg:flex">
          <For each={navLinks}>
            {(l) => (
              <li>
                <a
                  href={l.href}
                  aria-current={isActive(l.href) ? "location" : undefined}
                  class={cn(
                    "rounded-full px-3 py-1.5 text-sm transition-colors hover:bg-white/[0.04] hover:text-foreground",
                    isActive(l.href) ? "bg-white/[0.06] text-foreground" : "text-muted",
                  )}
                >
                  {l.label}
                </a>
              </li>
            )}
          </For>
        </ul>

        <div class="flex items-center gap-2">
          <a
            href={site.social.github}
            target="_blank"
            rel="noopener noreferrer"
            class="hidden items-center gap-2 rounded-full border border-white/10 px-3 py-1.5 text-sm text-muted transition-colors hover:border-white/20 hover:text-foreground sm:inline-flex"
          >
            <GitHubIcon />
            GitHub
          </a>
          <button
            type="button"
            class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 text-foreground transition-transform active:scale-95 lg:hidden"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open()}
            aria-controls="mobile-menu"
            aria-label={open() ? "Close menu" : "Open menu"}
          >
            <span class="flex w-5 flex-col gap-1.5">
              <span
                class={cn(
                  "h-0.5 w-full origin-center rounded-full bg-foreground transition-transform",
                  open() && "translate-y-2 rotate-45",
                )}
              />
              <span class={cn("h-0.5 w-full rounded-full bg-foreground transition-opacity", open() && "opacity-0")} />
              <span
                class={cn(
                  "h-0.5 w-full origin-center rounded-full bg-foreground transition-transform",
                  open() && "-translate-y-2 -rotate-45",
                )}
              />
            </span>
          </button>
        </div>
      </nav>

      <Show when={open()}>
        <div id="mobile-menu" class="menu-in overflow-hidden border-t border-white/[0.06] bg-background/98 lg:hidden">
          <ul class="flex flex-col gap-0.5 px-5 py-4">
            <For each={navLinks}>
              {(l) => (
                <li>
                  <a
                    href={l.href}
                    aria-current={isActive(l.href) ? "location" : undefined}
                    class={cn(
                      "block rounded-lg px-2 py-2.5 text-sm transition-colors hover:bg-white/[0.04] hover:text-foreground",
                      isActive(l.href) ? "bg-white/[0.06] text-foreground" : "text-muted",
                    )}
                    onClick={() => setOpen(false)}
                  >
                    {l.label}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </div>
      </Show>
    </header>
  );
}
