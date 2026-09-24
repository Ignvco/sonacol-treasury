import { CalendarRange, Coins } from "lucide-react";
import { Toolbar, ToolbarSelect } from "./Toolbar";

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
    <Toolbar label="Contexto de cálculo">
      <ToolbarSelect
        label="Moneda de cálculo"
        icon={Coins}
        value={currency}
        onChange={onCurrency}
        options={["CLP", "USD", "UF", "UTM"].map((c) => ({
          value: c,
          label: c,
        }))}
      />
      <ToolbarSelect
        label="Horizonte"
        icon={CalendarRange}
        value={String(horizon)}
        onChange={(v) => onHorizon(Number(v))}
        options={[7, 30, 60, 90, 180, 365].map((d) => ({
          value: String(d),
          label: `${d} días`,
        }))}
      />
    </Toolbar>
  );
}
