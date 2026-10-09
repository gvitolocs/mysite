# Giuseppe Vitolo's portfolio

Live site: https://gvitolo.vercel.app/

Next.js portfolio with a locally hosted portrait, current projects and the English CV from [gvitolocs/myresume](https://github.com/gvitolocs/myresume). Shared copy and project links are in `src/data/content.ts`.

## Local development

```sh
npm ci
npm run cv:sync
npm run dev
```

Before publishing:

```sh
npm run lint
npm run build
```

`npm run cv:sync` downloads `Giuseppe_Vitolo_EN.pdf` from the resume repository and validates the PDF header before replacing `public/cv.pdf`. The portrait is `public/giuseppe-vitolo.jpg`, taken from an existing CV.

The existing Vercel project is `mysite` (`prj_RvC32Suxq8gRmV5mvKbrvjQOppus`) in `giuseppevitolo17s-projects`. Preserve the production domain `gvitolo.vercel.app`.

## Project figures

Pokoin home-feed measurements compare the direct Pi API baseline with the optimized serving path through the cached edge: September 29, 2026, eight concurrent requests. They describe end-to-end results rather than a Rust-only speedup. The documented Rust production migration covers autocomplete.

Historical price imports comprise 52,940,443 English/Japanese Pokemon observations, 951 archives and 32 monthly PostgreSQL partitions. The September 30 snapshot contains 624,798 product/variant rows and 510,593 distinct products. Dataset rows are not sales or user counts.

CardRail is marked as in development; the prduct DPP assessment is a sprint prototype. The prduct internship uses the year 2026 because precise months and the formal role title have not yet been confirmed.
