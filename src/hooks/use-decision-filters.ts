import { projectionHorizon } from "@/financial-engine/projection";
import { useSavedFilters } from "./use-saved-filters";

/** Presets offered in the decision screens; the date picker sets any other day. */
export const DECISION_HORIZONS = [7, 30, 60, 90, 180, 365];

export function useDecisionFilters() {
  const [saved, setSaved] = useSavedFilters("decision-context", {
    currency: "CLP",
    horizon: 30,
  });
  const currency = ["CLP", "USD", "UF", "UTM"].includes(saved.currency)
      ? saved.currency
      : "CLP",
    horizon = projectionHorizon(saved.horizon);
  return {
    currency,
    horizon,
    setCurrency: (currency: string) => setSaved((s) => ({ ...s, currency })),
    setHorizon: (horizon: number) => setSaved((s) => ({ ...s, horizon })),
  };
}
