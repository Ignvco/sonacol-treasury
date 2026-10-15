import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import type { PGlite } from "@electric-sql/pglite";
import { decisionDb, query, hash, session, reader } from "./helpers/decision-db";
import { importErp, migrationSnapshot } from "./helpers/caja-migration";
import { erpContext, erpWithBankBalances, workbookBytes } from "./helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";
import { bankControls } from "../src/financial-engine/bank-control";
import { snapshotRows } from "../src/financial-engine/snapshot";
import { baseTreasury } from "../src/financial-engine/base-treasury";
import type { ProcessedRecord } from "../src/import-engine/types";

const parse = async (wb = erpWithBankBalances(), cutoff = "2026-09-13") => processWorkbook(await parseWorkbook(workbookBytes(wb, "xls")), undefined, { ERP: { ...erpContext.ERP, cutoffDate: cutoff } });
const preview = (db: PGlite, records: ProcessedRecord[]) => query(db, "select compare_erp_import($1::jsonb) s", [JSON.stringify(records)]);
const cash = async (db: PGlite, id: string) => { const s = await migrationSnapshot(db, id); return baseTreasury(snapshotRows(s), s.links, s.batch!.cutoff, 30, "CLP").available; };
async function counts(db: PGlite) {
 await db.exec("reset role");
 const c = await query(db, "select jsonb_build_array((select count(*) from daily_base_batches),(select count(*) from daily_base_rows),(select count(*) from erp_bank_postings),(select count(*) from erp_monthly_openings),(select count(*) from erp_import_runs)) s");
 await session(db); return c;
}
function extra(records: ProcessedRecord[], id = "102", date = "2026-09-03") {
 const r = structuredClone(records.find(r => r.normalized.recordRole === "bank_movement" && r.normalized.type === "income")!);
 r.row = 100 + Number(id); Object.assign(r.normalized, { transaction: id, erpDocument: `RC ${id}`, document: `RC ${id}`, date, dueDate: date });
 return r; // Deliberately identical amount/description/date to an existing posting.
}

test("monthly baseline accepts first-of-month or previous closing date, preserves an absent source date, rejects incompatible periods", async () => {
 const p = await parse(); assert.equal(p.error, 0);
 const opening = p.records.find(r => r.normalized.recordRole === "bank_opening")!;
 assert.equal(opening.normalized.date, "2026-08-31"); assert.equal(opening.normalized.openingDate, null);
 assert.equal(opening.normalized.openingDateSource, "declared_month");
 for (const date of ["01/09/2026", "31/08/2026", "13/09/2026", "31/07/2026"]) {
  const wb = erpWithBankBalances(); XLSX.utils.sheet_add_aoa(wb.Sheets["SALDOS BANCOS"], [["Fecha"], [date], [date]], { origin: "D2" });
  const result = await parse(wb); assert.equal(result.error === 0, ["01/09/2026", "31/08/2026"].includes(date));
 }
 const db = await decisionDb();
 try {
  const first = await importErp(db, "month.xls", p.records); assert.equal(await cash(db, first.id), 1300500);
  for (const mutate of [(n: Record<string, unknown>) => { n.periodStart = "2026-09-13"; }, (n: Record<string, unknown>) => { n.openingDate = "2026-08-01"; }]) {
   const bad = structuredClone(p.records); mutate(bad.find(r => r.normalized.recordRole === "bank_opening")!.normalized);
   await assert.rejects(preview(db, bad), /primer día|incompatible/);
  }
 } finally { await db.close(); }
});

test("same-day overlap adds only new identities; reordered/partial/repeated files retain postings without accumulating openings", async () => {
 const db = await decisionDb();
 try {
  const p = await parse(), a = await importErp(db, "08h.xls", p.records);
  assert.deepEqual([a.incremental.movementsRead, a.incremental.newMovements, a.incremental.existingMovements], [2, 2, 0]);
  const again = await importErp(db, "08h-renamed.xls", [...p.records].reverse());
  assert.equal(again.id, a.id); assert.equal(again.incremental.newMovements, 0);
  const later = [...p.records, extra(p.records)];
  const b = await importErp(db, "13h.xls", later);
  assert.deepEqual([b.incremental.newMovements, b.incremental.existingMovements], [1, 2]);
  assert.equal(await cash(db, b.id), 1800500); assert.equal(await cash(db, a.id), 1300500);
  const partial = later.filter(r => r.normalized.haber !== 200000);
  const c = await importErp(db, "14h-without-old-expense.xls", partial);
  assert.equal(c.id, b.id); assert.equal(c.incremental.retainedMovements, 1); assert.equal(c.incremental.retainedNet, -200000);
  assert.equal(await cash(db, c.id), 1800500);
  assert.deepEqual((await counts(db)).slice(2, 4), [3, 2]);
  const rawCount = (await counts(db))[1];
  await importErp(db, "retry.xls", p.records);
  assert.equal((await counts(db))[1], rawCount); // A no-op does not create even another evidence snapshot.
 } finally { await db.close(); }
});

