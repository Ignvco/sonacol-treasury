import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import type { PGlite } from "@electric-sql/pglite";
import { erpContext, erpWithBankBalances, erpWorkbook, workbookBytes } from "./helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";
import { bankControls, erpBankSigned } from "../src/financial-engine/bank-control";
import { snapshotRows, type RawSnapshot } from "../src/financial-engine/snapshot";
import { snapshotProjection } from "../src/financial-engine/projection";
import { executiveReport } from "../src/financial-engine/report";
import { decisionDb, query, session, reader } from "./helpers/decision-db";
import { importErp } from "./helpers/caja-migration";
import type { ProcessedRecord } from "../src/import-engine/types";
const context = { ERP: { ...erpContext.ERP, company: "SONACOL" } };
const parse = async (wb = erpWithBankBalances()) => processWorkbook(await parseWorkbook(workbookBytes(wb, "xlsm")), undefined, context);
let db: PGlite;
before(async () => { db = await decisionDb(); });
after(() => db?.close());

test("separate balances read actual coordinates, footer and accounts without movements; Cargo adds and Abono subtracts", async () => {
 const p = await parse(), [a, b] = bankControls(p.records);
 assert.equal(p.records.filter(r => r.status === "ERROR").length, 0);
 assert.deepEqual([a.opening, a.income, a.expense, a.calculated, a.reported, a.difference], [1000000, 500000, 200000, 1300000, null, null]);
 assert.deepEqual([b.opening, b.movements, b.calculated], [500, 0, 500]);
 const opening = p.records.find(r => r.sheet === "SALDOS BANCOS")!;
 assert.equal(opening.row, 3); assert.equal(opening.normalized.date, "2026-08-31");
 assert.ok(opening.raw["C3 · Saldo Inicial"]);
 const expense = p.records.find(r => r.normalized.haber === 200000)!;
 assert.equal(expense.normalized.type, "expense"); assert.equal(expense.normalized.signedAmount, -200000);
 assert.equal(p.sheets.find(s => s.name === "SALDOS BANCOS")!.reading!.headerRow, 2);
});

test("zero and negative opening balances, negative final cash and reordered balance columns are preserved", async () => {
 const wb = erpWithBankBalances();
 wb.Sheets["SALDOS BANCOS"] = XLSX.utils.aoa_to_sheet([["Banco", "Saldo Inicial", "Cuenta asociada"], ["Banco de prueba", -400000, "BANK-01"], ["Banco sin movimientos", 0, "BANK-02"]]);
 const p = await parse(wb), c = bankControls(p.records);
 assert.equal(p.records.filter(r => r.status === "ERROR").length, 0);
 assert.equal(c[0].calculated, -100000); assert.equal(c[1].calculated, 0);
 assert.equal(c[0].reported, null);
});

test("missing, duplicate or invalid opening accounts never become invented zero balances", async () => {
 for (const mutate of [
  (s: XLSX.WorkSheet) => { delete s.C3; },
  (s: XLSX.WorkSheet) => { s.A4 = { t: "s", v: "BANK-01" }; },
  (s: XLSX.WorkSheet) => { s.A3 = { t: "s", v: "UNKNOWN" }; },
  (s: XLSX.WorkSheet) => { s.C3 = { t: "s", v: "no es importe" }; },
  (s: XLSX.WorkSheet) => { s.C3 = { t: "e", v: 7, f: "1/0" }; },
 ]) {
  const wb = erpWithBankBalances(); mutate(wb.Sheets["SALDOS BANCOS"]);
  assert.ok((await parse(wb)).records.some(r => r.status === "ERROR"));
 }
 const bad = erpWithBankBalances(); delete bad.Sheets["SALDOS BANCOS"].B2;
 await assert.rejects(parse(bad), /SALDOS BANCOS/);
 const currency = erpWithBankBalances();
 XLSX.utils.sheet_add_aoa(currency.Sheets["SALDOS BANCOS"], [["Saldo Final"], ["USD 1.300.000"]], { origin: "D2" });
 assert.ok((await parse(currency)).records.some(r => r.status === "ERROR" && /moneda/i.test(r.warnings)));
});

test("reported closing is a control, never a second posting; differences include the affected account", async () => {
 const wb = erpWithBankBalances();
 XLSX.utils.sheet_add_aoa(wb.Sheets["SALDOS BANCOS"], [["Saldo Final"], [1300000], [500]], { origin: "D2" });
 const ok = await parse(wb), controls = bankControls(ok.records);
 assert.equal(ok.records.filter(r => r.status === "ERROR").length, 0);
 assert.equal(controls[0].difference, 0); assert.equal(controls[0].calculated, 1300000);
 wb.Sheets["SALDOS BANCOS"].D3.v = 1299000;
 const bad = await parse(wb), [control] = bankControls(bad.records);
 assert.equal(control.difference, 1000);
 assert.match(control.issues.join(" "), /BANK-01.*1300000.*1299000.*1000/);
 assert.ok(bad.records.filter(r => r.normalized.ledgerCode === "BANK-01").every(r => r.status === "ERROR"));
});

test("two opening sources are rejected even when their amounts agree", async () => {
 const wb = erpWithBankBalances();
 const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.BANCOS, { header: 1 });
 rows.splice(1, 0, ["Activos", "BANK-01", null, null, null, null, null, "Banco de prueba", "CLP 1.000.000"]);
 wb.Sheets.BANCOS = XLSX.utils.aoa_to_sheet(rows);
 await assert.rejects(parse(wb), /apertura con importe además de SALDOS BANCOS/);
 wb.Sheets.BANCOS.I2.v = "CLP 999";
 await assert.rejects(parse(wb), /apertura con importe además de SALDOS BANCOS/);
});

