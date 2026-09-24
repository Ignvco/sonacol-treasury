import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BentoCard, DeltaBadge } from "./BentoShell";

export interface BentoStat {
  key: string;
  label: string;
  valueText: string;
  subtext?: string;
  icon?: LucideIcon;
  tone?: "default" | "success" | "warning" | "danger";
  /** Percentage variation shown on the headline tile. */
  delta?: number | null;
  /** Drill-down hint; turns the headline tile into a button. */
  hint?: string;
  onClick?: () => void;
}

const GRID: Record<number, string> = {
  1: "lg:grid-cols-2",
  2: "lg:grid-cols-3",
  3: "lg:grid-cols-4",
  4: "lg:grid-cols-5",
  5: "lg:grid-cols-6",
};

const TONE: Record<string, string> = {
  default: "text-foreground",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};

const TILE_SURFACE = {
  default: "plain",
  success: "success",
  warning: "warning",
  danger: "danger",
} as const;

function StatTile({ stat, index }: { stat: BentoStat; index: number }) {
  const Icon = stat.icon;
  const tone = stat.tone ?? "default";
  const tinted = tone !== "default";
  return (
    <BentoCard
      surface={TILE_SURFACE[tone]}
      padding="sm"
      className="flex flex-col justify-between gap-3 lg:col-span-1"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="t-label">{stat.label}</span>
        {Icon && (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
              tinted
                ? cn("bg-card", TONE[tone])
                : "bg-brand-soft text-brand-dark",
            )}
          >
            <Icon size={15} strokeWidth={1.8} />
          </span>
        )}
      </div>
      <div className="min-w-0">
        <p
          className={cn(
            "text-[clamp(1.05rem,1.45vw,1.3rem)] font-semibold leading-tight tracking-tight tabular-nums",
            TONE[tone],
          )}
        >
          {stat.valueText}
        </p>
        {stat.subtext && (
          <p
            className={cn(
              "mt-1.5 line-clamp-2 text-[11px] leading-snug",
              tinted ? "text-foreground/70" : "text-muted-foreground",
            )}
          >
            {stat.subtext}
          </p>
        )}
      </div>
    </BentoCard>
  );
}

/**
 * Bento row of indicators: the first one becomes the navy headline tile and the
 * rest stay as light tiles, so the grid always fills its row.
 */
export function BentoStats({
  items,
  className,
}: {
  items: BentoStat[];
  className?: string;
}) {
  if (items.length === 0) return null;
  const [headline, ...rest] = items;
  const HeadlineIcon = headline.icon;
  const grid = GRID[Math.min(items.length, 5)] ?? GRID[4];

  const figure = (
    <>
      <span className="block text-[clamp(1.4rem,2.2vw,1.9rem)] font-semibold leading-none tracking-tight tabular-nums">
        {headline.valueText}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-2">
        {typeof headline.delta === "number" && (
          <DeltaBadge value={headline.delta} tone="dark" />
        )}
        {headline.subtext && (
          <span className="text-[11px] leading-snug text-white/70">
            {headline.subtext}
          </span>
        )}
      </span>
      {headline.onClick && (
        <span className="mt-2 flex items-center gap-1 text-[11px] font-medium text-white/60 transition-colors group-hover:text-white">
          {headline.hint ?? "Ver desglose"} <ChevronRight size={12} />
        </span>
      )}
    </>
  );

  return (
    <div className={cn("grid gap-4 sm:grid-cols-2", grid, className)}>
      <BentoCard
        surface="navy"
        className="flex flex-col justify-between gap-4 sm:col-span-2 lg:col-span-2"
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-20 h-48 w-48 rounded-full bg-white/10 blur-3xl"
        />
        <div className="flex items-start justify-between gap-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/60">
            {headline.label}
          </span>
          {HeadlineIcon && (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 text-white">
              <HeadlineIcon size={18} strokeWidth={1.8} />
            </span>
          )}
        </div>
        {headline.onClick ? (
          <button
            type="button"
            onClick={headline.onClick}
            className="group min-w-0 rounded-xl text-left"
          >
            {figure}
          </button>
        ) : (
          <div className="min-w-0">{figure}</div>
        )}
      </BentoCard>

      {rest.map((stat, index) => (
        <StatTile key={stat.key} stat={stat} index={index + 1} />
      ))}
    </div>
  );
}
