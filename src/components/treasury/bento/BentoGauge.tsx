import { useId } from "react";

const ARC = Math.PI * 60; // semicircle length for r = 60

/**
 * Semicircle gauge: the filled arc is the measured share, the hatched part is
 * what is left. The dot sits exactly on the ratio.
 */
export function BentoGauge({ ratio }: { ratio: number }) {
  const raw = useId();
  const hatch = `hatch-${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  const pct = Math.min(Math.max(ratio, 0), 1);
  const angle = Math.PI * pct;
  const dotX = 80 - 60 * Math.cos(angle);
  const dotY = 95 - 60 * Math.sin(angle);

  return (
    <svg
      viewBox="0 0 160 108"
      className="w-full max-w-[270px]"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <pattern
          id={hatch}
          patternUnits="userSpaceOnUse"
          width="4"
          height="4"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="4"
            stroke="hsl(var(--brand) / 0.3)"
            strokeWidth="1.4"
          />
        </pattern>
      </defs>
      <path
        d="M 20 95 A 60 60 0 0 1 140 95"
        fill="none"
        stroke={`url(#${hatch})`}
        strokeWidth="18"
        strokeLinecap="round"
      />
      <path
        d="M 20 95 A 60 60 0 0 1 140 95"
        fill="none"
        stroke="hsl(var(--brand))"
        strokeWidth="18"
        strokeLinecap="round"
        strokeDasharray={`${ARC * pct} ${ARC}`}
      />
      <circle
        cx={dotX}
        cy={dotY}
        r="5.5"
        fill="hsl(var(--card))"
        stroke="hsl(var(--brand))"
        strokeWidth="3"
        className="animate-pulse-soft"
      />
    </svg>
  );
}
