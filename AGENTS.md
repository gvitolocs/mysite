# Agent notes

Astro 7 static site. All UI components are SolidJS (`.tsx`, `jsxImportSource: solid-js`) under `src/components/`.

- Solid, not React: use `class` (not `className`), `onClick`, `<For>`/`<Show>` or `.map`, no `key` props,
  CSS variables in `style={{ "--d": "0.1s" }}`. Icons come from `lucide-solid` and `simple-icons`.
- Components rendered from `src/pages/index.astro` WITHOUT a `client:*` directive become static HTML with zero JS.
  Only true islands get a directive: `Navbar` (`client:load`) and `HeroField` (`client:idle`). Keep it that way.
- Images live in `src/assets/` and are optimized at build time with `getImage` from `astro:assets` in `index.astro`,
  then passed to Solid components as props (`src`, `srcset`, `width`, `height`).
- Animations are CSS only (`src/styles/global.css`), wrapped in `prefers-reduced-motion: no-preference`.
  Content must be visible without JS.
- Copy and links live in `src/data/content.ts`; facts there are verified, so never invent numbers or features.
- Run npm commands on nezopt (Linux node_modules): `ssh nezopt 'cd ~/Projects/mysite-revamp && npm run build'`.
  Type check: `npm run check`.
- `poko/` is a separate project (Poko Genesis: SolidJS + Vite + three.js) served at `/poko/`. It has its own
  `package.json`, `AGENTS.md` and tests; the root `npm run build` builds it into `dist/poko/`.
