/**
 * Deployment base path. The site can be served from the domain root or from a
 * sub-path (e.g. `/poko/` next to another site): `vite build --base` sets
 * `import.meta.env.BASE_URL`, and every internal link goes through `withBase`.
 * Route paths themselves stay base-free ('/', '/work/', …).
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/$/, '');

/** Prefix a root-relative path ('/work/') with the base; leaves anything else alone. */
export function withBase(href: string): string {
  return href.startsWith('/') && !href.startsWith('//') ? BASE + href : href;
}

/** Strip the base from a pathname ('/poko/work/' → '/work/'). */
export function stripBase(pathname: string): string {
  return BASE && pathname.startsWith(BASE) ? pathname.slice(BASE.length) || '/' : pathname;
}
