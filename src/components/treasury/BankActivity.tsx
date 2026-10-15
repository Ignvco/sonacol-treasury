import { useState } from "react";
import { Link } from "react-router-dom";
import type { BankActivityModel } from "@/financial-engine/bank-activity";
import type { TreasuryRow } from "@/financial-engine/base-treasury";
import { SourceBreakdown } from "./SourceBreakdown";
import { DataTable } from "./DataTable";

/** Same source, filters and amounts in both operational screens. */
export function BankActivity({ activity, formatAmount }: { activity: BankActivityModel; formatAmount: (amount: number) => string }) {
  const [detail, setDetail] = useState<{ title: string; rows: TreasuryRow[] } | null>(null);
  if (!activity) return null;
  const a = activity;
  const cards = [
    { key: "opening", label: "Saldo inicial del período", value: a.opening, rows: a.openings, tone: "" },
    { key: "income", label: "Ingresos registrados · Cargo", value: a.income, rows: a.incomeRows, tone: "text-success" },
    { key: "expense", label: "Egresos registrados · Abono", value: a.expense, rows: a.expenseRows, tone: "text-danger" },
    { key: "closing", label: "Saldo calculado al corte", value: a.closing, rows: a.rows, tone: "" },
  ];
  return <section aria-label="Flujo bancario registrado" className="t-card min-w-0 space-y-4 p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h2 className="font-semibold">Flujo bancario registrado</h2>
        <p className="mt-1 text-xs text-muted-foreground">{a.from ? `${a.from} a ${a.cutoff}` : `Períodos de origen distintos · corte ${a.cutoff}`} · {a.movements.length} movimientos · filtros de banco y moneda aplicados</p></div>
      <Link to="/projections" className="t-button-secondary">Programar egresos</Link>
    </div>
    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(c => <button key={c.key} type="button" data-testid={`bank-activity-${c.key}`} onClick={() => setDetail({ title: c.label, rows: c.rows })}
        className="min-w-0 rounded-xl border bg-sunken p-3 text-left transition-colors hover:border-brand/40">
        <span className="block text-xs text-muted-foreground">{c.label}</span>
        <span className={`mt-2 block break-words text-lg font-semibold tabular-nums ${c.tone}`}>{formatAmount(c.value)}</span>
        <span className="mt-1 block text-xs text-muted-foreground">{c.rows.length} filas · Ver origen</span>
      </button>)}
    </div>
    <p className="text-xs text-muted-foreground">Saldo inicial + cargos − abonos = saldo al corte. Estos movimientos ya están incluidos en la caja disponible. La proyección comienza al día siguiente y utiliza los cobros y pagos programados.</p>
    {a.periodIssue ? <p role="alert" className="text-xs text-warning">{a.periodIssue}</p> : <details>
      <summary className="cursor-pointer text-sm font-medium text-brand">Ver flujo bancario diario</summary>
      <div className="mt-3 min-w-0"><DataTable data={a.daily} rowKey={d => d.date} pageSize={10} defaultSort={{ key: "date", dir: "asc" }} columns={[
        { key: "date", header: "Fecha", sortValue: d => d.date },
        { key: "initial", header: "Saldo inicial", align: "right", render: d => formatAmount(d.initial) },
        { key: "income", header: "Ingresos registrados", align: "right", render: d => formatAmount(d.income) },
        { key: "expense", header: "Egresos registrados", align: "right", render: d => <button className="text-danger underline" aria-label={`Ver egresos del ${d.date}`} onClick={() => setDetail({ title: `Egresos registrados del ${d.date}`, rows: a.expenseRows.filter(r => r.date === d.date) })}>{formatAmount(d.expense)}</button> },
        { key: "final", header: "Saldo calculado", align: "right", render: d => formatAmount(d.final) },
      ]} /></div>
    </details>}
    {detail && <SourceBreakdown {...detail} onClose={() => setDetail(null)} />}
  </section>;
}
