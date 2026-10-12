import { useState } from "react";
import { toast } from "sonner";
import { useAsyncData } from "@/hooks/use-async";
import { decisionService } from "@/services/decisionService";
import { initialPlanService } from "@/services/initialPlanService";
import type { Projection } from "@/financial-engine/types";
import { total, pendingProjectionAmount } from "@/financial-engine/base-treasury";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

interface Execution { sourceKey: string; date: string; amount: number; description: string; sourceFile: string; sourceSheet: string; sourceRow: number; }

/** User-confirmed allocation: equal amounts alone never mark a commitment as executed. */
export function ManualExecutionDialog({ initial, onClose }: { initial: Projection; onClose: () => void }) {
  const state = useAsyncData(() => decisionService.snapshot(initial.batchId!), [initial.batchId]);
  const [record, setRecord] = useState(""), [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const current = state.data?.manual.find(r => r.id === initial.id);
  const executions: Execution[] = current?.normalized.executions ?? [];
  const remaining = pendingProjectionAmount(Number(current?.normalized.amount ?? initial.amount), Number(current?.normalized.executedAmount ?? 0));
  const candidates = (state.data?.rows ?? []).filter(r => r.normalized.recordRole === "bank_movement" && r.normalized.type === initial.type && r.normalized.currency === initial.currency &&
    (current?.normalized.ledgerCode ? r.normalized.ledgerCode === current.normalized.ledgerCode : r.normalized.bank === initial.bankId) &&
    r.normalized.date <= (state.data?.batch?.cutoff ?? "")).map(r => {
      const allocations = (state.data?.manual ?? []).flatMap(m => (m.normalized.executions ?? []) as (Execution & { recordId?: string })[])
        .filter(e => e.sourceKey === r.normalized.businessKey || e.recordId === r.recordId);
      const assigned = total(allocations.map(e => Number(e.amount)));
      return { ...r, available: pendingProjectionAmount(Number(r.normalized.amount), assigned) };
    }).filter(r => r.available > 0 && !executions.some(e => e.sourceKey === r.normalized.businessKey));
  const selected = candidates.find(r => r.recordId === record);
  const run = async (removeKey: string | null = null) => {
    if (!current || !state.data?.batch || busy) return;
    setBusy(true); setError("");
    try {
      await initialPlanService.execute(state.data.batch.id, current.id, current.revision!, removeKey ? null : record, removeKey ? 0 : Number(amount), removeKey);
      onClose(); toast.success(removeKey ? "Ejecución retirada; pendiente recalculado." : "Ejecución vinculada; solo el saldo pendiente se proyecta.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar la ejecución."); }
    finally { setBusy(false); }
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="min-w-0 max-w-2xl overflow-x-hidden p-4 sm:p-6">
    <DialogHeader><DialogTitle>Ejecución del compromiso</DialogTitle><DialogDescription>{initial.description}. Vincula el cobro o pago registrado en ERP. La caja real ya lo contiene; la asignación reduce únicamente el importe futuro pendiente.</DialogDescription></DialogHeader>
    {state.loading ? <p>Cargando movimientos…</p> : state.error ? <p role="alert" className="text-danger">{state.error}</p> : !current ? <p role="alert">El compromiso ya no está disponible.</p> : <>
      <p className="text-sm tabular-nums">Planificado: {baseNumber(Number(current.normalized.amount))} · Ejecutado: {baseNumber(Number(current.normalized.executedAmount ?? 0))} · Pendiente: {baseNumber(remaining)} {initial.currency}</p>
      {executions.length > 0 && <ul className="space-y-2">{executions.map(e => <li key={e.sourceKey} className="rounded-lg border p-3 text-sm"><p className="break-words">{e.date} · {e.description} · {baseNumber(e.amount)} {initial.currency}</p><p className="mt-1 break-words text-xs text-muted-foreground">{e.sourceFile} · {e.sourceSheet}!{e.sourceRow}</p><button disabled={busy} className="t-button-secondary mt-2" onClick={() => void run(e.sourceKey)}>Retirar asignación</button></li>)}</ul>}
      {remaining > 0 && <>
        <label className="min-w-0 text-sm">Movimiento bancario<select className="t-input mt-1 w-full min-w-0" value={record} disabled={busy} onChange={e => { const next = candidates.find(r => r.recordId === e.target.value); setRecord(e.target.value); setAmount(next ? String(Math.min(remaining, next.available)) : ""); }}><option value="">Seleccionar movimiento de la misma cuenta</option>{candidates.map(r => <option key={r.recordId} value={r.recordId ?? ""}>{r.normalized.date} · {r.normalized.description} · {baseNumber(r.available)} {initial.currency} · fila {r.row}</option>)}</select></label>
        {!candidates.length && <p className="text-sm text-muted-foreground">No hay movimientos compatibles en este período. Revisa la cuenta del compromiso o importa la exportación ERP que contenga su ejecución.</p>}
        <label className="min-w-0 text-sm">Importe a aplicar<input className="t-input mt-1 w-full" inputMode="decimal" type="number" step="0.01" min="0.01" max={Math.min(remaining, selected?.available ?? 0)} disabled={busy || !selected} value={amount} onChange={e => setAmount(e.target.value)} /></label>
        <button className="t-button-primary" disabled={busy || !selected || !Number.isFinite(Number(amount)) || Number(amount) <= 0 || Number(amount) > Math.min(remaining, selected.available)} onClick={() => void run()}>Vincular ejecución</button>
      </>}
    </>}
    {error && <p role="alert" className="text-danger">{error}</p>}
  </DialogContent></Dialog>;
}
