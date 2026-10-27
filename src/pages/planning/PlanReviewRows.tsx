import { DataTable } from "@/components/treasury/DataTable";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import type { PlanChoice, PlanKind, PlanReference, PlanReviewPreview } from "@/services/planReviewService";

export function PlanReviewRows({ preview, kind, choices, change, disabled }: {
  preview: PlanReviewPreview; kind: PlanKind; choices: Record<string, PlanChoice>;
  change: (key: string, choice?: PlanChoice) => void; disabled: boolean;
}) {
  const candidates = (r: PlanReference) => preview.existing.filter(e => !e.refs.length && (
    ["collection", "collection_rule"].includes(r.kind) ? e.kind === r.kind && r.targets.includes(e.targetKey ?? "") :
    r.kind === "redemption" ? e.kind === "redemption" && e.currency === r.currency :
    ["commitment", "placement"].includes(e.kind) && e.type === r.type && e.currency === r.currency));
  return <DataTable<PlanReference> data={preview.rows.filter(r => r.kind === kind)} rowKey={r => r.key} pageSize={6} columns={[
    { key: "source", header: "Referencia 09/10", className: "!whitespace-normal min-w-[190px]", render: r => <>
      <strong>{r.description}</strong><span className="block">{r.kind === "collection_rule" ? "Vencimiento + 5 días naturales" : `${r.date} · ${baseNumber(r.amount)} ${r.currency}`}</span>
      <span className="block text-xs">{r.sheet}!{r.row} · {r.bank ?? "Cuenta"} · {r.bankLedger}</span>
      {r.overdue && <span className="block text-warning">Anterior al corte ERP; revisar ejecución o reprogramar</span>}
      {!r.covered && <span className="block text-warning">Cuenta fuera de cobertura</span>}
      {r.kind === "collection" && <span className="block text-xs">{r.customerCode} · emisión {r.issueDate} · vence {r.dueDate}<br />{r.overrideDate ? `Excepción de cobro: ${r.overrideDate}` : "Fecha calculada por reglas; no se fija la fecha del Excel"}</span>}
      {r.kind === "placement" && <span className="block text-xs">Propuesta; sin tasa ni vencimiento inferidos</span>}
      {r.kind === "collection_rule" && <span className="block text-xs">{r.customerCode} · se aplica también a nuevas facturas del cliente; prevalece sobre reglas anteriores y conserva las fechas explícitas.</span>}
    </> },
    { key: "decision", header: "Decisión", className: "!whitespace-normal min-w-[220px]", render: r => {
      if (r.known.length) return <span>Ya revisado. Se conservan su estado, ediciones y eliminaciones.</span>;
      const choice = choices[r.key], options = candidates(r);
      return <div className="grid min-w-0 gap-2">
        <select aria-label={`Acción para ${r.sheet} ${r.row}`} className="t-input w-full min-w-0 max-w-[280px]" disabled={disabled} value={choice?.action ?? ""} onChange={e => change(r.key, e.target.value ? { action: e.target.value as PlanChoice["action"] } : undefined)}>
          <option value="">Dejar pendiente</option>
          <option value="new" disabled={!r.covered || (["collection", "collection_rule"].includes(r.kind) && options.length > 0) || (["collection", "collection_rule", "redemption"].includes(r.kind) && !r.targets.length)}>Crear registro nuevo</option>
          <option value="keep" disabled={!options.length}>Vincular y conservar mis valores</option>
          <option value="update" disabled={!r.covered || !options.some(e => !e.deleted && !e.linked)}>Adoptar valores de la referencia</option>
        </select>
        {choice && choice.action !== "new" && <select aria-label={`Registro para ${r.sheet} ${r.row}`} className="t-input w-full min-w-0 max-w-[280px]" disabled={disabled} value={choice.id ?? ""} onChange={e => { const current = options.find(o => o.id === e.target.value); change(r.key, { ...choice, id: e.target.value, target: current?.targetKey }); }}>
          <option value="">Selecciona el registro existente</option>{options.filter(e => choice.action === "keep" || (!e.deleted && !e.linked)).map(e => <option key={e.id} value={e.id}>{r.suggestions.includes(e.id) ? "Revisar · " : ""}{e.date ?? "Sin fecha"} · {e.description} · {baseNumber(e.amount ?? 0)}{e.deleted ? " · eliminado" : ""} · {e.id.slice(0, 8)}</option>)}
        </select>}
        {choice && choice.action !== "keep" && r.kind === "redemption" && <select aria-label={`Posición del rescate ${r.row}`} className="t-input w-full min-w-0 max-w-[280px]" disabled={disabled} value={choice.target ?? ""} onChange={e => change(r.key, { ...choice, target: e.target.value })}>
          <option value="">Selecciona la posición ERP</option>{preview.positions.filter(p => r.targets.includes(p.normalized.businessKey)).map(p => <option key={p.id} value={p.normalized.businessKey}>{p.normalized.ledgerCode} · {baseNumber(Number(p.normalized.amount))} {p.normalized.currency}</option>)}
        </select>}
        {choice?.action === "new" && ["collection", "collection_rule"].includes(r.kind) && <select aria-label={`Destino ${r.description}`} className="t-input w-full min-w-0 max-w-[280px]" disabled={disabled} value={choice.target ?? ""} onChange={e => change(r.key, { ...choice, target: e.target.value })}>
          <option value="">Confirmar destino ERP coincidente</option>{r.targets.map(t => {
            const invoice = preview.invoices.find(i => i.normalized.businessKey === t);
            return <option key={t} value={t}>{invoice ? `ERP fila ${invoice.row} · documento ${invoice.normalized.erpDocument} · folio ${invoice.normalized.document} · cuota ${invoice.normalized.installment}` : t}</option>;
          })}
        </select>}
        {!r.targets.length && ["collection", "collection_rule", "redemption"].includes(r.kind) && <span className="text-warning">Sin destino ERP compatible en esta carga. La referencia queda pendiente.</span>}
        {r.suggestions.length > 0 && <span className="text-xs text-muted-foreground">Hay registros para revisar; fecha, fila o importe no prueban identidad ni ejecución.</span>}
      </div>;
    } },
    { key: "current", header: "Registro elegido / efecto", className: "!whitespace-normal min-w-[190px]", render: r => {
      const choice = choices[r.key], e = preview.existing.find(e => e.id === choice?.id);
      return e ? <><span>{e.description} · {e.date ?? "Sin fecha específica"}</span><span className="block">{e.amount === null ? "Sin importe propio" : `${baseNumber(e.amount)} ${e.currency}`} · cuenta {e.bankLedger ?? "sin asignar"}</span>{e.kind === "collection_rule" && <span className="block">Plazo actual: {e.values?.days} días · prioridad {e.values?.priority}</span>}<span className="block">{e.deleted ? "Eliminado" : e.status ?? "Vigente"} · ejecutado {baseNumber(e.executedAmount)}</span><strong className="mt-2 block text-xs">{choice?.action === "keep" ? "Se conservan todos sus valores y su estado." : r.kind === "collection_rule" ? "Adopta +5 días y cuenta; prioridad superior a las reglas actuales. Conserva las excepciones por factura." : "Cambiarán fecha, importe, cuenta y clasificación del compromiso. En cobranzas, solo cuenta y excepción explícita; se conservan las demás decisiones."}</strong></> : choice?.action === "new" ? <span>{r.kind === "collection" ? "Ajuste sobre la factura ERP; no agrega otro cobro." : r.kind === "collection_rule" ? "Regla para el cliente actual y sus próximas facturas; no agrega cobros." : "Se agregará un pendiente. Revisa que no exista ya en tu planificación."}</span> : "—";
    } },
  ]} />;
}
