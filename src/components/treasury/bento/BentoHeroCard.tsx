import type { CSSProperties, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { BentoCard, BentoHeader, DeltaBadge } from "./BentoShell";

/**
 * Navy hero card: one headline figure, its variation and the chart that backs
 * it. The figure becomes a button when there is a calculation to open.
 */
export function BentoHeroCard({
  icon = TrendingUp,
  title,
  subtitle,
  trailing,
  valueLabel,
  valueText,
  valueHint = "Ver cálculo del día",
  delta,
  onOpenValue,
  footerLeft,
  footerRight,
  className,
  style,
  children,
}: {
  icon?: LucideIcon;
  title: string;
  subtitle: string;
  trailing?: ReactNode;
  valueLabel: string;
  valueText: string;
  valueHint?: string;
  delta?: number | null;
  onOpenValue?: () => void;
  footerLeft?: ReactNode;
  footerRight?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  const figure = (
    <>
      <span className="block text-[11px] font-medium uppercase tracking-[0.14em] text-white/60">
        {valueLabel}
      </span>
      <span className="mt-2 flex flex-wrap items-center gap-2.5">
        <span className="text-[clamp(1.6rem,2.6vw,2.15rem)] font-semibold leading-none tracking-tight tabular-nums">
          {valueText}
        </span>
        {typeof delta === "number" && <DeltaBadge value={delta} tone="dark" />}
      </span>
      {onOpenValue && (
        <span className="mt-2 flex items-center gap-1 text-[11px] font-medium text-white/60 transition-colors group-hover:text-white">
          {valueHint} <ChevronRight size={12} />
        </span>
      )}
    </>
  );

  return (
    <BentoCard
      surface="navy"
      className={cn("flex flex-col", className)}
      style={style}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute -right-20 -top-24 h-56 w-56 rounded-full bg-white/10 blur-3xl"
      />
      <BentoHeader
        tone="dark"
        icon={icon}
        title={title}
        subtitle={subtitle}
        trailing={trailing}
      />

      {onOpenValue ? (
        <button
          type="button"
          onClick={onOpenValue}
          className="group mt-6 min-w-0 rounded-xl text-left"
        >
          {figure}
        </button>
      ) : (
        <div className="mt-6 min-w-0">{figure}</div>
      )}

      <div className="mt-4 min-w-0">{children}</div>

      {(footerLeft || footerRight) && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-4">
          {footerLeft}
          {footerRight}
        </div>
      )}
    </BentoCard>
  );
}
