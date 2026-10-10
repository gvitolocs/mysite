/** Prerendered routes and their metadata. Each becomes dist/<path>/index.html. */
import { CASE_STUDIES } from '../content/caseStudies.ts';
import { site } from '../content/content.ts';
import { BASE } from './base.ts';

export const SITE_URL = 'https://gvitolo.vercel.app';

export type Page = 'home' | 'work' | 'case' | 'about' | 'notfound';

export interface Route {
  path: string;
  page: Page;
  slug?: string;
  title: string;
  description: string;
}

const homeDescription =
  'Giuseppe Vitolo, software engineer in Aarhus: backend systems, data pipelines and web products. A cinematic portfolio where Pokoin’s pixel mascot Poko becomes thousands of voxels.';

export const ROUTES: Route[] = [
  { path: '/', page: 'home', title: `${site.name} · Software engineer`, description: homeDescription },
  { path: '/work/', page: 'work', title: `Work · ${site.name}`, description: `Projects by ${site.name}: Pokoin, CardRails, data pipelines, a B2B product-data prototype and more.` },
  ...CASE_STUDIES.map((c) => ({ path: `/work/${c.slug}/`, page: 'case' as const, slug: c.slug, title: `${c.title} · ${site.name}`, description: c.description })),
  { path: '/about/', page: 'about', title: `About · ${site.name}`, description: `About ${site.name}: experience, education, skills and how I work.` },
  { path: '/404', page: 'notfound', title: `Not found · ${site.name}`, description: 'This page does not exist.' },
];

export function resolveRoute(pathname: string): Route {
  const normalised = pathname.endsWith('/') || pathname === '/404' ? pathname : `${pathname}/`;
  return ROUTES.find((r) => r.path === normalised) ?? ROUTES[ROUTES.length - 1];
}

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function headFor(route: Route, ogImage: string): string {
  const url = SITE_URL + BASE + (route.page === 'notfound' ? '/' : route.path);
  const tags = [
    `<title>${escape(route.title)}</title>`,
    `<meta name="description" content="${escape(route.description)}">`,
    route.page === 'notfound' ? '<meta name="robots" content="noindex">' : `<link rel="canonical" href="${url}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:title" content="${escape(route.title)}">`,
    `<meta property="og:description" content="${escape(route.description)}">`,
    `<meta property="og:url" content="${url}">`,
    `<meta property="og:image" content="${SITE_URL}${ogImage}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
  ];
  if (route.page === 'home') {
    const person = {
      '@context': 'https://schema.org',
      '@type': 'Person',
      name: site.name,
      jobTitle: 'Software engineer',
      address: { '@type': 'PostalAddress', addressLocality: 'Aarhus', addressCountry: 'DK' },
      alumniOf: ['Aarhus University', 'University of Salerno'],
      url: `${SITE_URL}${BASE}/`,
      sameAs: [site.social.github, site.social.linkedin],
    };
    tags.push(`<script type="application/ld+json">${JSON.stringify(person).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.join('\n    ');
}