test("SQL, classified snapshot, projection opening and executive report retain exactly the bank equation", async () => {
 const p = await parse();
 const saved = await importErp(db, "balances.xlsm", p.records);
 const snap: RawSnapshot = await query(db, "select get_daily_base_snapshot($1) s", [saved.id]);
 const rows = snapshotRows(snap), expense = rows.find(r => r.normalized?.haber === 200000)!;
 assert.equal(expense.normalized!.category, "bank_credit"); // ABONO classification cannot turn an expense into income.
 assert.equal(expense.type, "expense"); assert.equal(erpBankSigned(expense.normalized!), -200000);
 const model = snapshotProjection({ rows, links: snap.links, cutoff: snap.batch!.cutoff });
 assert.equal(model.available, 1300500); assert.equal(model.daily[0].initial, 1300500);
 assert.equal(model.positions.find(r => r.ledger === "BANK-02")!.amount, 500);
 assert.equal(model.events.some(r => r.origin === "BANCO"), false); // Already applied bank rows are not forecast again.
 const report = executiveReport(rows, snap.links, { cutoff: snap.batch!.cutoff, currency: "CLP", horizon: 30, minimum: 0 }, { id: saved.id, fileName: "balances.xlsm", revision: "test" });
 assert.equal(report.model.available, model.available);
 assert.match(JSON.stringify(report.sections.find(s => s.title === "Control bancario")), /No informado.*No comprobable/);
 assert.equal((await importErp(db, "balances-renamed.xlsm", p.records)).id, saved.id);
 const forged = structuredClone(snap); forged.rows.find(r => r.normalized.haber === 200000)!.normalized.type = "income";
 assert.throws(() => snapshotRows(forged), /Ingreso\/egreso/);
});

test("server independently rejects missing openings, positive expenses, forged controls and different periods atomically", async () => {
 const p = await parse();
 const saved = await importErp(db, "server-good.xlsm", p.records);
 const reject = async (alter: (records: ProcessedRecord[]) => ProcessedRecord[] | void, expected: RegExp) => {
  const copy = structuredClone(p.records); const bad = alter(copy) ?? copy;
  for (const r of bad) { r.status = "VALID"; r.warnings = ""; }
  await assert.rejects(importErp(db, "server-bad.xlsm", bad), expected);
  assert.equal((await query(db, "select get_daily_base_snapshot(null) s")).batch.id, saved.id);
 };
 await reject(rows => rows.filter(r => !(r.normalized.recordRole === "bank_opening" && r.normalized.ledgerCode === "BANK-01")), /saldo inicial|sin apertura/);
 await reject(rows => { rows.find(r => r.normalized.haber === 200000)!.normalized.type = "income"; }, /signo|tipo|importe/i);
 await reject(rows => { rows.find(r => r.normalized.haber === 200000)!.normalized.signedAmount = 200000; }, /signo|Cargo|importe/i);
 await reject(rows => { rows.find(r => r.normalized.recordRole === "bank_opening")!.normalized.bankReportedClosing = 1; }, /BANK-01.*2026-09-01.*1300000.*1299999/);
 await reject(rows => { rows.find(r => r.normalized.recordRole === "bank_movement")!.normalized.periodStart = "2026-09-02"; }, /primer día del mes/i);
 await reject(rows => { rows.find(r => r.normalized.recordRole === "bank_opening")!.normalized.bankBalanceSource = "BANCOS"; }, /fuente del saldo|sin apertura/);
 await session(db, reader); await assert.rejects(importErp(db, "forbidden.xlsm", p.records), /pendiente|rol/); await session(db);
});

test("migration upgrades an installed ERP without losing decisions or rewriting past bank balances", async () => {
 const isolated = await decisionDb("20260927000000000");
 try {
  const oldRows = processWorkbook(await parseWorkbook(workbookBytes(erpWorkbook())), undefined, context).records;
  const first = await importErp(isolated, "previous.xlsm", oldRows);
  const old: RawSnapshot = await query(isolated, "select get_daily_base_snapshot($1) s", [first.id]);
  const invoice = old.rows.find(r => r.kind === "invoice")!;
  await query(isolated, "select treasury_save_business($1,null,null,'adjustment',$2,$3::jsonb,false) s", [first.id, invoice.normalized.businessKey, JSON.stringify({ date: "2026-09-28" })]);
  await query(isolated, "select treasury_save_manual($1,null,null,$2::jsonb,'{}'::jsonb) s", [first.id, JSON.stringify({ date: "2026-09-26", amount: 90, currency: "CLP", type: "expense", category: "payroll", status: "proyectado", description: "Compromiso conservado" })]);
  const newRows = (await parse()).records;
  await assert.rejects(importErp(isolated, "new.xlsm", newRows), /hoja|cobertura/i);
  await isolated.exec("reset role");
  await isolated.exec(await readFile("supabase/migrations/20260927000000000_erp_bank_balances.sql", "utf8")); await session(isolated);
  const next = await importErp(isolated, "new.xlsm", newRows);
  const current: RawSnapshot = await query(isolated, "select get_daily_base_snapshot($1) s", [next.id]);
  assert.equal(current.manual.length, 1);
  assert.equal(current.rows.find(r => r.kind === "invoice")!.normalized.adjustedDate, "2026-09-28");
  assert.equal(snapshotProjection({ rows: snapshotRows(current), links: current.links, cutoff: current.batch!.cutoff }).available, 1300500);
  const historic: RawSnapshot = await query(isolated, "select get_daily_base_snapshot($1) s", [first.id]);
  assert.deepEqual(historic.rows.filter(r => r.kind === "cash_flow"), old.rows.filter(r => r.kind === "cash_flow"));
  assert.equal((await importErp(isolated, "same.xlsm", newRows)).id, next.id);
 } finally { await isolated.close(); }
});
