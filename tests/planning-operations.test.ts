import test from "node:test";
import assert from "node:assert/strict";
import { baseTreasury, CASH_POSITION_ENGINE, type TreasuryRow } from "../src/financial-engine/base-treasury";
import { snapshotRows } from "../src/financial-engine/snapshot";
import { decisionDb, query } from "./helpers/decision-db";
import { importErp, migrationSnapshot } from "./helpers/caja-migration";
import { erpContext, workbookBytes } from "./helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";

// Authored for later verification. No tests, builds or SQL were run for this patch.
const cutoff = "2026-10-09";
const row = (id: string, amount: number, extra: Partial<TreasuryRow> = {}): TreasuryRow => ({
  id, amount, kind: "projection", type: "income", origin: "MANUAL", currency: "CLP", status: "proyectado",
  date: cutoff, plannedDate: cutoff, bank: "Banco A", ledger: "BANK-01", settlementLedger: "BANK-01",
  description: id, document: "", customer: "", interest: 0, cutoff, fileName: "Fixture", row: null, recordId: null, ...extra,
});
const capital = row("capital", 5000, { kind: "investment", origin: "COLOCACIONES", normalized: { isPosition: true } });
const input = [row("cash", 1000, { kind: "cash_flow", origin: "BANCO" }), capital,
  row("rescue", 300, { normalized: { recordRole: "planned_redemption" } }),
  row("payment", 100, { type: "expense" }),
  row("placement", 1100, { type: "expense", normalized: { category: "investment_placement", executedAmount: 0 } })];
const model = (rows = input) => baseTreasury(rows, [], cutoff, 7, "CLP", "", CASH_POSITION_ENGINE);

test("placements are already expenses: before-placement bridge does not debit twice or create investment capital", () => {
  const m = model();
  assert.equal(m.available, 1000); assert.equal(m.invested, 5000);
  assert.equal(m.cutoffPosition!.operatingExpense, 100);
  assert.equal(m.cutoffPosition!.beforePlacements, 1200);
  assert.equal(m.cutoffPosition!.placements, 1100);
  assert.equal(m.cutoffPosition!.expense, 1200);
  assert.equal(m.cutoffPosition!.closing, 100);
  assert.equal(m.cutoffPosition!.accounts[0].closing, 100);
  assert.equal(m.days[0].beforePlacements, 1200);
  assert.equal(m.days[1].balance, 100);
});

test("partial and complete bank execution replace placement pending amount, preserving final cash", () => {
  for (const executed of [400, 1100]) {
    const rows = input.map(r => r.id === "placement" ? { ...r, normalized: { ...r.normalized, executedAmount: executed } } : r);
    rows.push(row("real-placement", executed, { kind: "cash_flow", origin: "BANCO", type: "expense" }));
    const m = model(rows);
    assert.equal(m.available, 1000 - executed);
    assert.equal(m.cutoffPosition!.placements, 1100 - executed);
    assert.equal(m.cutoffPosition!.closing, 100);
    assert.equal(m.invested, 5000);
    assert.equal(m.events.some(r => r.id === "placement"), executed < 1100);
  }
});

test("rescue and manual income share a bank allocation limit; execution survives the next ERP load", async () => {
  const db = await decisionDb();
  try {
    const records = processWorkbook(await parseWorkbook(workbookBytes()), undefined, erpContext).records;
    const batch = await importErp(db, "operations-first.xlsm", records);
    const initial = await migrationSnapshot(db, batch.id);
    const position = initial.rows.find(r => r.kind === "investment")!;
    const posting = initial.rows.find(r => r.normalized.recordRole === "bank_movement" && r.normalized.type === "income")!;
    const rescue = await query(db, "select treasury_save_business($1,null,null,'redemption',$2,$3::jsonb,false) s", [batch.id, position.normalized.businessKey,
      JSON.stringify({ date: initial.batch!.cutoff, amount: 600, currency: "CLP", bankLedger: "BANK-01", status: "planned" })]);
    await query(db, "select treasury_record_redemption_execution($1,$2,$3,$4,400,null) s", [batch.id, rescue.id, rescue.revision, posting.recordId]);
    let snap = await migrationSnapshot(db, batch.id);
    const planned = snap.manual.find(r => r.id === rescue.id)!;
    assert.equal(planned.normalized.executedAmount, 400);
    assert.equal(snap.rows.find(r => r.kind === "investment")!.normalized.reservedAmount, 200);
    const m = baseTreasury(snapshotRows(snap), [], snap.batch!.cutoff, 30, "CLP", "", snap.engineVersion);
    assert.equal(m.available, 1300); assert.equal(m.events.find(r => r.id === rescue.id)!.amount, 200);
    const manual = await query(db, "select save_daily_manual($1,null,null,$2::jsonb,false) s", [batch.id,
      JSON.stringify({ date: snap.batch!.cutoff, type: "income", amount: 400, currency: "CLP", category: "collection", description: "Otro cobro", status: "proyectado", bank: "Banco de prueba", bankLedger: "BANK-01" })]);
    await assert.rejects(query(db, "select treasury_record_manual_execution($1,$2,$3,$4,200,null) s", [batch.id, manual.id, manual.revision, posting.recordId]), /asignado/);
    await query(db, "select treasury_record_manual_execution($1,$2,$3,$4,100,null) s", [batch.id, manual.id, manual.revision, posting.recordId]);
    const d = snap.business!.find(d => d.id === rescue.id)!;
    await assert.rejects(query(db, "select treasury_save_business($1,$2,$3,'redemption',$4,$5::jsonb,false) s", [batch.id, d.id, d.revision, d.target_key, JSON.stringify({ ...d.values_json, amount: 399 })]), /ejecución/);
    const next = structuredClone(records); next.forEach(r => { r.normalized.cutoffDate = "2026-09-11"; });
    const later = await importErp(db, "operations-next.xlsm", next);
    snap = await migrationSnapshot(db, later.id);
    assert.deepEqual(snap.business!.find(x => x.id === d.id)!.execution_json, d.execution_json);
    assert.equal(snap.manual.find(r => r.id === manual.id)!.normalized.executedAmount, 100);
    assert.equal((await migrationSnapshot(db, batch.id)).business!.find(x => x.id === d.id)!.revision, d.revision);
  } finally { await db.close(); }
});

test("October preview is read-only and rejects uncovered accounts and obsolete September adoption", async () => {
  const db = await decisionDb();
  try {
    const context = { ERP: { ...erpContext.ERP, company: "SONACOL" } };
    const records = processWorkbook(await parseWorkbook(workbookBytes()), undefined, context).records;
    const batch = await importErp(db, "plan-review.xlsm", records);
    const before = await migrationSnapshot(db, batch.id);
    const preview = await query(db, "select treasury_october_plan_preview($1) s", [batch.id]);
    assert.equal(preview.rows.length, 103);
    assert.equal(preview.rows.filter((r: { kind: string }) => r.kind === "commitment").length, 38);
    assert.deepEqual(await migrationSnapshot(db, batch.id), before);
    await assert.rejects(query(db, "select treasury_apply_october_plan($1,$2,$3::jsonb,'{}'::jsonb) s", [batch.id, preview.revision, JSON.stringify([{ key: preview.rows[0].key, action: "new" }])]), /cubierta/);
    await assert.rejects(query(db, "select treasury_apply_initial_plan($1,'old','[]'::jsonb,'[]'::jsonb) s", [batch.id]), /octubre/);
    assert.deepEqual(await migrationSnapshot(db, batch.id), before);
  } finally { await db.close(); }
});