test("retained source coordinates, reconciliation and evidence-backed manual/redemption execution survive a new snapshot", async () => {
 const db = await decisionDb();
 try {
  const p = await parse(), a = await importErp(db, "first.xls", p.records), s = await migrationSnapshot(db, a.id);
  const receipt = s.rows.find(r => r.normalized.recordRole === "bank_movement" && r.normalized.type === "income")!;
  const expense = s.rows.find(r => r.normalized.recordRole === "bank_movement" && r.normalized.type === "expense")!;
  const [manual] = await query(db, "select treasury_save_manual($1,null,null,$2::jsonb,'{}'::jsonb) s", [a.id, JSON.stringify({ date: "2026-09-13", type: "expense", amount: 200000, currency: "CLP", category: "supplier", description: "Pago confirmado", status: "proyectado", bank: "Banco de prueba", bankLedger: "BANK-01" })]);
  await query(db, "select treasury_record_manual_execution($1,$2,$3,$4,200000,null) s", [a.id, manual.id, manual.revision, expense.recordId]);
  const rescue = await query(db, "select treasury_save_business($1,null,null,'redemption',$2,$3::jsonb,false) s", [a.id, s.rows.find(r => r.kind === "investment")!.normalized.businessKey, JSON.stringify({ date: "2026-09-13", amount: 500, currency: "CLP", status: "planned", bankLedger: "BANK-01" })]);
  await query(db, "select treasury_record_redemption_execution($1,$2,$3,$4,500,null) s", [a.id, rescue.id, rescue.revision, receipt.recordId]);
  const account = JSON.stringify(["Banco de prueba", "BANK-01"]);
  await query(db, "select treasury_import_statement('cartola',$1,$2,'CLP',$3::jsonb,null,null) s", [hash("statement"), account, JSON.stringify([{ date: "2026-09-02", amount: -200000, reference: "JE 01", description: "Pago" }])]);
  const recon = await query(db, "select treasury_reconciliation($1,'CLP') s", [account]);
  const match = await query(db, "select treasury_confirm_match($1,$2,'CLP',$3::jsonb,$4::jsonb,'Comprobante verificado') s", [a.id, account, JSON.stringify([{ id: expense.recordId, amount: 200000 }]), JSON.stringify([{ id: recon.transactions[0].id, amount: 200000 }])]);
  const before = await migrationSnapshot(db, a.id);
  const newLine = extra(p.records); newLine.row = 2; // Same source row, different source file.
  const incoming = [...p.records.filter(r => r.normalized.recordRole !== "bank_movement"), newLine];
  const review = await preview(db, incoming); assert.equal(review.refreshReview.blocking, false); assert.equal(review.refreshReview.verified, 2);
  const b = await importErp(db, "updated.xls", incoming), after = await migrationSnapshot(db, b.id);
  assert.equal(b.incremental.retainedMovements, 2); assert.equal(await cash(db, b.id), 1800500);
  assert.deepEqual(after.business!.find(r => r.id === rescue.id)!.execution_json, before.business!.find(r => r.id === rescue.id)!.execution_json);
  assert.deepEqual(after.manual.find(r => r.id === manual.id)!.normalized.executions, before.manual.find(r => r.id === manual.id)!.normalized.executions);
  assert.equal(after.rows.find(r => r.id === expense.id)!.normalized.sourceFileName, "first.xls");
  assert.deepEqual((await migrationSnapshot(db, a.id)).rows, before.rows);
  const kept = await query(db, "select treasury_reconciliation($1,'CLP') s", [account]);
  assert.equal(kept.matches[0].id, match); assert.equal(kept.matches[0].voided_at, null);
  assert.equal(kept.ledgerAllocations.find((x: { id: string }) => x.id === expense.id).amount, 200000);
  assert.equal(await query(db, "select count(*)::int s from daily_base_rows where id=$1", [expense.recordId]), 1);
 } finally { await db.close(); }
});

