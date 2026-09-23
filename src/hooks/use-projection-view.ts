import { useMemo } from "react";
import { useCurrency } from "@/contexts/currency-context";
import { baseTreasuryService } from "@/services/baseTreasuryService";
import {
  PROJECTION_DEFAULTS,
  projectionFilters,
  snapshotProjection,
} from "@/financial-engine/projection";
import { formatMoney } from "@/financial-engine/format";
import type { Currency } from "@/financial-engine/types";
import { useAsyncData } from "./use-async";
import { useSavedFilters } from "./use-saved-filters";

export function useProjectionView(refresh = 0) {
  const state = useAsyncData(() => baseTreasuryService.load(), [refresh]);
  // Shared across Resumen and Flujo; old dashboard-v6 cutoff is deliberately ignored.
  const [saved, setFilters, reset] = useSavedFilters(
    "projection-v1",
    PROJECTION_DEFAULTS,
  );
  const filters = useMemo(() => projectionFilters(saved), [saved]);
  const model = useMemo(
    () => (state.data ? snapshotProjection(state.data, filters) : null),
    [state.data, filters],
  );
  const { currency: displayCurrency, money } = useCurrency();
  const formatAmount = (amount: number, compact = false) =>
    filters.currency === "BASE"
      ? new Intl.NumberFormat("es-CL", {
          maximumFractionDigits: 2,
          notation: compact ? "compact" : "standard",
        }).format(amount)
      : filters.currency === "CLP"
        ? money(amount, undefined, { compact })
        : formatMoney(amount, filters.currency as Currency, { compact });
  const amountDescription =
    filters.currency === "BASE"
      ? "Suma literal de REAL de todas las monedas, sin conversión. No representa un saldo en CLP."
      : filters.currency === "CLP"
        ? `Partidas CLP de BASE · visualización en ${displayCurrency}${displayCurrency === "CLP" ? "" : " con la tasa vigente al corte"}.`
        : `Solo partidas ${filters.currency} de BASE · importes originales, sin conversión.`;
  return {
    ...state,
    model,
    filters,
    setFilters,
    reset,
    formatAmount,
    amountDescription,
  };
}
