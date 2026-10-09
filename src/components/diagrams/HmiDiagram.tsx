import { Backdrop, Flow, Node, TEAL } from "./parts";

const id = "hm";
const readouts = ["state", "alarms", "velocity", "temperature"];

export function HmiDiagram() {
  return (
    <svg
      viewBox="0 0 560 315"
      role="img"
      aria-label="Three simulated machines are read over Modbus TCP; timestamped measurements are stored in MySQL and shown on an operator dashboard with state, alarms, velocity and temperature."
      class="h-full w-full"
    >
      <Backdrop id={id} />

      <Node x={10} y={30} w={120} h={46} title="Machine 1" sub="simulated" />
      <Node x={10} y={134} w={120} h={46} title="Machine 2" sub="simulated" />
      <Node x={10} y={238} w={120} h={46} title="Machine 3" sub="simulated" />
      <Node x={168} y={127} w={124} h={60} title="Modbus TCP" sub="data acquisition" />
      <Node x={320} y={22} w={230} h={60} title="MySQL" sub="timestamped measurements" accent />

      <g>
        <rect x="320" y="118" width="230" height="150" rx="10" fill="rgba(255,255,255,0.03)" stroke="rgba(255,255,255,0.12)" />
        <text x="435" y="142" text-anchor="middle" font-size="13.5" fill="#f4f4f5" class="font-sans">
          Operator dashboard
        </text>
        {/* Illustrative trace, not recorded data. */}
        <polyline
          points="338,200 358,192 378,196 398,178 418,184 438,168 458,176 478,160 498,166 518,154 532,158"
          fill="none"
          stroke={TEAL}
          stroke-width="1.5"
          stroke-linejoin="round"
        />
        <line x1="338" y1="210" x2="532" y2="210" stroke="rgba(255,255,255,0.08)" />
        {readouts.map((r, i) => {
          const x = 338 + (i % 2) * 100;
          const y = 220 + Math.floor(i / 2) * 24;
          return (
            <g>
              <rect x={x} y={y} width="94" height="20" rx="10" fill="rgba(45,212,191,0.06)" stroke="rgba(45,212,191,0.25)" />
              <text x={x + 47} y={y + 13.5} text-anchor="middle" font-size="10" fill="#a1a1aa" class="font-mono">
                {r}
              </text>
            </g>
          );
        })}
      </g>

      <Flow id={id} d="M132 53 C 150 53, 150 145, 165 148" />
      <Flow id={id} d="M132 157 H165" begin={0.5} />
      <Flow id={id} d="M132 261 C 150 261, 150 169, 165 166" begin={1} />
      <Flow id={id} d="M294 150 C 306 150, 300 52, 317 52" begin={1.5} />
      <Flow id={id} d="M435 84 V115" begin={0.8} />
    </svg>
  );
}
