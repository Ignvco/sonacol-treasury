export function DecisionControls({
  currency,
  horizon,
  onCurrency,
  onHorizon,
}: {
  currency: string;
  horizon: number;
  onCurrency: (v: string) => void;
  onHorizon: (v: number) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <label className="grid gap-1 text-xs text-muted-foreground">
        Moneda de cálculo
        <select
          className="t-input"
          value={currency}
          onChange={(e) => onCurrency(e.target.value)}
        >
          {["CLP", "USD", "UF", "UTM"].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-xs text-muted-foreground">
        Horizonte
        <select
          className="t-input"
          value={horizon}
          onChange={(e) => onHorizon(Number(e.target.value))}
        >
          {[7, 30, 60, 90, 180, 365].map((d) => (
            <option key={d} value={d}>
              {d} días
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
