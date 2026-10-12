import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { CASH_POSITION_ENGINE, total, type TreasuryRow } from "../src/financial-engine/base-treasury";
import { snapshotProjection, PROJECTION_DEFAULTS } from "../src/financial-engine/projection";
import { aggregateProjection } from "../src/financial-engine/calculations";
import { decisionModel } from "../src/financial-engine/decisions";
import { executiveReport } from "../src/financial-engine/report";
import { snapshotRows, type RawSnapshot } from "../src/financial-engine/snapshot";
import { decisionDb, query, session } from "./helpers/decision-db";
import { importErp, migrationSnapshot } from "./helpers/caja-migration";
import { erpContext, workbookBytes } from "./helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";

const cutoff = "2026-10-09";
const row = (id: string, changes: Partial<TreasuryRow> = {}): TreasuryRow => ({
  id, kind: "projection", origin: "MANUAL", amount: 100, currency: "CLP", type: "income",
  status: "proyectado", date: cutoff, plannedDate: cutoff, bank: "Banco A", ledger: "BANK-01",
  settlementLedger: "BANK-01", description: id, document: id, customer: "", interest: 0,
  cutoff, fileName: "ERP-fixture.xlsm", row: null, recordId: null, ...changes,
});
const bank = (id: string, amount: number, opening = false) => row(id, {
  kind: "cash_flow", origin: "BANCO", status: "conciliado", amount: Math.abs(amount), type: amount < 0 ? "expense" : "income",
  date: opening ? "2026-09-30" : cutoff,
  normalized: { sourceProfile: "ERP-RAW-v1", recordRole: opening ? "bank_opening" : "bank_movement",
    amount: Math.abs(amount), signedAmount: amount, type: amount < 0 ? "expense" : "income",
    debe: amount > 0 ? amount : 0, haber: amount < 0 ? -amount : 0,
    company: "Fixture", ledgerCode: "BANK-01", bank: "Banco A", currency: "CLP",
    periodStart: "2026-10-01", cutoffDate: cutoff, sourceSheet: opening ? "SALDOS BANCOS" : "BANCOS",
    category: "collection" }, // A category must never reverse an expense.
});
const rows = [
  bank("opening", 1000, true), bank("cargo", 500), bank("abono", -200),
  row("collection"),
  row("redemption", { amount: 50, normalized: { recordRole: "planned_redemption" } }),
  row("payment", { amount: 300, type: "expense", normalized: { executedAmount: 200 } }),
  row("overdue", { amount: 25, type: "expense", plannedDate: "2026-10-08" }),
  row("tomorrow", { amount: 75, plannedDate: "2026-10-10" }),
  row("stock", { kind: "investment", origin: "COLOCACIONES", amount: 5000, normalized: { isPosition: true } }),
];
const snapshot = { rows, links: [], cutoff, engineVersion: CASH_POSITION_ENGINE };
const project = (input = rows) => snapshotProjection({ ...snapshot, rows: input }, { ...PROJECTION_DEFAULTS, horizon: 7 });

test("cutoff bridge distinguishes real Abono, unexecuted payment and planned redemption", () => {
  const before = structuredClone(rows), m = project();
  assert.equal(m.available, 1300);
  assert.equal(m.bankActivity!.expense, 200);
  assert.equal(m.cutoffPosition!.income, 150);
  assert.equal(m.cutoffPosition!.expense, 100);
  assert.equal(m.cutoffPosition!.closing, 1350);
  assert.deepEqual(m.daily[0], { date: cutoff, initial: 1300, income: 150, expense: 100, final: 1350, variation: 50 });
  assert.equal(m.daily[1].initial, 1350);
  assert.equal(m.daily[1].expense, 25);
  assert.equal(m.daily[1].final, 1400);
  assert.equal(m.daily.length, 8); assert.equal(m.to, "2026-10-16");
  assert.deepEqual(m.overdue.map(r => r.id), ["overdue"]);
  assert.equal(m.overdue[0].plannedDate, "2026-10-08");
  assert.equal(m.overdue[0].effectiveDate, "2026-10-10");
  assert.match(m.issues.join(), /provisionalmente/);
  assert.equal(m.events.some(r => r.origin === "BANCO" || r.id === "stock"), false);
  assert.equal(m.cutoffPosition!.accounts[0].closing, 1350);
  assert.deepEqual(rows, before);
});

