import { Backdrop, Flow, Node, TEAL } from "./parts";

const id = "pl";

export function PipelineDiagram() {
  return (
    <svg
      viewBox="0 0 560 315"
      role="img"
      aria-label="951 historical archives and daily snapshots are validated and imported transactionally into 32 monthly PostgreSQL partitions holding 52.9 million price observations, which serve Pokoin's catalog and pricing APIs."
      class="h-full w-full"
    >
      <Backdrop id={id} />

      <Node x={10} y={28} w={160} h={64} title="951 archives" sub="Feb 2024–Sep 2026" />
      <Node x={200} y={28} w={160} h={64} title="Transactional import" sub="resumable stages" />
      <g>
        <rect x="390" y="28" width="160" height="150" rx="10" fill="rgba(45,212,191,0.04)" stroke="rgba(45,212,191,0.45)" />
        <text x="470" y="54" text-anchor="middle" font-size="13.5" fill="#f4f4f5" class="font-sans">
          PostgreSQL
        </text>
        <text x="470" y="72" text-anchor="middle" font-size="10.5" fill="#a1a1aa" class="font-mono">
          32 monthly partitions
        </text>
        <text x="470" y="126" text-anchor="middle" font-size="30" fill={TEAL} class="font-mono">
          52.9M
        </text>
        <text x="470" y="148" text-anchor="middle" font-size="10.5" fill="#a1a1aa" class="font-mono">
          price observations
        </text>
      </g>

      <Node x={10} y={210} w={160} h={64} title="Daily snapshot" sub="624,798 rows" />
      <Node x={200} y={210} w={160} h={64} title="Validate" sub="hashes · row counts" />
      <Node x={390} y={210} w={160} h={64} title="Catalog & pricing APIs" sub="Pokoin" accent />

      <Flow id={id} d="M172 60 H197" />
      <Flow id={id} d="M362 60 H387" begin={0.6} />
      <Flow id={id} d="M172 242 H197" begin={1.2} />
      <Flow id={id} d="M280 208 V95" violet begin={1.8} />
      <Flow id={id} d="M470 180 V207" begin={0.9} />
    </svg>
  );
}
