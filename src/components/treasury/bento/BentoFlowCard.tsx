import type { CSSProperties } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { BentoCard, BentoHeader } from "./BentoShell";

export interface BentoFlowRow {
  key: string;
  tone: "success" | "danger";
  icon: LucideIcon;
  label: string;
  amount: string;
  /** Optional drill-down: rows without it render as plain figures. */
  onClick?: () => void;
}

export interface BentoFlowFoot {
  label: string;
  value: string;
  hint?: string;
}

function FlowRow({ row }: { row: BentoFlowRow }) {
  const success = row.tone === "success";
  const Icon = row.icon;
  const shell = cn(
    "flex items-center gap-3 rounded-2xl px-3.5 py-3 text-left",
    success ? "bg-success-soft" : "bg-danger-soft",
  );
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-card shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
        <Icon
          size={16}
          strokeWidth={2}
          className={success ? "text-success" : "text-danger"}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {row.label}
        </span>
        <span
          className={cn(
            "block text-[15px] font-semibold tabular-nums",
            success ? "text-success" : "text-danger",
          )}
        >
          {row.amount}
        </span>
      </span>
      {row.onClick && (
        <ChevronRight
          size={15}
          className="shrink-0 text-muted-foreground/70 transition-transform group-hover:translate-x-0.5"
        />
      )}
    </>
  );

  if (!row.onClick) return <div className={shell}>{body}</div>;
  return (
    <button
      type="button"
      onClick={row.onClick}
      className={cn(
        shell,
        "group transition-colors",
        success ? "hover:bg-success-soft/70" : "hover:bg-danger-soft/70",
      )}
    >
      {body}
    </button>
  );
}

/** Money in and out of the period, its split, the net result and one extra read. */
export function BentoFlowCard({
  icon,
  title,
  subtitle,
  netLabel = "Neto",
  netText,
  netPositive,
  incomeShare,
  rows,
  foot,
  className,
  style,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  netLabel?: string;
  netText: string;
  netPositive: boolean;
  incomeShare: number;
  rows: BentoFlowRow[];
  foot?: BentoFlowFoot;
  className?: string;
  style?: CSSProperties;
}) {
  const share = Math.min(Math.max(incomeShare, 0), 1);

  return (
    <BentoCard
      className={cn("flex flex-col justify-between gap-5", className)}
      style={style}
    >
      <div>
        <BentoHeader
          icon={icon}
          title={title}
          subtitle={subtitle}
          trailing={
            <span
              className={cn(
                "whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold tabular-nums",
                netPositive
                  ? "bg-success-soft text-success"
                  : "bg-danger-soft text-danger",
              )}
            >
              {netLabel} {netText}
            </span>
          }
        />

        <div
          className="mt-5 flex h-1.5 overflow-hidden rounded-full bg-muted"
          aria-hidden="true"
        >
          <span className="h-full bg-success-vivid" style={{ width: `${share * 100}%` }} />
          <span className="h-full flex-1 bg-danger-vivid/70" />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] tabular-nums text-muted-foreground">
          <span>Ingresos {Math.round(share * 100)}%</span>
          <span>Egresos {100 - Math.round(share * 100)}%</span>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        {rows.map((row) => (
          <FlowRow key={row.key} row={row} />
        ))}
      </div>

      {foot && (
        <div className="rounded-2xl border border-border bg-muted/50 p-3.5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {foot.label}
            </span>
            <span className="text-[16px] font-semibold tabular-nums text-foreground">
              {foot.value}
            </span>
          </div>
          {foot.hint && (
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {foot.hint}
            </p>
          )}
        </div>
      )}
    </BentoCard>
  );
}
