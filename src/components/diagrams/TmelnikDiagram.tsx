import { Backdrop, Flow, Node } from "./parts";

const id = "tm";

export function TmelnikDiagram() {
  return (
    <svg
      viewBox="0 0 560 315"
      role="img"
      aria-label="The Tmelnik Flutter app, with Offers, Feedback, Info and News sections, signs users in with Firebase Authentication, keeps project offers, applications and feedback in Cloud Firestore, and shares offers to Instagram."
      class="h-full w-full"
    >
      <Backdrop id={id} />

      {/* Phone outline with the app's four bottom-navigation sections: a schematic, not a screenshot. */}
      <g fill="none" stroke="rgba(255,255,255,0.2)">
        <rect x="60" y="40" width="100" height="184" rx="16" />
        <rect x="95" y="50" width="30" height="4" rx="2" fill="rgba(255,255,255,0.2)" stroke="none" />
        <rect x="74" y="66" width="72" height="34" rx="5" stroke="rgba(45,212,191,0.4)" />
        <rect x="74" y="106" width="72" height="34" rx="5" stroke="rgba(255,255,255,0.14)" />
        <rect x="74" y="146" width="72" height="34" rx="5" stroke="rgba(255,255,255,0.14)" />
        <line x1="66" y1="194" x2="154" y2="194" stroke="rgba(255,255,255,0.12)" />
      </g>
      <g font-size="7.5" fill="#a1a1aa" text-anchor="middle" class="font-mono">
        <text x="81" y="210">Offers</text>
        <text x="104" y="210">Feedback</text>
        <text x="125" y="210">Info</text>
        <text x="143" y="210">News</text>
      </g>
      <text x="110" y="252" text-anchor="middle" font-size="13.5" fill="#f4f4f5" class="font-sans">
        Tmelnik app
      </text>
      <text x="110" y="270" text-anchor="middle" font-size="10.5" fill="#a1a1aa" class="font-mono">
        Flutter · Dart
      </text>

      <Node x={330} y={28} w={200} h={64} title="Firebase Authentication" sub="Google · email" />
      <Node x={330} y={124} w={200} h={64} title="Cloud Firestore" sub="offers · applications · feedback" accent />
      <Node x={330} y={220} w={200} h={64} title="Instagram" sub="share an offer" />

      <Flow id={id} d="M164 80 C 240 80, 250 60, 326 60" violet />
      <Flow id={id} d="M164 136 C 240 136, 250 148, 326 148" begin={0.6} />
      <Flow id={id} d="M326 164 C 250 164, 240 152, 164 152" violet begin={1.4} />
      <Flow id={id} d="M164 176 C 240 176, 250 252, 326 252" begin={1.0} />
    </svg>
  );
}
