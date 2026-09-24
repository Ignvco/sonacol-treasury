import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { ChevronDown, Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

/**
 * One-line control row. The controls read as pills instead of stacked labels,
 * so the context of a screen costs a single line above the figures.
 */
export function Toolbar({
  children,
  className,
  label,
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("flex flex-wrap items-center gap-2", className)}
    >
      {children}
    </div>
  );
}

const PILL =
  "relative inline-flex h-9 min-w-0 items-center gap-2 rounded-xl border border-border bg-card pl-3 pr-7 text-[13px] font-medium text-foreground transition-colors hover:border-brand/40 focus-within:border-brand/50 focus-within:ring-2 focus-within:ring-brand/15";

/**
 * Pill select: the icon carries the meaning, the value is the visible label and
 * a real `<select>` sits on top, so the native picker and the accessible name
 * keep working.
 */
export function ToolbarSelect({
  label,
  icon: Icon,
  value,
  onChange,
  options,
  className,
}: {
  label: string;
  icon: LucideIcon;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  className?: string;
}) {
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <span className={cn(PILL, className)}>
      <Icon
        size={15}
        strokeWidth={1.9}
        className="shrink-0 text-muted-foreground"
      />
      <span className="truncate">{current}</span>
      <ChevronDown
        size={13}
        className="pointer-events-none absolute right-2.5 text-muted-foreground"
      />
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none rounded-xl bg-transparent text-transparent opacity-0"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </span>
  );
}

/** Static pill for context that cannot be chosen (period, cut-off, warning). */
export function ToolbarChip({
  icon: Icon,
  tone = "default",
  children,
  className,
}: {
  icon?: LucideIcon;
  tone?: "default" | "warning";
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-9 min-w-0 items-center gap-2 rounded-xl border px-3 text-[13px] font-medium",
        tone === "warning"
          ? "border-warning/30 bg-warning-soft text-warning"
          : "border-border bg-card text-foreground",
        className,
      )}
    >
      {Icon && <Icon size={15} strokeWidth={1.9} className="shrink-0" />}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Notes that used to be printed under the controls, kept one click away. */
export function InfoPopover({
  label,
  title,
  children,
  className,
}: {
  label: string;
  title?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label={label}
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border bg-card text-muted-foreground transition-colors hover:border-brand/40 hover:text-brand",
            className,
          )}
        >
          <Info size={15} strokeWidth={1.9} />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(92vw,21rem)] p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {title ?? label}
        </p>
        <div className="mt-1.5 text-[12px] leading-snug text-muted-foreground">
          {children}
        </div>
      </PopoverContent>
    </Popover>
  );
}
