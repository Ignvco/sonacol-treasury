/** SAP export contract. This describes raw reports, never CAJA's planning sheets. */
export const ERP_PROFILE = "ERP-RAW-v1";
export const ERP_SHEETS = ["BANCOS", "CLIENTES", "COLOCACIONES"] as const;
export type ErpSheet = typeof ERP_SHEETS[number];
export const headerKey = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
export const ERP_HEADERS: Record<ErpSheet, Record<string, string>> = {
  BANCOS: { date: "Fecha de contabilización", dueDate: "Fecha de vencimiento", series: "Serie", erpDocument: "Nº documento", folio: "Nº folio", transaction: "Nº de transacción", ledger: "Cuenta asociada", description: "Comentarios", debit: "Cargo (ML)", credit: "Abono (ML)", reference: "Referencia 3 (Fila)" },
  CLIENTES: { erpDocument: "Nº documento", series: "Series de documentos", folio: "Nº folio", terms: "Número de plazos", customerCode: "Código de cliente", customer: "Nombre del cliente", overdueDays: "Días atrasados", reference: "Número de referencia de cliente", dueDate: "Fecha de vencimiento", amount: "Importe", issueDate: "Fecha de documento", installment: "Instalments", documentType: "Clase de documento", agreement: "Acuerdo global" },
  COLOCACIONES: { date: "Fecha de contabilización", transaction: "Nº trans.", origin: "Origen", erpDocument: "Número de origen", reference: "Referencia 3", counterpart: "Cuenta de contrapartida", description: "Info.detallada", net: "C/D (ML)", balance: "Saldo acumulado (ML)", foreignNet: "C/D (ME)", foreignCredit: "Crédito (ME)", debit: "Cargo (ML)", credit: "Abono (ML)", ledger: "SN/Código de cuenta", agreement: "Acuerdo global" },
};

export function erpSheetNames(names: string[]): Map<ErpSheet, string> | null {
  const result = new Map<ErpSheet, string>();
  for (const expected of ERP_SHEETS) {
    const matches = names.filter(n => n.trim().toUpperCase() === expected);
    if (matches.length > 1) throw new Error(`Hay más de una hoja ${expected}.`);
    if (matches[0]) result.set(expected, matches[0]);
  }
  if (!result.has("BANCOS")) return null;
  const missing = ERP_SHEETS.filter(n => !result.has(n));
  if (missing.length) throw new Error(`El perfil ERP requiere las hojas ${missing.join(", ")}. No requiere BASE ni MANUAL.`);
  return result;
}
