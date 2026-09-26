import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DataTable } from "@/components/treasury/DataTable";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import { LoadingState, ErrorState, NoBaseState } from "@/components/treasury/feedback";
import { useAsyncData } from "@/hooks/use-async";
import { useCanWrite } from "@/contexts/auth-context";
import { planningService } from "@/services/planningService";
import type { BusinessDecision, RawRow } from "@/financial-engine/snapshot";
import { DecisionDialog } from "./DecisionDialog";
import { CollectionPolicyDialog } from "./CollectionPolicyDialog";
import { MigrationComparison } from "./MigrationComparison";

const labels = { adjustment: "Ajuste", redemption: "Rescate", rule: "Regla" };
const rescueStates = { planned: "Programado", executed: "Ejecutado", cancelled: "Cancelado" };
export default function Planning() {
  const state = useAsyncData(() => planningService.load(), []), canWrite = useCanWrite();
  const [edit, setEdit] = useState<{ kind: BusinessDecision["kind"]; decision?: BusinessDecision; target?: string } | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} />;
  const snapshot = state.data;
  if (!snapshot?.batch) return <NoBaseState />;
  const enabled = snapshot.coverage?.profile === "ERP-RAW-v1";
  const decisions = snapshot.business ?? [];
  const pending = decisions.filter(d => d.kind !== "rule" && !snapshot.rows.some(r => r.normalized.businessKey === d.target_key));
  const targetName = (key: string) => { const n = snapshot.rows.find(r => r.normalized.businessKey === key)?.normalized; return n ? [n.customer || n.description, n.document].filter(Boolean).join(" · ") : "Fuera de cobertura · revisar"; };
  const openAdjustment = (row: RawRow) => setEdit({ kind: "adjustment", target: row.normalized.businessKey, decision: decisions.find(d => d.kind === "adjustment" && d.target_key === row.normalized.businessKey) });
  return <div className="t-fade-in flex flex-col gap-5">
    <PageHeader title="Planificación y reglas" subtitle="Tus decisiones sobre los datos ERP · corte seleccionado" actions={<Link className="t-button-secondary" to="/projections">Movimientos manuales</Link>} />
    {!enabled ? <section className="rounded-xl border p-5 text-sm">Esta fecha utiliza el formato CAJA. Sus datos manuales están disponibles en Proyecciones. Al importar ERP podrás mantener aquí las fechas previstas, clasificaciones y rescates.</section> : <>
      {!!snapshot.businessIssues?.length && <section role="alert" className="rounded-xl border border-warning/30 bg-warning-soft p-4 text-sm"><p className="font-semibold">Decisiones que requieren revisión</p><ul className="mt-2 list-disc pl-5">{snapshot.businessIssues.map((issue, i) => <li key={i}>{issue}</li>)}</ul></section>}
      <div className="flex flex-wrap gap-2">{canWrite && <><button className="t-button-primary" onClick={() => setPolicyOpen(true)}>Adoptar cobranza CAJA</button>{(Object.keys(labels) as BusinessDecision["kind"][]).map(kind => <button className="t-button-secondary" key={kind} onClick={() => setEdit({ kind })}>Crear {labels[kind].toLowerCase()}</button>)}</>}</div>
      {!!pending.length && <SectionCard title={`Correspondencias pendientes (${pending.length})`} subtitle="Compara el origen CAJA con el destino ERP. Una ausencia en la exportación no acredita que el documento esté pagado.">
        <DataTable<BusinessDecision> data={pending} rowKey={d => d.id} pageSize={5} columns={[
          { key: "source", header: "Origen conservado", className: "!whitespace-normal", render: d => [d.source_json?.normalized.customer || d.source_json?.normalized.description || d.values_json.description, d.source_json?.normalized.document, d.source_json ? `BASE!${d.source_json.row}` : d.values_json.note].filter(Boolean).join(" · ") },
          { key: "date", header: "Fecha prevista", render: d => d.values_json.date ?? "—" },
          { key: "kind", header: "Tipo", render: d => labels[d.kind] },
          { key: "review", header: "Acción", render: d => canWrite ? <button className="t-button-secondary" onClick={() => setEdit({ kind: d.kind, decision: d })}>Revisar correspondencia</button> : "Solo lectura" },
        ]} />
      </SectionCard>}
      <SectionCard title="Posiciones de inversión" subtitle="El capital permanece invertido hasta que programes un rescate; solo el importe programado entra al flujo futuro.">
        <div className="grid gap-3 md:grid-cols-2">{snapshot.rows.filter(r => r.kind === "investment").map(r => <article key={r.id} className="rounded-xl border p-4"><h3 className="font-semibold">Cuenta {r.normalized.ledgerCode}</h3><p className="mt-2 text-xl font-semibold tabular-nums">{baseNumber(Number(r.normalized.amount))} {r.normalized.currency}</p>{r.normalized.openingBasis === "first_balance_minus_movement" && <p className="mt-2 text-xs text-muted-foreground">Apertura calculada: {baseNumber(Number(r.normalized.inferredOpeningBalance))} {r.normalized.currency} · saldo acumulado menos primer movimiento en COLOCACIONES!{r.normalized.openingSourceRow}.</p>}<p className="mt-1 text-sm text-muted-foreground">Programado: {baseNumber(Number(r.normalized.reservedAmount ?? 0))} · Remanente: {baseNumber(Number(r.normalized.remainingAmount ?? r.normalized.amount))}</p>{canWrite && <button className="t-button-secondary mt-3" onClick={() => setEdit({ kind: "redemption", target: r.normalized.businessKey })}>Programar rescate</button>}</article>)}</div>
      </SectionCard>
      <SectionCard title="Decisiones guardadas" subtitle="Los ajustes explícitos prevalecen sobre las reglas. Al reimportar se conservan y se revisa su correspondencia.">
        <DataTable<BusinessDecision> data={decisions} rowKey={d => d.id} pageSize={8} search searchText={d => `${labels[d.kind]} ${targetName(d.target_key)} ${d.values_json.note ?? ""}`} columns={[
          { key: "kind", header: "Tipo", render: d => labels[d.kind] },
          { key: "target", header: "Destino", className: "!whitespace-normal min-w-[160px]", render: d => d.kind === "rule" ? (d.target_key === "*" ? "Todos los registros aplicables" : "Cliente " + d.target_key) : targetName(d.target_key) },
          { key: "detail", header: "Decisión", className: "!whitespace-normal min-w-[180px]", render: d => [d.values_json.date, d.values_json.amount ? `${baseNumber(Number(d.values_json.amount))} ${d.values_json.currency}` : "", d.kind === "rule" ? (d.values_json.ruleType === "collection" ? `${d.values_json.days} días naturales` : `Contiene: ${d.values_json.contains}`) : "", d.values_json.note].filter(Boolean).join(" · ") },
          { key: "revision", header: "Versión", render: d => d.revision },
          { key: "status", header: "Estado", render: d => d.kind === "redemption" ? rescueStates[String(d.values_json.status) as keyof typeof rescueStates] ?? "Pendiente de revisión" : "Vigente" },
          { key: "edit", header: "Acción", render: d => canWrite ? <button className="t-button-secondary" onClick={() => setEdit({ kind: d.kind, decision: d })}>Editar</button> : "Solo lectura" },
        ]} />
      </SectionCard>
      <SectionCard title="Cobranzas" subtitle="Vencimiento contractual y fecha prevista de cobro separados.">
        <DataTable<RawRow> data={snapshot.rows.filter(r => r.kind === "invoice")} rowKey={r => r.id} pageSize={8} search searchText={r => `${r.normalized.customer} ${r.normalized.document}`} columns={[
          { key: "client", header: "Cliente / documento", render: r => `${r.normalized.customer} · ${r.normalized.document}` },
          { key: "due", header: "Vencimiento original", render: r => r.normalized.dueDate },
          { key: "planned", header: "Cobro previsto", render: r => r.normalized.adjustedDate || r.normalized.reportDate || r.normalized.dueDate },
          { key: "bank", header: "Cuenta receptora", render: r => r.normalized.settlementBank || "Sin asignar" },
          { key: "edit", header: "Acción", render: r => canWrite ? <button className="t-button-secondary" onClick={() => openAdjustment(r)}>Ajustar</button> : "Solo lectura" },
        ]} />
      </SectionCard>
      <MigrationComparison snapshot={snapshot} />
    </>}
    {edit && <DecisionDialog key={edit.decision?.id ?? edit.kind + edit.target} snapshot={snapshot} kind={edit.kind} initial={edit.decision} targetKey={edit.target} onClose={() => setEdit(null)} />}
    {policyOpen && <CollectionPolicyDialog snapshot={snapshot} onClose={() => setPolicyOpen(false)} />}
  </div>;
}
