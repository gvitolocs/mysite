import { For } from 'solid-js';
import { site } from '../content/content.ts';
import { PokoMark } from './PokoMark.tsx';
import { withBase } from '../app/base.ts';

const NAV = [
  { label: 'Work', href: '/work/', key: 'work' },
  { label: 'About', href: '/about/', key: 'about' },
  { label: 'Contact', href: '/#finale', key: 'contact' },
  { label: 'CV', href: '/cv.pdf', key: 'cv' },
];

export function SiteHeader(props: { current: string }) {
  return (
    <header class="site-header">
      <a class="brand" href={withBase('/')} aria-label={`${site.name}, home`}>
        <PokoMark size={22} />
        <span class="brand__name">{site.name}</span>
      </a>
      <nav aria-label="Primary">
        <ul class="site-nav">
          <For each={NAV}>
            {(item) => (
              <li>
                <a href={withBase(item.href)} aria-current={props.current === item.key ? 'page' : undefined}>
                  {item.label}
                </a>
              </li>
            )}
          </For>
        </ul>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer class="site-footer">
      <p>
        © 2026 {site.name}. Built with SolidJS, three.js and Blender. Poko is the Pokoin mascot.
      </p>
      <p>
        <a href={`mailto:${site.email}`}>{site.email}</a> · <a href={site.social.github}>GitHub</a> ·{' '}
        <a href={site.social.linkedin}>LinkedIn</a>
      </p>
    </footer>
  );
}
