import { CheckCircle2, Scale } from "lucide-react";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import { formatDateMedium } from "@/financial-engine/format";
import { total } from "@/financial-engine/base-treasury";
import { BentoGaugeCard } from "./BentoGaugeCard";
import { BentoHeroCard } from "./BentoHeroCard";

const PENDING_BARS = [
  { key: "base", label: "Pendiente en BASE", color: "#B9C6FF" },
  { key: "bank", label: "Pendiente en cartola", color: "#8FA3FF" },
] as const;

/**
 * Bento header of Conciliación: the balance gap against the statement, what is
 * still unmatched on each side and how much of the cartola is already crossed.
 */
export function ReconciliationBento({
  bankName,
  accountNumber,
  currency,
  cutoff,
  accountingBalance,
  statement,
  pendingBase,
  pendingBank,
  matchedBank,
  matchedShare,
  movementCount,
  suggestionCount,
  onOpenBalance,
}: {
  bankName: string;
  accountNumber: string;
  currency: string;
  cutoff: string;
  accountingBalance: number;
  statement?: { end_date: string; closing: number | null };
  pendingBase: number;
  pendingBank: number;
  matchedBank: number;
  matchedShare: number;
  movementCount: number;
  suggestionCount: number;
  onOpenBalance: () => void;
}) {
  const amount = (value: number) => `${baseNumber(value)} ${currency}`;
  const closing = statement?.closing != null ? Number(statement.closing) : null;
  const gap = closing != null ? total([accountingBalance, -closing]) : null;
  const comparable = gap != null && statement?.end_date === cutoff;
  const scale = Math.max(pendingBase, pendingBank, 1);
  const pending = { base: pendingBase, bank: pendingBank };
  const nothingPending = pendingBase <= 0 && pendingBank <= 0;
  const statementText =
    closing != null && statement
      ? `Cartola: ${amount(closing)} al ${formatDateMedium(statement.end_date)}`
      : "La cartola no informa saldo de cierre";

  return (
    <div className="grid gap-4 lg:grid-cols-3 lg:gap-5">
      <BentoHeroCard
        className="lg:col-span-2"
        icon={Scale}
        title="Conciliación bancaria"
        subtitle={`${bankName} · ${accountNumber || "Sin código"}`}
        trailing={
          <span className="whitespace-nowrap rounded-full border border-white/20 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/70">
            {statement
              ? `Cartola al ${formatDateMedium(statement.end_date)}`
              : "Sin cartola importada"}
          </span>
        }
        valueLabel={
          comparable
            ? `Diferencia de saldos al ${cutoff}`
            : `Saldo BASE al ${cutoff}`
        }
        valueText={comparable ? amount(gap) : amount(accountingBalance)}
        onOpenValue={onOpenBalance}
        footerLeft={
          <span className="text-[12px] text-white/70">
            Saldo BASE: {amount(accountingBalance)}
          </span>
        }
        footerRight={
          <span className="text-[11px] text-white/65">{statementText}</span>
        }
      >
        <div className="grid gap-3">
          <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-white/60">
            Pendiente por conciliar
          </span>
          {nothingPending ? (
            <p className="rounded-2xl border border-white/15 bg-white/5 px-4 py-5 text-[12px] leading-snug text-white/70">
              No quedan partidas pendientes: BASE y cartola están cruzadas.
            </p>
          ) : (
            PENDING_BARS.map((bar) => (
              <div key={bar.key} className="grid gap-1.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                  <span className="text-[12px] text-white/70">{bar.label}</span>
                  <span className="text-[13px] font-semibold tabular-nums text-white">
                    {amount(pending[bar.key])}
                  </span>
                </div>
                <span
                  aria-hidden="true"
                  className="block h-2 overflow-hidden rounded-full bg-white/12"
                >
                  <span
                    className="block h-full rounded-full transition-[width] duration-500 ease-out"
                    style={{
                      width: `${(pending[bar.key] / scale) * 100}%`,
                      backgroundColor: bar.color,
                    }}
                  />
                </span>
              </div>
            ))
          )}
          {gap != null && !comparable && (
            <p className="text-[11px] leading-snug text-white/60">
              Cortes distintos; la diferencia de saldos no es comparable.
            </p>
          )}
        </div>
      </BentoHeroCard>

      <BentoGaugeCard
        icon={CheckCircle2}
        title="Avance de la cartola"
        subtitle={
          movementCount
            ? "Movimientos bancarios ya cruzados"
            : "Sin movimientos de cartola"
        }
        ratio={matchedShare}
        style={{ animationDelay: "80ms" }}
        trailing={
          <span className="rounded-full bg-card px-2.5 py-1 text-[10px] font-semibold tabular-nums text-brand-dark shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
            {Math.round(matchedShare * 100)}% cruzado
          </span>
        }
      >
        <div className="mx-auto -mt-1 block px-2 text-center">
          <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-brand-dark/55">
            Cruzado
          </span>
          <span className="mt-1 block text-[clamp(1.25rem,2vw,1.6rem)] font-semibold leading-none tracking-tight tabular-nums text-brand-dark">
            {amount(matchedBank)}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-brand/10 pt-3">
          <div className="px-2 py-1">
            <span className="block text-[10px] uppercase tracking-wide text-brand-dark/50">
              Movimientos
            </span>
            <span className="block text-[13px] font-semibold tabular-nums text-brand-dark">
              {movementCount}
            </span>
          </div>
          <div className="px-2 py-1">
            <span className="block text-[10px] uppercase tracking-wide text-brand-dark/50">
              Coincidencias
            </span>
            <span className="block text-[13px] font-semibold tabular-nums text-brand-dark">
              {suggestionCount}
            </span>
          </div>
        </div>
      </BentoGaugeCard>
    </div>
  );
}