test("only the remaining payment is forecast; a complete execution disappears without changing real cash", () => {
  const complete = rows.map(r => r.id === "payment" ? { ...r, normalized: { executedAmount: 300 } } : r);
  const m = project(complete);
  assert.equal(m.available, 1300); assert.equal(m.cutoffPosition!.expense, 0);
  assert.equal(m.events.some(r => r.id === "payment"), false);
  assert.equal(m.cutoffPosition!.closing, 1450);
});

test("account routing uses the receiving ledger and keeps uncovered or ambiguous accounts visible", () => {
  const input = [...rows, row("receivable", { kind: "invoice", ledger: "AR-01", settlementLedger: "BANK-01", amount: 40 }),
    row("uncovered", { settlementLedger: "OUTSIDE", amount: 10 }),
    row("usd", { currency: "USD", type: "expense", amount: 10 })];
  const m = project(input);
  assert.equal(m.cutoffPosition!.accounts[0].closing, 1390);
  assert.equal(m.cutoffPosition!.closing, 1400);
  assert.deepEqual(m.cutoffPosition!.unassigned.map(r => r.id), ["uncovered"]);
  assert.equal(m.events.some(r => r.id === "usd"), false);
  const noAccount = row("ambiguous", { settlementLedger: "", ledger: "" });
  const second = bank("second-opening", 500, true);
  second.ledger = "BANK-02";
  second.normalized = { ...second.normalized, ledgerCode: "BANK-02" };
  assert.deepEqual(project([...rows, second, noAccount]).cutoffPosition!.unassigned.map(r => r.id), ["ambiguous"]);
});

test("operational views, report, scenario and weekly/monthly totals share the same cutoff series", () => {
  const m = project(), context = { cutoff, currency: "CLP", horizon: 7, minimum: 0, engineVersion: CASH_POSITION_ENGINE };
  const report = executiveReport(rows, [], context, { id: "fixture", fileName: "ERP.xlsm", revision: "1" });
  assert.deepEqual(decisionModel(rows, [], context).days, m.days);
  assert.deepEqual(report.model.days, m.days);
  assert.equal(report.summary.find(r => r.Métrica === "Egresos pendientes del corte")!.Valor, 100);
  for (const mode of ["weekly", "monthly"] as const) {
    const groups = aggregateProjection(m.daily, mode);
    assert.equal(groups[0].initial, 1300);
    assert.equal(groups.at(-1)!.final, 1400);
    assert.equal(total(groups.map(r => r.expense)), 125);
    assert.equal(total(groups.map(r => r.income)), 225);
  }
});

test("a minimum at projected cutoff closing opens that day and counts its risk only once", () => {
  const input = [bank("negative-opening", -100, true), row("payment", { type: "expense", amount: 50 }),
    row("next-income", { amount: 500, plannedDate: "2026-10-10" })];
  const m = project(input);
  assert.equal(m.minimum, -150); assert.equal(m.minimumDate, cutoff); assert.equal(m.minimumIsCash, false);
  const risk = decisionModel(input, [], { cutoff, currency: "CLP", horizon: 7, minimum: 0, engineVersion: CASH_POSITION_ENGINE });
  assert.equal(risk.daysBelow, 1); assert.equal(risk.firstRisk, cutoff);
});

test("old and versionless snapshots retain next-day calculations and horizon length", () => {
  for (const engineVersion of [undefined, "erp-business-v1", "erp-business-plan-v2"]) {
    const m = snapshotProjection({ ...snapshot, engineVersion }, { ...PROJECTION_DEFAULTS, horizon: 7 });
    assert.equal(m.cutoffPosition, null); assert.equal(m.daily.length, 7);
    assert.equal(m.from, "2026-10-10"); assert.equal(m.daily[0].initial, 1300);
    assert.equal(m.daily[0].final, 1400); assert.equal(m.overdue.length, 4);
  }
});

