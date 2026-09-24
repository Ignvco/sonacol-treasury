import {
  Activity,
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
} from "lucide-react";
import { PeriodToggle } from "@/components/treasury/charts";
import { formatDateMedium } from "@/financial-engine/format";
import type { DailyProjection } from "@/financial-engine/calculations";
import { BentoFlowCard } from "./BentoFlowCard";
import { BentoHeroCard } from "./BentoHeroCard";
import { CashFlowChart } from "./CashFlowChart";

export type ChartMode = "daily" | "weekly" | "monthly";

const MODE_LABEL: Record<ChartMode, string> = {
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
};

/** Bento header of Flujo de caja: the liquidity series and the period split. */
export function CashFlowBento({
  cutoff,
  to,
  horizon,
  mode,
  onModeChange,
  available,
  projected,
  collections,
  payments,
  variation,
  projection,
  formatAmount,
  onOpenDay,
}: {
  cutoff: string;
  to: string;
  horizon: number;
  mode: ChartMode;
  onModeChange: (mode: ChartMode) => void;
  available: number;
  projected: number;
  collections: number;
  payments: number;
  variation: number;
  projection: DailyProjection[];
  formatAmount: (amount: number, compact?: boolean) => string;
  onOpenDay: (date: string) => void;
}) {
  const delta =
    available !== 0 ? ((projected - available) / Math.abs(available)) * 100 : null;
  const incomeShare =
    collections + payments > 0 ? collections / (collections + payments) : 0.5;

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
      <BentoHeroCard
        className="lg:col-span-2"
        icon={Activity}
        title="Proyección de liquidez"
        subtitle={`Serie ${MODE_LABEL[mode].toLowerCase()} · próximos ${horizon} días`}
        trailing={
          <PeriodToggle<ChartMode>
            value={mode}
            onChange={onModeChange}
            options={[
              { value: "daily", label: "Diario" },
              { value: "weekly", label: "Semanal" },
              { value: "monthly", label: "Mensual" },
            ]}
          />
        }
        valueLabel={`Caja prevista al ${formatDateMedium(to)}`}
        valueText={formatAmount(projected)}
        delta={delta}
        onOpenValue={() => onOpenDay(to)}
        footerLeft={
          <span className="text-[12px] text-white/70">
            Saldo inicial: {formatAmount(available)}
          </span>
        }
        footerRight={
          <span className="text-[11px] text-white/65">Corte {cutoff}</span>
        }
      >
        <CashFlowChart projection={projection} formatAmount={formatAmount} />
        <div className="mt-3 flex flex-wrap items-center gap-4 text-[11px] text-white/70">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#8FA3FF]" /> Ingresos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#FFA940]" /> Egresos
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#E8ECFF]" /> Saldo
          </span>
        </div>
      </BentoHeroCard>

      <BentoFlowCard
        className="lg:col-span-1"
        style={{ animationDelay: "80ms" }}
        icon={ArrowLeftRight}
        title="Entradas y salidas"
        subtitle={`Previstas en los próximos ${horizon} días`}
        netText={formatAmount(Math.abs(variation))}
        netPositive={variation >= 0}
        incomeShare={incomeShare}
        rows={[
          {
            key: "collections",
            tone: "success",
            icon: ArrowDownLeft,
            label: "Ingresos",
            amount: formatAmount(collections),
          },
          {
            key: "payments",
            tone: "danger",
            icon: ArrowUpRight,
            label: "Egresos",
            amount: formatAmount(payments),
          },
        ]}
        foot={{
          label: "Variación del horizonte",
          value: (variation > 0 ? "+" : "") + formatAmount(variation),
          hint: "Caja prevista al cierre menos el saldo inicial del corte.",
        }}
      />
    </div>
  );
}
