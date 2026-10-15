import * as XLSX from "xlsx";
import { cellText, cellToNumber, cellToDate, isErrorCell } from "./detect";
import { ERP_HEADERS, ERP_PROFILE, headerKey } from "./erp-profile";
import { MAX_IMPORT_ROWS, type ProcessedRecord } from "./types";
import type { WorkSheetData } from "./pipeline";

/** Opening balances are source facts, never period income or an extra final-balance posting. */
export function readErpBankBalances(wb: XLSX.WorkBook, name: string) {
  const rows = new Map<number, Map<number, XLSX.CellObject>>();
  for (const [address, cell] of Object.entries(wb.Sheets[name])) {
    if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(address) || (!cellText(cell).trim() && !cell.f)) continue;
    const { r, c } = XLSX.utils.decode_cell(address), row = rows.get(r + 1) ?? new Map();
    row.set(c, cell); rows.set(r + 1, row);
    if (rows.size > MAX_IMPORT_ROWS + 100) throw new Error(`${name}: demasiadas filas.`);
  }
  const ordered = [...rows.keys()].sort((a, b) => a - b), schema = ERP_HEADERS["SALDOS BANCOS"];
  const header = ordered.find(r => r <= 50 && Object.values(schema).every(label => [...rows.get(r)!.values()].some(c => headerKey(cellText(c)) === headerKey(label))));
  if (!header) throw new Error(`${name}: faltan los encabezados de saldos bancarios.`);
  const columns: Record<string, number> = {};
  for (const [key, label] of Object.entries({ ...schema, closing: "Saldo Final" })) {
    const matches = [...rows.get(header)!].filter(([, c]) => headerKey(cellText(c)) === headerKey(label));
    if (matches.length > 1) throw new Error(`${name}: encabezado duplicado «${label}».`);
    if (matches.length) columns[key] = matches[0][0];
  }
  const dates = [...rows.get(header)!].filter(([, c]) => ["fecha", "fechadeapertura", "fechadesaldo", "fechadelsaldo"].includes(headerKey(cellText(c))));
  if (dates.length > 1) throw new Error(`${name}: varias columnas de fecha de apertura. Define una columna inequívoca.`);
  if (dates.length) columns.openingDate = dates[0][0];
  const records: ProcessedRecord[] = [], accounts = new Map<string, ProcessedRecord>();
  for (const row of ordered.filter(r => r > header)) {
    const cells = rows.get(row)!, get = (key: string) => cells.get(columns[key]), text = (key: string) => cellText(get(key)).trim();
    // The supplied export contains this explanatory footer, not an account or a numeric total.
    if (!text("ledger") && !text("bank") && cells.size === 1 && !get("opening")?.f && headerKey(text("opening")) === "saldofinalsaldoinicialcargoabono") continue;
    const errors: string[] = [], ledger = text("ledger"), bank = text("bank"), opening = cellToNumber(get("opening"));
    const openingCurrency = text("opening").match(/\b(CLP|USD|UF|UTM)\b/i)?.[1].toUpperCase();
    const closingCurrency = text("closing").match(/\b(CLP|USD|UF|UTM)\b/i)?.[1].toUpperCase();
    const currency = openingCurrency ?? closingCurrency ?? "";
    const closing = text("closing") ? cellToNumber(get("closing")) : null;
    const openingDate = columns.openingDate === undefined ? null : cellToDate({ ...get("openingDate"), date1904: !!wb.Workbook?.WBProps?.date1904 }).iso;
    if (columns.openingDate !== undefined && !openingDate) errors.push("Fecha de apertura vacía o inválida; no se reemplaza automáticamente.");
    if (!ledger || !bank) errors.push("Cuenta asociada y Banco son obligatorios.");
    if (opening === null || !Number.isSafeInteger(Math.round(opening * 100))) errors.push("Saldo Inicial inválido; una celda vacía no equivale a cero.");
    if (text("closing") && (closing === null || !Number.isSafeInteger(Math.round(closing * 100)))) errors.push("Saldo Final informado inválido.");
    if (closingCurrency && currency && closingCurrency !== currency) errors.push("Saldo Inicial y Saldo Final usan monedas distintas.");
    for (const [key, col] of Object.entries(columns)) {
      const cell = cells.get(col);
      if (isErrorCell(cell) || (cell?.f && cell.v == null)) errors.push(`${XLSX.utils.encode_col(col)}${row}: error o fórmula sin resultado (${key}).`);
    }
    const n = { sourceProfile: ERP_PROFILE, sourceOrigin: "BANCO", sourceSheet: name, recordRole: "bank_opening", bankBalanceSource: "SALDOS BANCOS", company: "SONACOL", currency, currencyKnown: true,
      ledgerCode: ledger, bank, date: null, openingDate, openingDateSource: columns.openingDate === undefined ? "declared_month" : `${name}!${XLSX.utils.encode_col(columns.openingDate)}${row}`, openingBasis: "monthly_opening", periodStart: null, reportDate: null, adjustedDate: null, status: "confirmado", entityType: "cash_flow",
      description: "Saldo de apertura · " + bank, category: "other_income", amount: Math.abs(opening ?? 0), signedAmount: opening ?? 0, type: (opening ?? 0) < 0 ? "expense" : "income",
      bankReportedClosing: closing, sourceId: `ERP:BANK-OPENING:${ledger}` };
    const raw = Object.fromEntries([...cells].map(([c, v]) => [`${XLSX.utils.encode_col(c)}${row} · ${cellText(rows.get(header)!.get(c))}`, { value: v.v ?? null, type: v.t, formula: v.f ?? null }]));
    const previous = accounts.get(ledger);
    if (previous) { errors.push("Cuenta repetida en SALDOS BANCOS."); previous.status = "ERROR"; previous.warnings = [previous.warnings, "Cuenta repetida en SALDOS BANCOS."].filter(Boolean).join(" · "); }
    const record: ProcessedRecord = { sheet: name, row, entityType: "cash_flow", normalized: n, raw, status: errors.length ? "ERROR" : "VALID", warnings: errors.join(" · "), dedupeKey: n.sourceId };
    records.push(record); accounts.set(ledger, record);
  }
  if (!records.length) throw new Error(`${name}: no contiene cuentas con saldo inicial.`);
  const sheet: WorkSheetData = { name, rows: [], prepared: records, profile: ERP_PROFILE, headerIndex: header, reading: { profileId: ERP_PROFILE, erpReport: "SALDOS BANCOS", sheetName: name, headerRow: header, firstDataRow: records[0].row, lastDataRow: records[records.length - 1].row, ignoredRows: ordered.length - records.length - 1, missingOptional: columns.closing === undefined ? ["Saldo Final informado"] : [], currencyColumn: "Saldo Inicial", cutoffSource: "user", cutoff: null, workbookCutoff: null, cutoffFormula: null, lastBankDate: null, cutoffIssue: "Define corte e inicio del período ERP para importar." } };
  return { accounts, sheet };
}