test("installed upgrade preserves older batches and frozen forecasts while versioning current/future ERP", async () => {
  const migration = "20261012000000000_cash_position.sql", db = await decisionDb(migration);
  try {
    const records = processWorkbook(await parseWorkbook(workbookBytes()), undefined, erpContext).records;
    const historical = await importErp(db, "historical.xlsm", records);
    const next = structuredClone(records); next.forEach(r => { r.normalized.cutoffDate = "2026-09-11"; });
    const current = await importErp(db, "current.xlsm", next);
    await query(db, "select treasury_save_manual($1,null,null,$2::jsonb,'{}'::jsonb) s", [current.id,
      JSON.stringify({ date: "2026-09-11", amount: 100, currency: "CLP", type: "expense", category: "supplier", status: "proyectado", description: "Pending today", bank: "Banco de prueba" })]);
    const before = await migrationSnapshot(db, current.id);
    const oldContext = { cutoff: before.batch!.cutoff, currency: "CLP", horizon: 7, minimum: 0 };
    const oldRevision = await query(db, "select treasury_revision($1) s", [current.id]);
    const frozen = await query(db, "select treasury_freeze_forecast($1,$2,$3::jsonb) s", [current.id, oldRevision, JSON.stringify(oldContext)]);
    const rawBefore = await query(db, "select jsonb_agg(normalized_json order by id) s from daily_base_rows where batch_id=$1", [current.id]);
    await db.exec("reset role");
    await db.exec(await readFile("supabase/migrations/" + migration, "utf8"));
    await session(db);
    const after = await migrationSnapshot(db, current.id);
    assert.equal(after.engineVersion, CASH_POSITION_ENGINE);
    assert.equal((await migrationSnapshot(db, historical.id)).engineVersion, "erp-business-plan-v2");
    assert.deepEqual(after.rows, before.rows); assert.deepEqual(after.manual, before.manual);
    assert.deepEqual(await query(db, "select jsonb_agg(normalized_json order by id) s from daily_base_rows where batch_id=$1", [current.id]), rawBefore);
    const saved: RawSnapshot = await query(db, "select snapshot s from treasury_forecasts where id=$1", [frozen.id]);
    assert.deepEqual(saved, frozen.snapshot);
    const oldModel = decisionModel(snapshotRows(saved), saved.links, { ...oldContext, engineVersion: saved.engineVersion });
    const newModel = decisionModel(snapshotRows(after), after.links, { ...oldContext, engineVersion: after.engineVersion });
    assert.equal(oldModel.days[0].date, "2026-09-12");
    assert.equal(newModel.days[0].date, "2026-09-11"); assert.equal(newModel.cutoffPosition!.expense, 100);
    const revision = await query(db, "select treasury_revision($1) s", [current.id]);
    assert.notEqual(revision, oldRevision);
    await assert.rejects(query(db, "select treasury_freeze_forecast($1,$2,$3::jsonb) s", [current.id, revision, JSON.stringify(oldContext)]), /criterio de cálculo/);
    const v3Context = { ...oldContext, engineVersion: after.engineVersion };
    const recent = await query(db, "select treasury_freeze_forecast($1,$2,$3::jsonb) s", [current.id, revision, JSON.stringify(v3Context)]);
    assert.equal(recent.engine_version, CASH_POSITION_ENGINE);
    assert.deepEqual(recent.snapshot, after);
    const later = structuredClone(next); later.forEach(r => { r.normalized.cutoffDate = "2026-09-12"; });
    const imported = await importErp(db, "later.xlsm", later);
    assert.equal((await migrationSnapshot(db, imported.id)).engineVersion, CASH_POSITION_ENGINE);
    assert.equal((await migrationSnapshot(db, current.id)).engineVersion, CASH_POSITION_ENGINE);
    assert.deepEqual(await query(db, "select snapshot s from treasury_forecasts where id=$1", [recent.id]), recent.snapshot);
  } finally { await db.close(); }
});
