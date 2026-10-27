import { useState } from "react";
import type { RawSnapshot } from "@/financial-engine/snapshot";
import type { Projection } from "@/financial-engine/types";
import { pendingProjectionAmount } from "@/financial-engine/base-treasury";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DataTable } from "@/components/treasury/DataTable";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import { ManualDialog } from "../projections/ManualDialog";
import { ManualExecutionDialog } from "../projections/ManualExecutionDialog";

/** A planned placement is an outflow; only ERP can report its actual cash and capital. */
export function Placements({ snapshot, canWrite }: { snapshot: RawSnapshot; canWrite: boolean }) {
  const [edit, setEdit] = useState<Projection | "new" | null>(null), [execution, setExecution] = useState<Projection | null>(null);
  if (!snapshot.batch) return null;
  const projections: Projection[] = snapshot.manual.filter(r => r.normalized.category === "investment_placement" && r.normalized.type === "expense").map(r => ({
    id: r.id, batchId: snapshot.batch!.id, revision: r.revision, date: r.normalized.adjustedDate || r.normalized.reportDate || r.normalized.date,
    type: "expense", category: "investment_placement", amount: Number(r.normalized.amount), currency: r.normalized.currency,
    description: r.normalized.description, status: r.normalized.status, bankId: r.normalized.bank,
    bankLedger: r.normalized.settlementLedger || r.normalized.ledgerCode, executedAmount: Number(r.normalized.executedAmount ?? 0),
  }));
  return <SectionCard title="Colocaciones propuestas" subtitle="Cada colocación reduce la liquidez prevista de su cuenta. Su ejecución se vincula a un abono ERP; no crea otro egreso ni aumenta por sí sola la posición invertida.">
    {canWrite && <button className="t-button-secondary mb-3" onClick={() => setEdit("new")}>Programar colocación</button>}
    <DataTable data={projections} rowKey={p => p.id} pageSize={5} columns={[
      { key: "date", header: "Fecha" }, { key: "description", header: "Colocación", className: "!whitespace-normal" },
      { key: "bankLedger", header: "Cuenta de origen" }, { key: "currency", header: "Moneda" },
      { key: "amount", header: "Planificado", align: "right", render: p => baseNumber(p.amount) },
      { key: "executedAmount", header: "Ejecutado", align: "right", render: p => baseNumber(p.executedAmount ?? 0) },
      { key: "pending", header: "Pendiente activo", align: "right", render: p => ["cancelado", "borrador"].includes(p.status) ? "—" : baseNumber(pendingProjectionAmount(p.amount, p.executedAmount)) },
      { key: "status", header: "Estado" },
      { key: "actions", header: "Acciones", render: p => canWrite ? <div className="flex flex-wrap gap-2"><button className="t-button-secondary" onClick={() => setEdit(p)}>Editar</button><button className="t-button-secondary" onClick={() => setExecution(p)}>Ejecución</button></div> : "Solo lectura" },
    ]} />
    {edit && <ManualDialog initial={edit === "new" ? null : edit} preset={{ type: "expense", category: "investment_placement", description: "Colocación programada" }} batchId={snapshot.batch.id} date={snapshot.batch.cutoff} banks={snapshot.rows.filter(r => r.normalized.recordRole === "bank_opening").map(r => r.normalized.bank)} onClose={() => setEdit(null)} />}
    {execution && <ManualExecutionDialog initial={execution} onClose={() => setExecution(null)} />}
  </SectionCard>;
}
