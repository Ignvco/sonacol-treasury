import { HandCoins, History } from "lucide-react";
import { useCurrency } from "@/contexts/currency-context";
import { formatDateMedium } from "@/financial-engine/format";
import { BentoGaugeCard } from "./BentoGaugeCard";
import { BentoHeroCard } from "./BentoHeroCard";
import { ReceivablesAgingChart } from "./ReceivablesAgingChart";

/** Bento header of Cobranzas: open portfolio, its age and what is overdue. */
export function ReceivablesBento({
  today,
  openCount,
  total,
  overdue,
  upcoming,
  dueSoon,
  aging,
}: {
  today: string;
  openCount: number;
  total: number;
  overdue: number;
  upcoming: number;
  dueSoon: number;
  aging: { bucket: string; amount: number }[];
}) {
  const { money } = useCurrency();
  const overdueShare = total > 0 ? overdue / total : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
      <BentoHeroCard
        className="lg:col-span-2"
        icon={HandCoins}
        title="Cartera por cobrar"
        subtitle={`Documentos abiertos al ${formatDateMedium(today)}`}
        trailing={
          <span className="whitespace-nowrap rounded-full border border-white/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
            {openCount} documentos
          </span>
        }
        valueLabel="Total por cobrar"
        valueText={money(total)}
        footerLeft={
          <span className="text-[12px] text-white/70">
            Vencido: {money(overdue)}
          </span>
        }
        footerRight={
          <span className="text-[11px] text-white/65">
            Antigüedad de los saldos vencidos
          </span>
        }
      >
        <ReceivablesAgingChart
          data={aging.map((a) => ({ name: a.bucket, amount: a.amount }))}
        />
      </BentoHeroCard>

      <BentoGaugeCard
        icon={History}
        title="Cartera vencida"
        subtitle="Antigüedad de los saldos"
        ratio={overdueShare}
        style={{ animationDelay: "80ms" }}
        trailing={
          <span className="rounded-full bg-card px-2.5 py-1 text-[10px] font-semibold tabular-nums text-brand-dark shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
            {Math.round(overdueShare * 100)}% del total
          </span>
        }
      >
        <div className="mx-auto -mt-1 block px-2 text-center">
          <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-brand-dark/55">
            Vencido
          </span>
          <span className="mt-1 block text-[clamp(1.25rem,2vw,1.6rem)] font-semibold leading-none tracking-tight tabular-nums text-brand-dark">
            {money(overdue)}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-brand/10 pt-3">
          <div className="px-2 py-1">
            <span className="block text-[10px] uppercase tracking-wide text-brand-dark/50">
              Por vencer
            </span>
            <span className="block text-[13px] font-semibold tabular-nums text-brand-dark">
              {money(upcoming)}
            </span>
          </div>
          <div className="px-2 py-1">
            <span className="block text-[10px] uppercase tracking-wide text-brand-dark/50">
              Vence esta semana
            </span>
            <span className="block text-[13px] font-semibold tabular-nums text-brand-dark">
              {money(dueSoon)}
            </span>
          </div>
        </div>
      </BentoGaugeCard>
    </div>
  );
}
