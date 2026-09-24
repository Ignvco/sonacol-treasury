import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import { CalendarRange, Coins, Landmark, RotateCcw } from "lucide-react";
import {
  PROJECTION_CURRENCIES,
  PROJECTION_DEFAULTS,
  PROJECTION_HORIZON_MAX,
  PROJECTION_HORIZONS,
  type ProjectionFilters,
} from "@/financial-engine/projection";
import { nextDate } from "@/financial-engine/base-treasury";
import { daysUntil, formatDateMedium } from "@/financial-engine/format";
import type { BaseBundle } from "@/services/baseTreasuryService";
import { InfoPopover, Toolbar, ToolbarDate, ToolbarSelect } from "./Toolbar";

export function ProjectionControls({
  data,
  filters,
  setFilters,
  reset,
  from,
  to,
  amountDescription,
}: {
  data: BaseBundle;
  filters: ProjectionFilters;
  setFilters: Dispatch<SetStateAction<ProjectionFilters>>;
  reset: () => void;
  from: string;
  to: string;
  amountDescription: string;
}) {
  const banks = [
    ...new Set([
      ...data.rows.map((r) => r.bank),
      ...(filters.bank ? [filters.bank] : []),
    ]),
  ].sort();
  const changed =
    filters.horizon !== PROJECTION_DEFAULTS.horizon ||
    filters.currency !== PROJECTION_DEFAULTS.currency ||
    filters.bank !== PROJECTION_DEFAULTS.bank;
  // A picked date is a horizon like any other: it just is not one of the presets.
  const horizons = useMemo(() => {
    const presets = PROJECTION_HORIZONS.map((n) => ({
      value: String(n),
      label: `${n} días`,
    }));
    return (PROJECTION_HORIZONS as readonly number[]).includes(filters.horizon)
      ? presets
      : [...presets, { value: String(filters.horizon), label: `${filters.horizon} días` }];
  }, [filters.horizon]);

  return (
    <section aria-label="Contexto de proyección">
      <Toolbar label="Contexto de proyección">
        <ToolbarSelect
          label="Horizonte"
          icon={CalendarRange}
          value={String(filters.horizon)}
          onChange={(v) => setFilters((f) => ({ ...f, horizon: Number(v) }))}
          options={horizons}
        />
        <ToolbarDate
          label="Fecha de proyección"
          value={to}
          min={from}
          max={nextDate(data.cutoff, PROJECTION_HORIZON_MAX)}
          onSelect={(iso) =>
            setFilters((f) => ({ ...f, horizon: daysUntil(iso, data.cutoff) }))
          }
          hint={`Proyección diaria desde el corte hasta el día elegido. El motor llega hasta ${PROJECTION_HORIZON_MAX} días después del corte.`}
        />
        <ToolbarSelect
          label="Valores"
          icon={Coins}
          value={filters.currency}
          onChange={(v) => setFilters((f) => ({ ...f, currency: v }))}
          options={PROJECTION_CURRENCIES.map((c) => ({
            value: c,
            label:
              c === "BASE"
                ? "Literal de BASE · todas las monedas"
                : `Partidas ${c}`,
          }))}
        />
        <ToolbarSelect
          label="Banco"
          icon={Landmark}
          value={filters.bank}
          onChange={(v) => setFilters((f) => ({ ...f, bank: v }))}
          options={[
            { value: "", label: "Todos los bancos" },
            ...banks.map((b) => ({ value: b, label: b })),
          ]}
        />
        {changed && (
          <button
            className="inline-flex h-9 items-center gap-2 rounded-xl border border-border bg-card px-3 text-[13px] font-medium text-foreground transition-colors hover:border-brand/40 hover:text-brand"
            onClick={reset}
          >
            <RotateCcw size={14} strokeWidth={2} />
            Restablecer
          </button>
        )}
        <p
          data-testid="projection-period"
          className="ml-auto text-[11.5px] leading-snug text-muted-foreground"
        >
          BASE al{" "}
          <strong className="font-semibold text-foreground/75">
            {formatDateMedium(data.cutoff)}
          </strong>{" "}
          · Proyección del{" "}
          <strong className="font-semibold text-foreground/75">
            {formatDateMedium(from)}
          </strong>{" "}
          al{" "}
          <strong className="font-semibold text-foreground/75">
            {formatDateMedium(to)}
          </strong>
        </p>
        <InfoPopover
          label="Cómo se calculan las cifras"
          className="order-first sm:order-none"
        >
          <p>
            {amountDescription} Los filtros se comparten entre Resumen y Flujo
            de caja.
          </p>
        </InfoPopover>
      </Toolbar>
    </section>
  );
}
