/** Text pages: work index, case studies, about, 404. Plain, fast, fully indexable. */
import { For, Show } from 'solid-js';
import { CASE_STUDIES } from '../../content/caseStudies.ts';
import { about, contact, experience, guidingPrinciples, projects, site, skills } from '../../content/content.ts';
import { PokoMark } from '../../components/PokoMark.tsx';
import { SiteFooter, SiteHeader } from '../../components/SiteChrome.tsx';

const caseSlug: Record<string, string> = { pokoin: 'pokoin', cardrail: 'cardrail', 'price-pipelines': 'systems' };

function PageShell(props: { current: string; children: unknown }) {
  return (
    <>
      <a class="skip-link" href="#main">Skip to content</a>
      <SiteHeader current={props.current} />
      <main id="main" class="page">{props.children as never}</main>
      <SiteFooter />
    </>
  );
}

export function WorkIndex() {
  return (
    <PageShell current="work">
      <header class="page-hero">
        <p class="kicker">Work</p>
        <h1>Things I have built</h1>
        <p class="lede">Backend services, data pipelines and the products on top of them. The three marked with a case study appear in the 3D journey on the home page.</p>
      </header>
      <ol class="work-list">
        <For each={projects}>
          {(p) => (
            <li class="work-item">
              <div class="work-item__head">
                <h2>{p.name}</h2>
                <p class="kicker">{p.tagline}</p>
              </div>
              <p class="work-item__outcome">{p.outcome}</p>
              <p>{p.description}</p>
              <Show when={p.metrics}>
                <dl class="metrics">
                  <For each={p.metrics}>
                    {(m) => (
                      <div>
                        <dt>{m.label}</dt>
                        <dd>{m.value}</dd>
                      </div>
                    )}
                  </For>
                </dl>
              </Show>
              <p class="stack">{p.stack.join(' · ')}</p>
              <ul class="link-row">
                <Show when={caseSlug[p.id]}>
                  <li><a href={`/work/${caseSlug[p.id]}/`}>Case study →</a></li>
                </Show>
                <For each={p.links}>{(l) => <li><a href={l.href}>{l.label} ↗</a></li>}</For>
              </ul>
            </li>
          )}
        </For>
      </ol>
    </PageShell>
  );
}

export function CaseStudyPage(props: { slug: string }) {
  const c = CASE_STUDIES.find((s) => s.slug === props.slug)!;
  return (
    <PageShell current="work">
      <article class="case">
        <header class="page-hero">
          <p class="kicker">{c.kicker}</p>
          <h1>{c.title}</h1>
          <p class="lede">{c.summary}</p>
        </header>
        <Show when={c.metrics}>
          <dl class="metrics metrics--large">
            <For each={c.metrics}>
              {(m) => (
                <div>
                  <dd>{m.value}</dd>
                  <dt>{m.label}</dt>
                </div>
              )}
            </For>
          </dl>
          <Show when={c.measurementNote}>
            <p class="note">{c.measurementNote}</p>
          </Show>
        </Show>
        <For each={c.sections}>
          {(s) => (
            <section class="case__section">
              <h2>{s.heading}</h2>
              <For each={s.paragraphs ?? []}>{(p) => <p>{p}</p>}</For>
              <Show when={s.bullets}>
                <ul>
                  <For each={s.bullets}>{(b) => <li>{b}</li>}</For>
                </ul>
              </Show>
            </section>
          )}
        </For>
        <section class="case__section">
          <h2>Stack</h2>
          <p class="stack">{c.stack.join(' · ')}</p>
          <ul class="link-row">
            <For each={c.links}>{(l) => <li><a href={l.href}>{l.label} ↗</a></li>}</For>
            <li><a href="/work/">All work →</a></li>
          </ul>
        </section>
      </article>
    </PageShell>
  );
}

export function AboutPage() {
  return (
    <PageShell current="about">
      <header class="page-hero page-hero--about">
        <div>
          <p class="kicker">{about.eyebrow}</p>
          <h1>{about.title}</h1>
        </div>
        <img class="portrait" src={site.avatarUrl} width="220" height="220" alt={`Portrait of ${site.name}`} loading="lazy" decoding="async" />
      </header>
      <section class="prose">
        <For each={about.paragraphs}>{(p) => <p>{p}</p>}</For>
      </section>
      <section class="case__section">
        <h2>Experience & education</h2>
        <ol class="timeline">
          <For each={experience}>
            {(e) => (
              <li>
                <p class="timeline__meta">{e.period} · {e.location}</p>
                <h3>{e.title}</h3>
                <p class="timeline__org">{e.org}</p>
                <p>{e.summary}</p>
              </li>
            )}
          </For>
        </ol>
      </section>
      <section class="case__section">
        <h2>{skills.title}</h2>
        <dl class="skills">
          <For each={skills.categories}>
            {(cat) => (
              <div>
                <dt>{cat.name}</dt>
                <dd>{cat.items.join(' · ')}</dd>
              </div>
            )}
          </For>
        </dl>
      </section>
      <section class="case__section">
        <h2>How I work</h2>
        <dl class="principles">
          <For each={guidingPrinciples}>
            {(g) => (
              <div>
                <dt>{g.title}</dt>
                <dd>{g.body}</dd>
              </div>
            )}
          </For>
        </dl>
      </section>
      <section class="case__section">
        <h2>{contact.title}</h2>
        <p>{contact.body}</p>
        <ul class="link-row">
          <li><a href={`mailto:${site.email}`}>{site.email}</a></li>
          <li><a href="/cv.pdf">CV (PDF)</a></li>
          <li><a href={site.social.github}>GitHub ↗</a></li>
          <li><a href={site.social.linkedin}>LinkedIn ↗</a></li>
        </ul>
        <p class="note">{contact.replyNote}</p>
      </section>
    </PageShell>
  );
}

export function NotFound() {
  return (
    <PageShell current="">
      <header class="page-hero page-hero--center">
        <PokoMark size={104} title="Poko" />
        <h1>Lost a pixel</h1>
        <p class="lede">This page does not exist. Poko suggests the <a href="/">home page</a> or the <a href="/work/">work index</a>.</p>
      </header>
    </PageShell>
  );
}
