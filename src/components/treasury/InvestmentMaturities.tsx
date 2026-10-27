import type { InvestmentMaturity } from "@/financial-engine/types";
import { maturityDays } from "@/financial-engine/investment-maturities";
import { DataTable } from "./DataTable";
import { baseNumber } from "./SourceBreakdown";
import { ExportMenu } from "./ExportMenu";

/** Source entries, not invented lots or a second cash forecast. */
export function InvestmentMaturities({ entries, cutoff, allowExport = true }: { entries: InvestmentMaturity[]; cutoff: string; allowExport?: boolean }) {
  const future = entries.filter(e => e.signedAmount > 0 && (maturityDays(e.endDate, cutoff) ?? -1) > 0);
  const missing = entries.filter(e => maturityDays(e.endDate, cutoff) === null);
  return <section className="my-4 min-w-0 rounded-xl border p-4">
    <h3 className="font-semibold">Fechas de vencimiento informadas por ERP</h3>
    <p className="my-2 text-sm">{future.length} registros de entrada con fecha posterior al corte {cutoff}. {missing.length} registros sin vencimiento válido.</p>
    <p className="mb-3 text-xs text-muted-foreground">Son importes originales del mayor, no capital disponible por vencimiento. Los rescates históricos no identifican inequívocamente qué colocación reducen. Revisa el capital remanente y las decisiones existentes antes de programar un rescate; no se añade otro ingreso automático.</p>
    {allowExport && <ExportMenu filename="vencimientos-origen-erp" rows={entries.map(e => ({ Origen: `${e.sourceSheet}!${e.sourceRow}`, Cuenta: e.ledger, Contabilización: e.operationDate || "No informada", Vencimiento: e.endDate || "No informado", "Importe original con signo": e.signedAmount, Moneda: e.currency, Corte: cutoff, Detalle: e.description, "Clave de origen": e.sourceKey, Alcance: "Mayor original; no capital remanente por vencimiento" }))} />}
    <DataTable data={entries} rowKey={e => e.sourceKey} pageSize={8} columns={[
      { key: "origin", header: "Origen", render: e => `${e.sourceSheet}!${e.sourceRow}` },
      { key: "operationDate", header: "Contabilización", render: e => e.operationDate || "Apertura sin fecha de operación" },
      { key: "endDate", header: "Vencimiento ERP", render: e => e.endDate || "Sin informar · revisar" },
      { key: "amount", header: "Importe original con signo", render: e => `${baseNumber(e.signedAmount)} ${e.currency}` },
      { key: "state", header: "Situación al corte", render: e => maturityDays(e.endDate, cutoff) === null ? "Revisar fecha" : e.signedAmount < 0 ? "Salida histórica de inversión" : e.endDate! < cutoff ? "Fecha vencida · revisar remanente" : e.endDate === cutoff ? "Vence al corte · revisar" : "Fecha futura" },
      { key: "description", header: "Detalle ERP", className: "!whitespace-normal", render: e => e.description },
    ]} />
  </section>;
}
