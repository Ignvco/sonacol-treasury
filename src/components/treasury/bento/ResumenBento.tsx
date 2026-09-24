import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, TrendingUp } from "lucide-react";
import { formatDateMedium } from "@/financial-engine/format";
import { BentoFlowCard } from "./BentoFlowCard";
import { BentoHeroCard } from "./BentoHeroCard";
import { ResumenCashChart } from "./ResumenCashChart";
import { ResumenLiquidityCard } from "./ResumenLiquidityCard";
import {
  ResumenMilestonesCard,
  type MilestoneItem,
} from "./ResumenMilestonesCard";

export interface ResumenBentoProps {
  cutoff: string;
  to: string;
  horizon: number;
  currencyLabel: string;
  available: number;
  projected: number;
  invested: number;
  minimum: number;
  collections: number;
  payments: number;
  daily: { date: string; final: number }[];
  days: { date: string; income: number; expense: number; balance: number }[];
  formatAmount: (amount: number, compact?: boolean) => string;
  onOpenCash: () => void;
  onOpenInvested: () => void;
  onOpenCollections: () => void;
  onOpenPayments: () => void;
  onOpenDay: (date: string) => void;
}

type RawMilestone = Omit<MilestoneItem, "date"> & { raw: string };

/**
 * Bento grid of the executive summary. Every figure keeps its drill-down: the
 * cards only rearrange what the projection model already knows.
 */
export function ResumenBento({
  cutoff,
  to,
  horizon,
  currencyLabel,
  available,
  projected,
  invested,
  minimum,
  collections,
  payments,
  daily,
  days,
  formatAmount,
  onOpenCash,
  onOpenInvested,
  onOpenCollections,
  onOpenPayments,
  onOpenDay,
}: ResumenBentoProps) {
  const minimumDay = days.find((day) => day.balance === minimum)?.date ?? to;
  const heaviest = days.reduce<{ date: string; expense: number } | null>(
    (worst, day) =>
      day.expense > 0 && (!worst || day.expense > worst.expense)
        ? { date: day.date, expense: day.expense }
        : worst,
    null,
  );
  const delta =
    available !== 0 ? ((projected - available) / Math.abs(available)) * 100 : null;
  const position = available + invested;
  const liquidity = position > 0 ? available / position : 0;
  const deficitDays = days.filter((day) => day.balance < 0).length;
  const net = collections - payments;
  const balances = daily.map((day) => day.final);
  const incomeShare =
    collections + payments > 0 ? collections / (collections + payments) : 0.5;

  const middle: RawMilestone[] = [
    ...(heaviest && heaviest.date !== minimumDay
      ? [
          {
            key: "heaviest",
            raw: heaviest.date,
            title: "Mayor egreso",
            description: "pago más alto del horizonte",
            amountText: "-" + formatAmount(heaviest.expense),
            tone: "danger" as const,
            onClick: () => onOpenDay(heaviest.date),
          },
        ]
      : []),
    {
      key: "minimum",
      raw: minimumDay,
      title: "Mínimo proyectado",
      description: "punto más bajo del horizonte",
      amountText: formatAmount(minimum),
      onClick: () => onOpenDay(minimumDay),
    },
  ].sort((a, b) => a.raw.localeCompare(b.raw));

  const milestones: MilestoneItem[] = [
    {
      key: "cutoff",
      raw: cutoff,
      title: "Al corte",
      description: "saldo real disponible",
      amountText: formatAmount(available),
      onClick: onOpenCash,
    },
    ...middle,
    {
      key: "closing",
      raw: to,
      title: "Cierre proyectado",
      description: "saldo al final del horizonte",
      amountText: formatAmount(projected),
      onClick: () => onOpenDay(to),
    },
  ].map(({ raw, ...item }) => ({ ...item, date: formatDateMedium(raw) }));

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
      <BentoHeroCard
        className="lg:col-span-2"
        icon={TrendingUp}
        title="Caja prevista"
        subtitle={`Cierre al ${to} · próximos ${horizon} días`}
        trailing={
          <span className="rounded-full border border-white/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
            {currencyLabel}
          </span>
        }
        valueLabel={`Caja prevista al ${to}`}
        valueText={formatAmount(projected)}
        delta={delta}
        onOpenValue={() => onOpenDay(to)}
        footerLeft={
          <button
            type="button"
            onClick={() => onOpenDay(minimumDay)}
            className="rounded-lg text-[12px] font-medium text-white/70 underline decoration-white/30 underline-offset-4 transition-colors hover:text-white"
          >
            Mínimo del horizonte: {formatAmount(minimum)}
          </button>
        }
        footerRight={
          <span className="text-[11px] text-white/65">
            Saldo al cierre de cada día · corte {cutoff}
          </span>
        }
      >
        <ResumenCashChart daily={daily} formatAmount={formatAmount} />
      </BentoHeroCard>

      <BentoFlowCard
        className="lg:col-span-1"
        style={{ animationDelay: "80ms" }}
        icon={ArrowLeftRight}
        title="Flujo del horizonte"
        subtitle="Ingresos y egresos previstos"
        netText={formatAmount(Math.abs(net))}
        netPositive={net >= 0}
        incomeShare={incomeShare}
        rows={[
          {
            key: "collections",
            tone: "success",
            icon: ArrowDownLeft,
            label: "Ingresos esperados",
            amount: formatAmount(collections),
            onClick: onOpenCollections,
          },
          {
            key: "payments",
            tone: "danger",
            icon: ArrowUpRight,
            label: "Egresos previstos",
            amount: formatAmount(payments),
            onClick: onOpenPayments,
          },
        ]}
        foot={
          payments > 0
            ? {
                label: "Cobertura de egresos",
                value:
                  new Intl.NumberFormat("es-CL", {
                    maximumFractionDigits: 1,
                  }).format(available / payments) + "x",
                hint: "Veces que la caja disponible de hoy cubre los egresos del horizonte.",
              }
            : undefined
        }
      />

      <ResumenLiquidityCard
        cutoff={cutoff}
        availableText={formatAmount(available)}
        investedText={formatAmount(invested)}
        minimumText={formatAmount(minimum)}
        liquidity={liquidity}
        onOpenCash={onOpenCash}
        onOpenInvested={onOpenInvested}
        onOpenMinimumDay={() => onOpenDay(minimumDay)}
      />

      <ResumenMilestonesCard
        className="lg:col-span-2"
        items={milestones}
        horizon={horizon}
        deficitDays={deficitDays}
        balances={balances}
        minimumText={formatAmount(
          balances.length ? Math.min(...balances) : 0,
          true,
        )}
        maximumText={formatAmount(
          balances.length ? Math.max(...balances) : 0,
          true,
        )}
      />
    </div>
  );
}
