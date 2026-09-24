import { CalendarRange, Coins } from "lucide-react";
import { nextDate } from "@/financial-engine/base-treasury";
import {
  PROJECTION_HORIZON_MAX,
  horizonOptions,
} from "@/financial-engine/projection";
import { daysUntil } from "@/financial-engine/format";
import { DECISION_HORIZONS } from "@/hooks/use-decision-filters";
import { Toolbar, ToolbarDate, ToolbarSelect } from "./Toolbar";

export function DecisionControls({
  cutoff,
  currency,
  horizon,
  onCurrency,
  onHorizon,
}: {
  /** Accounting cutoff: the projection starts the next day and runs from here. */
  cutoff: string;
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
        options={horizonOptions(horizon, DECISION_HORIZONS)}
      />
      <ToolbarDate
        label="Fecha de proyección"
        value={nextDate(cutoff, horizon)}
        min={nextDate(cutoff, 1)}
        max={nextDate(cutoff, PROJECTION_HORIZON_MAX)}
        onSelect={(iso) => onHorizon(daysUntil(iso, cutoff))}
        hint={`Proyección diaria desde el corte hasta el día elegido. El motor llega hasta ${PROJECTION_HORIZON_MAX} días después del corte.`}
      />
    </Toolbar>
  );
}
