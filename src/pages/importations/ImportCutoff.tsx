import { nextDate } from "@/financial-engine/base-treasury";
import { validDate } from "@/import-engine/detect";
import type { BaseReadingSummary } from "@/import-engine/types";

export function ImportCutoff({ reading, value, issue, busy, onChange, onApply }: {
  reading: BaseReadingSummary;
  value: string;
  issue: string | null;
  busy: boolean;
  onChange: (value: string) => void;
  onApply: () => void;
}) {
  return (
    <section aria-label="Fecha de corte de la importación" className="mb-4 rounded-xl border p-4">
      <h3 className="font-semibold">Fecha de los datos</h3>
      <p className="mt-1 text-sm text-muted-foreground">
        Indica hasta qué día está actualizada esta BASE. La fecha de carga se registra por separado.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <label className="grid gap-2 text-sm font-medium">
          Fecha de corte
          <input type="date" className="t-input" min="2000-01-01" max="2100-12-31"
            value={value} disabled={busy} onChange={(e) => onChange(e.target.value)} />
        </label>
        <button className="t-button-secondary" disabled={busy || !validDate(value)} onClick={onApply}>
          Aplicar fecha de corte
        </button>
        {reading.lastBankDate && (
          <button className="t-button-secondary" disabled={busy} onClick={() => onChange(reading.lastBankDate!)}>
            Usar última fecha BANCO
          </button>
        )}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Último movimiento BANCO: {reading.lastBankDate ?? "no disponible"}.
        {" "}Fecha guardada en AE7: {reading.workbookCutoff ?? "no disponible"}.
        {reading.cutoffFormula && " AE7 contiene una fórmula; puede cambiar al recalcular Excel."}
      </p>
      {validDate(value) && (
        <p className="mt-2 text-sm">Caja disponible al {value} · Proyección desde {nextDate(value, 1)}.</p>
      )}
      {issue && <p role="alert" className="mt-3 text-sm text-danger">{issue}</p>}
      {!issue && value !== reading.cutoff && (
        <p role="status" className="mt-3 text-sm text-amber-800">
          Aplica la fecha para actualizar la comparación. Todavía no se ha guardado ningún cambio.
        </p>
      )}
    </section>
  );
}
