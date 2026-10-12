import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { decisionDb, query, upload, row, hash, session, reader } from "./helpers/decision-db";
import { erpContext, erpWithoutInvestmentOpening, renamedErpWorkbook, workbookBytes } from "./helpers/erp-workbook";
import { snapshotRows, type RawSnapshot } from "../src/financial-engine/snapshot";
import { baseTreasury } from "../src/financial-engine/base-treasury";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";
import type { ProcessedRecord } from "../src/import-engine/types";
let db: PGlite, records: ProcessedRecord[];
before(async () => { db = await decisionDb(); records = processWorkbook(await parseWorkbook(workbookBytes()), undefined, erpContext).records; });
after(() => db?.close());
async function commit(name: string, input = records) {
  const preview = await query(db, "select compare_erp_import($1::jsonb) s", [JSON.stringify(input.map(({ raw: _raw, ...r }) => r))]);
  return query(db, "select import_erp_daily($1,$2,$3::jsonb,$4) s", [name, hash(name), JSON.stringify(input), preview.revision]);
}

test("installed ERP accepts renamed daily reports after upgrade, preserving adjustments, manual work, history and idempotence", async () => {
 const isolated = await decisionDb("20260926050000000");
 try {
  const save = async (input: ProcessedRecord[]) => {
   const p = await query(isolated, "select compare_erp_import($1::jsonb) s", [JSON.stringify(input)]);
   return query(isolated, "select import_erp_daily('ERP.xlsm',$1,$2::jsonb,$3) s", [hash(JSON.stringify(input)), JSON.stringify(input), p.revision]);
  };
  const first = await save(records);
  const old: RawSnapshot = await query(isolated, "select get_daily_base_snapshot($1) s", [first.id]);
  const invoice = old.rows.find(r => r.kind === "invoice")!;
  await query(isolated, "select treasury_save_business($1,null,null,'adjustment',$2,$3::jsonb,false) s", [first.id, invoice.normalized.businessKey, JSON.stringify({ date: "2026-09-28" })]);
  await query(isolated, "select treasury_save_manual($1,null,null,$2::jsonb,'{}'::jsonb) s", [first.id, JSON.stringify({ date: "2026-09-26", amount: 90, currency: "CLP", type: "expense", category: "payroll", status: "proyectado", description: "Compromiso conservado" })]);
  const renamed = processWorkbook(await parseWorkbook(workbookBytes(renamedErpWorkbook(), "xlsm")), undefined, erpContext).records;
  await assert.rejects(save(renamed), /Fila ERP inválida/);
  await isolated.exec("reset role");
  await isolated.exec(await readFile("supabase/migrations/20260926050000000_erp_report_sheet_names.sql", "utf8")); await session(isolated);
  assert.equal((await save(renamed)).id, first.id); // A change of tab labels alone is not a new financial snapshot.
  renamed.forEach(r => { r.normalized.cutoffDate = "2026-09-11"; });
  const next = await save(renamed), snap: RawSnapshot = await query(isolated, "select get_daily_base_snapshot($1) s", [next.id]);
  assert.notEqual(next.id, first.id);
  assert.equal(snap.rows.find(r => r.kind === "invoice")!.normalized.adjustedDate, "2026-09-28");
  assert.equal(snap.manual.length, 1);
  assert.equal(baseTreasury(snapshotRows(snap), snap.links, snap.batch!.cutoff, 30, "CLP").available, 1300);
  assert.equal(snap.rows.find(r => r.kind === "invoice")!.normalized.sourceSheet, "Cuentas por cobrar");
  assert.deepEqual((await query(isolated, "select get_daily_base_snapshot($1) s", [first.id])).rows.map((r: { recordId: string }) => r.recordId), old.rows.map(r => r.recordId));
  assert.equal((await save(renamed)).id, next.id);
  const invalid = structuredClone(renamed); invalid[0].normalized.sourceOrigin = "CLIENTES";
  await assert.rejects(save(invalid), /reporte|moneda ERP inválidos/);
  const mixed = structuredClone(renamed); mixed[0].sheet = "Otra hoja"; mixed[0].normalized.sourceSheet = "Otra hoja";
  await assert.rejects(save(mixed), /única hoja/);
  const wrongCoordinate = structuredClone(renamed); wrongCoordinate[0].normalized.sourceSheet = "Otra hoja";
  await assert.rejects(save(wrongCoordinate), /Fila ERP inválida/);
  await session(isolated, reader); await assert.rejects(save(renamed), /pendiente|rol/);
 } finally { await isolated.close(); }
});
test("ERP SQL accepts repeated row numbers across sheets, carries every MANUAL and keeps historical snapshots", async () => {
  const legacy = await upload(db, "old-caja", [row("BANCO", 9, { cutoffDate: "2026-09-01", date: "2026-09-01" }), row("MANUAL", 10, { cutoffDate: "2026-09-01", date: "2026-09-25" })]);
  const saved = await commit("erp-raw"); assert.equal(saved.imported_records, 8);
  const snapshot = await query(db, "select get_daily_base_snapshot($1) s", [saved.id]);
  assert.equal(snapshot.manual.length, 1);
  const old = await query(db, "select get_daily_base_snapshot($1) s", [legacy.id]); assert.equal(old.manual.length, 1);
  const count = await query(db, "select count(*)::int s from daily_base_rows where batch_id=$1 and source_row=2", [saved.id]); assert.equal(count, 3);
});
test("ERP repeated content with another workbook hash is idempotent", async () => {
  const a = await commit("erp-raw"), b = await commit("saved-again", [...records].reverse()); assert.equal(a.id, b.id);
});
test("ERP server rejects inconsistent ledger balances and forged planning values atomically", async () => {
  const bad = structuredClone(records); bad.find(r => r.normalized.recordRole === "investment_movement")!.normalized.balance = 1;
  await assert.rejects(commit("bad-ledger", bad), /Saldo acumulado/);
  const adjusted = structuredClone(records); adjusted[0].normalized.adjustedDate = "2026-09-20";
  await assert.rejects(commit("forged-planning", adjusted), /planificación/);
});
test("ERP permissions prevent read-only users from importing", async () => {
  await session(db, reader);
  await assert.rejects(commit("forbidden"), /pendiente|rol/);
  await session(db);
});

