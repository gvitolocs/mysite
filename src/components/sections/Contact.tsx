import { Download, Mail, MapPin } from "lucide-solid";
import { Button } from "@/components/ui/Button";
import { GitHubIcon, LinkedInIcon } from "@/components/ui/TechIcon";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHeading } from "@/components/ui/SectionHeading";
import { Section } from "@/components/layout/Section";
import { contact, cv, site } from "@/data/content";

export function Contact() {
  const linkedin = site.social.linkedin;

  return (
    <Section id="contact" class="py-24 md:pb-32 md:pt-28">
      <div class="relative overflow-hidden rounded-3xl border border-white/[0.08] bg-gradient-to-br from-surface/80 via-background to-surface/60 p-8 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] md:p-12 lg:p-14">
        <div class="pointer-events-none absolute -right-24 top-0 h-64 w-64 rounded-full bg-accent/10 blur-[100px]" />
        <div class="pointer-events-none absolute -left-16 bottom-0 h-48 w-48 rounded-full bg-accent-secondary/10 blur-[90px]" />

        <div class="relative grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
          <Reveal>
            <SectionHeading eyebrow={contact.eyebrow} title={contact.title} description={contact.body} />
          </Reveal>

          <Reveal class="flex flex-col gap-4 lg:items-end">
            <div class="flex w-full flex-col gap-3 sm:flex-row sm:justify-end">
              <Button href={`mailto:${site.email}`} external icon={<Mail class="h-4 w-4" aria-hidden="true" />}>
                Email
              </Button>
              <Button href={site.social.github} variant="secondary" external icon={<GitHubIcon class="h-4 w-4" />}>
                GitHub
              </Button>
              {linkedin ? (
                <Button href={linkedin} variant="secondary" external icon={<LinkedInIcon class="h-4 w-4" />}>
                  LinkedIn
                </Button>
              ) : null}
            </div>
            <div class="flex flex-wrap gap-4 text-sm sm:justify-end">
              <a href={`mailto:${site.email}`} class="text-muted transition-colors hover:text-foreground">
                {site.email}
              </a>
              {cv.available ? (
                <a
                  href={cv.href}
                  class="inline-flex items-center gap-1.5 text-muted transition-colors hover:text-foreground"
                >
                  <Download class="h-3.5 w-3.5" aria-hidden="true" />
                  CV (PDF)
                </a>
              ) : null}
            </div>
            <p class="inline-flex items-center gap-1.5 text-xs text-muted/80 animate-pulse-glow sm:justify-end sm:text-right">
              <MapPin class="h-3.5 w-3.5" aria-hidden="true" />
              {contact.replyNote}
            </p>
          </Reveal>
        </div>
      </div>
    </Section>
  );
}
