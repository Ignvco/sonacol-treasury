import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decisionDb, query, session, upload } from "./helpers/decision-db";
import { importErp, migrationSnapshot } from "./helpers/caja-migration";
import { erpContext, erpWithBankBalances, workbookBytes } from "./helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";
import { snapshotRows } from "../src/financial-engine/snapshot";
import { snapshotProjection } from "../src/financial-engine/projection";
import { CASH_POSITION_ENGINE, CASH_POSITION_ENGINE_N1 } from "../src/financial-engine/base-treasury";

const activation = "scripts/treasury-activate-n1.sql";
const parse = async () => processWorkbook(
  await parseWorkbook(workbookBytes(erpWithBankBalances(), "xls")), undefined,
  { ERP: { ...erpContext.ERP, cutoffDate:"2026-09-13" } },
).records;

// A distinct new posting in the same month, not a silent rewrite of an ERP identity.
function additionalReceipt(records: Awaited<ReturnType<typeof parse>>) {
  const receipt = structuredClone(records.find(r => r.normalized.recordRole === "bank_movement" && r.normalized.type === "income")!);
  receipt.row = 202;
  Object.assign(receipt.normalized, {
    transaction: "102", erpDocument: "RC 102", document:"RC 102",
    date:"2026-09-03", dueDate:"2026-09-03",
  });
  return receipt;
}

// Runs on PGlite only, not Supabase. The SQL file is NOT a deployment action.
test("new ERP batches use N+1 while old ERP batches and frozen forecasts stay v3", async () => {
  const db = await decisionDb();
  try {
    const records = await parse();
    const historic = await importErp(db,"historical-erp.xls",records);
    const before = await migrationSnapshot(db,historic.id);
    assert.equal(await query(db,"select projection_engine_version s from daily_base_batches where id=$1",[historic.id]),CASH_POSITION_ENGINE);
    const context = {cutoff:before.batch!.cutoff,currency:"CLP",horizon:7,minimum:0,
      ...(before.engineVersion ? {engineVersion:before.engineVersion} : {})};
    const oldRevision = await query(db,"select treasury_revision($1) s",[historic.id]);
    const saved = await query(db,"select treasury_freeze_forecast($1,$2,$3::jsonb) s",[
      historic.id,oldRevision,JSON.stringify(context),
    ]);
    const rawBefore = await query(db,"select jsonb_agg(normalized_json order by id) s from daily_base_rows where batch_id=$1",[historic.id]);
    await db.exec("reset role");
    await db.exec(await readFile(activation,"utf8"));
    await session(db);
    const after = await migrationSnapshot(db,historic.id);
    assert.equal(after.engineVersion,before.engineVersion);
    assert.deepEqual(after.rows,before.rows);
    assert.deepEqual(after.manual,before.manual);
    assert.deepEqual(await query(db,"select jsonb_agg(normalized_json order by id) s from daily_base_rows where batch_id=$1",[historic.id]),rawBefore);
    assert.deepEqual(await query(db,"select snapshot s from treasury_forecasts where id=$1",[saved.id]),saved.snapshot);

    const retried = await importErp(db,"same-erp.xls",records);
    assert.equal(retried.id,historic.id);
    assert.equal((await migrationSnapshot(db,historic.id)).engineVersion,before.engineVersion);

    const fresh = await importErp(db,"incremental-new-erp.xls",[...records,additionalReceipt(records)]);
    assert.notEqual(fresh.id,historic.id);
    const v4 = await migrationSnapshot(db,fresh.id);
    assert.equal(v4.engineVersion,CASH_POSITION_ENGINE_N1);
    assert.equal((await migrationSnapshot(db,historic.id)).engineVersion,before.engineVersion);
    const model = snapshotProjection({rows:snapshotRows(v4),links:v4.links,cutoff:v4.batch!.cutoff,engineVersion:v4.engineVersion});
    assert.equal(model.cutoffPosition?.date,v4.batch!.cutoff);
    assert.equal(model.daily.length,30);
    assert.equal(model.daily[0].date,"2026-09-14");
    assert.equal(model.daily.some(d=>d.date===v4.batch!.cutoff),false);

    const newRevision = await query(db,"select treasury_revision($1) s",[fresh.id]);
    const wrong = {cutoff:v4.batch!.cutoff,currency:"CLP",horizon:7,minimum:0,engineVersion:CASH_POSITION_ENGINE};
    await assert.rejects(query(db,"select treasury_freeze_forecast($1,$2,$3::jsonb) s",[fresh.id,newRevision,JSON.stringify(wrong)]),/criterio de cálculo/);
    const withoutVersion = {cutoff:v4.batch!.cutoff,currency:"CLP",horizon:7,minimum:0};
    await assert.rejects(query(db,"select treasury_freeze_forecast($1,$2,$3::jsonb) s",[fresh.id,newRevision,JSON.stringify(withoutVersion)]),/criterio de cálculo/);
    const proper = await query(db,"select treasury_freeze_forecast($1,$2,$3::jsonb) s",[fresh.id,newRevision,JSON.stringify({...wrong,engineVersion:CASH_POSITION_ENGINE_N1})]);
    assert.equal(proper.engine_version,CASH_POSITION_ENGINE_N1);
    assert.equal((await migrationSnapshot(db,historic.id)).engineVersion,before.engineVersion);
  } finally { await db.close(); }
});

test("BASE-only imports keep previous default; SQL has no backfill or history repair", async () => {
  const sql=await readFile(activation,"utf8");
  assert.doesNotMatch(sql,/update\s+public\.daily_base_batches\s+set\s+projection_engine_version/i);
  assert.doesNotMatch(sql,/\bsupabase_migrations\s*\.\s*schema_migrations\s*(?:\(|values|set)/i);
  const db = await decisionDb();
  try {
    await db.exec("reset role"); await db.exec(sql); await session(db);
    const base = await upload(db,"legacy-base.xlsx");
    const version = await query(db,"select projection_engine_version s from daily_base_batches where id=$1",[base.id]);
    assert.equal(version,CASH_POSITION_ENGINE);
  } finally { await db.close(); }
});
