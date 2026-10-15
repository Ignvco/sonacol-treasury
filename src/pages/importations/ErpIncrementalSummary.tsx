import type { ErpIncrementalResult } from "@/import-engine/types";
import { baseNumber } from "@/components/treasury/SourceBreakdown";

/** Counts come from the server; only a committed response uses completed wording. */
export function ErpIncrementalSummary({ result }: { result?: ErpIncrementalResult }) {
  if (!result) return null;
  const saved = result.state === "completed";
  return <section className="my-4 min-w-0 rounded-xl border p-4 text-sm" aria-label="Actualización incremental ERP">
    <h3 className="font-semibold">{saved ? "Actualización ERP confirmada" : "Revisión de actualización ERP"}</h3>
    <p className="mt-1 text-muted-foreground">Apertura mensual: {result.periodStart.slice(0, 7)} · Corte: {result.cutoff}</p>
    <dl className="my-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
      {[["Movimientos leídos", result.movementsRead], [saved ? "Nuevos incorporados" : "Nuevos por incorporar", result.newMovements],
        ["Ya registrados", result.existingMovements], ["Conservados de cargas anteriores", result.retainedMovements],
        ["Errores que impiden importar", result.rejected], ["Movimientos ambiguos", result.ambiguous]].map(([label, value]) =>
        <div key={label}><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-lg font-semibold tabular-nums">{value}</dd></div>)}
    </dl>
    {saved && result.newMovements === 0 && <p>No se encontraron movimientos bancarios adicionales.</p>}
    {result.retainedMovements > 0 && <p role="status" className="my-2 rounded-lg bg-warning-soft p-3">Hay movimientos anteriores ausentes en este archivo. Se conservan con su fecha, cuenta y relaciones. Su efecto neto es {baseNumber(result.retainedNet)}; revisa el origen antes de concluir que el saldo del archivo equivale a la caja registrada.</p>}
    {!!result.retainedDetails?.length && <details className="my-2 rounded-lg border p-3"><summary className="cursor-pointer font-medium">Revisar movimientos conservados y su origen</summary>
      <ul className="mt-2 space-y-2">{result.retainedDetails.map(r => <li key={r.sourceKey} className="break-words border-t pt-2">
        {r.date} · {r.ledger} · {r.document} · {baseNumber(r.signedAmount)} {r.currency}<br />
        <span className="text-xs text-muted-foreground">{r.fileName} · {r.sheet}!{r.row}</span>
      </li>)}</ul>
    </details>}
    {result.blocking && <p role="alert" className="my-2 font-medium text-danger">La carga está bloqueada. No se ha incorporado ningún movimiento.</p>}
    {result.issues.length > 0 && <ul className="my-2 list-inside list-disc text-danger">{result.issues.map((issue, index) => <li key={index}>{issue.ledger} {issue.document}: {issue.message}</li>)}</ul>}
    <p className="mt-3 text-xs text-muted-foreground">Caja registrada, incluyendo movimientos conservados. La apertura se reconoce una vez por cuenta y mes.</p>
    <div className="mt-2 max-w-full overflow-x-auto"><table className="w-full text-xs"><thead><tr>
      {["Banco / cuenta", "Moneda", "Apertura mensual", "Cargos", "Abonos", "Saldo calculado", "Saldo informado", "Diferencia"].map(label => <th className="whitespace-nowrap p-2 text-left" key={label}>{label}</th>)}
    </tr></thead><tbody>{result.openings.map(o => <tr className="border-t" key={`${o.ledger}:${o.currency}`}>
      <td className="min-w-40 p-2">{o.bank} · {o.ledger}</td><td className="p-2">{o.currency}</td>
      {[o.opening, o.income, o.expense, o.calculated, o.reported, o.difference].map((amount, index) => <td className="whitespace-nowrap p-2 text-right tabular-nums" key={index}>{amount === null ? "No informado" : baseNumber(amount)}</td>)}
    </tr>)}</tbody></table></div>
  </section>;
}
