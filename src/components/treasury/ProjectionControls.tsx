import type { Dispatch, SetStateAction } from "react";
import {
  PROJECTION_CURRENCIES,
  PROJECTION_HORIZONS,
  type ProjectionFilters,
} from "@/financial-engine/projection";
import type { BaseBundle } from "@/services/baseTreasuryService";
import { formatDateMedium } from "@/financial-engine/format";

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
  return (
    <section
      aria-label="Contexto de proyección"
      className="space-y-3 rounded-2xl border bg-white p-4"
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid gap-1 text-xs font-medium">
          Horizonte
          <select
            className="t-input"
            value={filters.horizon}
            onChange={(e) =>
              setFilters((f) => ({ ...f, horizon: Number(e.target.value) }))
            }
          >
            {PROJECTION_HORIZONS.map((n) => (
              <option key={n} value={n}>
                {n} días
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-medium">
          Valores
          <select
            className="t-input max-w-full"
            value={filters.currency}
            onChange={(e) =>
              setFilters((f) => ({ ...f, currency: e.target.value }))
            }
          >
            {PROJECTION_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {c === "BASE"
                  ? "Literal de BASE · todas las monedas"
                  : `Partidas ${c}`}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs font-medium">
          Banco
          <select
            className="t-input max-w-full"
            value={filters.bank}
            onChange={(e) =>
              setFilters((f) => ({ ...f, bank: e.target.value }))
            }
          >
            <option value="">Todos los bancos</option>
            {banks.map((b) => (
              <option key={b} value={b}>
                {b}
              </option>
            ))}
          </select>
        </label>
        <button className="t-button-secondary" onClick={reset}>
          Restablecer
        </button>
      </div>
      <p className="text-sm" data-testid="projection-period">
        BASE al <strong>{formatDateMedium(data.cutoff)}</strong> · Proyección
        del {formatDateMedium(from)} al <strong>{formatDateMedium(to)}</strong>
      </p>
      <p className="text-xs text-muted-foreground">
        {amountDescription} Los filtros se comparten entre Resumen y Flujo de
        caja.
      </p>
    </section>
  );
}
