import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { decisionDb, query, upload, row, hash, session, reader } from "./helpers/decision-db";
import { erpContext, workbookBytes } from "./helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";
import type { ProcessedRecord } from "../src/import-engine/types";
let db: PGlite, records: ProcessedRecord[];
before(async () => { db = await decisionDb(); records = processWorkbook(await parseWorkbook(workbookBytes()), undefined, erpContext).records; });
after(() => db?.close());
async function commit(name: string, input = records) {
  const preview = await query(db, "select compare_erp_import($1::jsonb) s", [JSON.stringify(input.map(({ raw: _raw, ...r }) => r))]);
  return query(db, "select import_erp_daily($1,$2,$3::jsonb,$4) s", [name, hash(name), JSON.stringify(input), preview.revision]);
}
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
  assert.equal(snap.businessIssues.length, 2);
  assert.equal(snap.manual[0].normalized.amount, 5000);
  assert.equal(snap.manual[0].normalized.status, "borrador");
 } finally { await isolated.close(); }
});
