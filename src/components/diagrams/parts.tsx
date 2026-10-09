/**
 * SVG building blocks for the project architecture diagrams (viewBox 0 0 560 315).
 * Each diagram passes its own `id` prefix: three diagrams share one page, so pattern/marker ids must not clash.
 */

export const TEAL = "#2dd4bf";
export const VIOLET = "#818cf8";

export function Backdrop(props: { id: string }) {
  return (
    <>
      <defs>
        <pattern id={`${props.id}-dots`} width="20" height="20" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="rgba(255,255,255,0.05)" />
        </pattern>
        <marker
          id={`${props.id}-arrow`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill={TEAL} />
        </marker>
        <marker
          id={`${props.id}-arrow-v`}
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M0 0L10 5L0 10z" fill={VIOLET} />
        </marker>
      </defs>
      <rect width="560" height="315" fill={`url(#${props.id}-dots)`} />
    </>
  );
}

type NodeProps = { x: number; y: number; w: number; h: number; title: string; sub?: string; accent?: boolean };

export function Node(props: NodeProps) {
  const cx = props.x + props.w / 2;
  const cy = props.y + props.h / 2;
  return (
    <g>
      <rect
        x={props.x}
        y={props.y}
        width={props.w}
        height={props.h}
        rx="10"
        fill="rgba(255,255,255,0.03)"
        stroke={props.accent ? "rgba(45,212,191,0.45)" : "rgba(255,255,255,0.12)"}
      />
      <text
        x={cx}
        y={props.sub ? cy - 3 : cy + 4.5}
        text-anchor="middle"
        font-size="13.5"
        fill="#f4f4f5"
        class="font-sans"
      >
        {props.title}
      </text>
      {props.sub ? (
        <text x={cx} y={cy + 14} text-anchor="middle" font-size="10.5" fill="#a1a1aa" class="font-mono">
          {props.sub}
        </text>
      ) : null}
    </g>
  );
}

/** A dashed connector whose dashes march (CSS `.flow`) plus a packet travelling along it (SMIL, hidden for reduced motion). */
export function Flow(props: { id: string; d: string; violet?: boolean; begin?: number }) {
  const color = props.violet ? VIOLET : TEAL;
  return (
    <g>
      <path
        d={props.d}
        fill="none"
        stroke={color}
        stroke-width="1.5"
        stroke-opacity="0.7"
        class="flow"
        marker-end={`url(#${props.id}-arrow${props.violet ? "-v" : ""})`}
      />
      <g class="motion-reduce:hidden">
        <circle r="2.5" fill={color}>
          <animateMotion dur="2.4s" begin={`${props.begin ?? 0}s`} repeatCount="indefinite" path={props.d} />
        </circle>
      </g>
    </g>
  );
}
