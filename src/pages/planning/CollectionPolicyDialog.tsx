import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import type { RawSnapshot, BusinessDecision } from "@/financial-engine/snapshot";
import { planningService, type CollectionPolicyPreview } from "@/services/planningService";

/** Adopts a reviewed formula without converting the user's manual dates into rules. */
export function CollectionPolicyDialog({ snapshot, onClose }: { snapshot: RawSnapshot; onClose: () => void }) {
  const [target, setTarget] = useState("*"), [days, setDays] = useState(5), [bank, setBank] = useState("");
  const [priority, setPriority] = useState(Math.min(9999, Math.max(9, ...(snapshot.business ?? []).filter(d => d.kind === "rule" && d.values_json.ruleType === "collection").map(d => Number(d.values_json.priority))) + 1)), [preview, setPreview] = useState<CollectionPolicyPreview | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const invoices = snapshot.rows.filter(r => r.kind === "invoice");
  const clients = [...new Map(invoices.map(r => [String(r.normalized.customerCode), String(r.normalized.customer)])).entries()];
  const banks = snapshot.rows.filter(r => r.normalized.recordRole === "bank_opening");
  const scoped = new Set(invoices.filter(r => target === "*" || r.normalized.customerCode === target).map(r => r.normalized.businessKey));
  const sourceBanks = [...new Set((snapshot.business ?? []).filter(d => d.kind === "adjustment" && scoped.has(d.target_key)).map(d => d.source_json?.normalized.settlementBank).filter(Boolean))];
  const values: BusinessDecision["values_json"] = { ruleType: "collection", days, priority, bankLedger: bank, note: "Política de cobranza revisada durante la migración de CAJA." };
  const submit = async () => {
    if (!snapshot.batch || busy) return;
    setBusy(true); setError("");
    try {
      if (preview) { await planningService.adoptCollection(snapshot.batch.id, target, values, preview.revision); onClose(); }
      else setPreview(await planningService.previewCollection(snapshot.batch.id, target, values));
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo aplicar la regla."); setPreview(null); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
    <DialogHeader><DialogTitle>Adoptar regla de cobranza CAJA</DialogTitle><DialogDescription>La fórmula observada es vencimiento + 5 días naturales. Revisa el alcance y la cuenta receptora antes de aplicarla.</DialogDescription></DialogHeader>
    <form className="grid gap-4" onSubmit={e => { e.preventDefault(); void submit(); }} onChange={() => setPreview(null)}>
      <label className="grid gap-1 text-sm">Cliente ERP<select className="t-input" disabled={busy} value={target} onChange={e => { setTarget(e.target.value); setBank(""); }}><option value="*">Todos los clientes</option>{clients.map(([code, name]) => <option key={code} value={code}>{name} · {code}</option>)}</select></label>
      <div className="grid grid-cols-2 gap-3"><label className="grid gap-1 text-sm">Días naturales<input className="t-input" type="number" required min={-365} max={365} disabled={busy} value={days} onChange={e => setDays(Number(e.target.value))} /></label><label className="grid gap-1 text-sm">Prioridad<input className="t-input" type="number" required min={0} max={9999} disabled={busy} value={priority} onChange={e => setPriority(Number(e.target.value))} /></label></div>
      <label className="grid gap-1 text-sm">Cuenta receptora de la regla<select className="t-input" disabled={busy} value={bank} onChange={e => setBank(e.target.value)}><option value="">Conservar las asignaciones actuales</option>{banks.map(r => <option key={r.id} value={r.normalized.ledgerCode}>{r.normalized.bank} · {r.normalized.ledgerCode} · {r.normalized.currency}</option>)}</select></label>
      {!!sourceBanks.length && <p className="text-xs text-muted-foreground">Bancos receptores observados en las correspondencias CAJA de este alcance: {sourceBanks.join(", ")}. La selección se guarda por código de cliente ERP y cuenta bancaria.</p>}
      {preview && <section aria-label="Impacto de la regla" className="rounded-xl border bg-sunken p-4 text-sm"><p><strong>{preview.invoiceCount}</strong> facturas alcanzadas por la regla.</p><p className="mt-2"><strong>{preview.releaseIds.length}</strong> fechas calculadas de CAJA pasarán a seguir la regla.</p><p className="mt-2"><strong>{preview.preservedDates}</strong> fechas explícitas, excepciones o decisiones ya editadas conservarán su prioridad.</p><p className="mt-2">Las correspondencias pendientes siguen en revisión. Las reglas se conservan para las siguientes cargas ERP.</p></section>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <div className="flex justify-end gap-2"><button type="button" className="t-button-secondary" disabled={busy} onClick={onClose}>Cancelar</button><button className="t-button-primary" disabled={busy}>{busy ? "Procesando…" : preview ? "Aplicar regla revisada" : "Revisar impacto"}</button></div>
    </form>
  </DialogContent></Dialog>;
}
