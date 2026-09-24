import type { ComponentPropsWithoutRef, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Bento surfaces for the executive dashboard. Three variants keep the whole
 * grid consistent: navy (hero), plain (white card) and sunken (soft inset).
 */
const SURFACE = {
  navy: "border-transparent bg-gradient-brand text-white",
  plain: "border-border bg-card",
  sunken: "border-border bg-sunken",
  success: "border-success/25 bg-success-soft",
  warning: "border-warning/25 bg-warning-soft",
  danger: "border-danger/25 bg-danger-soft",
} as const;

export type BentoSurface = keyof typeof SURFACE;

export function BentoCard({
  surface = "plain",
  padding = "md",
  className,
  children,
  ...rest
}: ComponentPropsWithoutRef<"section"> & {
  surface?: BentoSurface;
  padding?: "md" | "sm";
}) {
  return (
    <section
      {...rest}
      className={cn(
        "animate-rise relative min-w-0 overflow-hidden rounded-[24px] border shadow-bento transition-[transform,box-shadow] duration-300 ease-out hover:-translate-y-0.5 hover:shadow-bento-hover",
        padding === "sm" ? "p-4" : "p-5 sm:p-6",
        SURFACE[surface],
        className,
      )}
    >
      {children}
    </section>
  );
}

/** Card title block: icon chip, title, subtitle and optional trailing slot. */
export function BentoHeader({
  icon: Icon,
  title,
  subtitle,
  trailing,
  tone = "light",
}: {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  trailing?: ReactNode;
  tone?: "light" | "dark";
}) {
  const dark = tone === "dark";
  return (
    <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
      <div className="flex min-w-[150px] flex-1 items-start gap-3">
        {Icon && (
          <span
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              dark ? "bg-white/10 text-white" : "bg-brand-soft text-brand-dark",
            )}
          >
            <Icon size={18} strokeWidth={1.8} />
          </span>
        )}
        <div className="min-w-0">
          <h2
            className={cn(
              "text-[15px] font-semibold tracking-tight",
              dark ? "text-white" : "text-foreground",
            )}
          >
            {title}
          </h2>
          {subtitle && (
            <p
              className={cn(
                "mt-0.5 text-[12px] leading-snug",
                dark ? "text-white/60" : "text-muted-foreground",
              )}
            >
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {trailing}
    </header>
  );
}

/** Small variation pill used next to the headline figures. */
export function DeltaBadge({
  value,
  tone = "light",
}: {
  value: number;
  tone?: "light" | "dark";
}) {
  const flat = Math.abs(value) < 0.05;
  const Icon = flat ? Minus : value > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums",
        tone === "dark"
          ? "bg-white/10 text-white"
          : flat
            ? "bg-muted text-muted-foreground"
            : value > 0
              ? "bg-success-soft text-success"
              : "bg-danger-soft text-danger",
      )}
    >
      <Icon size={12} strokeWidth={2.4} />
      {value > 0 ? "+" : ""}
      {new Intl.NumberFormat("es-CL", {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      }).format(value)}
      %
    </span>
  );
}
