import { Link } from "react-router-dom";
import type { InvestmentCalendarEntry } from "@/financial-engine/investment-maturities";
import { DataTable } from "./DataTable";
import { baseNumber } from "./SourceBreakdown";

export function InvestmentCalendar({ entries, cutoff }: { entries: InvestmentCalendarEntry[]; cutoff: string }) {
  return <section aria-label="Calendario de vencimientos" className="min-w-0">
    <p className="mb-3 text-sm text-muted-foreground">Corte: {cutoff}. Los importes originales ERP no equivalen al capital remanente por vencer. <Link className="underline" to="/help#inversiones">Ver guía</Link></p>
    <DataTable data={entries} rowKey={e => e.id} pageSize={8} emptyTitle="Sin fechas de vencimiento válidas" columns={[
      { key: "date", header: "Vencimiento", sortValue: e => e.date, render: e => <time dateTime={e.date}>{e.date}</time> },
      { key: "ledger", header: "Cuenta", render: e => e.ledger },
      { key: "amount", header: "Importe", align: "right", render: e => <><span className="t-num">{baseNumber(e.amount)} {e.currency}</span>{e.sourceEvidence && <span className="block text-xs text-muted-foreground">Original ERP</span>}</> },
      { key: "state", header: "Situación al corte", render: e => e.days < 0 ? "Vencido · revisar remanente" : e.days === 0 ? "Vence al corte" : `${e.days} días` },
      { key: "origin", header: "Origen", render: e => e.origin },
      { key: "description", header: "Detalle", className: "!whitespace-normal", render: e => e.description },
    ]} />
  </section>;
}
