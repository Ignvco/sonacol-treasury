import * as XLSX from "xlsx";
/** Anonymous SAP-shaped reports with repeated postings and partial redemptions. */
export function erpWorkbook() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Fecha de contabilización", "Fecha de vencimiento", "Serie", "Nº documento", "Nº folio", "Nº de transacción", "Cuenta asociada", "Comentarios", "Cargo (ML)", "Abono (ML)", "Referencia 3 (Fila)"],
    ["Activos", "BANK-01", null, null, null, null, null, "Banco de prueba", "CLP 1.000"],
    ["02/09/2026", "02/09/2026", "Primario", "JE 01", null, 100, "BANK-01", "Pago repetido", null, "CLP 100"],
    ["02/09/2026", "02/09/2026", "Primario", "JE 01", null, 100, "BANK-01", "Pago repetido", null, "CLP 100"],
    ["03/09/2026", "03/09/2026", "Primario", "RC 02", null, 101, "BANK-01", "Cobro", "CLP 500"],
  ]), "BANCOS");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Nº documento", "Series de documentos", "Nº folio", "Número de plazos", "Código de cliente", "Nombre del cliente", "Días atrasados", "Número de referencia de cliente", "Fecha de vencimiento", "Importe", "Fecha de documento", "Instalments", "Clase de documento", "Acuerdo global"],
    [900, "Primario", "FE-500", "1 de 1", "C001", "Cliente de prueba", 0, null, "20/09/2026", "CLP 2.000", "01/09/2026", 1, "Facturas clientes"],
  ]), "CLIENTES");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ["Fecha de contabilización", "Nº trans.", "Origen", "Número de origen", "Referencia 3", "Cuenta de contrapartida", "Info.detallada", "C/D (ML)", "Saldo acumulado (ML)", "C/D (ME)", "Crédito (ME)", "Cargo (ML)", "Abono (ML)", "SN/Código de cuenta", "Acuerdo global"],
    [null, null, "OB", null, null, null, null, null, "CLP 10.000", null, null, null, null, "FUND-01"],
    ["02/09/2026", 200, "JE", 300, null, "BANK-01", "Aporte", "CLP 5.000", "CLP 15.000", null, null, "CLP 5.000", null, "FUND-01"],
    ["03/09/2026", 200, "RC", 301, null, "BANK-01", "Rescate", "CLP (2.000)", "CLP 13.000", null, null, null, "CLP 2.000", "FUND-01"],
  ]), "COLOCACIONES");
  return wb;
}
export const erpContext = { ERP: { company: "TEST", localCurrency: "CLP", cutoffDate: "2026-09-10", periodStart: "2026-09-01", investmentPeriodStart: "2026-09-01" } };
export function workbookBytes(wb = erpWorkbook()): ArrayBuffer {
  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