test("CAJA transition carries verified invoice dates and retains uncertain invoices and rescues for allocation", async () => {
 const isolated = await decisionDb();
 try {
  const invoice = records.find(r => r.entityType === "invoice")!.normalized;
  await upload(isolated, "worked-caja", [row("BANCO", 9, { date: "2026-09-01", cutoffDate: "2026-09-01" }),
   row("CLIENTES", 10, { amount: invoice.amount, customer: invoice.customer, document: invoice.document, issueDate: invoice.issueDate, dueDate: invoice.dueDate, reportDate: "2026-09-25", cutoffDate: "2026-09-01" }),
   row("CLIENTES", 11, { customer: "Nombre sin correspondencia", reportDate: "2026-09-28", cutoffDate: "2026-09-01" }),
   row("COLOCACIONES", 12, { amount: 5000, endDate: "2026-09-26", reportDate: "2026-09-26", cutoffDate: "2026-09-01" })]);
  const p = await query(isolated, "select compare_erp_import($1::jsonb) s", [JSON.stringify(records)]);
  const b = await query(isolated, "select import_erp_daily($1,$2,$3::jsonb,$4) s", ["erp", hash("erp-transition"), JSON.stringify(records), p.revision]);
  const snap = await query(isolated, "select get_daily_base_snapshot($1) s", [b.id]);
  assert.equal(snap.rows.find((r: { kind: string }) => r.kind === "invoice").normalized.adjustedDate, "2026-09-25");
  assert.equal(snap.business.length, 3);
  assert.equal(snap.business.filter((d: { target_key: string }) => d.target_key.startsWith("legacy:")).length, 2);
  // Two unresolved CAJA decisions plus the missing expense-plan coverage notice.
  const issues: string[] = snap.businessIssues;
  assert.equal(issues.length, 3);
  assert.equal(issues.filter(message => message.startsWith("Ajuste sin registro en la cobertura actual: ")).length, 1);
  assert.equal(issues.filter(message => message.startsWith("Rescate ") && message.endsWith("La cuenta receptora ya no está en la cobertura o cambió de moneda.")).length, 1);
  assert.ok(issues.includes("No hay compromisos de egreso incorporados en esta versión. Revisa el plan inicial en Planificación; los abonos históricos no generan pagos futuros."));
  assert.equal(snap.manual[0].normalized.amount, 5000);
  assert.equal(snap.manual[0].normalized.status, "borrador");
 } finally { await isolated.close(); }
});

