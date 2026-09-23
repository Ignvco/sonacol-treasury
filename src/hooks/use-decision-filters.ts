import { useSavedFilters } from "./use-saved-filters";
export function useDecisionFilters() {
  const [saved, setSaved] = useSavedFilters("decision-context", {
    currency: "CLP",
    horizon: 30,
  });
  const currency = ["CLP", "USD", "UF", "UTM"].includes(saved.currency)
      ? saved.currency
      : "CLP",
    horizon = [7, 30, 60, 90, 180, 365].includes(saved.horizon)
      ? saved.horizon
      : 30;
  return {
    currency,
    horizon,
    setCurrency: (currency: string) => setSaved((s) => ({ ...s, currency })),
    setHorizon: (horizon: number) => setSaved((s) => ({ ...s, horizon })),
  };
}
