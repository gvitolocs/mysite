import { hydrate, render } from 'solid-js/web';
import { App } from './app/App.tsx';
import { stripBase } from './app/base.ts';
import { resolveRoute } from './app/routes.ts';
import './styles/base.css';
import './styles/home.css';
import './styles/pages.css';

const root = document.getElementById('app')!;
const route = resolveRoute(document.body.dataset.path ?? stripBase(location.pathname));

// Production pages are prerendered and hydrate in place; the dev server serves
// the bare template, so it renders from scratch.
if (root.firstElementChild) hydrate(() => <App route={route} />, root);
else render(() => <App route={route} />, root);
