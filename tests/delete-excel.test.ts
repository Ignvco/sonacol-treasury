import test, { before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const db = new PGlite();
const writer = "10000000-0000-0000-0000-000000000001", reader = "10000000-0000-0000-0000-000000000002";
const hash = (s: string) => createHash("sha256").update(s).digest("hex");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const q = async (sql: string, args: unknown[] = []): Promise<any> => (await db.query<{ s: unknown }>(sql, args)).rows[0]?.s;
const row = (origin: string, index: number, day = 12, amount = 100) => ({
  sheet: "BASE", row: index, status: "VALID", warnings: "", raw: { R: amount },
  entityType: origin === "BANCO" ? "cash_flow" : "projection",
  normalized: { sourceId: origin + index, sourceOrigin: origin, sourceProfile: "BASE-ONLY-test", company: "TEST", ledgerCode: "BCI", voucher: String(index),
    description: origin + index, amount, type: "income", currency: "CLP", date: "2026-09-11", reportDate: "2026-09-20", cutoffDate: `2026-09-${day}`,
    status: origin === "BANCO" ? "confirmado" : "proyectado", bank: "Banco BCI", category: "other_income" },
});
async function upload(name: string, day = 12, amount = 100) {
  const rows = [row("BANCO", 8, day, amount), row("MANUAL", 9, day)];
  const compared = await q("select compare_daily_base($1::jsonb) s", [JSON.stringify(rows)]);
  return q("select import_daily_base($1,$2,$3::jsonb,$4,'{}'::int[]) s", [name, hash(name), JSON.stringify(rows), compared.revision]);
}
const snapshot = (id: string | null = null) => q("select get_daily_base_snapshot($1::uuid) s", [id]);
const preview = (id: string | null = null) => q("select excel_deletion_plan($1::uuid) s", [id]);
async function remove(id: string | null = null) {
  const p = await preview(id);
  return q("select delete_excel_imports($1::uuid,$2,$3) s", [id, p.revision, id ? "ELIMINAR" : "VACIAR EXCEL"]);
}
before(async () => {
  const source = await readFile("tests/database.test.ts", "utf8");
  const setup = source.slice(source.indexOf("before(async()=>{") + "before(async()=>{".length, source.indexOf("\nafter(")).trim().replace(/\}\);$/, "");
  await new Function("db", "writer", "reader", "readFile", "return (async()=>{" + setup + "})();")(db, writer, reader, readFile);
  await db.exec("reset role; create role service_role;");
  for (const name of ["20260917000000000_daily_base_v7.sql", "20260917010000000_sap_daily_receiver.sql", "20260918000000000_delete_excel_imports.sql"]) {
    await db.exec(await readFile("supabase/migrations/" + name, "utf8"));
  }
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${writer}';`);
});
beforeEach(() => db.exec("begin"));
afterEach(() => db.exec("rollback"));
after(() => db.close());

test("delete Excel: preview writes nothing; deleting latest restores the previous full snapshot", async () => {
  const first = await upload("first.xlsx", 12, 100), latest = await upload("latest.xlsx", 13, 300);
  const p = await preview(latest.id);
  assert.equal(p.files, 1); assert.equal(p.rows, 2); assert.equal(p.manual, 1); assert.equal(p.latestAfter.id, first.id);
  assert.equal((await snapshot()).batch.id, latest.id);
  const result = await remove(latest.id);
  assert.equal(result.latestId, first.id); assert.equal(result.remainingBatches, 1);
  const current = await snapshot(); assert.equal(current.rows[0].normalized.amount, 100);
  assert.equal((await q("select get_daily_import_status() s")).history.length, 1);
  assert.equal(await q("select count(*)::int s from audit_logs where action='Eliminó importación Excel'"), 1);
});

test("delete Excel: removing historical source preserves later MANUAL edits without dangling references", async () => {
  const old = await upload("old.xlsx"), m = (await snapshot()).manual[0];
  await q("select save_daily_manual($1,$2,$3,$4::jsonb) s", [old.id, m.id, m.revision, JSON.stringify({ ...m.normalized, amount: 240 })]);
  const current = await upload("current.xlsx", 13);
  assert.equal((await preview(old.id)).carriedManual, 1);
  await remove(old.id);
  const s = await snapshot(); assert.equal(s.batch.id, current.id); assert.equal(s.manual[0].normalized.amount, 240);
  assert.equal(s.manual[0].recordId, null); assert.equal(s.manual[0].normalized.removedSourceFile, "old.xlsx");
  await assert.rejects(snapshot(old.id), /ya no está disponible/);
});

