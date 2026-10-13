import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { DataTable } from "@/components/treasury/DataTable";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import { planReviewService, planKinds, type PlanChoice, type PlanKind, type PlanReviewPreview } from "@/services/planReviewService";
import { PlanReviewRows } from "./PlanReviewRows";

/** Adoption is explicit and versioned. Everyday operation uses native decisions thereafter. */
export function PlanReview({ batch, canWrite }: { batch: string; canWrite: boolean }) {
  const [preview, setPreview] = useState<PlanReviewPreview | null>(null), [kind, setKind] = useState<PlanKind>("commitment");
  const [choices, setChoices] = useState<Record<string, PlanChoice>>({}), [prior, setPrior] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const change = (key: string, choice?: PlanChoice) => setChoices(old => { const next = { ...old }; if (choice) next[key] = choice; else delete next[key]; return next; });
  const review = async () => {
    setBusy(true); setError("");
    try { setPreview(await planReviewService.preview(batch)); setChoices({}); setPrior({}); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir la revisión."); }
    finally { setBusy(false); }
  };
  const hasCommitments = preview?.rows.some(r => r.kind === "commitment" && choices[r.key]);
  const chosenIds = Object.values(choices).map(c => c.id).filter(Boolean);
  const repeatedId = new Set(chosenIds).size !== chosenIds.length;
  const previous = hasCommitments ? (preview?.existing ?? []).filter(e => e.legacy && !e.deleted && !["borrador", "cancelado"].includes(e.status ?? "") && !e.reviewed && !e.refs.length && !Object.values(choices).some(c => c.id === e.id)) : [];
  const incomplete = repeatedId || previous.some(e => !prior[e.id]) || Object.entries(choices).some(([key, c]) => {
    const r = preview?.rows.find(r => r.key === key);
    return c.action !== "new" && !c.id || c.action !== "keep" && ["collection", "collection_rule", "redemption"].includes(r?.kind ?? "") && !c.target;
  });
  const apply = async () => {
    if (!preview || busy || incomplete) return;
    setBusy(true); setError("");
    try { const result = await planReviewService.apply(batch, preview, choices, prior); setPreview(null); toast.success(`${result.applied} referencias adoptadas; ${result.reviewed} compromisos anteriores revisados.`); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo aplicar la revisión."); }
    finally { setBusy(false); }
  };
  return <section className="min-w-0 rounded-xl border bg-card p-4 text-sm">
    <p className="font-semibold">Transición del plan · referencia 09/10/2026</p>
    <p className="mt-2 text-muted-foreground">38 compromisos, 5 propuestas de colocación, 6 rescates, 6 políticas por cliente y 48 referencias de cobranza. Revisa una vez qué conservar o incorporar; después mantén las decisiones aquí y actualiza únicamente ERP.</p>
    <div className="mt-3 flex flex-wrap gap-2"><button className="t-button-secondary" disabled={busy} onClick={() => void review()}>Revisar transición del plan</button><Link className="t-button-secondary" to="/projections">Gestionar compromisos y recurrencias</Link></div>
    {error && <p role="alert" className="mt-3 text-danger">{error}</p>}
    <Dialog open={!!preview} onOpenChange={open => { if (!open && !busy) setPreview(null); }}><DialogContent className="max-h-[92dvh] min-w-0 max-w-6xl overflow-x-hidden overflow-y-auto p-4 sm:p-6">
      <DialogHeader><DialogTitle>Revisar planificación de octubre</DialogTitle><DialogDescription>Referencia 09/10/2026 · corte ERP {preview?.cutoff}. Ninguna selección se aplica automáticamente. Una referencia ausente en ERP queda pendiente; no significa que se haya ejecutado.</DialogDescription></DialogHeader>
      {preview && <>
        <div className="flex flex-wrap gap-2">{(Object.keys(planKinds) as PlanKind[]).map(k => <button key={k} type="button" className={kind === k ? "t-button-primary" : "t-button-secondary"} onClick={() => setKind(k)}>{planKinds[k]}</button>)}</div>
        <PlanReviewRows preview={preview} kind={kind} choices={choices} change={change} disabled={busy || !canWrite || !preview.canApply} />
        {previous.length > 0 && <section className="min-w-0 rounded-xl border p-3">
          <p className="font-semibold">Compromisos anteriores sin correspondencia ({previous.length})</p>
          <p className="my-2 text-sm">Retirar cancela únicamente el pendiente; conserva sus datos y ejecuciones. Una fila ausente en octubre no demuestra pago.</p>
          <button type="button" className="t-button-secondary mb-3" disabled={busy || !canWrite || !preview.canApply} onClick={() => setPrior(p => ({ ...p, ...Object.fromEntries(previous.map(e => [e.id, "keep"])) }))}>Conservar todos los anteriores pendientes de decisión</button>
          <DataTable data={previous} rowKey={e => e.id} pageSize={5} columns={[
            { key: "date", header: "Fecha" }, { key: "description", header: "Compromiso", className: "!whitespace-normal" },
            { key: "amount", header: "Importe", render: e => `${baseNumber(e.amount ?? 0)} ${e.currency}` },
            { key: "choice", header: "Decisión", render: e => <select aria-label={`Decisión anterior ${e.description}`} className="t-input w-full min-w-0" disabled={busy || !canWrite || !preview.canApply} value={prior[e.id] ?? ""} onChange={event => setPrior(p => ({ ...p, [e.id]: event.target.value }))}><option value="">Seleccionar</option><option value="keep">Conservar vigente</option><option value="retire" disabled={e.linked}>Retirar pendiente{e.linked ? " · desvincula primero" : ""}</option></select> },
          ]} />
        </section>}
        <p className="text-sm">Referencias seleccionadas: {Object.keys(choices).length}. Se conservan identidades, estados y ejecuciones. Adoptar valores reemplaza las fechas e importes indicados; no renueva automáticamente los meses siguientes.</p>
        {!preview.canApply && <p className="text-warning">Solo puedes adoptar decisiones en la última carga ERP.</p>}
        {repeatedId && <p role="alert" className="text-danger">Un mismo registro está seleccionado para varias referencias. Revisa esas correspondencias.</p>}
        {error && <p role="alert" className="text-danger">{error}</p>}
        <div className="flex flex-wrap justify-end gap-2">{error && <button className="t-button-secondary" disabled={busy} onClick={() => void review()}>Volver a cargar revisión y selecciones</button>}<button className="t-button-secondary" disabled={busy} onClick={() => setPreview(null)}>Cerrar</button>{canWrite && preview.canApply && <button className="t-button-primary" disabled={busy || incomplete || !Object.keys(choices).length} onClick={() => void apply()}>Aplicar revisión seleccionada</button>}</div>
      </>}
    </DialogContent></Dialog>
  </section>;
}
