import { Match, Switch } from 'solid-js';
import type { Route } from './routes.ts';
import { Home } from './pages/Home.tsx';
import { AboutPage, CaseStudyPage, NotFound, WorkIndex } from './pages/Pages.tsx';

export function App(props: { route: Route }) {
  return (
    <Switch fallback={<NotFound />}>
      <Match when={props.route.page === 'home'}>
        <Home />
      </Match>
      <Match when={props.route.page === 'work'}>
        <WorkIndex />
      </Match>
      <Match when={props.route.page === 'case'}>
        <CaseStudyPage slug={props.route.slug!} />
      </Match>
      <Match when={props.route.page === 'about'}>
        <AboutPage />
      </Match>
    </Switch>
  );
}
