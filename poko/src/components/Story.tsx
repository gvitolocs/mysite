/**
 * The scrollable story. Every chapter is a real <section> with real text, in
 * document order: search engines, screen readers and visitors without WebGL get
 * the whole page. The canvas behind it is decoration.
 *
 * Sections are as tall as the chapter's scroll length; their content is
 * position: sticky, so it stays in view while the 3D scene plays, with no
 * per-frame JavaScript. Overlay visibility toggles a class on chapter changes only.
 */
import { For, Show } from 'solid-js';
import { CHAPTERS, type Chapter, type ChapterId } from '../content/chapters.ts';
import { chapter, overlay, status } from '../app/store.ts';
import { withBase } from '../app/base.ts';

function ChapterSection(props: { chapter: Chapter; index: number }) {
  const c = props.chapter;
  const headingId = `${c.id}-title`;
  const Heading = (p: { children: string }) =>
    props.index === 0 ? <h1 id={headingId} class="overlay__title">{p.children}</h1> : <h2 id={headingId} class={c.title && !c.titleHidden ? 'overlay__title' : 'sr-only'}>{p.children}</h2>;
  return (
    <section id={c.id} class={`chapter chapter--${c.id}`} style={{ '--len': String(c.length) }} aria-labelledby={headingId}>
      <div class="chapter__sticky">
        <div class="overlay" classList={{ 'is-visible': overlay() === props.index }}>
          <Show when={c.kicker}>
            <p class="kicker">{c.kicker}</p>
          </Show>
          <Heading>{c.title ?? c.nav}</Heading>
          <Show when={c.body}>
            <p class="overlay__body">{c.body}</p>
          </Show>
          <Show when={c.links?.length}>
            <ul class="overlay__links">
              <For each={c.links}>
                {(l) => (
                  <li>
                    <a href={withBase(l.href)} rel={l.external ? 'noopener' : undefined}>
                      {l.label}
                      <span aria-hidden="true" class="arrow">{l.external ? '↗' : '→'}</span>
                    </a>
                  </li>
                )}
              </For>
            </ul>
          </Show>
          <Show when={props.index === 0}>
            <p class="scroll-hint" aria-hidden="true">
              <span>Scroll to wake Poko</span>
            </p>
          </Show>
        </div>
      </div>
    </section>
  );
}

export function Story() {
  return (
    <main id="main" class="story">
      <For each={CHAPTERS}>{(c, i) => <ChapterSection chapter={c} index={i()} />}</For>
    </main>
  );
}

export function ChapterIndex(props: { onGo: (id: ChapterId) => void }) {
  return (
    <nav class="chapter-index" aria-label="Chapters">
      <ol>
        <For each={CHAPTERS}>
          {(c, i) => (
            <li>
              <a
                href={`#${c.id}`}
                aria-current={chapter() === i() ? 'step' : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  props.onGo(c.id);
                }}
              >
                <span class="chapter-index__tick" aria-hidden="true" />
                <span class="chapter-index__label">{c.nav}</span>
              </a>
            </li>
          )}
        </For>
      </ol>
    </nav>
  );
}

export function Loader() {
  return (
    <div class="loader" classList={{ 'is-hidden': status() === 'ready' || status() === 'static' }} role="status" aria-live="polite">
      <span class="loader__pixels" aria-hidden="true">
        <i />
        <i />
        <i />
      </span>
      <span>{status() === 'ready' ? 'Ready' : 'Assembling Poko'}</span>
    </div>
  );
}
