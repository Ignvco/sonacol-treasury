import * as XLSX from "xlsx";
import { cellText, cellToDate, cellToNumber, isErrorCell } from "./detect";
import { ERP_HEADERS, ERP_PROFILE, headerKey, type ErpSheet } from "./erp-profile";
import { MAX_IMPORT_ROWS, type ProcessedRecord } from "./types";
import type { WorkSheetData } from "./pipeline";

const text = (v: unknown) => cellText(v).trim();
const moneyCurrency = (v: unknown) => text(v).match(/\b(CLP|USD|UF|UTM)\b/i)?.[1].toUpperCase();

/** Sparse cell traversal preserves Excel coordinates and avoids formatted empty ranges. */
export function readErp(wb: XLSX.WorkBook, names: Map<ErpSheet, string>): WorkSheetData[] {
  const sheets: WorkSheetData[] = [];
  const occurrences = new Map<string, number>();
  let count = 0;
  for (const [kind, name] of names) {
    const ws = wb.Sheets[name], rows = new Map<number, Map<number, XLSX.CellObject>>();
    for (const [address, value] of Object.entries(ws)) {
      if (!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(address) || (!text(value) && !value.f)) continue;
      const { r, c } = XLSX.utils.decode_cell(address);
      if (r > 1048575 || c > 16383) throw new Error(`${name}: dirección inválida ${address}.`);
      const cells = rows.get(r + 1) ?? new Map();
      cells.set(c, { ...value, date1904: !!wb.Workbook?.WBProps?.date1904 }); rows.set(r + 1, cells);
      if (rows.size > MAX_IMPORT_ROWS + 100) throw new Error(`${name} supera el límite de filas de importación.`);
    }
    const ordered = [...rows.keys()].sort((a, b) => a - b);
    const schema = ERP_HEADERS[kind];
    const header = ordered.filter(r => r <= 50).find(r => {
      const keys = new Set([...rows.get(r)!.values()].map(c => headerKey(text(c))));
      return Object.values(schema).every(label => keys.has(headerKey(label)));
    });
    if (!header) throw new Error(`${name}: faltan encabezados del perfil ERP. Se esperan: ${Object.values(schema).join(", ")}.`);
    const columns: Record<string, number> = {};
    for (const [key, label] of Object.entries(schema)) {
      const matches = [...rows.get(header)!].filter(([, c]) => headerKey(text(c)) === headerKey(label));
      if (matches.length !== 1) throw new Error(`${name}: encabezado duplicado «${label}».`);
      columns[key] = matches[0][0];
    }
    const records: ProcessedRecord[] = [];
    let bankLedger = "", bank = "", bankCurrency = "", skipped = 0;
    const bankGroups = new Set<string>();
    const balances = new Map<string, number>();
    for (const row of ordered.filter(r => r > header)) {
      const cells = rows.get(row)!;
      const get = (key: string) => cells.get(columns[key]);
      const value = (key: string) => text(get(key));
      const errors: string[] = [], warnings: string[] = [];
      const required = (key: string) => {
        const v = value(key); if (!v) errors.push(`${schema[key]} no informado.`); return v;
      };
      const date = (key: string, optional = false) => {
        const v = cellToDate(get(key)).iso;
        if ((!optional || value(key)) && !v) errors.push(`${schema[key]} contiene una fecha inválida.`);
        return v;
      };
      const number = (key: string, blankZero = false) => {
        const v = cellToNumber(get(key));
        if (v === null && !(blankZero && !value(key))) errors.push(`${schema[key]} contiene un importe inválido.`);
        return v ?? 0;
      };
      for (const [key, col] of Object.entries(columns)) {
        const cell = cells.get(col);
        if (isErrorCell(cell) || (cell?.f && cell.v == null)) errors.push(`${XLSX.utils.encode_col(col)}${row} (${schema[key]}): error o fórmula sin resultado.`);
      }
      const n: Record<string, unknown> = {
        sourceProfile: ERP_PROFILE, sourceSheet: name,
        sourceOrigin: kind === "BANCOS" ? "BANCO" : kind,
        company: "SONACOL", currency: "", currencyKnown: true,
        account: null, reportDate: null, adjustedDate: null, status: "confirmado",
      };
      let signed = 0;
      if (kind === "BANCOS") {
        if (value("date").toUpperCase() === "ACTIVOS") {
          bankLedger = required("dueDate"); bank = required("description");
          bankCurrency = moneyCurrency(get("debit")) ?? moneyCurrency(get("credit")) ?? "";
          if (bankGroups.has(bankLedger)) errors.push("Cabecera de cuenta repetida; no se sumarán aperturas dos veces.");
          bankGroups.add(bankLedger);
          signed = number("debit", true) - number("credit", true);
          Object.assign(n, { recordRole: "bank_opening", date: null, description: "Saldo de apertura · " + bank });
        } else {
          if (!bankLedger) errors.push("Movimiento sin cabecera de cuenta Activos.");
          if (required("ledger") !== bankLedger) errors.push("La cuenta de la fila no coincide con su cabecera.");
          const debit = number("debit", true), credit = number("credit", true);
          if (debit < 0 || credit < 0 || (debit > 0 && credit > 0)) errors.push("Cargo/Abono inválidos o ambos lados con importe.");
          signed = debit - credit;
          Object.assign(n, { recordRole: "bank_movement", date: date("date"), dueDate: date("dueDate", true), transaction: required("transaction"), document: value("erpDocument"), erpDocument: value("erpDocument"), reference: value("reference"), series: value("series"), description: value("description"), debe: debit, haber: credit });
        }
        Object.assign(n, { bank, ledgerCode: bankLedger, currency: bankCurrency || moneyCurrency(get("debit")) || moneyCurrency(get("credit")) || "", category: signed < 0 ? "supplier" : "other_income" });
      } else if (kind === "CLIENTES") {
        signed = number("amount");
        Object.assign(n, { recordRole: "invoice", currency: moneyCurrency(get("amount")) ?? "", erpDocument: required("erpDocument"), document: value("folio").replace(/^FE-/, ""), originalFolio: value("folio"), customerCode: required("customerCode"), customer: required("customer"), rut: null, series: value("series"), installment: required("installment"), documentType: required("documentType"), issueDate: date("issueDate"), dueDate: date("dueDate"), originalDueDate: date("dueDate"), description: value("documentType") + " " + value("folio"), category: "collection", status: "por_vencer", bank: null, settlementBank: null });
      } else {
        const ledger = required("ledger"), opening = value("origin") === "OB";
        const balance = number("balance");
        const currency = moneyCurrency(get("balance")) ?? "";
        const balanceKey = ledger;
        if (value("foreignNet") || value("foreignCredit")) errors.push("Este perfil requiere importes en moneda local; declara un perfil multimoneda para datos ME.");
        if (opening) {
          if (balances.has(balanceKey)) errors.push("Apertura OB repetida para la misma posición.");
          signed = balance;
        } else {
          signed = number("net");
          const debit = number("debit", true), credit = number("credit", true);
          if (Math.abs(signed - debit + credit) > 0.005) errors.push("C/D no coincide con Cargo menos Abono.");
          if (!balances.has(balanceKey)) errors.push("Falta saldo OB anterior para la cuenta del fondo.");
          else if (Math.abs(balances.get(balanceKey)! + signed - balance) > 0.005) errors.push("Saldo acumulado inconsistente con el movimiento.");
          Object.assign(n, { date: date("date"), transaction: required("transaction"), debe: debit, haber: credit });
        }
        balances.set(balanceKey, balance);
        Object.assign(n, { recordRole: opening ? "investment_opening" : "investment_movement", currency, ledgerCode: ledger, balance, counterpartLedger: value("counterpart"), erpDocument: value("erpDocument"), reference: value("reference"), description: value("description") || "Saldo inicial de inversión", rateKnown: false, rate: null, interest: null, endDate: null, investmentType: "fondo_mutuo", status: "vigente", bank: null });
      }
      const monetaryKeys = kind === "CLIENTES" ? ["amount"] : kind === "BANCOS" ? ["debit", "credit"] : ["net", "balance", "debit", "credit"];
      if (!n.currency) n.currency = monetaryKeys.map(k => moneyCurrency(get(k))).find(Boolean) ?? "";
      if (monetaryKeys.some(k => moneyCurrency(get(k)) && moneyCurrency(get(k)) !== n.currency)) errors.push("Monedas incompatibles dentro de la fila o cuenta.");
      if (!Number.isSafeInteger(Math.round(Math.abs(signed) * 100))) errors.push("Importe fuera del rango monetario seguro.");
      const entityType = kind === "BANCOS" ? "cash_flow" : kind === "CLIENTES" ? "invoice" : "investment";
      Object.assign(n, { entityType, amount: Math.abs(signed), type: signed < 0 ? "expense" : "income", signedAmount: signed });
      // Identical postings retain multiplicity. Positions are assembled separately from these raw entries.
      const identity = JSON.stringify([n.recordRole, n.ledgerCode, n.erpDocument, n.transaction, n.customerCode, n.installment, n.series, n.documentType, ...(kind === "CLIENTES" ? [] : [n.date, n.counterpartLedger, signed, n.description])]);
      const occurrence = (occurrences.get(identity) ?? 0) + 1; occurrences.set(identity, occurrence);
      n.sourceId = `ERP:${identity}:${occurrence}`;
      if (occurrence > 1) warnings.push("Línea repetida conservada: el archivo no declara un identificador único de línea.");
      const raw = Object.fromEntries([...cells].map(([c, v]) => [`${XLSX.utils.encode_col(c)}${row} · ${text(rows.get(header)!.get(c))}`, { value: v.v ?? null, type: v.t, formula: v.f ?? null }]));
      records.push({ sheet: name, row, entityType, normalized: n, raw, status: errors.length ? "ERROR" : warnings.length ? "WARNING" : "VALID", warnings: [...errors, ...warnings].join(" · "), dedupeKey: String(n.sourceId) });
      if (++count > MAX_IMPORT_ROWS) throw new Error("ERP supera 20.000 registros financieros.");
    }
    skipped = Math.max(0, (ordered[ordered.length - 1] ?? header) - header - records.length);
    sheets.push({ name, rows: [], prepared: records, profile: ERP_PROFILE, headerIndex: header, reading: { profileId: ERP_PROFILE, sheetName: name, headerRow: header, firstDataRow: records[0]?.row ?? null, lastDataRow: records[records.length - 1]?.row ?? null, ignoredRows: skipped, missingOptional: [], currencyColumn: "Importes ML", cutoffSource: "user", cutoff: null, workbookCutoff: null, cutoffFormula: null, lastBankDate: null, cutoffIssue: "Define corte e inicio del período ERP para importar." }, note: "Datos crudos ERP. Los ajustes, reglas y proyecciones se mantienen en la plataforma." });
  }
  const lastDate = sheets.flatMap(s => s.prepared ?? []).map(r => String(r.normalized.date ?? r.normalized.issueDate ?? "")).filter(Boolean).sort().slice(-1)[0] ?? null;
  for (const sheet of sheets) sheet.reading!.lastBankDate = lastDate;
  return sheets;
}
