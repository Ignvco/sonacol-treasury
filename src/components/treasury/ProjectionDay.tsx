import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SourceBreakdown } from "./SourceBreakdown";
import type { SnapshotProjection } from "@/financial-engine/projection";
import { formatDateMedium } from "@/financial-engine/format";

export function ProjectionDay({
  model,
  date,
  formatAmount,
  amountDescription,
  onClose,
}: {
  model: SnapshotProjection;
  date: string;
  formatAmount: (n: number) => string;
  amountDescription: string;
  onClose: () => void;
}) {
  const [sources, setSources] = useState(false);
  const day = model.daily.find((d) => d.date === date);
  if (!day) return null;
  const previous = model.events.filter((r) => r.effectiveDate < date);
  const movements = model.events.filter((r) => r.effectiveDate === date);
  return (
    <>
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Caja prevista al {formatDateMedium(date)}</DialogTitle>
            <DialogDescription>
              BASE al {formatDateMedium(model.cutoff)}. {amountDescription}
            </DialogDescription>
          </DialogHeader>
          <dl
            className="grid grid-cols-2 gap-3"
            data-testid="projection-day-formula"
          >
            {[
              [date === model.cutoff ? "Saldo bancario real al corte" : "Saldo inicial del día", day.initial],
              ["Ingresos pendientes", day.income],
              ["Egresos pendientes", day.expense],
              ["Saldo previsto al cierre", day.final],
            ].map(([label, value]) => (
              <div key={label} className="min-w-0 rounded-xl border p-3">
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-2 break-words font-semibold tabular-nums">
                  {formatAmount(Number(value))}
                </dd>
              </div>
            ))}
          </dl>
          <p className="text-xs text-muted-foreground">
            Saldo inicial + ingresos − egresos = saldo previsto. El saldo
            inicial del día incluye el saldo bancario real y los {previous.length}{" "}
            movimientos proyectados anteriores. Este día contiene{" "}
            {movements.length} movimientos.
          </p>
          {date === model.cutoff && <p className="text-xs text-muted-foreground">
            Son movimientos aún pendientes en la fecha de corte. Los cargos y abonos
            importados ya forman parte del saldo real y no se repiten en esta proyección.
          </p>}
          <button
            className="t-button-secondary justify-center"
            onClick={() => setSources(true)}
          >
            Ver movimientos que componen el saldo
          </button>
        </DialogContent>
      </Dialog>
      {sources && (
        <SourceBreakdown
          title={`Origen del saldo al ${formatDateMedium(date)}`}
          rows={[...model.cashRows, ...previous, ...movements]}
          onClose={() => setSources(false)}
        />
      )}
    </>
  );
}
