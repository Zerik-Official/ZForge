import type { CSSProperties } from "react";
import { SIGIL_AXIS, SIGIL_BAR, SIGIL_HEXAGON, SIGIL_Z } from "@/components/brand/Sigil";
import "@/styles/rune.css";

/** Strokes of the twelve forge runes, drawn on a 20 x 28 grid. */
const GLYPHS: string[][] = [
  ["M3 8 H17", "M6 8 L8 16 H12 L14 8", "M10 16 V24", "M6 24 H14"],
  ["M10 2 V26", "M4 8 L16 20", "M16 8 L4 20"],
  ["M4 4 H16", "M4 4 V10", "M16 4 V10", "M10 4 V26"],
  ["M10 26 L4 14 L10 2 L16 14 Z", "M10 10 V18"],
  ["M5 2 V26", "M5 8 L14 14 L5 20", "M14 14 V26"],
  ["M15 2 V26", "M15 8 L5 14 L15 20"],
  ["M4 4 L10 10 L16 4", "M10 10 V26", "M5 20 H15"],
  ["M10 2 V26", "M4 10 L10 4 L16 10", "M4 20 L10 26 L16 20"],
  ["M4 2 V26", "M16 2 V26", "M4 8 L16 14", "M16 14 L4 20"],
  ["M10 2 V26", "M4 6 L10 12 L16 6"],
  ["M4 26 V10 L10 2 L16 10 V26", "M10 14 V20"],
  ["M4 4 L16 24", "M16 4 L4 24", "M10 2 V8", "M10 20 V26"],
];

const OUTER_ARCS = [
  "M200 22 A178 178 0 0 1 345 98",
  "M362 160 A178 178 0 0 1 300 346",
  "M232 375 A178 178 0 0 1 40 270",
  "M26 205 A178 178 0 0 1 120 40",
];

const TICKS = Array.from({ length: 72 }, (_, index) => ({ angle: index * 5, long: index % 6 === 0 }));

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315].map((angle, index) => ({
  angle: angle + 15,
  duration: `${(2.2 + ((index * 0.57) % 2.1)).toFixed(2)}s`,
  delay: `${((index * 0.37) % 1.9).toFixed(2)}s`,
}));

const CORE_STROKES = [SIGIL_HEXAGON, SIGIL_Z, SIGIL_AXIS, SIGIL_BAR];
const CORE_DELAYS = ["0s", "0.25s", "0.5s", "0.65s"];

type RuneStyle = CSSProperties & Record<`--${string}`, string>;

/**
 * Properties for the {@link RuneLoader} component.
 */
interface RuneLoaderProps {
  /** Boot progress from 0 to 100. */
  percent: number;
  /** Draws the central sigil once the boot is complete. */
  complete: boolean;
  /** How busy a download is, from 0 to 1; the sparks around the ring flare faster with it. */
  activity?: number;
}

/**
 * Boot animation: a ring of twelve forge runes that are engraved as the boot advances.
 *
 * The inner arc shows the exact percentage. The outer arcs, the tick crown, the rune ring
 * and two sparks each move at their own speed and direction. When the boot completes the
 * central sigil is drawn. Every stroke uses the theme's primary color.
 */
