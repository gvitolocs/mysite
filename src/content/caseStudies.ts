/**
 * Long-form project pages. Every figure here comes from src/content/content.ts
 * or the measurement notes in gvitolocs/myresume (README "Measurement context"),
 * and carries the same caveats.
 */
import { projects } from './content.ts';

export interface CaseSection {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
}

export interface CaseStudy {
  slug: 'pokoin' | 'cardrail' | 'systems';
  title: string;
  kicker: string;
  summary: string;
  metrics?: { value: string; label: string }[];
  measurementNote?: string;
  sections: CaseSection[];
  stack: string[];
  links: { label: string; href: string }[];
  description: string;
}

const byId = (id: string) => projects.find((p) => p.id === id)!;
const pokoin = byId('pokoin');
const cardrail = byId('cardrail');
const pipelines = byId('price-pipelines');

export const CASE_STUDIES: CaseStudy[] = [
  {
    slug: 'pokoin',
    title: 'Pokoin',
    kicker: 'Trading-card marketplace · 2026',
    summary: pokoin.outcome + ' ' + pokoin.description,
    description: 'Pokoin case study: Rust autocomplete, edge caching and request coalescing, Kubernetes overflow and PostgreSQL replicas behind a trading-card marketplace.',
    metrics: pokoin.metrics,
    measurementNote: pokoin.measurementNote + ' The comparison covers the complete serving paths; it is not a claim about uncached SQL or a Rust-only speedup.',
    sections: [
      {
        heading: 'What I built',
        bullets: [
          'Marketplace APIs and React interfaces; the site is deployed on Cloudflare.',
          'Autocomplete in Rust (Axum, Tokio, SQLx): the verified production migration covers autocomplete, not every route.',
          'Kubernetes (k3s) API overflow and health-based failover, with PostgreSQL writer/replica separation for consistent writes and distributed reads.',
          'Home-feed serving path through the cached edge with request coalescing.',
        ],
      },
      {
        heading: 'Data underneath',
        paragraphs: [
          'Historical prices: 52,940,443 observations from 951 archives in 32 monthly PostgreSQL partitions, covering English and Japanese Pokémon from February 2024 to 15 September 2026, with row counts validated and source hashes preserved.',
          'The 30 September 2026 snapshot holds 624,798 product/variant rows and 510,593 distinct products. These are provider catalog and price data, not customers or completed sales.',
        ],
      },
      {
        heading: 'Poko',
        paragraphs: [
          'Poko is Pokoin’s pixel-art coin mascot and the name of its in-app assistant. The character starring on this site is rebuilt from the same 26 × 24 sprite that Pokoin ships.',
        ],
      },
    ],
    stack: pokoin.stack,
    links: [{ label: 'Visit pokoin.com', href: 'https://pokoin.com' }],
  },
  {
    slug: 'cardrail',
    title: 'CardRail',
    kicker: 'Inventory for card sellers · in development',
    summary: cardrail.outcome + ' ' + cardrail.description,
    description: 'CardRail case study: one inventory for every marketplace. Scanning, shelf positions and marketplace adapters for trading-card sellers.',
    sections: [
      {
        heading: 'One inventory, every marketplace',
        paragraphs: [
          'Marketplaces connect through adapters. The core stores one canonical card: identity, language, condition, printing, quantity, price, physical location and its external listings.',
          'CardTrader ↔ adapter ↔ CardRail core ↔ adapter ↔ Pokoin: Pokoin is a connector, not the product.',
        ],
      },
      {
        heading: 'The workflow the demo shows',
        bullets: [
          'Scan a card into a shelf position.',
          'Reconcile a CardTrader order into one physical pick run.',
          'Keep listings and stock in step across marketplaces.',
        ],
      },
      {
        heading: 'Status',
        paragraphs: ['CardRail is in development. Work so far spans a Rust/PostgreSQL backend, a React web app, Swift and Kotlin clients, and CardTrader and eBay integrations for listing and stock workflows.'],
      },
    ],
    stack: cardrail.stack,
    links: cardrail.links,
  },
  {
    slug: 'systems',
    title: 'Systems & data',
    kicker: 'Engineering · pipelines and infrastructure',
    summary: pipelines.outcome + ' ' + pipelines.description,
    description: 'Systems and data engineering: PostgreSQL partitioning, transactional imports, edge caching and Kubernetes failover behind Pokoin.',
    metrics: pipelines.metrics,
    measurementNote: pipelines.measurementNote,
    sections: [
      {
        heading: 'Pipelines',
        bullets: [
          '951 historical archives imported into 32 monthly PostgreSQL partitions, validating row counts and preserving source hashes.',
          'Daily snapshot processing links explicit provider identifiers to Pokoin’s catalog.',
          'Transactional imports and resumable stages keep completed datasets readable during refreshes.',
        ],
      },
      {
        heading: 'Serving path',
        bullets: [
          'Edge caching and request coalescing in front of the API.',
          'Rust services (Axum, Tokio, SQLx) on k3s with API overflow and health-based failover.',
          'PostgreSQL writer/replica separation: consistent writes, distributed reads.',
        ],
      },
      {
        heading: 'How I work',
        bullets: [
          'Measure the result: load tests, row-count reconciliation and repeatable imports.',
          'Protect data correctness: explicit source identity, transaction boundaries and failure recovery.',
          'Build for maintenance: documented decisions, reproducible inputs, visible failures.',
        ],
      },
    ],
    stack: [...new Set([...pipelines.stack, 'Rust', 'Kubernetes (k3s)', 'Cloudflare'])],
    links: [{ label: 'Pokoin', href: 'https://pokoin.com' }],
  },
];
