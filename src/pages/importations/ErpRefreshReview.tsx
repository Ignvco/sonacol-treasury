// Incoming ERP coverage and exact-identity review of carried execution evidence.
import type { ErpRefreshReview as Review } from "@/import-engine/types";

const states: Record<Review["executions"][number]["state"], string> = {
  uncovered_account: "Cuenta/moneda fuera de cobertura. Se conserva la ejecución; no se acredita saldo cero.",
  before_period: "Anterior a la apertura. Se conserva como evidencia histórica; no se vuelve a sumar ni restar.",
  missing_movement: "Bloqueo: el movimiento no aparece dentro del período cubierto.",
  changed_movement: "Bloqueo: los datos bancarios no coinciden con la evidencia registrada.",
  overallocated: "Bloqueo: la suma asignada a compromisos y rescates supera el movimiento bancario.",
  ambiguous_duplicate: "Bloqueo: cambió la cantidad de movimientos idénticos. No se puede confirmar a cuál corresponde la ejecución.",
};
const amount = (value: number | null) => value === null ? "—" : value.toLocaleString("es-CL", { maximumFractionDigits: 2 });

export function ErpRefreshReview({ review }: { review?: Review }) {
  if (!review) return null;
  return <section className="mb-4 min-w-0 rounded-xl border p-4" aria-label="Revisión de actualización ERP">
    <h3 className="font-semibold">Actualización ERP y ejecuciones</h3>
    <p className="mt-2 text-sm">{review.verified} asignaciones coinciden por identidad bancaria. Actualizar ERP conserva planificación, decisiones y ejecuciones; no crea pagos o rescates por coincidencia de importe.</p>
    {review.uncoveredAccounts.length > 0 && <p role="alert" className="mt-2 text-sm text-warning">
      Cuentas ausentes: {review.uncoveredAccounts.map(a => `${a.ledger} (${a.currency})`).join(", ")}. Sus datos anteriores quedan en el histórico; esta carga no certifica su saldo ni los consolida como cero.
    </p>}
    {review.blocking && <p role="alert" className="mt-2 text-sm text-danger">
      No se puede confirmar esta carga. Revisa si la exportación está completa o si la asignación registrada requiere una corrección explícita. No retires ejecuciones válidas solo para desbloquear la carga.
    </p>}
    {review.executions.length > 0 && <div className="mt-3 max-h-80 overflow-auto">
      <table className="w-full min-w-[760px] text-left text-sm">
        <thead><tr><th>Compromiso / rescate</th><th>Cuenta / fecha</th><th>Asignado</th><th>Banco antes / ahora</th><th>Revisión</th></tr></thead>
        <tbody>{review.executions.map((e, index) => <tr key={`${e.kind}:${e.id}:${e.sourceKey}:${index}`} className="border-t align-top">
          <td className="p-2"><p>{e.description || e.id}</p><small className="break-all">{e.sourceKey}</small></td>
          <td className="p-2">{e.ledger} · {e.currency}<br />{e.date}<br />Desde: {e.periodStart ?? "sin cobertura"}</td>
          <td className="p-2">{amount(e.amount)}<br /><small>Total vinculado: {amount(e.allocated)}</small></td>
          <td className="p-2">{amount(e.bankAmount)} / {amount(e.incomingAmount)}</td>
          <td className="p-2">{states[e.state]}</td>
        </tr>)}</tbody>
      </table>
    </div>}
  </section>;
}