export function RuneLoader({ percent, complete, activity = 0 }: RuneLoaderProps) {
  const clamped = Math.max(0, Math.min(100, percent));
  const pace: RuneStyle = { "--ray-pace": (1 - 0.7 * Math.max(0, Math.min(1, activity))).toFixed(2) };

  return (
    <svg className="rune-loader" viewBox="0 0 400 400" aria-hidden="true" style={pace}>
      <defs>
        <filter id="rune-glow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2.4" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <g className="rune-spin rune-spin--slow">
        {OUTER_ARCS.map((d) => (
          <path key={d} className="rune-stroke" strokeWidth={1.6} opacity={0.75} d={d} />
        ))}
      </g>

      <g className="rune-spin rune-spin--reverse">
        {TICKS.map((tick) => (
          <line
            key={tick.angle}
            className="rune-stroke"
            x1={200}
            y1={tick.long ? 36 : 40}
            x2={200}
            y2={46}
            strokeWidth={tick.long ? 1.6 : 1}
            opacity={tick.long ? 0.7 : 0.35}
            transform={`rotate(${tick.angle} 200 200)`}
          />
        ))}
      </g>

      <circle className="rune-stroke rune-dim" cx={200} cy={200} r={150} strokeWidth={1} />
      <circle className="rune-stroke rune-dim" cx={200} cy={200} r={108} strokeWidth={1} />

      <g className="rune-spin rune-spin--ring" filter="url(#rune-glow)">
        {GLYPHS.map((strokes, index) => {
          const lit = clamped >= ((index + 1) / GLYPHS.length) * 100 - 0.01;
          const style: RuneStyle = {
            "--flicker": `${(2.6 + ((index * 0.73) % 2.4)).toFixed(2)}s`,
            "--flicker-delay": `${((index * 0.41) % 1.7).toFixed(2)}s`,
          };
          return (
            <g key={index} transform={`rotate(${index * 30} 200 200) translate(188 54) scale(1.2)`}>
              <g className={`rune-glyph ${lit ? "is-lit" : ""}`} style={style}>
                {strokes.map((d) => (
                  <path key={`ghost-${d}`} className="rune-stroke rune-ghost" strokeWidth={1.8} d={d} />
                ))}
                {strokes.map((d, stroke) => (
                  <path
                    key={`ink-${d}`}
                    className="rune-stroke rune-ink"
                    strokeWidth={1.8}
                    pathLength={1}
                    d={d}
                    style={{ transitionDelay: `${(stroke * 0.16).toFixed(2)}s` }}
                  />
                ))}
              </g>
            </g>
          );
        })}
      </g>

      <g>
        {RAYS.map((ray) => (
          <line
            key={ray.angle}
            className="rune-ray"
            x1={200}
            y1={4}
            x2={200}
            y2={26}
            strokeWidth={1.4}
            transform={`rotate(${ray.angle} 200 200)`}
            style={{ "--ray-duration": ray.duration, "--ray-delay": ray.delay } as RuneStyle}
          />
        ))}
      </g>

      <circle className="rune-stroke rune-dim" cx={200} cy={200} r={92} strokeWidth={3} />
      <circle
        className="rune-stroke rune-progress"
        cx={200}
        cy={200}
        r={92}
        strokeWidth={3}
        pathLength={1}
        strokeDasharray={1}
        strokeDashoffset={1 - clamped / 100}
        transform="rotate(-90 200 200)"
        filter="url(#rune-glow)"
      />

      <circle r={3} fill="currentColor" filter="url(#rune-glow)">
        <animateMotion dur="7s" repeatCount="indefinite" path="M200 50 A150 150 0 1 1 199.9 50" />
      </circle>
      <circle r={2.2} fill="currentColor" opacity={0.8} filter="url(#rune-glow)">
        <animateMotion
          dur="11s"
          repeatCount="indefinite"
          keyPoints="1;0"
          keyTimes="0;1"
          calcMode="linear"
          path="M200 22 A178 178 0 1 1 199.9 22"
        />
      </circle>

      <g className={`rune-core ${complete ? "is-lit" : ""}`} filter="url(#rune-glow)">
        <svg x={150} y={150} width={100} height={100} viewBox="0 0 100 100" strokeWidth={3.2}>
          {CORE_STROKES.map((d) => (
            <path key={`ghost-${d}`} className="rune-stroke rune-core-ghost" d={d} />
          ))}
          {CORE_STROKES.map((d, index) => (
            <path key={d} className="rune-stroke rune-core-ink" pathLength={1} d={d} style={{ transitionDelay: CORE_DELAYS[index] }} />
          ))}
        </svg>
      </g>
    </svg>
  );
}
