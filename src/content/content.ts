/** Giuseppe Vitolo's portfolio: shared copy, links and project evidence. */

export type SiteSocial = { github: string; linkedin?: string };
export const site = {
  name: "Giuseppe Vitolo",
  firstName: "Giuseppe",
  role: "Software engineering · MSc Computer Engineering, Aarhus University",
  tagline: "Backend services, data pipelines and useful web products.",
  email: "gvitolocs@gmail.com",
  location: "Aarhus, Denmark",
  avatarUrl: "/giuseppe-vitolo-440.jpg",
  social: {
    github: "https://github.com/gvitolocs",
    linkedin: "https://www.linkedin.com/in/gvitolocs/",
  } satisfies SiteSocial,
};

export const cv = { available: true, href: "/cv.pdf" } as const;
export const hero = {
  headline: "Backend engineering, data pipelines and web products.",
  subhead: "I’m Giuseppe Vitolo, a Computer Engineering MSc student at Aarhus University. I build with Rust, Kubernetes and PostgreSQL, from a trading-card marketplace to pipelines processing millions of price observations and B2B product-data tools.",
  primaryCta: { label: "Explore my projects", href: "#projects" },
  secondaryCta: { label: "Download CV", href: "/cv.pdf" },
  presence: {
    label: "Software engineer · MSc student",
    line1: "Backend systems · Data engineering · Cybersecurity",
    line2: "Building products in Aarhus, Denmark",
  },
};

export const about = {
  eyebrow: "About",
  title: "Connecting software, data and the people who use it.",
  paragraphs: [
    "I’m an Italian Computer Engineering graduate based in Aarhus, where I’m studying for an MSc with a focus on cybersecurity. My work combines backend development, distributed systems and practical product design.",
    "Through Pokoin, I build marketplace APIs, web interfaces and data pipelines. Recent work includes a Rust autocomplete service, Kubernetes overflow routing and PostgreSQL imports covering 52.9 million historical price observations.",
    "My B2B internship at prduct focuses on how product information moves from suppliers to companies and retailers. I built an interactive Digital Product Passport assessment prototype that gives purchasing and sales teams questions they can answer and a clear picture of their data gaps.",
  ],
  highlights: [
    { label: "Education", value: "MSc Computer Engineering, Aarhus University" },
    { label: "Based in", value: "Aarhus, Denmark" },
    { label: "Working with", value: "Rust · PostgreSQL · Kubernetes · SolidJS" },
  ],
};

export type ExperienceItem = {
  id: string; title: string; org: string; period: string; location: string;
  summary: string; tags: string[];
  kind: "education" | "work" | "internship" | "milestone";
};
export const experience: ExperienceItem[] = [
  {
    id: "pokoin", kind: "work", title: "Backend & data engineering",
    org: "Pokoin · Independent project", period: "2026", location: "Aarhus, Denmark",
    summary: "Built marketplace APIs and web interfaces (SolidJS, migrated from React), shipped autocomplete in Rust, and configured Kubernetes API overflow with PostgreSQL writer/replica separation. Optimized the home feed with edge caching and request coalescing, and developed transactional imports for large catalog and price datasets.",
    tags: ["Rust", "PostgreSQL", "Kubernetes", "SolidJS", "Data pipelines"],
  },
  {
    id: "prduct", kind: "internship", title: "B2B software development",
    org: "prduct", period: "2026", location: "Denmark",
    summary: "Mapped product-data handoffs, documentation ownership and data quality across suppliers, companies and retailers. Built and iterated a Digital Product Passport assessment website with purchasing and sales paths, product-data mapping and stakeholder feedback. The delivered website is a sprint prototype.",
    tags: ["B2B", "Product data", "Digital Product Passports", "Web development"],
  },
  {
    id: "msc-au", kind: "education", title: "MSc Computer Engineering",
    org: "Aarhus University", period: "2026–2028 · expected", location: "Aarhus, Denmark",
    summary: "Graduate study with a cybersecurity focus. Selected courses include Distributed Systems and Security, Modelling and Verification, and Software Correctness.",
    tags: ["Cybersecurity", "Distributed systems", "Formal verification"],
  },
  {
    id: "tmelnik", kind: "work", title: "Communications assistant · Digital education",
    org: "Tmelnik", period: "Jul 2025–Feb 2026", location: "Prague, Czech Republic",
    summary: "Coordinated digital communication, event activities and reporting with international youth-education partners.",
    tags: ["Communication", "International collaboration", "Project coordination"],
  },
  {
    id: "intern-industrial", kind: "internship", title: "Java software developer",
    org: "Innovation Engineering", period: "Jan–Mar 2025", location: "Salerno, Italy",
    summary: "Built a JavaFX HMI prototype for three simulated industrial machines. Integrated Modbus TCP data acquisition with timestamped measurements in MySQL and operator dashboards.",
    tags: ["Java", "JavaFX", "MySQL", "Modbus TCP"],
  },
  {
    id: "bsc", kind: "education", title: "BSc Computer Engineering",
    org: "University of Salerno", period: "2025", location: "Salerno, Italy",
    summary: "Engineering foundation in programming, algorithms, operating systems, computer networks, databases and software engineering.",
    tags: ["Computer engineering", "Algorithms", "Systems"],
  },
];