test("delete Excel: clear all empties active data and permits importing the same bytes again", async () => {
  const first = await upload("same.xlsx"); await upload("other.xlsx", 13);
  const profiles = await q("select count(*)::int s from profiles"), rates = await q("select count(*)::int s from fx_rates");
  const result = await remove(); assert.equal(result.remainingBatches, 0);
  const empty = await snapshot(); assert.equal(empty.batch, null); assert.deepEqual(empty.rows, []); assert.deepEqual(empty.manual, []); assert.deepEqual(empty.links, []);
  const status = await q("select get_daily_import_status() s"); assert.equal(status.records, 0); assert.deepEqual(status.history, []);
  assert.equal(await q("select count(*)::int s from profiles"), profiles); assert.equal(await q("select count(*)::int s from fx_rates"), rates);
  const reimported = await upload("same.xlsx"); assert.notEqual(reimported.id, first.id); assert.equal((await snapshot()).rows[0].normalized.amount, 100);
});

test("delete Excel: a new upload or MANUAL edit invalidates an old deletion confirmation", async () => {
  const first = await upload("first.xlsx"), plan = await preview(); await upload("second.xlsx", 13);
  await db.exec("savepoint rejected");
  await assert.rejects(q("select delete_excel_imports(null,$1,'VACIAR EXCEL') s", [plan.revision]), /datos cambiaron/);
  await db.exec("rollback to rejected");
  const current = await preview(first.id), manual = (await snapshot(first.id)).manual[0];
  await q("select save_daily_manual($1,$2,$3,$4::jsonb) s", [first.id, manual.id, manual.revision, JSON.stringify({ ...manual.normalized, amount: 200 })]);
  await db.exec("savepoint rejected2");
  await assert.rejects(q("select delete_excel_imports($1,$2,'ELIMINAR') s", [first.id, current.revision]), /datos cambiaron/);
  await db.exec("rollback to rejected2"); assert.equal(await q("select count(*)::int s from daily_base_batches"), 2);
});

test("delete Excel: read-only roles and incorrect confirmations cannot delete data", async () => {
  const first = await upload("safe.xlsx"), p = await preview(first.id);
  await db.exec("savepoint denied");
  await assert.rejects(q("select delete_excel_imports($1,$2,'YES') s", [first.id, p.revision]), /confirmación/);
  await db.exec(`rollback to denied; set request.jwt.claim.sub='${reader}'; savepoint role_denied`);
  await assert.rejects(preview(), /rol no permite/); await db.exec("rollback to role_denied");
  await assert.rejects(q("select delete_excel_imports($1,$2,'ELIMINAR') s", [first.id, p.revision]), /rol no permite/);
  await db.exec(`rollback to role_denied; set request.jwt.claim.sub='${writer}'`);
  assert.equal((await snapshot()).batch.id, first.id);
});

test("delete Excel: clearing Excel preserves SAP deliveries and their MANUAL workspace", async () => {
  await upload("excel.xlsx");
  await db.exec("reset role; set role service_role");
  const sap = await q("select import_sap_daily($1,$2,$3::jsonb) s", [writer, hash("SAP"), JSON.stringify([row("BANCO", 8, 14, 500)])]);
  await db.exec(`reset role; set role authenticated; set request.jwt.claim.sub='${writer}'`);
  await db.exec("savepoint sap_denied"); await assert.rejects(preview(sap.id), /SAP/); await db.exec("rollback to sap_denied");
  await remove(); const s = await snapshot(); assert.equal(s.batch.id, sap.id); assert.equal(s.rows[0].normalized.amount, 500); assert.equal(s.manual.length, 1);
});

test("delete Excel: legacy traces and financial entities are removed, catalogs and unrelated data remain", async () => {
  await db.exec("reset role");
  const records = [row("BANCO", 10), row("MANUAL", 11)];
  await q("select import_treasury_records($1,$2,$3::jsonb) s", ["legacy.xlsx", hash("legacy"), JSON.stringify(records)]);
  await db.exec("insert into cash_flow(date,type,category,description,amount,origin) values('2026-09-01','income','other_income','Manual independiente',10,'manual')");
  const banks = await q("select count(*)::int s from banks");
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${writer}'`);
  const plan = await preview(); assert.equal(plan.legacyFiles, 1); assert.equal(plan.legacyRows, 2);
  await remove(); assert.equal(await q("select count(*)::int s from import_records"), 0); assert.equal(await q("select count(*)::int s from import_batches"), 0);
  assert.equal(await q("select count(*)::int s from projections"), 0);
  assert.equal(await q("select count(*)::int s from cash_flow where description='Manual independiente'"), 1);
  assert.equal(await q("select count(*)::int s from cash_flow where origin='excel'"), 0);
  assert.equal(await q("select count(*)::int s from banks"), banks);
});

