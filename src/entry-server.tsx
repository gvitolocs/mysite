/** Prerender entry: renders each route to HTML at build time (scripts/prerender.mjs). */
import { generateHydrationScript, renderToString } from 'solid-js/web';
import { App } from './app/App.tsx';
import { ROUTES, headFor, resolveRoute } from './app/routes.ts';
import ogImage from './assets/og/poko-genesis-og.jpg?url';

export { ROUTES };

export function render(path: string) {
  const route = resolveRoute(path);
  const html = renderToString(() => <App route={route} />);
  return { html, head: headFor(route, ogImage), hydration: generateHydrationScript(), route };
}
