import type { WorkBook } from "xlsx";
import { cellText } from "./detect";

/** SAP export contract. This describes raw reports, never CAJA's planning sheets. */
export const ERP_PROFILE = "ERP-RAW-v1";
export const ERP_SHEETS = ["BANCOS", "CLIENTES", "COLOCACIONES"] as const;
export const ERP_REPORTS = [...ERP_SHEETS, "SALDOS BANCOS"] as const;
export type ErpSheet = typeof ERP_REPORTS[number];
export const headerKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const ERP_HEADERS: Record<ErpSheet, Record<string, string>> = {
  "SALDOS BANCOS": { ledger: "Cuenta asociada", bank: "Banco", opening: "Saldo Inicial" },
  BANCOS: { date: "Fecha de contabilización", dueDate: "Fecha de vencimiento", series: "Serie", erpDocument: "Nº documento", folio: "Nº folio", transaction: "Nº de transacción", ledger: "Cuenta asociada", description: "Comentarios", debit: "Cargo (ML)", credit: "Abono (ML)", reference: "Referencia 3 (Fila)" },
  CLIENTES: { erpDocument: "Nº documento", series: "Series de documentos", folio: "Nº folio", terms: "Número de plazos", customerCode: "Código de cliente", customer: "Nombre del cliente", overdueDays: "Días atrasados", reference: "Número de referencia de cliente", dueDate: "Fecha de vencimiento", amount: "Importe", issueDate: "Fecha de documento", installment: "Instalments", documentType: "Clase de documento", agreement: "Acuerdo global" },
  COLOCACIONES: { date: "Fecha de contabilización", transaction: "Nº trans.", origin: "Origen", erpDocument: "Número de origen", reference: "Referencia 3", counterpart: "Cuenta de contrapartida", description: "Info.detallada", net: "C/D (ML)", balance: "Saldo acumulado (ML)", foreignNet: "C/D (ME)", foreignCredit: "Crédito (ME)", debit: "Cargo (ML)", credit: "Abono (ML)", ledger: "SN/Código de cuenta", agreement: "Acuerdo global" },
};

/** Identify reports by their complete schema, independent of daily export tab names.
 * The caller reads only the first 50 rows; financial data is read after resolution. */
export function erpSheetNames(workbook: WorkBook): Map<ErpSheet, string> {
  const result = new Map<ErpSheet, string>();
  for (const name of workbook.SheetNames) {
    const rows = new Map<number, Set<string>>();
    for (const [address, cell] of Object.entries(workbook.Sheets[name] ?? {})) {
      const coordinate = /^[A-Z]{1,3}([1-9]\d?)$/.exec(address);
      if (!coordinate || Number(coordinate[1]) > 50) continue;
      const row = Number(coordinate[1]), keys = rows.get(row) ?? new Set<string>();
      keys.add(headerKey(cellText(cell))); rows.set(row, keys);
    }
    const matches = ERP_REPORTS.filter(kind => [...rows.values()].some(keys => Object.values(ERP_HEADERS[kind]).every(label => keys.has(headerKey(label)))));
    if (headerKey(name) === "saldosbancos" && !matches.includes("SALDOS BANCOS")) throw new Error(`${name}: se requieren Cuenta asociada, Banco y Saldo Inicial. No se omitirá esta fuente de saldos.`);
    if (matches.length > 1) throw new Error(`La hoja «${name}» contiene varios reportes ERP. Exporta cada reporte en una hoja separada.`);
    for (const kind of matches) {
      if (result.has(kind)) throw new Error(`Hay más de un reporte ${kind}: «${result.get(kind)}» y «${name}». Conserva un único reporte por tipo en la exportación.`);
      result.set(kind, name);
    }
  }
  const missing = ERP_SHEETS.filter(n => !result.has(n));
  if (missing.length) throw new Error(`No se reconocieron los reportes ERP ${missing.join(", ")} con sus encabezados obligatorios en las primeras 50 filas. Hojas encontradas: ${workbook.SheetNames.join(", ") || "ninguna"}. Incluye los tres reportes completos de bancos, clientes e inversiones. ERP no requiere BASE ni MANUAL.`);
  return new Map(ERP_REPORTS.filter(kind => result.has(kind)).map(kind => [kind, result.get(kind)!]));
}
