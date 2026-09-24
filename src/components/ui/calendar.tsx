import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

import { cn } from "@/lib/utils";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

/**
 * Calendar themed with the design tokens. react-day-picker ships the layout
 * stylesheet; size and colour come from our variables, and the states that the
 * library draws with borders are repainted as solid brand pills.
 */
function Calendar({
  className,
  classNames,
  showOutsideDays = false,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "p-3",
        "[--rdp-accent-color:hsl(var(--brand))]",
        "[--rdp-accent-background-color:hsl(var(--brand-soft))]",
        "[--rdp-today-color:hsl(var(--brand-dark))]",
        "[--rdp-day-height:36px] [--rdp-day-width:36px]",
        "[--rdp-day_button-height:34px] [--rdp-day_button-width:34px]",
        "[--rdp-day_button-border-radius:10px]",
        "[--rdp-day_button-border:none]",
        "[--rdp-selected-border:none]",
        "[--rdp-nav-height:2.25rem]",
        "[--rdp-nav_button-height:2rem] [--rdp-nav_button-width:2rem]",
        "[--rdp-months-gap:0]",
        "[--rdp-weekday-padding:0.25rem_0]",
        "[--rdp-weekday-opacity:1]",
        className,
      )}
      classNames={{
        month: "relative",
        months: "flex flex-col",
        month_caption: "flex h-9 items-center justify-center",
        caption_label: "text-[13px] font-semibold text-foreground",
        nav: "absolute inset-x-0 top-0 z-10 flex h-9 items-center justify-between",
        button_previous:
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
        button_next:
          "inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40",
        chevron: "h-4 w-4",
        month_grid: "w-full border-collapse",
        weekdays: "flex",
        weekday:
          "w-9 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        weeks: "flex flex-col gap-0.5",
        week: "flex w-full",
        day_button:
          "h-[34px] w-[34px] rounded-[10px] text-[13px] font-normal text-foreground transition-colors hover:bg-muted",
        selected:
          "!text-[13px] !font-semibold [&>button]:!bg-brand [&>button]:!font-semibold [&>button]:!text-primary-foreground",
        outside: "[&>button]:!text-muted-foreground/50",
        disabled: "[&>button]:!text-muted-foreground/40",
        hidden: "invisible",
        ...classNames,
      }}
      components={{
        Chevron: ({ className: iconClassName, orientation, ...rest }) =>
          orientation === "left" ? (
            <ChevronLeft className={cn("h-4 w-4", iconClassName)} {...rest} />
          ) : (
            <ChevronRight className={cn("h-4 w-4", iconClassName)} {...rest} />
          ),
      }}
      {...props}
    />
  );
}
Calendar.displayName = "Calendar";

export { Calendar };
