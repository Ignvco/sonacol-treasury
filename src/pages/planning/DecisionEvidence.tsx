import type { BusinessDecision, RawRow } from "@/financial-engine/snapshot";
import { baseNumber } from "@/components/treasury/SourceBreakdown";

/** The saved source is evidence, never a substitute for reviewing a binding. */
export function DecisionEvidence({ decision, selected }: { decision: BusinessDecision; selected?: RawRow }) {
  const source = decision.source_json;
  if (!source) return decision.values_json.sourceRecord ? <p className="text-sm text-warning">El origen CAJA ya no está disponible. Revisa la correspondencia con tu respaldo antes de asignarla.</p> : null;
  const original = source.normalized, current = selected?.normalized;
  const rows = [
    ["Cliente / descripción", original.customer || original.description, current?.customer || current?.description],
    ["Documento", original.document, current?.document],
    ["Importe", `${baseNumber(Number(original.amount))} ${original.currency}`, current ? `${baseNumber(Number(current.amount))} ${current.currency}` : ""],
    ["Vencimiento", original.dueDate || original.endDate, current?.dueDate || current?.endDate],
    ["Fecha manual CAJA", original.adjustedDate, ""],
    ["Fecha calculada CAJA", original.reportDate, ""],
    ["Banco de origen", original.bank, current?.bank],
    ["Cuenta contable", original.ledgerCode, current?.ledgerCode],
    ["Banco receptor", original.settlementBank, current?.settlementBank],
  ];
  return <section className="rounded-xl border p-3 text-sm">
    <h3 className="font-semibold">Origen conservado de CAJA</h3>
    <p className="mt-1 break-words text-xs text-muted-foreground">{source.fileName} · BASE!{source.row} · corte {source.cutoff}</p>
    <div className="mt-3 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-1">Dato</th><th className="p-1">CAJA original</th><th className="p-1">Destino ERP</th></tr></thead><tbody>{rows.map(([label, before, after]) => <tr key={label}><th className="p-1 font-normal">{label}</th><td className="p-1">{before || "—"}</td><td className="p-1">{after || "—"}</td></tr>)}</tbody></table></div>
    {decision.kind === "redemption" && <p className="mt-3 text-xs">El importe CAJA es un rescate previsto; el destino ERP representa capital total. Confirma la entidad y la cuenta de inversión antes de asignarlo.</p>}
    {current && original.document && current.document && original.document !== current.document && <p className="mt-3 text-warning">Los documentos tienen folios diferentes. Un monto igual no demuestra que correspondan.</p>}
  </section>;
}
