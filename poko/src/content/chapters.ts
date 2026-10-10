/**
 * The story's chapters: one table read by both the DOM (section heights, copy)
 * and the WebGL story (progress boundaries). Change a length here and text and
 * scene stay in sync.
 *
 * `length` is in viewport heights of scroll. `overlay` is the window of the
 * chapter (0..1, chapter-local) during which its text is shown.
 */
import { projects, site } from './content.ts';

export type ChapterId =
  | 'awakening'
  | 'disintegration'
  | 'portal'
  | 'pokoin'
  | 'cardrail'
  | 'prduct'
  | 'tmelnik'
  | 'systems'
  | 'reconstruction'
  | 'finale';

export interface ChapterLink {
  label: string;
  href: string;
  external?: boolean;
}

export interface Chapter {
  id: ChapterId;
  /** Short label for the chapter index / skip controls. */
  nav: string;
  length: number;
  overlay: [number, number] | null;
  kicker?: string;
  title?: string;
  /** Keep the heading for screen readers and search, but do not show it (the 3D scene already does). */
  titleHidden?: boolean;
  body?: string;
  links?: ChapterLink[];
}

const pokoin = projects.find((p) => p.id === 'pokoin')!;
const cardrail = projects.find((p) => p.id === 'cardrail')!;
const prduct = projects.find((p) => p.id === 'prduct-dpp')!;
const tmelnik = projects.find((p) => p.id === 'tmelnik-app')!;

export const POKO_VOXEL_COUNT = 2586;

export const CHAPTERS: Chapter[] = [
  {
    id: 'awakening',
    nav: 'Intro',
    length: 2.0,
    overlay: [0, 0.42],
    kicker: 'Software engineer · Aarhus, Denmark',
    title: site.name,
    body: 'Backend systems, data pipelines and the products built on them.',
  },
  {
    id: 'disintegration',
    nav: 'Poko',
    length: 2.4,
    overlay: [0.04, 0.5],
    kicker: 'Meet Poko',
    body: `Pokoin's mascot, rebuilt from a 26 × 24 sprite into ${POKO_VOXEL_COUNT.toLocaleString('en-US')} voxels. Every one of them is about to move.`,
  },
  {
    id: 'portal',
    nav: 'Portal',
    length: 2.0,
    overlay: [0.18, 0.62],
    kicker: 'Selected work',
    body: 'What I have built, assembled from the same matter.',
  },
  {
    id: 'pokoin',
    nav: 'Pokoin',
    length: 2.2,
    overlay: [0.4, 0.96],
    kicker: pokoin.tagline,
    title: 'Pokoin',
    body: 'A trading-card marketplace. I build its APIs, Rust services and data pipelines; edge caching took the home feed from 6.9 s to 26 ms.',
    links: [
      { label: 'Case study', href: '/work/pokoin/' },
      { label: 'pokoin.com', href: 'https://pokoin.com', external: true },
    ],
  },
  {
    id: 'cardrail',
    nav: 'CardRails',
    length: 2.0,
    overlay: [0.42, 0.96],
    kicker: cardrail.tagline,
    title: 'CardRails',
    body: 'A scanning desk and stock book for card sellers: scan a card, give it a shelf, list it on every marketplace.',
    links: [
      { label: 'Case study', href: '/work/cardrails/' },
      { label: 'Open CardRails', href: 'https://cardrails.vercel.app', external: true },
    ],
  },
  {
    id: 'prduct',
    nav: 'prduct',
    length: 2.0,
    overlay: [0.42, 0.96],
    kicker: 'B2B internship · pilot',
    title: 'prduct · DPP assessment pilot',
    body: 'A Digital Product Passport readiness journey, piloted with furniture: purchasing and sales teams answer one situation at a time and get a product-data landscape, not a score.',
    links: [
      { label: 'Case study', href: '/work/prduct/' },
      { label: 'Try the pilot', href: prduct.links[0].href, external: true },
    ],
  },
  {
    id: 'tmelnik',
    nav: 'Tmelnik',
    length: 2.0,
    overlay: [0.42, 0.96],
    kicker: tmelnik.tagline,
    title: 'Tmelnik app',
    body: 'A Flutter and Firebase app for international youth exchanges: project offers, applications, feedback and news, with sign-in and admin roles.',
    links: [
      { label: 'Case study', href: '/work/tmelnik/' },
      { label: 'Source code', href: tmelnik.links[0].href, external: true },
    ],
  },
  {
    id: 'systems',
    nav: 'Systems',
    length: 2.0,
    overlay: [0.42, 0.96],
    kicker: 'Engineering',
    title: 'Systems & data',
    body: 'Edge caching, Rust services on Kubernetes, PostgreSQL replicas, and 52.9 million price observations in 32 monthly partitions.',
    links: [{ label: 'Case study', href: '/work/systems/' }],
  },
  {
    id: 'reconstruction',
    nav: 'Return',
    length: 1.8,
    overlay: null,
  },
  {
    id: 'finale',
    nav: 'Contact',
    length: 1.6,
    overlay: [0, 1],
    title: site.name,
    titleHidden: true,
    body: 'Software engineer in Aarhus, open to backend, data and product engineering roles.',
    links: [
      { label: 'Email', href: `mailto:${site.email}` },
      { label: 'GitHub', href: site.social.github, external: true },
      { label: 'LinkedIn', href: site.social.linkedin!, external: true },
      { label: 'CV (PDF)', href: '/cv.pdf' },
      { label: 'About', href: '/about/' },
      { label: 'All work', href: '/work/' },
    ],
  },
];

export const TOTAL_LENGTH = CHAPTERS.reduce((sum, c) => sum + c.length, 0);

/**
 * Progress boundaries. Scroll progress u = scrollY / (documentHeight - viewport).
 * The document is TOTAL_LENGTH viewports tall, so the scrollable distance is
 * TOTAL_LENGTH - 1 viewports; chapter i starts at u = top_i / (TOTAL_LENGTH - 1).
 */
export const CHAPTER_STARTS: number[] = (() => {
  const starts: number[] = [];
  let top = 0;
  for (const c of CHAPTERS) {
    starts.push(Math.min(1, top / (TOTAL_LENGTH - 1)));
    top += c.length;
  }
  return starts;
})();

export function chapterAt(u: number): { index: number; local: number } {
  let index = 0;
  for (let i = 0; i < CHAPTERS.length; i++) if (u >= CHAPTER_STARTS[i]) index = i;
  const start = CHAPTER_STARTS[index];
  const end = index + 1 < CHAPTERS.length ? CHAPTER_STARTS[index + 1] : 1;
  return { index, local: end > start ? Math.min(1, Math.max(0, (u - start) / (end - start))) : 1 };
}

/** Global progress for a chapter-local time (inverse of chapterAt). */
export function progressFor(id: ChapterId, local: number): number {
  const i = CHAPTERS.findIndex((c) => c.id === id);
  const start = CHAPTER_STARTS[i];
  const end = i + 1 < CHAPTERS.length ? CHAPTER_STARTS[i + 1] : 1;
  return start + (end - start) * local;
}
