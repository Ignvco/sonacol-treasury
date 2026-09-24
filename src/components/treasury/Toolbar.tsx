import type { ReactNode } from "react";
import { useState } from "react";
import type { LucideIcon } from "lucide-react";
import { CalendarDays, ChevronDown, Info } from "lucide-react";
import { es } from "date-fns/locale";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { formatDateMedium } from "@/financial-engine/format";
import { cn } from "@/lib/utils";

/** Local-time ISO helpers: the calendar works with dates, the engine with days. */
const parseIso = (iso: string) => new Date(`${iso}T12:00:00`);
const toIso = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
    date.getDate(),
  ).padStart(2, "0")}`;

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

/**
 * Pill that opens a real calendar: picking a day is the exact way to choose how
 * far the projection runs, instead of counting days.
 */
export function ToolbarDate({
  label,
  value,
  min,
  max,
  onSelect,
  hint,
  className,
}: {
  label: string;
  value: string;
  min: string;
  max: string;
  onSelect: (iso: string) => void;
  hint?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = parseIso(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button aria-label={label} className={cn(PILL, className)}>
          <CalendarDays
            size={15}
            strokeWidth={1.9}
            className="shrink-0 text-muted-foreground"
          />
          <span className="truncate">Hasta {formatDateMedium(value)}</span>
          <ChevronDown
            size={13}
            className="pointer-events-none absolute right-2.5 text-muted-foreground"
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        data-testid="toolbar-date-menu"
        className="w-auto p-1"
      >
        <Calendar
          mode="single"
          locale={es}
          selected={selected}
          defaultMonth={selected}
          disabled={{ before: parseIso(min), after: parseIso(max) }}
          onSelect={(date) => {
            if (!date) return;
            onSelect(toIso(date));
            setOpen(false);
          }}
        />
        {hint && (
          <p className="max-w-[17rem] px-3 pb-2 pt-1 text-[11px] leading-snug text-muted-foreground">
            {hint}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Static pill for context that cannot be chosen (period, cut-off, warning). */export function ToolbarChip({
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