test("SQL reconstructs omitted OB, preserves raw postings and does not double count explicit openings", async () => {
 const next = processWorkbook(await parseWorkbook(workbookBytes(erpWithoutInvestmentOpening())), undefined, erpContext).records;
 const b = await commit("no-opening", next);
 const snap: RawSnapshot = await query(db, "select get_daily_base_snapshot($1) s", [b.id]);
 const p = snap.rows.find(r => r.kind === "investment")!;
 assert.equal(p.normalized.amount, 13000); assert.equal(p.normalized.inferredOpeningBalance, 10000);
 assert.equal(p.normalized.openingSourceRow, 3); assert.equal(p.normalized.traceRecords.length, 2);
 assert.equal(await query(db, "select count(*)::int s from daily_base_rows where batch_id=$1", [b.id]), 7);
 assert.equal(baseTreasury(snapshotRows(snap), [], snap.batch!.cutoff, 30, "CLP").invested, 13000);
 // Includes the 100 MANUAL carried by the earlier CAJA test, never investment capital.
 assert.equal(baseTreasury(snapshotRows(snap), [], snap.batch!.cutoff, 30, "CLP").collections, 2100);
 assert.equal(baseTreasury(snapshotRows(snap), [], snap.batch!.cutoff, 30, "CLP").events.filter(r => r.kind === "investment").length, 0);
 const original = await commit("with-opening", records);
 const old: RawSnapshot = await query(db, "select get_daily_base_snapshot($1) s", [original.id]);
 assert.equal(old.rows.find(r => r.kind === "investment")!.normalized.amount, 13000);
 assert.equal(old.rows.find(r => r.kind === "investment")!.normalized.inferredOpeningBalance, undefined);
 const repeated = await commit("no-opening-renamed", next); assert.equal(repeated.id, b.id);
});

test("SQL independently verifies inferred opening and all later cumulative balances", async () => {
 const next = processWorkbook(await parseWorkbook(workbookBytes(erpWithoutInvestmentOpening())), undefined, erpContext).records;
 const forged = structuredClone(next); forged.find(r => r.entityType === "investment")!.normalized.inferredOpeningBalance = 0;
 await assert.rejects(commit("forged-opening", forged), /Apertura calculada no coincide/);
 const bad = structuredClone(next); bad.filter(r => r.entityType === "investment")[1].normalized.balance = 12000;
 await assert.rejects(commit("no-opening-bad-balance", bad), /Saldo acumulado/);
 const bare = structuredClone(next); delete bare.find(r => r.entityType === "investment")!.normalized.inferredOpeningBalance;
 const b = await commit("server-derives-opening", bare);
 const snap: RawSnapshot = await query(db, "select get_daily_base_snapshot($1) s", [b.id]);
 assert.equal(snap.rows.find(r => r.kind === "investment")!.normalized.amount, 13000);
 const absent = structuredClone(next); delete absent.find(r => r.entityType === "investment")!.normalized.balance;
 await assert.rejects(commit("no-first-balance", absent), /Saldo acumulado/);
});

test("omitted opening is derived per account and supports a first withdrawal", async () => {
 const next = processWorkbook(await parseWorkbook(workbookBytes(erpWithoutInvestmentOpening())), undefined, erpContext).records;
 const extra = structuredClone(next.filter(r => r.entityType === "investment"));
 extra.forEach((r, i) => { r.row = 5 + i; r.normalized.ledgerCode = "FUND-02"; });
 Object.assign(extra[0].normalized, { signedAmount: -2000, amount: 2000, type: "expense", debe: 0, haber: 2000, balance: 8000, inferredOpeningBalance: 10000 });
 extra[1].normalized.balance = 6000;
 const b = await commit("two-investment-accounts", [...next, ...extra]);
 const snap: RawSnapshot = await query(db, "select get_daily_base_snapshot($1) s", [b.id]);
 assert.equal(snap.rows.find(r => r.normalized.ledgerCode === "FUND-01")!.normalized.amount, 13000);
 assert.equal(snap.rows.find(r => r.normalized.ledgerCode === "FUND-02")!.normalized.amount, 6000);
});
