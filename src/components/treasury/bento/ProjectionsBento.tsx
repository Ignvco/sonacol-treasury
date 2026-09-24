import { Scale, TrendingUp } from "lucide-react";
import { PeriodToggle } from "@/components/treasury/charts";
import { useCurrency } from "@/contexts/currency-context";
import { formatDateMedium } from "@/financial-engine/format";
import { BentoGaugeCard } from "./BentoGaugeCard";
import { BentoHeroCard } from "./BentoHeroCard";
import { ProjectionsCurveChart } from "./ProjectionsCurveChart";

export interface ProjectionsSummary {
  income: number;
  expense: number;
}

/**
 * Bento header of Proyecciones: the manual horizon, its cumulative net and how
 * far the projected income covers the projected expense.
 */
export function ProjectionsBento({
  cutoff,
  view,
  onViewChange,
  count,
  lastDate,
  summary,
  curve,
}: {
  cutoff: string;
  view: string;
  onViewChange: (view: string) => void;
  count: number;
  lastDate?: string;
  summary: ProjectionsSummary | null;
  curve: { date: string; net: number }[];
}) {
  const { money } = useCurrency();
  const income = summary?.income ?? 0,
    expense = summary?.expense ?? 0,
    coverage = expense > 0 ? income / expense : 0;

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
      <BentoHeroCard
        className={summary ? "lg:col-span-2" : "lg:col-span-3"}
        icon={TrendingUp}
        title="Horizonte de proyecciones"
        subtitle={`Partidas MANUAL del corte ${formatDateMedium(cutoff)}`}
        trailing={
          <PeriodToggle<string>
            value={view}
            onChange={onViewChange}
            options={[
              { value: "table", label: "Tabla" },
              { value: "calendar", label: "Agenda" },
            ]}
          />
        }
        valueLabel="Neto proyectado del horizonte"
        valueText={summary ? money(income - expense) : "Falta tasa de cambio"}
        footerLeft={
          <span className="text-[12px] text-white/70">
            {count} {count === 1 ? "partida activa" : "partidas activas"}
          </span>
        }
        footerRight={
          <span className="text-[11px] text-white/65">
            {lastDate
              ? `Última partida: ${formatDateMedium(lastDate)}`
              : "Sin fechas registradas"}
          </span>
        }
      >
        {summary && curve.length > 1 ? (
          <ProjectionsCurveChart
            data={curve}
            formatAmount={(amount, compact) =>
              money(amount, undefined, { compact })
            }
          />
        ) : (
          <p className="rounded-2xl border border-white/15 bg-white/5 px-4 py-6 text-[12px] leading-snug text-white/70">
            {summary
              ? "Registra partidas en al menos dos fechas para dibujar el acumulado del horizonte."
              : "Falta la tasa de cambio para convertir las partidas y dibujar el acumulado."}
          </p>
        )}
      </BentoHeroCard>

      {summary && (
        <BentoGaugeCard
          icon={Scale}
          title="Cobertura de egresos"
          subtitle="Ingresos manuales sobre egresos del horizonte"
          ratio={Math.min(coverage, 1)}
          style={{ animationDelay: "80ms" }}
          trailing={
            <span className="rounded-full bg-card px-2.5 py-1 text-[10px] font-semibold tabular-nums text-brand-dark shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
              {expense > 0
                ? `${Math.round(coverage * 100)}% cubierto`
                : "Sin egresos"}
            </span>
          }
        >
          <div className="mx-auto -mt-1 block px-2 text-center">
            <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-brand-dark/55">
              Cobertura
            </span>
            <span className="mt-1 block text-[clamp(1.25rem,2vw,1.6rem)] font-semibold leading-none tracking-tight tabular-nums text-brand-dark">
              {expense > 0
                ? new Intl.NumberFormat("es-CL", {
                    maximumFractionDigits: 1,
                  }).format(coverage) + "x"
                : "—"}
            </span>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-brand/10 pt-3">
            <div className="px-2 py-1">
              <span className="block text-[10px] uppercase tracking-wide text-brand-dark/50">
                Ingresos
              </span>
              <span className="block text-[13px] font-semibold tabular-nums text-brand-dark">
                {money(income)}
              </span>
            </div>
            <div className="px-2 py-1">
              <span className="block text-[10px] uppercase tracking-wide text-brand-dark/50">
                Egresos
              </span>
              <span className="block text-[13px] font-semibold tabular-nums text-brand-dark">
                {money(expense)}
              </span>
            </div>
          </div>
        </BentoGaugeCard>
      )}
    </div>
  );
}
