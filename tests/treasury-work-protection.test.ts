import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { PGlite } from "@electric-sql/pglite";
import { decisionDb, query, session, reader, admin } from "./helpers/decision-db";
import { importErp, migrationSnapshot } from "./helpers/caja-migration";
import { erpContext, erpWithBankBalances, workbookBytes } from "./helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";
const migration = "20261025034359_protect_treasury_work.sql";
const values = { date: "2026-09-26", amount: 900, currency: "CLP", type: "expense", category: "payroll", status: "proyectado", description: "Compromiso confirmado", bank: "Banco de prueba", bankLedger: "BANK-01" };
async function input(cutoffDate = "2026-09-10") { return processWorkbook(await parseWorkbook(workbookBytes(erpWithBankBalances())), undefined, { ERP: { ...erpContext.ERP, company: "SONACOL", cutoffDate } }).records; }
const manual = (db: PGlite, batch: string, details = {}) => query(db, "select treasury_save_manual($1,null,null,$2::jsonb,$3::jsonb) s", [batch, JSON.stringify(values), JSON.stringify(details)]);
const preview = (db: PGlite, batch: string | null = null) => query(db, "select excel_deletion_plan($1) s", [batch]);
const remove = (db: PGlite, batch: string | null, revision: string) => query(db, "select delete_excel_imports($1,$2,$3) s", [batch, revision, batch ? "ELIMINAR" : "VACIAR EXCEL"]);
test("installed database upgrade preserves all data and rejects an old deletion approval", async () => {
  const db = await decisionDb(migration);
  try {
    const b = await importErp(db, "installed.xls", await input()); await manual(db, b.id);
    const before = await migrationSnapshot(db, b.id), old = await preview(db);
    await db.exec("reset role"); await db.exec(await readFile(`supabase/migrations/${migration}`, "utf8")); await session(db);
    assert.deepEqual(await migrationSnapshot(db, b.id), before);
    await assert.rejects(remove(db, null, old.revision), /cambiaron/);
    const p = await preview(db);
    assert.equal(p.workProtectionVersion, 1); assert.equal(p.blocked, true); assert.equal(p.protectedWork.manual, 1);
    await assert.rejects(remove(db, null, p.revision), /sin respaldo/);
    assert.equal(await query(db, "select count(*)::int s from audit_logs where action='Conservó versión de planificación'"), 0);
    assert.deepEqual(await migrationSnapshot(db, b.id), before);
  } finally { await db.close(); }
});
test("clearing imports cannot remove four manual commitments, even after a fresh preview", async () => {
  const db = await decisionDb();
  try {
    const b = await importErp(db, "four.xls", await input()), old = await preview(db);
    for (let n = 0; n < 4; n++) await manual(db, b.id);
    const before = await migrationSnapshot(db, b.id);
    await assert.rejects(remove(db, null, old.revision), /cambiaron/);
    const p = await preview(db); assert.equal(p.protectedWork.manual, 4);
    await assert.rejects(remove(db, null, p.revision), /sin respaldo/);
    assert.deepEqual(await migrationSnapshot(db, b.id), before);
  } finally { await db.close(); }
});
test("an older import may be removed only while its manual content and details survive in another copy", async () => {
  const db = await decisionDb();
  try {
    const first = await importErp(db, "first.xls", await input());
    await manual(db, first.id, { due_date: "2026-09-27" });
    const next = await importErp(db, "next.xls", await input("2026-09-11")), before = await migrationSnapshot(db, next.id);
    assert.notEqual(next.id, first.id);
    const p = await preview(db, first.id); assert.equal(p.blocked, false);
    await remove(db, first.id, p.revision);
    assert.deepEqual(await migrationSnapshot(db, next.id), before);
    assert.equal((await preview(db, next.id)).blocked, true);
    assert.equal(await query(db, "select count(*)::int s from treasury_manual_details where batch_id=$1", [next.id]), 1);
  } finally { await db.close(); }
});
test("untouched native defaults do not trap unused imports; the bank register survives removal and repetition", async () => {
  const db = await decisionDb();
  try {
    const records = await input(), b = await importErp(db, "unused.xls", records), p = await preview(db);
    assert.equal(p.dependentWork.businessDecisions, 16); assert.equal(p.blocked, false);
    await remove(db, null, p.revision); await db.exec("reset role");
    assert.equal(await query(db, "select count(*)::int s from erp_bank_postings"), 2);
    assert.equal(await query(db, "select count(*)::int s from erp_monthly_openings"), 2);
    await session(db);
    const next = await importErp(db, "reload.xls", records); assert.notEqual(next.id, b.id);
    await db.exec("reset role");
    assert.equal(await query(db, "select count(*)::int s from erp_bank_postings"), 2);
    assert.equal(await query(db, "select count(*)::int s from treasury_business_decisions"), 16);
  } finally { await db.close(); }
});
test("custom, edited and retired rules are protected; an older copy cannot cover a newer decision", async () => {
  const db = await decisionDb();
  try {
    const b = await importErp(db, "rules.xls", await input());
    const custom = await query(db, "select treasury_save_business($1,null,null,'rule','*',$2::jsonb,false) s", [b.id, JSON.stringify({ ruleType: "classification", contains: "LOCAL", category: "payroll", priority: 99 })]);
    assert.equal((await preview(db)).protectedWork.businessDecisions, 1);
    const next = await importErp(db, "rules-later.xls", await input("2026-09-11")); assert.notEqual(next.id, b.id);
    assert.equal((await preview(db, next.id)).blocked, false);
    await query(db, "select treasury_save_business($1,$2,$3,'rule','*',$4::jsonb,true) s", [next.id, custom.id, custom.revision, JSON.stringify(custom.values_json)]);
    const p = await preview(db, next.id); assert.equal(p.blocked, true); assert.equal(p.protectedWork.businessDecisions, 1);
    const rule = (await migrationSnapshot(db, next.id)).business!.find(d => d.values_json.ruleType === "collection")!;
    await query(db, "select treasury_save_business($1,$2,$3,'rule','*',$4::jsonb,false) s", [next.id, rule.id, rule.revision, JSON.stringify({ ...rule.values_json, days: 7 })]);
    assert.equal((await preview(db, next.id)).protectedWork.businessDecisions, 2);
  } finally { await db.close(); }
});
test("manual audit retains prior amounts, dates and metadata; deletion cannot change a frozen forecast", async () => {
  const db = await decisionDb();
  try {
    const b = await importErp(db, "history.xls", await input());
    const [m] = await manual(db, b.id, { due_date: "2026-09-27" });
    await query(db, "select treasury_save_manual($1,$2,$3,$4::jsonb,$5::jsonb) s", [b.id, m.id, m.revision, JSON.stringify({ ...values, amount: 850, date: "2026-09-28" }), JSON.stringify({ due_date: "2026-09-29" })]);
    const audit = (await db.query<{ previous_value: string; new_value: string }>("select previous_value,new_value from audit_logs where action='Conservó versión de planificación' and entity='daily_manual' and previous_value is not null")).rows;
    const change = audit.find(a => JSON.parse(a.previous_value).normalized_json.amount === 900 && JSON.parse(a.new_value).normalized_json.amount === 850);
    assert.ok(change); assert.equal(JSON.parse(change.previous_value).normalized_json.date, "2026-09-26"); assert.equal(JSON.parse(change.new_value).normalized_json.date, "2026-09-28");
    assert.ok(await query(db, "select count(*)::int s from audit_logs where action='Conservó versión de planificación' and entity='treasury_manual_details'"));
    const snap = await migrationSnapshot(db, b.id), rev = await query(db, "select treasury_revision($1) s", [b.id]);
    const frozen = await query(db, "select treasury_freeze_forecast($1,$2,$3::jsonb) s", [b.id, rev, JSON.stringify({ cutoff: snap.batch!.cutoff, currency: "CLP", horizon: 30, minimum: 0, engineVersion: snap.engineVersion })]);
    const p = await preview(db); assert.equal(p.protectedWork.forecasts, 1);
    await assert.rejects(remove(db, null, p.revision), /sin respaldo/);
    assert.deepEqual(await query(db, "select to_jsonb(f) s from treasury_forecasts f where id=$1", [frozen.id]), frozen);
  } finally { await db.close(); }
});
test("deletion protection keeps authorization, MFA and private entry points closed", async () => {
  const db = await decisionDb();
  try {
    const b = await importErp(db, "access.xls", await input()), p = await preview(db);
    await assert.rejects(query(db, "select delete_excel_imports_before_work_guard($1,$2,'ELIMINAR') s", [b.id, p.revision]), /permission denied/);
    await assert.rejects(query(db, "select excel_deletion_plan_before_work_guard(null) s"), /permission denied/);
    await session(db, admin, "aal1"); await assert.rejects(remove(db, null, p.revision), /segundo factor/);
    await session(db, reader); await assert.rejects(preview(db), /pendiente|permiso|rol/);
    await db.exec("reset role; set role anon"); await assert.rejects(preview(db), /permission denied/);
  } finally { await db.close(); }
});
