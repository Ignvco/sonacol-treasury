import { useId } from "react";
import { ChevronRight, Milestone } from "lucide-react";
import { cn } from "@/lib/utils";
import { BentoCard, BentoHeader } from "./BentoShell";

export interface MilestoneItem {
  key: string;
  date: string;
  title: string;
  description: string;
  amountText: string;
  tone?: "default" | "danger";
  onClick: () => void;
}

/** Projected balance trend, drawn as a plain polyline to stay light. */
function Sparkline({ values }: { values: number[] }) {
  const raw = useId();
  const fill = `spark-${raw.replace(/[^a-zA-Z0-9]/g, "")}`;
  if (values.length < 2) return null;

  const width = 140;
  const height = 56;
  const pad = 5;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const points = values.map((value, index) => {
    const x = (index / (values.length - 1)) * width;
    const y = height - pad - ((value - min) / span) * (height - pad * 2);
    return [x, y] as const;
  });
  const line = points
    .map(([x, y], index) => `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-2 h-14 w-full"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={fill} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#A9B8FF" stopOpacity={0.5} />
          <stop offset="100%" stopColor="#A9B8FF" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={`${line} L ${width} ${height} L 0 ${height} Z`} fill={`url(#${fill})`} />
      <path
        d={line}
        fill="none"
        stroke="#C7D2FF"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeDasharray="320"
        className="animate-draw"
      />
      <circle cx={lastX} cy={lastY} r="3" fill="#C7D2FF" />
    </svg>
  );
}

/**
 * Timeline of the dates that matter inside the horizon, with the two figures
 * that qualify the series: deficit days and the projected trend.
 */
export function ResumenMilestonesCard({
  items,
  horizon,
  deficitDays,
  balances,
  minimumText,
  maximumText,
  className,
}: {
  items: MilestoneItem[];
  horizon: number;
  deficitDays: number;
  balances: number[];
  minimumText: string;
  maximumText: string;
  className?: string;
}) {
  return (
    <BentoCard
      className={cn("flex min-h-0 flex-col", className)}
      style={{ animationDelay: "160ms" }}
    >
      <BentoHeader
        icon={Milestone}
        title="Hitos de la proyección"
        subtitle={`Del corte al cierre · ${horizon} días`}
      />

      <div className="mt-5 flex min-w-0 flex-1 flex-col gap-5 sm:flex-row">
        <ol className="relative flex min-w-0 flex-1 flex-col justify-between">
          <span
            aria-hidden
            className="absolute bottom-4 left-3 top-4 w-px -translate-x-1/2 bg-border"
          />
          {items.map((item, index) => (
            <li
              key={item.key}
              className="animate-slide-in relative"
              style={{ animationDelay: `${200 + index * 80}ms` }}
            >
              <button
                type="button"
                onClick={item.onClick}
                className="group flex w-full items-center gap-3 rounded-xl py-2.5 pl-0.5 pr-1 text-left transition-colors hover:bg-muted/60"
              >
                <span className="flex w-6 shrink-0 justify-center">
                  <span
                    className={cn(
                      "h-2.5 w-2.5 rounded-full ring-4",
                      item.tone === "danger"
                        ? "bg-danger-vivid ring-danger-soft"
                        : "bg-brand ring-brand-soft",
                    )}
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[12px] font-semibold text-foreground">
                    {item.date}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {item.title} · {item.description}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-[13px] font-semibold tabular-nums",
                    item.tone === "danger" ? "text-danger" : "text-foreground",
                  )}
                >
                  {item.amountText}
                </span>
                <ChevronRight
                  size={14}
                  className="shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5"
                />
              </button>
            </li>
          ))}
        </ol>

        <div className="flex w-full shrink-0 flex-col justify-center gap-3 sm:w-[184px]">
          <div className="rounded-[20px] bg-brand p-4 text-white">
            <span className="text-[10px] font-medium uppercase tracking-wide text-white/70">
              Días en déficit
            </span>
            <p className="mt-1 text-[26px] font-bold leading-none tabular-nums">
              {deficitDays}
            </p>
            <p className="mt-1 text-[11px] text-white/70">
              de {horizon} días proyectados
            </p>
          </div>

          <div className="rounded-[20px] bg-brand-deep p-4 text-white">
            <span className="text-[10px] font-medium uppercase tracking-wide text-white/60">
              Tendencia del saldo
            </span>
            <Sparkline values={balances} />
            <p className="mt-2 flex items-center justify-between gap-2 text-[10px] tabular-nums text-white/60">
              <span>Mín {minimumText}</span>
              <span>Máx {maximumText}</span>
            </p>
          </div>
        </div>
      </div>
    </BentoCard>
  );
}