test("delete Excel: an audit failure rolls back the entire deletion", async () => {
  const first = await upload("atomic.xlsx");
  await db.exec("reset role; create function test_reject_audit() returns trigger language plpgsql as $$ begin raise exception 'audit blocked'; end $$; create trigger test_reject before insert on audit_logs for each row execute function test_reject_audit(); set role authenticated;");
  await db.exec("savepoint deletion"); await assert.rejects(remove(first.id), /audit blocked/); await db.exec("rollback to deletion");
  assert.equal((await snapshot()).batch.id, first.id); assert.equal((await snapshot()).manual.length, 1);
});

test("delete Excel: migrated legacy invoice/investment/account data is cleared without deleting catalogs", async () => {
  await db.exec("reset role");
  const records = [
    { ...row("BANCO", 1), entityType: "invoice", normalized: { customer: "Cliente legado", rut: "12345678-K", document: "F123", issueDate: "2026-09-01", dueDate: "2026-09-30", amount: 400, currency: "CLP" } },
    { ...row("BANCO", 2), entityType: "investment", normalized: { bank: "Banco legado", amount: 300, currency: "CLP", investmentType: "colocacion", startDate: "2026-09-01", endDate: "2026-09-30", rateKnown: false, rate: null, interest: null } },
    { ...row("BANCO", 3), entityType: "bank_account", normalized: { bank: "Banco legado", account: "123456", ledgerCode: "LEGADO", date: "2026-09-12", balance: 500, reconciledBalance: 500, currency: "CLP" } },
  ];
  const batch = await q("select import_treasury_records($1,$2,$3::jsonb) s", ["legacy-entities.xlsx", hash("legacy-entities"), JSON.stringify(records)]);
  assert.equal(batch.imported_records, 3);
  // Simulate the preserved batch identity of the v7 upgrade.
  await db.exec("insert into daily_base_batches(id,file_name,file_hash,cutoff,uploaded_by) select id,file_name,file_hash,'2026-09-12','Test' from import_batches");
  const customers = await q("select count(*)::int s from customers");
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${writer}'`);
  await remove(batch.id);
  assert.equal(await q("select count(*)::int s from invoices"), 0);
  assert.equal(await q("select count(*)::int s from investments"), 0);
  assert.equal(await q("select count(*)::int s from customers"), customers);
  assert.equal(Number(await q("select balance s from bank_accounts where ledger_code='LEGADO'")), 0);
  assert.equal(await q("select balance_date s from bank_accounts where ledger_code='LEGADO'"), null);
});

test("delete Excel: shared legacy entities survive while another import still references them", async () => {
  await db.exec("reset role");
  const records = [row("BANCO", 8)];
  const one = await q("select import_treasury_records($1,$2,$3::jsonb) s", ["legacy-one.xlsx", hash("legacy-one"), JSON.stringify(records)]);
  await q("select import_treasury_records($1,$2,$3::jsonb) s", ["legacy-two.xlsx", hash("legacy-two"), JSON.stringify(records)]);
  await db.exec("insert into daily_base_batches(id,file_name,file_hash,cutoff,uploaded_by) select id,file_name,file_hash,'2026-09-12','Test' from import_batches");
  await db.exec(`set role authenticated; set request.jwt.claim.sub='${writer}'`);
  await remove(one.id); assert.equal(await q("select count(*)::int s from cash_flow"), 1);
  assert.equal(await q("select count(*)::int s from import_records"), 1);
  await remove(); assert.equal(await q("select count(*)::int s from cash_flow"), 0);
});

test("delete Excel: a legacy Excel movement without a batch is visible in the deletion preview", async () => {
  await db.exec("reset role; insert into cash_flow(date,type,category,description,amount,origin) values('2026-09-01','income','other_income','Excel antiguo sin lote',10,'excel'); set role authenticated;");
  const p = await preview(); assert.equal(p.files, 0); assert.equal(p.legacyOrphans, 1);
  await remove(); assert.equal(await q("select count(*)::int s from cash_flow"), 0);
});
