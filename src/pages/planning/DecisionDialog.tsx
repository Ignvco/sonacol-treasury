import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { CASHFLOW_CATEGORY_LABEL } from "@/financial-engine/types";
import type { BusinessDecision, RawSnapshot } from "@/financial-engine/snapshot";
import { planningService } from "@/services/planningService";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import { DecisionEvidence } from "./DecisionEvidence";

const names = { adjustment: "Ajuste operativo", redemption: "Rescate programado", rule: "Regla de negocio" };
export function DecisionDialog({ snapshot, kind, initial, targetKey, onClose }: {
  snapshot: RawSnapshot; kind: BusinessDecision["kind"]; initial?: BusinessDecision; targetKey?: string; onClose: () => void;
}) {
  const [target, setTarget] = useState(initial?.target_key ?? targetKey ?? (kind === "rule" ? "*" : ""));
  const [values, setValues] = useState<BusinessDecision["values_json"]>(initial?.values_json ?? (kind === "rule" ? { ruleType: "collection", days: 5, priority: 10 } : kind === "redemption" ? { status: "planned", currency: snapshot.coverage?.currency ?? "CLP" } : {}));
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [reviewedTarget, setReviewedTarget] = useState("");
  const update = (field: string, value: string | number) => setValues(v => ({ ...v, [field]: value }));
  const targets = snapshot.rows.filter(r => kind === "redemption" ? r.kind === "investment" : initial?.source_json?.kind === "invoice" ? r.kind === "invoice" && r.normalized.currency === initial.source_json.normalized.currency : ["invoice", "cash_flow"].includes(r.kind) && r.normalized.recordRole !== "bank_opening");
  const selected = snapshot.rows.find(r => r.normalized.businessKey === target);
  const banks = snapshot.rows.filter(r => r.normalized.recordRole === "bank_opening");
  const collectionRule = kind === "rule" && values.ruleType === "collection";
  const bindingChanged = !!initial && kind !== "rule" && target !== initial.target_key;
  const bankAllowed = kind === "redemption" || collectionRule || (kind === "adjustment" && selected?.kind === "invoice");
  const save = async (remove = false) => {
    if (!snapshot.batch || busy) return;
    if (!remove && bindingChanged && reviewedTarget !== target) { setError("Confirma la correspondencia después de revisar el origen y el destino."); return; }
    setBusy(true); setError("");
    try { await planningService.save(snapshot.batch.id, kind, target, values, initial, remove); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar."); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>{names[kind]}</DialogTitle><DialogDescription>La decisión se guarda por separado y se conserva al actualizar los datos ERP.</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void save(); }}>
      {kind !== "rule" && <label className="grid gap-1 text-sm">{kind === "redemption" ? "Posición de inversión" : "Documento o movimiento"}<select className="t-input" required value={target} disabled={busy} onChange={e => { setTarget(e.target.value); const r = snapshot.rows.find(r => r.normalized.businessKey === e.target.value); if (kind === "redemption" && r) update("currency", r.normalized.currency); }}>
        <option value="">Selecciona un registro</option>
        {target && !targets.some(r => r.normalized.businessKey === target) && <option value={target}>Registro anterior fuera de cobertura · reasignar</option>}
        {targets.map(r => <option key={r.id} value={r.normalized.businessKey}>{r.normalized.customer || r.normalized.description} {r.normalized.document} · {baseNumber(Number(r.normalized.amount))} {r.normalized.currency}</option>)}
      </select></label>}
      {initial && <DecisionEvidence decision={initial} selected={selected} />}
      {bindingChanged && <label className="flex items-start gap-2 text-sm"><input className="mt-1" type="checkbox" checked={reviewedTarget === target} onChange={e => setReviewedTarget(e.target.checked ? target : "")} />Confirmo que revisé la correspondencia entre el origen y este destino ERP.</label>}
      {selected?.kind === "invoice" && <p className="rounded-lg bg-sunken p-3 text-sm">Vencimiento original: {selected.normalized.dueDate}. Fecha prevista actual: {selected.normalized.adjustedDate || selected.normalized.reportDate || selected.normalized.dueDate}.</p>}
      {selected?.kind === "investment" && <p className="rounded-lg bg-sunken p-3 text-sm">Capital: {baseNumber(Number(selected.normalized.amount))} {selected.normalized.currency} · Reservado: {baseNumber(Number(selected.normalized.reservedAmount ?? 0))} · Remanente: {baseNumber(Number(selected.normalized.remainingAmount ?? selected.normalized.amount))}.</p>}
      {kind === "rule" && <>
        <label className="grid gap-1 text-sm">Tipo de regla<select className="t-input" value={String(values.ruleType)} onChange={e => { setTarget("*"); setValues({ ruleType: e.target.value, priority: values.priority ?? 10, ...(e.target.value === "collection" ? { days: 5 } : {}) }); }}><option value="collection">Fecha y cuenta de cobro</option><option value="classification">Clasificación de movimientos</option></select></label>
        {collectionRule ? <><label className="grid gap-1 text-sm">Código de cliente · * para todos<input className="t-input" required value={target} onChange={e => setTarget(e.target.value)} /></label><label className="grid gap-1 text-sm">Días naturales desde el vencimiento<input className="t-input" type="number" min={-365} max={365} required value={Number(values.days ?? 0)} onChange={e => update("days", Number(e.target.value))} /></label></> : <label className="grid gap-1 text-sm">La descripción contiene<input className="t-input" required value={String(values.contains ?? "")} onChange={e => update("contains", e.target.value)} /></label>}
        <label className="grid gap-1 text-sm">Prioridad · el número mayor se aplica al final<input className="t-input" type="number" min={0} max={9999} required value={Number(values.priority ?? 10)} onChange={e => update("priority", Number(e.target.value))} /></label>
      </>}
      {(kind === "redemption" || (kind === "adjustment" && selected?.kind === "invoice")) && <label className="grid gap-1 text-sm">Fecha prevista<input className="t-input" type="date" min="2000-01-01" max="2100-12-31" required={kind === "redemption"} value={String(values.date ?? "")} onChange={e => update("date", e.target.value)} /></label>}
      {kind === "redemption" && <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">Importe del rescate ({values.currency})<input className="t-input" type="number" min="0.01" step="0.01" required value={values.amount ?? ""} onChange={e => update("amount", Number(e.target.value))} /></label><label className="grid gap-1 text-sm">Estado<select className="t-input" value={String(values.status)} onChange={e => update("status", e.target.value)}><option value="planned">Programado</option><option value="executed">Ejecutado</option><option value="cancelled">Cancelado</option></select></label></div>}
      {bankAllowed && <label className="grid gap-1 text-sm">Cuenta receptora<select className="t-input" required={kind === "redemption"} value={String(values.bankLedger ?? "")} onChange={e => setValues(v => ({ ...v, bankLedger: e.target.value, bank: null }))}><option value="">Sin asignación específica</option>{banks.map(r => <option key={r.id} value={r.normalized.ledgerCode}>{r.normalized.bank} · {r.normalized.ledgerCode} · {r.normalized.currency}</option>)}</select></label>}
      {(kind === "adjustment" || (kind === "rule" && !collectionRule)) && <label className="grid gap-1 text-sm">Clasificación<select className="t-input" required={kind === "rule"} value={String(values.category ?? "")} onChange={e => update("category", e.target.value)}><option value="">Conservar clasificación</option>{Object.entries(CASHFLOW_CATEGORY_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      {kind !== "rule" && <label className="grid gap-1 text-sm">Descripción operativa<input className="t-input" maxLength={300} value={String(values.description ?? "")} onChange={e => update("description", e.target.value)} /></label>}
      <label className="grid gap-1 text-sm">Observaciones o condiciones<textarea className="t-input min-h-20" maxLength={2000} value={String(values.note ?? "")} onChange={e => update("note", e.target.value)} /></label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex flex-wrap justify-end gap-2">{initial && <button type="button" className="t-button-secondary mr-auto" disabled={busy} onClick={() => void save(true)}>Retirar decisión</button>}<button type="button" className="t-button-secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="t-button-primary" disabled={busy}>{busy ? "Guardando…" : "Guardar decisión"}</button></div>
    </form>
  </DialogContent></Dialog>;
}
