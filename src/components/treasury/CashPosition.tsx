import { useState } from "react";
import { CashEquivalence } from "./CashEquivalence";
import type { SnapshotProjection } from "@/financial-engine/projection";
import { isPlannedPlacement, type TreasuryRow } from "@/financial-engine/base-treasury";
import { formatDateMedium } from "@/financial-engine/format";
import { DataTable } from "./DataTable";
import { SectionCard } from "./SectionCard";
import { baseNumber, SourceBreakdown } from "./SourceBreakdown";

/** One cash bridge for both operational screens, including source evidence. */
export function CashPosition({ model, formatAmount }: {
  model: SnapshotProjection; formatAmount: (amount: number) => string;
}) {
  const [detail, setDetail] = useState<{ title: string; rows: TreasuryRow[] } | null>(null);
  const position = model.cutoffPosition;
  if (!position) return null;
  const items = [
    { title: "Saldo bancario real al corte", amount: position.available, rows: model.cashRows },
    { title: "Ingresos pendientes del corte", amount: position.income, rows: position.events.filter(r => r.signed > 0) },
    { title: "Pagos pendientes sin colocaciones", amount: position.operatingExpense, rows: position.events.filter(r => r.signed < 0 && !isPlannedPlacement(r)) },
    { title: "Caja prevista antes de colocar", amount: position.beforePlacements, rows: [...model.cashRows, ...position.events.filter(r => !isPlannedPlacement(r))] },
    { title: "Colocaciones pendientes del corte", amount: position.placements, rows: position.events.filter(isPlannedPlacement) },
    { title: "Liquidez prevista tras colocaciones", amount: position.closing, rows: [...model.cashRows, ...position.events] },
  ];
  return <SectionCard title={`Posición de caja · ${formatDateMedium(position.date)}`}
    subtitle="Saldo real + ingresos pendientes − pagos pendientes − colocaciones pendientes = liquidez prevista del corte.">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(item => <button key={item.title} type="button"
        className="min-w-0 rounded-xl border p-4 text-left hover:border-brand/50"
        onClick={() => setDetail({ title: item.title, rows: item.rows })}>
        <span className="block text-xs text-muted-foreground">{item.title}</span>
        <span className="mt-2 block break-words text-lg font-semibold tabular-nums">{formatAmount(item.amount)}</span>
      </button>)}
    </div>
    <p className="my-3 text-xs text-muted-foreground">
      La fecha corresponde a la carga seleccionada. Los pendientes aún no son movimientos bancarios;
      los cobros y pagos ya registrados en ERP están incluidos en el saldo real.
      La proyección del día siguiente parte de este cierre previsto.
    </p>
    <DataTable data={position.accounts} rowKey={r => r.key} pageSize={9}
      onRowClick={r => setDetail({ title: `${r.bank} · ${r.ledger} · ${r.currency}`, rows: [...r.rows, ...r.events] })}
      columns={[
        { key: "bank", header: "Banco" },
        { key: "ledger", header: "Cuenta" },
        { key: "currency", header: "Moneda" },
        { key: "amount", header: "Saldo real", align: "right", render: r => baseNumber(r.amount) },
        { key: "income", header: "Ingresos pendientes", align: "right", render: r => baseNumber(r.income) },
        { key: "operatingExpense", header: "Pagos pendientes", align: "right", render: r => baseNumber(r.operatingExpense) },
        { key: "beforePlacements", header: "Antes de colocar", align: "right", render: r => baseNumber(r.beforePlacements) },
        { key: "placements", header: "Colocaciones", align: "right", render: r => baseNumber(r.placements) },
        { key: "closing", header: "Liquidez prevista", align: "right", render: r => baseNumber(r.closing) },
      ]} />
    <p className="mt-2 text-xs text-muted-foreground">Cada cuenta se muestra en su moneda original, sin conversión.</p>
    {position.unassigned.length > 0 && <button type="button"
      className="mt-3 text-left text-sm text-warning underline"
      onClick={() => setDetail({ title: "Pendientes sin cuenta única en la cobertura", rows: position.unassigned })}>
      Revisar {position.unassigned.length} pendientes incluidos en el total, sin asignación a una cuenta de esta tabla.
    </button>}
    <CashEquivalence model={model} />
    {detail && <SourceBreakdown key={detail.title} {...detail} onClose={() => setDetail(null)} />}
  </SectionCard>;
}