export type Project = {
  id: string; name: string; tagline: string; outcome: string; description: string;
  stack: string[]; links: { label: string; href: string }[];
  metrics?: { value: string; label: string }[]; measurementNote?: string;
  accent: "teal" | "violet";
};
export const projects: Project[] = [
  {
    id: "pokoin", name: "Pokoin", tagline: "Marketplace",
    outcome: "Trading-card discovery, pricing and seller workflows.",
    description: "A marketplace with SolidJS web interfaces, shared APIs and provider-data integrations. I shipped autocomplete in Rust using Axum, Tokio and SQLx, configured Kubernetes overflow and PostgreSQL read replicas, and optimized the home feed through edge caching and request coalescing.",
    metrics: [
      { value: "6.9 s → 26 ms", label: "Home-feed median latency" },
      { value: "1.3 → 284 req/s", label: "Home-feed throughput" },
    ],
    measurementNote: "29 Sep 2026 load test, 8 concurrent requests: direct Pi API baseline compared with the serving path through the cached edge.",
    stack: ["Rust", "Axum", "PostgreSQL", "Kubernetes", "SolidJS", "Cloudflare"],
    links: [{ label: "Visit Pokoin", href: "https://pokoin.com" }], accent: "teal",
  },
  {
    id: "cardrail", name: "CardRail", tagline: "In development",
    outcome: "A scanning desk and stock book for collectible-card inventory.",
    description: "Connects phone capture, saved scan photos, card recognition and inventory positions. Work includes a Rust/PostgreSQL backend, React web app, Swift and Kotlin clients, and CardTrader and eBay integrations for listing and stock workflows.",
    stack: ["Rust", "PostgreSQL", "React", "Swift", "Kotlin", "REST APIs"],
    links: [
      { label: "Open CardRail", href: "https://cardrails.vercel.app" },
      { label: "Source code", href: "https://github.com/gvitolocs/CardRail" },
    ], accent: "violet",
  },
  {
    id: "prduct-dpp", name: "prduct · DPP assessment", tagline: "Sprint prototype",
    outcome: "Making supplier and product-data gaps visible to B2B teams.",
    description: "An interactive assessment website from my prduct internship. Purchasing and sales teams follow different questions through a product’s lifecycle, then receive a product-data landscape and practical next steps. Developed through stakeholder feedback for Digital Product Passport readiness.",
    stack: ["JavaScript", "HTML/CSS", "Python", "B2B", "Product data"],
    links: [
      { label: "Try the prototype", href: "https://demosprint-fawn.vercel.app" },
      { label: "Source code", href: "https://github.com/gvitolocs/prduct_sprint" },
    ], accent: "teal",
  },
  {
    id: "price-pipelines", name: "Catalog & price data pipelines", tagline: "Data engineering",
    outcome: "Provider datasets transformed into retail-facing catalog and pricing APIs.",
    description: "Imported 951 historical archives into 32 monthly PostgreSQL partitions. Daily snapshot processing preserves source hashes, validates row counts and links explicit provider identifiers to Pokoin’s catalog. Transactional imports and resumable stages keep completed datasets readable during refreshes.",
    metrics: [
      { value: "52.9M", label: "Historical price observations" },
      { value: "624,798", label: "Product/variant rows in a snapshot" },
    ],
    measurementNote: "Historical data covers English and Japanese Pokémon, Feb 2024–Sep 2026. The 30 Sep 2026 snapshot contains 510,593 distinct products across categories.",
    stack: ["Python", "PostgreSQL", "SQL", "Partitioning", "Data validation"],
    links: [{ label: "Integrated into Pokoin", href: "https://pokoin.com" }], accent: "violet",
  },
  {
    id: "cardvault", name: "CardVault", tagline: "Mobile app",
    outcome: "Collectible-card organization, search and inventory on mobile.",
    description: "A Flutter application for organizing cards and accessing the Pokoin catalog. It brings collection and inventory workflows into a mobile interface, using shared APIs for search and card data.",
    stack: ["Dart", "Flutter", "Firebase", "REST APIs"],
    links: [{ label: "Source code", href: "https://github.com/gvitolocs/cardvault" }], accent: "teal",
  },
  {
    id: "industrial-hmi", name: "Industrial monitoring & HMI", tagline: "Internship project",
    outcome: "Machine measurements connected to operator dashboards.",
    description: "A JavaFX prototype for three simulated industrial machines. Modbus TCP acquisition feeds timestamped measurements into MySQL, with dashboards for machine state, alarms, velocity and temperature. Developed during my Innovation Engineering internship.",
    stack: ["Java", "JavaFX", "MySQL", "Modbus TCP"],
    links: [{ label: "Read my CV", href: "/cv.pdf" }], accent: "violet",
  },
];

