// Read-only comparison for migration review; reference inputs are session-only.
import { useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/auth-context";
import type { SnapshotProjection } from "@/financial-engine/projection";
import { cashEquivalence, cashMetrics, emptyCashReference } from "@/financial-engine/cash-equivalence";
import { downloadCSV } from "@/lib/export";

export function CashEquivalence({ model }: { model: SnapshotProjection }) {
  const { user } = useAuth();
  const [reference, setReference] = useState(emptyCashReference);
  const [date, setDate] = useState("");
  const [source, setSource] = useState("");
  const [scope, setScope] = useState(false);
  const [busy, setBusy] = useState(false);
  const result = cashEquivalence(model, reference, date, source, scope);
  const number = (cents: number | null) => cents === null ? "Pendiente" : (cents / 100).toLocaleString("es-CL", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const status = !result.comparable ? "Revisión pendiente" : result.matches ? "Coincidencia de los seis totales declarados" : "Diferencias detectadas";
  const exportReview = async () => {
    setBusy(true);
    try {
      await downloadCSV(result.rows.map(row => ({
        "Fecha de exportación": new Date().toISOString(),
        "Corte plataforma": model.cutoff, "Corte referencia": date,
        "Referencia declarada": source, "Moneda": model.filters.currency,
        "Banco": model.filters.bank || "Todos", "Alcance confirmado": scope ? "Sí" : "No",
        "Archivos ERP": [...new Set(model.cashRows.map(r => r.fileName))].join(" | "),
        "Versiones de carga": [...new Set(model.cashRows.map(r => r.batchId).filter(Boolean))].join(" | "),
        "Versión del motor": model.engineVersion || "Sin identificar",
        "Cuentas plataforma": model.cutoffPosition?.accounts.map(a => `${a.ledger} ${a.currency}`).join(" | ") || "",
        "Indicador": row.label, "Plataforma": row.actual === null ? "Pendiente" : row.actual / 100,
        "Referencia": row.expected === null ? "Pendiente" : row.expected / 100,
        "Diferencia plataforma menos referencia": row.difference === null ? "No calculable" : row.difference / 100,
        "Estado": status, "Observaciones": result.issues.join(" | "),
        "Límite": "Comparación de totales declarados, sin certificación de equivalencia por movimiento.",
      })), `revision-cierre-${model.cutoff}.csv`);
    } catch (error) { toast.error(error instanceof Error ? error.message : "No se pudo exportar la revisión."); }
    finally { setBusy(false); }
  };
  return <details className="mt-4 min-w-0 rounded-xl border p-4">
    <summary className="cursor-pointer font-semibold">Comparar cierre con una referencia</summary>
    <p className="mt-3 text-sm text-muted-foreground">Control opcional de migración. La plataforma sigue operando con ERP y su planificación propia. Estos campos no importan CAJA ni modifican saldos; se descartan al salir o cambiar de carga, moneda o banco. Exporta la revisión si necesitas conservarla.</p>
    <p className="mt-2 text-sm">Corte: {model.cutoff} · Moneda: {model.filters.currency} · Banco: {model.filters.bank || "Todos"}.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="min-w-0 text-sm">Documento o cierre de referencia<input className="t-input mt-1 w-full" value={source} maxLength={255} onChange={e => setSource(e.target.value)} placeholder="Archivo, hoja y celdas o identificación del cierre" /></label>
      <label className="min-w-0 text-sm">Fecha de la referencia<input type="date" className="t-input mt-1 w-full" value={date} onChange={e => setDate(e.target.value)} /></label>
      {cashMetrics.map(metric => <label key={metric.key} className="min-w-0 text-sm">{metric.label}<input className="t-input mt-1 w-full" inputMode="decimal" value={reference[metric.key]} onChange={e => setReference({ ...reference, [metric.key]: e.target.value })} placeholder="Sin separadores de miles" /></label>)}
    </div>
    <p className="mt-2 text-xs text-muted-foreground">Ejemplo: 1000000,50. Ingresa 0 cuando corresponda; dejar vacío significa dato pendiente. Los ingresos y pagos son los pendientes del corte, sin repetir cargos o abonos ya incluidos en el saldo real.</p>
    <label className="mt-3 flex items-start gap-2 text-sm"><input type="checkbox" checked={scope} onChange={e => setScope(e.target.checked)} />La referencia corresponde a la misma moneda, cuentas y estado de ejecución de los pendientes del corte.</label>
    <p className="mt-3 font-semibold" role="status">{status}</p>
    {!!result.issues.length && <ul className="mt-2 list-disc pl-5 text-sm text-warning">{result.issues.map((issue, i) => <li key={i}>{issue}</li>)}</ul>}
    <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm">
      <thead><tr><th>Indicador</th><th>Plataforma</th><th>Referencia</th><th>Diferencia</th></tr></thead>
      <tbody>{result.rows.map(row => <tr key={row.key} className="border-t"><td className="py-2">{row.label}</td><td>{number(row.actual)}</td><td>{number(row.expected)}</td><td>{row.difference === null ? "No comparable aún" : number(row.difference)}</td></tr>)}</tbody>
    </table></div>
    <p className="mt-2 text-xs text-muted-foreground">Una coincidencia de totales no acredita correspondencia por movimiento ni resuelve cuentas omitidas. Revisa también el detalle de las tarjetas y las advertencias de planificación.</p>
    {user?.canExport && <button type="button" className="t-button-secondary mt-3" disabled={busy} onClick={exportReview}>{busy ? "Exportando…" : "Exportar revisión CSV"}</button>}
  </details>;
}
