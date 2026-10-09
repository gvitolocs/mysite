# Giuseppe Vitolo's portfolio

Live site: https://gvitolo.vercel.app/

Static [Astro](https://astro.build) site whose UI is written in [SolidJS](https://www.solidjs.com). Shared copy and project links are in `src/data/content.ts`.

- Components render to plain HTML at build time. Only two Solid islands ship JavaScript: `Navbar` (scroll state, mobile menu, active section) and `HeroField` (about 14 KB of JS in total).
- The hero background is a particle field written in Rust (`wasm/hero-field`): simulation and pixels run as WebAssembly, and JavaScript only copies each frame to a canvas. It loads when the page is idle and stays off for `prefers-reduced-motion` and Save-Data.
- Every other animation is CSS (scroll-driven reveals, SVG flows, marquee) and sits behind `prefers-reduced-motion: no-preference`.
- Project screenshots are real captures of the live sites (`src/assets/projects`), converted to AVIF at build time. Projects without a public screenshot show a diagram labelled as an architecture diagram, built only from the facts below.
- Technology logos come from [simple-icons](https://simpleicons.org) through one cached sprite (`/icons.svg`); UI icons come from [lucide](https://lucide.dev).

## Local development

```sh
npm ci
npm run cv:sync
npm run dev
```

Before publishing:

```sh
npm run check
npm run build
```

`npm run wasm:build` rebuilds `public/wasm/hero_field.wasm`. It needs Rust with the `wasm32-unknown-unknown` target and uses `wasm-opt` when available. The built file is committed, so Vercel builds the site without a Rust toolchain.

`npm run cv:sync` downloads `Giuseppe_Vitolo_EN.pdf` from the resume repository and validates the PDF header before replacing `public/cv.pdf`. The portrait is `src/assets/giuseppe-vitolo.jpg` (also in `public/` for the Open Graph image), taken from an existing CV.

The existing Vercel project is `mysite` (`prj_RvC32Suxq8gRmV5mvKbrvjQOppus`) in `giuseppevitolo17s-projects`; `vercel.json` selects the Astro preset. Preserve the production domain `gvitolo.vercel.app`.

## Project figures

Pokoin home-feed measurements compare the direct Pi API baseline with the optimized serving path through the cached edge: September 29, 2026, eight concurrent requests. They describe end-to-end results rather than a Rust-only speedup. The documented Rust production migration covers autocomplete.

Historical price imports comprise 52,940,443 English/Japanese Pokemon observations, 951 archives and 32 monthly PostgreSQL partitions. The September 30 snapshot contains 624,798 product/variant rows and 510,593 distinct products. Dataset rows are not sales or user counts.

CardRail is marked as in development; the prduct DPP assessment is a sprint prototype. The prduct internship uses the year 2026 because precise months and the formal role title have not yet been confirmed.