export const skills = {
  eyebrow: "Skills", title: "The tools behind my projects",
  summary: "Practical development experience, supported by graduate study in systems and security.",
  educationSummary: ["BSc Computer Engineering, University of Salerno", "MSc Computer Engineering, Aarhus University", "Cybersecurity focus"],
  categories: [
    { name: "Programming", items: ["Rust", "Python", "Java", "JavaScript", "Dart", "SQL"] },
    { name: "Backend & data", items: ["Axum / Tokio / SQLx", "PostgreSQL", "MySQL", "REST APIs", "Data pipelines"] },
    { name: "Infrastructure & web", items: ["Kubernetes (k3s)", "Docker", "Linux", "Cloudflare", "SolidJS", "React", "Git"] },
    { name: "Systems & security", items: ["Distributed systems", "Cryptography", "Formal verification", "Software correctness"] },
  ],
};

export type GuidingPrinciple = { id: string; title: string; body: string };
export const guidingPrinciples: GuidingPrinciple[] = [
  { id: "evidence", title: "Measure the result", body: "I use load tests, row-count reconciliation and repeatable imports to check whether a change improves the system." },
  { id: "correctness", title: "Protect data correctness", body: "I keep source identity, transaction boundaries and failure recovery explicit, especially when data crosses services." },
  { id: "users", title: "Start with the workflow", body: "A supplier, an operator and a sales team need different views of the same data. The interface should reflect the work they do." },
  { id: "ownership", title: "Build for maintenance", body: "I document decisions, preserve reproducible inputs and make failures visible so the next change is easier to understand." },
];

export const vision = {
  eyebrow: "Direction", title: "Growing as a software engineer in Denmark.",
  paragraphs: [
    "I want to work on backend systems and data products where reliability matters to the people using them. My current projects give me practical experience from source data and database design to APIs and user interfaces.",
    "Alongside my MSc, I’m developing my knowledge of distributed systems, security and software correctness. I’m interested in teams where I can contribute to real products and learn from experienced engineers.",
  ],
  pillars: [
    { title: "Systems", body: "Understand how services, storage and infrastructure behave together." },
    { title: "Security", body: "Apply security thinking to interfaces, access boundaries and data handling." },
    { title: "Products", body: "Connect technical decisions to a workflow and a useful result." },
  ],
};
export const contact = {
  eyebrow: "Contact", title: "Let’s build something useful.",
  body: "For software engineering opportunities or collaborations around backend systems, data and B2B products, get in touch. You can find my latest CV and project links below.",
  replyNote: "Based in Aarhus · Europe/Copenhagen",
};
export const footer = { note: "Software engineering, systems and data." };
