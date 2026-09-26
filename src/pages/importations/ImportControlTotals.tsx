import { importControlTotals } from "@/import-engine/control-totals";
import type { ProcessedRecord } from "@/import-engine/types";

const format = new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 });
export function ImportControlTotals({ records }: { records: ProcessedRecord[] }) {
  const groups = importControlTotals(records);
  const invalid = records.filter((r) => r.status === "ERROR").length;
  const inferred = records.filter(r => ["VALID", "WARNING"].includes(r.status) && typeof r.normalized.inferredOpeningBalance === "number");
  const title = records.some(r => r.normalized.sourceProfile === "ERP-RAW-v1") ? "Control de importes del archivo" : "Control de importes de BASE";
  return (
    <section aria-label={title} className="mb-4 rounded-xl border p-4">
      <h3 className="font-semibold">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">
        Suma con signo de las filas válidas, por origen y moneda. Son importes del archivo, no cobros o pagos confirmados del período.
        Las monedas se mantienen separadas; no se convierte USD a CLP sin una tasa.
      </p>
      {invalid > 0 && <p role="alert" className="mt-2 text-sm text-danger">{invalid} filas con errores excluidas: los totales están incompletos y la carga está bloqueada.</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-muted-foreground">
            <th className="p-2">Origen</th><th className="p-2">Moneda</th><th className="p-2 text-right">Filas</th><th className="p-2 text-right">Importe neto</th>
          </tr></thead>
          <tbody>{groups.map((group) => <tr key={group.origin + group.currency} className="border-b last:border-0">
            <td className="p-2">{group.origin}</td><td className="p-2">{group.currency}</td>
            <td className="p-2 text-right tabular-nums">{format.format(group.rows)}</td>
            <td className="whitespace-nowrap p-2 text-right tabular-nums">{format.format(group.amount)}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!!inferred.length && <div className="mt-3 rounded-lg bg-brand-soft p-3 text-sm">
        <p className="font-semibold">Aperturas de inversión calculadas</p>
        <p className="mt-1 text-xs">No hay fila OB para estas cuentas. La plataforma suma esta apertura al movimiento neto para obtener la posición; no añade filas al Excel ni la cuenta como ingreso.</p>
        <ul className="mt-2 space-y-1">{inferred.map(r => <li key={r.sheet + r.row}>{r.sheet}!{r.row} · cuenta {String(r.normalized.ledgerCode)}: {format.format(Number(r.normalized.balance))} − ({format.format(Number(r.normalized.signedAmount))}) = <strong>{format.format(Number(r.normalized.inferredOpeningBalance))} {String(r.normalized.currency)}</strong>.</li>)}</ul>
      </div>}
    </section>
  );
}