test("ambiguous duplicates and source corrections of amount, date, account, reference or description block atomically", async () => {
 const db = await decisionDb();
 try {
  const p = await parse(); await importErp(db, "base.xls", p.records); const before = await counts(db);
  const changes = [
   (r: ProcessedRecord) => { r.normalized.amount = 600000; r.normalized.signedAmount = 600000; r.normalized.debe = 600000; },
   (r: ProcessedRecord) => { r.normalized.date = "2026-09-04"; },
   (r: ProcessedRecord) => { r.normalized.ledgerCode = "BANK-02"; r.normalized.bank = "Banco sin movimientos"; },
   (r: ProcessedRecord) => { r.normalized.reference = "CORRECCION"; },
   (r: ProcessedRecord) => { r.normalized.description = "Descripción corregida"; },
  ];
  for (const change of changes) {
   const bad = structuredClone(p.records); change(bad.find(r => r.normalized.debe === 500000)!);
   const check = await preview(db, bad); assert.equal(check.incremental.blocking, true); assert.equal(check.incremental.ambiguous, 1);
   await assert.rejects(importErp(db, "correction.xls", bad), /bloqueada/); assert.deepEqual(await counts(db), before);
  }
  const duplicate = structuredClone(p.records[0]); duplicate.row = 400;
  const check = await preview(db, [...p.records, duplicate]); assert.equal(check.incremental.blocking, true); assert.ok(check.incremental.ambiguous >= 2);
  await assert.rejects(importErp(db, "duplicate.xls", [...p.records, duplicate]), /bloqueada/);
  assert.deepEqual(await counts(db), before);
 } finally { await db.close(); }
});

test("retroactive additions keep their dates; a new month has a separate opening and never rewrites prior cash", async () => {
 const db = await decisionDb();
 try {
  const p = await parse(), a = await importErp(db, "sep.xls", p.records);
  const next = [...structuredClone(p.records), extra(p.records, "103", "2026-09-01")];
  next.forEach(r => { r.normalized.cutoffDate = "2026-09-14"; });
  const b = await importErp(db, "sep14.xls", next); assert.equal(b.incremental.newMovements, 1);
  assert.equal((await migrationSnapshot(db, b.id)).rows.find(r => r.normalized.transaction === "103")!.normalized.date, "2026-09-01");
  const october = structuredClone(p.records).filter(r => r.normalized.recordRole !== "bank_movement");
  october.forEach(r => {
   r.normalized.cutoffDate = "2026-10-13";
   if (r.normalized.sourceOrigin !== "COLOCACIONES") r.normalized.periodStart = "2026-10-01";
   if (r.normalized.recordRole === "bank_opening") Object.assign(r.normalized, { date: "2026-09-30", openingMonth: "2026-10" });
  });
  const line = extra(p.records, "104", "2026-10-13"); line.normalized.cutoffDate = "2026-10-13"; line.normalized.periodStart = "2026-10-01"; october.push(line);
  const c = await importErp(db, "oct.xls", october); assert.equal(c.incremental.retainedMovements, 0);
  assert.equal(await cash(db, c.id), 1500500); assert.equal(await cash(db, a.id), 1300500); assert.equal(await cash(db, b.id), 1800500);
  assert.equal((await counts(db))[3], 4);
 } finally { await db.close(); }
});

test("changed opening, lost account and reported closing differences remain visible blockers", async () => {
 const db = await decisionDb();
 try {
  const p = await parse(); await importErp(db, "base.xls", p.records);
  const changed = structuredClone(p.records), opening = changed.find(r => r.normalized.recordRole === "bank_opening")!;
  opening.normalized.amount = 1000001; opening.normalized.signedAmount = 1000001;
  assert.equal((await preview(db, changed)).incremental.issues[0].state, "changed_opening");
  const missing = p.records.filter(r => r.normalized.ledgerCode !== "BANK-02");
  assert.ok((await preview(db, missing)).incremental.issues.some((i: { state: string }) => i.state === "uncovered_account"));
  const partial = structuredClone(p.records.filter(r => r.normalized.haber !== 200000));
  partial.find(r => r.normalized.recordRole === "bank_opening")!.normalized.bankReportedClosing = 1500000;
  const plan = await preview(db, partial), control = plan.incremental.openings.find((o: { ledger: string }) => o.ledger === "BANK-01");
  assert.equal(plan.incremental.blocking, true); assert.equal(control.calculated, 1300000); assert.equal(control.difference, -200000);
  await assert.rejects(importErp(db, "bad-control.xls", partial), /bloqueada/);
 } finally { await db.close(); }
});

