import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { initialPlanService, type InitialPlanPreview } from "@/services/initialPlanService";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import { DataTable } from "@/components/treasury/DataTable";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

const states = { missing: "Disponible para incorporar", existing: "Ya incorporado · se conserva", review: "Posible coincidencia · revisar", uncovered: "Cuenta fuera de cobertura" };

/** A one-time business plan, kept out of the browser bundle until an authorized preview. */
export function InitialPlan({ batch, canWrite }: { batch: string; canWrite: boolean }) {
  const [preview, setPreview] = useState<InitialPlanPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [bindings, setBindings] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const review = async () => {
    setBusy(true); setError("");
    try {
      const next = await initialPlanService.preview(batch);
      setPreview(next);
      setBindings({});
      // Past-due commitments require an explicit selection; execution is never inferred.
      setSelected(next.rows.filter(r => r.state === "missing" && !r.overdue).map(r => r.key));
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo leer el plan inicial."); }
    finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview || busy || (!selected.length && !Object.values(bindings).some(Boolean))) return;
    setBusy(true); setError("");
    try {
      const result = await initialPlanService.apply(batch, preview.revision, selected, bindings);
      setPreview(null); toast.success(`${result.inserted} compromisos incorporados y ${result.bound} correspondencias conservadas.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo incorporar el plan.");
      setPreview(null); // A stale preview must be rebuilt before another write.
    } finally { setBusy(false); }
  };
  const selectedRows = preview?.rows.filter(r => selected.includes(r.key)) ?? [];
  const sum = (type: string) => selectedRows.filter(r => r.type === type).reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100;
  return <section className="min-w-0 rounded-xl border bg-card p-4 text-sm" aria-label="Planificación inicial SONACOL">
    <p className="font-semibold">Plan de cobros y pagos SONACOL</p>
    <p className="mt-2 text-muted-foreground">Incorpora una vez la planificación identificada al 24/09/2026: 26 egresos y 17 ingresos hasta diciembre. Después, los compromisos se gestionan aquí y se conservan con cada actualización ERP.</p>
    <div className="mt-3 flex flex-wrap gap-2">
      <button disabled={busy} className="t-button-secondary" onClick={() => void review()}>{busy ? "Procesando…" : "Revisar planificación inicial"}</button>
      <Link className="t-button-secondary" to="/projections">Ver compromisos y ejecuciones</Link>
    </div>
    {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    <Dialog open={!!preview} onOpenChange={open => { if (!open && !busy) setPreview(null); }}>
      <DialogContent className="min-w-0 max-w-5xl overflow-x-hidden p-4 sm:p-6">
        <DialogHeader><DialogTitle>Incorporar planificación inicial</DialogTitle><DialogDescription>Referencia de negocio: 24/09/2026. Corte ERP seleccionado: {preview?.cutoff}. Los valores son compromisos del plan conocido; no se repiten automáticamente en meses posteriores.</DialogDescription></DialogHeader>
        {preview && <>
          <p className="text-sm">Los registros identificados como existentes conservan sus ediciones y eliminaciones. Las posibles coincidencias requieren revisión en Proyecciones. Las partidas vencidas no se seleccionan automáticamente.</p>
          <DataTable data={preview.rows} rowKey={r => r.key} pageSize={8} columns={[
            { key: "select", header: "Incorporar", render: r => <input type="checkbox" aria-label={`Incorporar ${r.description} del ${r.date}`} disabled={busy || !canWrite || !preview.canApply || r.state !== "missing"} checked={selected.includes(r.key)} onChange={e => setSelected(keys => e.target.checked ? [...keys, r.key] : keys.filter(k => k !== r.key))} /> },
            { key: "date", header: "Fecha", render: r => <>{r.date}{r.overdue && <span className="block text-warning">Pendiente al corte · revisar ejecución</span>}</> },
            { key: "description", header: "Compromiso", className: "!whitespace-normal min-w-[160px]", render: r => <>{r.description}<span className="block text-xs text-muted-foreground">PROYEC!{r.row} · {r.bank ?? r.bankLedger}</span></> },
            { key: "amount", header: "Importe CLP", align: "right", render: r => `${r.type === "expense" ? "−" : "+"}${baseNumber(r.amount)}` },
            { key: "state", header: "Revisión", className: "!whitespace-normal", render: r => <>{states[r.state]}{r.state === "review" && canWrite && preview.canApply && <label className="mt-2 block text-xs">Conservar un registro existente<select className="t-input mt-1 w-full min-w-0 max-w-[220px]" disabled={busy} value={bindings[r.key] ?? ""} onChange={e => setBindings(v => ({ ...v, [r.key]: e.target.value }))}><option value="">Dejar pendiente</option>{r.matches.map(m => <option key={m.id} value={m.id}>{m.date} · {m.description} · {baseNumber(m.amount)}{m.deleted ? " · eliminado" : ""} · {m.id.slice(0, 8)}</option>)}</select></label>}</> },
          ]} />
          <p className="text-sm tabular-nums">Seleccionados: {selected.length} · Ingresos: {baseNumber(sum("income"))} CLP · Egresos: {baseNumber(sum("expense"))} CLP</p>
          {selectedRows.some(r => r.overdue) && <p role="alert" className="text-sm text-warning">Incluyes partidas vencidas: quedarán pendientes para el primer día proyectado hasta registrar su ejecución, reprogramarlas o cancelarlas.</p>}
          {!preview.canApply && <p className="text-sm">Selecciona la última carga ERP para incorporar planificación. Esta versión histórica conserva sus datos.</p>}
          <div className="flex flex-wrap justify-end gap-2"><button className="t-button-secondary" disabled={busy} onClick={() => setPreview(null)}>Cerrar</button>{canWrite && preview.canApply && <button className="t-button-primary" disabled={busy || (!selected.length && !Object.values(bindings).some(Boolean))} onClick={() => void apply()}>Aplicar selección</button>}</div>
        </>}
      </DialogContent>
    </Dialog>
  </section>;
}
