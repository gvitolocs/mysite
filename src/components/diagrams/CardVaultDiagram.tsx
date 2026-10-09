import { Backdrop, Flow, Node } from "./parts";

const id = "cv";

export function CardVaultDiagram() {
  return (
    <svg
      viewBox="0 0 560 315"
      role="img"
      aria-label="The CardVault Flutter app exchanges search and card data with the Pokoin catalog API and also talks to Firebase."
      class="h-full w-full"
    >
      <Backdrop id={id} />

      {/* Phone outline: a schematic, not a screenshot of the app. */}
      <g fill="none" stroke="rgba(255,255,255,0.2)">
        <rect x="60" y="48" width="100" height="176" rx="16" />
        <rect x="95" y="58" width="30" height="4" rx="2" fill="rgba(255,255,255,0.2)" stroke="none" />
        <rect x="74" y="74" width="72" height="12" rx="6" stroke="rgba(255,255,255,0.14)" />
        <rect x="74" y="96" width="33" height="46" rx="4" stroke="rgba(45,212,191,0.4)" />
        <rect x="113" y="96" width="33" height="46" rx="4" stroke="rgba(255,255,255,0.14)" />
        <rect x="74" y="150" width="33" height="46" rx="4" stroke="rgba(255,255,255,0.14)" />
        <rect x="113" y="150" width="33" height="46" rx="4" stroke="rgba(129,140,248,0.4)" />
      </g>
      <text x="110" y="252" text-anchor="middle" font-size="13.5" fill="#f4f4f5" class="font-sans">
        CardVault
      </text>
      <text x="110" y="270" text-anchor="middle" font-size="10.5" fill="#a1a1aa" class="font-mono">
        Flutter · Dart
      </text>

      <Node x={330} y={48} w={200} h={64} title="Pokoin catalog API" sub="search · card data" accent />
      <Node x={330} y={176} w={200} h={64} title="Firebase" />

      <Flow id={id} d="M164 104 C 240 104, 250 74, 326 74" />
      <Flow id={id} d="M326 88 C 250 88, 240 118, 164 118" violet begin={1.2} />
      <Flow id={id} d="M164 168 C 240 168, 250 202, 326 202" begin={0.6} />
      <Flow id={id} d="M326 216 C 250 216, 240 182, 164 182" violet begin={1.8} />
    </svg>
  );
}