test("stale concurrent previews, late transaction failures and read-only roles cannot partially write an import", async () => {
 const db = await decisionDb();
 try {
  const p = await parse(); await importErp(db, "first.xls", p.records);
  const left = [...p.records, extra(p.records, "105")], right = [...p.records, extra(p.records, "106")];
  const stale = await preview(db, right); await importErp(db, "left.xls", left);
  const before = await counts(db);
  await assert.rejects(query(db, "select import_erp_daily('stale.xls',$1,$2::jsonb,$3) s", [hash("stale"), JSON.stringify(right), stale.revision]), /cambiaron/);
  assert.deepEqual(await counts(db), before);
  await db.exec("reset role; create function fail_import_run() returns trigger language plpgsql as $$ begin raise exception 'Injected audit failure'; end; $$; create trigger fail_run before insert on erp_import_runs for each row execute function fail_import_run();"); await session(db);
  await assert.rejects(importErp(db, "late-failure.xls", right), /Injected audit failure/); assert.deepEqual(await counts(db), before);
  await db.exec("reset role; drop trigger fail_run on erp_import_runs; drop function fail_import_run();"); await session(db);
  const retried = await importErp(db, "retry.xls", right); assert.equal(retried.incremental.newMovements, 1); assert.equal(retried.incremental.retainedMovements, 1);
  await session(db, reader); await assert.rejects(importErp(db, "reader.xls", right), /pendiente|rol/);
  await assert.rejects(query(db, "select count(*) s from erp_bank_postings"), /permission denied/);
 } finally { await db.close(); }
});

test("BIFF date/header variants and account-less OB from October export retain maturity and reject ambiguous account inference", async () => {
 const wb = erpWithBankBalances();
 delete wb.Sheets.COLOCACIONES.N2;
 XLSX.utils.sheet_add_aoa(wb.Sheets.COLOCACIONES, [["Fecha Vencimiento"], [null], [46325], ["30/10/2026"]], { origin: "P1" });
 const result = await parse(wb); assert.equal(result.error, 0);
 const inv = result.records.filter(r => r.entityType === "investment");
 assert.equal(inv[0].normalized.ledgerCode, "FUND-01"); assert.equal(inv[0].normalized.endDate, null);
 assert.match(inv[0].warnings, /única cuenta/); assert.equal(inv[1].normalized.endDate, "2026-10-30"); assert.equal(inv[2].normalized.endDate, "2026-10-30");
 wb.Sheets.COLOCACIONES.N4.v = "FUND-02";
 assert.ok((await parse(wb)).records.some(r => r.normalized.recordRole === "investment_opening" && r.status === "ERROR"));
 wb.Sheets.COLOCACIONES.P3 = { t: "s", v: "31/02/2026" };
 assert.ok((await parse(wb)).records.some(r => r.status === "ERROR" && /Vencimiento inválida/.test(r.warnings)));
 assert.equal(bankControls(result.records)[0].calculated, 1300000);
});

test("installed daily-opening schema upgrades without rewriting rows or manual work, then recognizes existing bank identities", async () => {
 const db = await decisionDb("20261014000000000");
 try {
  const wb = erpWithBankBalances();
  for (const cell of ["A2", "B2", "A3", "B3"]) wb.Sheets.BANCOS[cell] = { t: "s", v: "13/09/2026" };
  const monthly = (await parse(wb)).records, legacy = structuredClone(monthly);
  legacy.forEach(r => {
   if (r.normalized.sourceOrigin !== "BANCO") return;
   r.normalized.periodStart = "2026-09-13";
   if (r.normalized.recordRole === "bank_opening") Object.assign(r.normalized, { date: "2026-09-13", openingDate: "2026-09-13", openingBasis: "daily_opening" });
  });
  const first = await importErp(db, "installed-daily.xls", legacy);
  await query(db, "select treasury_save_manual($1,null,null,$2::jsonb,'{}'::jsonb) s", [first.id, JSON.stringify({ date: "2026-09-20", type: "expense", amount: 1000, currency: "CLP", category: "supplier", description: "No sobrescribir", status: "proyectado" })]);
  const before = await migrationSnapshot(db, first.id);
  await db.exec("reset role"); await db.exec(await readFile("supabase/migrations/20261014000000000_monthly_incremental_erp.sql", "utf8")); await session(db);
  assert.deepEqual((await migrationSnapshot(db, first.id)).rows, before.rows);
  const next = await importErp(db, "monthly.xls", monthly);
  assert.equal(next.incremental.newMovements, 0); assert.equal(next.incremental.recognizedPrevious, 2);
  assert.equal(await cash(db, next.id), 1300500);
  assert.equal((await migrationSnapshot(db, next.id)).manual.find(r => r.normalized.description === "No sobrescribir")!.normalized.amount, 1000);
  await assert.rejects(preview(db, legacy), /primer día/);
  const deletion = await query(db, "select excel_deletion_plan($1) s", [next.id]); assert.equal(deletion.preservedBankRegister.openings, 2);
  assert.deepEqual((await migrationSnapshot(db, first.id)).rows, before.rows);
 } finally { await db.close(); }
});
