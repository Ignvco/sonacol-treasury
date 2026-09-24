import { ChevronRight, Wallet } from "lucide-react";
import { BentoGaugeCard } from "./BentoGaugeCard";

/** Cash on hand, its liquidity share and the two drill-downs that explain it. */
export function ResumenLiquidityCard({
  cutoff,
  availableText,
  investedText,
  minimumText,
  liquidity,
  onOpenCash,
  onOpenInvested,
  onOpenMinimumDay,
}: {
  cutoff: string;
  availableText: string;
  investedText: string;
  minimumText: string;
  liquidity: number;
  onOpenCash: () => void;
  onOpenInvested: () => void;
  onOpenMinimumDay: () => void;
}) {
  return (
    <BentoGaugeCard
      icon={Wallet}
      title="Caja disponible"
      subtitle={`Saldo real al corte ${cutoff}`}
      ratio={liquidity}
      style={{ animationDelay: "120ms" }}
      trailing={
        <span className="rounded-full bg-card px-2.5 py-1 text-[10px] font-semibold tabular-nums text-brand-dark shadow-[0_1px_2px_rgba(16,24,40,0.06)]">
          {Math.round(liquidity * 100)}% líquido
        </span>
      }
    >
      <button
        type="button"
        onClick={onOpenCash}
        className="group mx-auto -mt-1 block rounded-xl px-2 text-center"
      >
        <span className="block text-[10px] font-medium uppercase tracking-[0.16em] text-brand-dark/55">
          Caja disponible
        </span>
        <span className="mt-1 block text-[clamp(1.25rem,2vw,1.6rem)] font-semibold leading-none tracking-tight tabular-nums text-brand-dark">
          {availableText}
        </span>
        <span className="mt-1.5 flex items-center justify-center gap-1 text-[11px] font-medium text-brand-dark/60 transition-colors group-hover:text-brand-dark">
          Ver desglose <ChevronRight size={12} />
        </span>
      </button>

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-brand/10 pt-3">
        <button
          type="button"
          onClick={onOpenInvested}
          className="rounded-xl px-2 py-1 text-left transition-colors hover:bg-card/60"
        >
          <span className="block text-[10px] uppercase tracking-wide text-brand-dark/50">
            En inversiones
          </span>
          <span className="block text-[13px] font-semibold tabular-nums text-brand-dark">
            {investedText}
          </span>
        </button>
        <button
          type="button"
          onClick={onOpenMinimumDay}
          className="rounded-xl px-2 py-1 text-left transition-colors hover:bg-card/60"
        >
          <span className="block text-[10px] uppercase tracking-wide text-brand-dark/50">
            Mínimo proyectado
          </span>
          <span className="block text-[13px] font-semibold tabular-nums text-brand-dark">
            {minimumText}
          </span>
        </button>
      </div>
    </BentoGaugeCard>
  );
}
