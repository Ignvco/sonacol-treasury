import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { erpContext, erpWithBankBalances, workbookBytes } from "./helpers/erp-workbook";
import { decisionDb, query } from "./helpers/decision-db";
import { importErp } from "./helpers/caja-migration";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";
import { snapshotRows, type RawSnapshot } from "../src/financial-engine/snapshot";
import { snapshotProjection, PROJECTION_DEFAULTS } from "../src/financial-engine/projection";
import { aggregateProjection } from "../src/financial-engine/calculations";
import { total, type TreasuryRow } from "../src/financial-engine/base-treasury";
let db: PGlite, original: RawSnapshot;
before(async () => {
 db = await decisionDb();
 const rows = processWorkbook(await parseWorkbook(workbookBytes(erpWithBankBalances())), undefined, erpContext).records;
 const batch = await importErp(db, "ERP-activity.xlsm", rows);
 original = await query(db, "select get_daily_base_snapshot($1) s", [batch.id]);
});
after(() => db?.close());
const project = (rows = snapshotRows(original), extra = {}) => snapshotProjection({ rows, links: [], cutoff: original.batch!.cutoff }, { ...PROJECTION_DEFAULTS, ...extra });

test("registered expenses are visible independently of future payments and never get subtracted twice", () => {
 const p = project(), a = p.bankActivity!;
 assert.equal(a.expense, 200000); assert.equal(a.income, 500000);
 assert.equal(a.opening, 1000500); assert.equal(a.closing, 1300500);
 assert.equal(p.available, a.closing); assert.equal(p.daily[0].initial, a.closing);
 assert.equal(p.payments, 0); assert.equal(p.projected, 1302500); // Only the future invoice adds 2000.
 assert.equal(a.expenseRows.length, 1); assert.equal(a.movements.length, 2);
 assert.ok(a.movements.every(r => r.normalized!.recordRole === "bank_movement"));
 assert.equal(p.events.some(r => r.origin === "BANCO"), false);
 assert.equal(a.daily.find(r => r.date === "2026-09-02")!.final, 800500);
 assert.equal(a.daily.find(r => r.date === "2026-09-03")!.final, 1300500);
 assert.equal(a.daily[a.daily.length - 1].final, p.available);
 assert.ok(a.daily.every(r => total([r.initial, r.income, -r.expense]) === r.final));
 assert.equal(total(a.daily.map(r => r.expense)), a.expense);
 assert.equal(a.incomeRows.some(r => r.normalized!.recordRole === "bank_opening"), false);
});

test("actual and planned expenses retain independent dates, signs, source rows and totals", async () => {
 await query(db, "select treasury_save_manual($1,null,null,$2::jsonb,'{}'::jsonb) s", [original.batch!.id, JSON.stringify({ date: "2026-09-12", amount: 50000, currency: "CLP", type: "expense", category: "supplier", status: "proyectado", description: "Pago futuro" })]);
 const updated: RawSnapshot = await query(db, "select get_daily_base_snapshot($1) s", [original.batch!.id]);
 const p = project(snapshotRows(updated));
 assert.equal(p.bankActivity!.expense, 200000); assert.equal(p.payments, 50000);
 assert.equal(p.daily.find(d => d.date === "2026-09-12")!.expense, 50000);
 assert.equal(p.projected, 1252500);
 assert.equal(p.minimumDate, "2026-09-12"); assert.equal(p.minimum, 1250500);
 assert.equal(p.bankActivity!.expenseRows[0].row, 2);
 assert.equal(p.bankActivity!.expenseRows[0].normalized!.sourceSheet, "BANCOS");
});

test("shared bank/currency filters and accounts without movements give matching cash and daily totals", () => {
 const one = project(undefined, { bank: "Banco de prueba" });
 assert.equal(one.bankActivity!.expense, 200000); assert.equal(one.bankActivity!.closing, one.available);
 const quiet = project(undefined, { bank: "Banco sin movimientos" });
 assert.equal(quiet.bankActivity!.movements.length, 0);
 assert.equal(quiet.bankActivity!.income, 0); assert.equal(quiet.bankActivity!.expense, 0);
 assert.ok(quiet.bankActivity!.daily.every(d => d.initial === 500 && d.final === 500));
 const usd = project(undefined, { currency: "USD" });
 assert.equal(usd.available, 0); assert.equal(usd.bankActivity, null);
});

test("cash minimum at the cutoff points to its actual source date, never to a higher future closing", () => {
 const p = project();
 assert.equal(p.minimum, 1300500); assert.equal(p.minimumDate, "2026-09-10");
 assert.ok(p.closing.final > p.minimum);
 const cash = snapshotRows(original).filter(r => r.kind === "cash_flow");
 const negative = structuredClone(cash);
 const opening = negative.find(r => r.normalized!.recordRole === "bank_opening")!;
 Object.assign(opening, { amount: 100, type: "expense" });
 Object.assign(opening.normalized!, { amount: 100, signedAmount: -100, type: "expense" });
 const onlyOpening = project([opening]);
 assert.equal(onlyOpening.minimum, -100); assert.equal(onlyOpening.minimumDate, original.batch!.cutoff);
 assert.equal(onlyOpening.bankActivity!.expense, 0); // A negative opening is not a period payment.
});

test("daily, weekly and monthly buckets preserve exact cents, first opening and last closing", () => {
 const rows = [
  { date: "2026-09-21", initial: 1, income: 0, expense: 0.1, final: 0.9, variation: -0.1 },
  { date: "2026-09-22", initial: 0.9, income: 0, expense: 0.2, final: 0.7, variation: -0.2 },
 ];
 for (const mode of ["weekly", "monthly"] as const) {
  const [b] = aggregateProjection(rows, mode);
  assert.deepEqual([b.initial, b.income, b.expense, b.final, b.variation], [1, 0, 0.3, 0.7, -0.3]);
  const actual = aggregateProjection(project().bankActivity!.daily, mode);
  assert.equal(total(actual.map(r => r.expense)), 200000);
  assert.equal(actual[actual.length - 1].final, 1300500);
 }
 assert.equal(aggregateProjection(rows, "daily"), rows);
});

test("historic snapshots stay fixed while a refresh adds only the new period expense", async () => {
 const wb = erpWithBankBalances();
 const records = processWorkbook(await parseWorkbook(workbookBytes(wb)), undefined, { ERP: { ...erpContext.ERP, cutoffDate: "2026-09-11" } }).records;
 const additional = structuredClone(records.find(r => r.normalized.recordRole === "bank_movement" && r.normalized.type === "expense")!);
 additional.row = 4;
 Object.assign(additional.normalized, { transaction: "102", document: "JE 03", erpDocument: "JE 03", date: "2026-09-11", dueDate: "2026-09-11", amount: 100000, signedAmount: -100000, haber: 100000 });
 additional.raw = {}; records.push(additional);
 const b = await importErp(db, "ERP-new.xlsm", records);
 const current: RawSnapshot = await query(db, "select get_daily_base_snapshot($1) s", [b.id]);
 const p = snapshotProjection({ rows: snapshotRows(current), links: current.links, cutoff: current.batch!.cutoff });
 assert.equal(p.bankActivity!.expense, 300000); assert.equal(p.bankActivity!.closing, 1200500);
 assert.equal(p.payments, 50000); // The business decision survives the new source snapshot.
 const old: RawSnapshot = await query(db, "select get_daily_base_snapshot($1) s", [original.batch!.id]);
 assert.equal(project(snapshotRows(old)).bankActivity!.expense, 200000);
 assert.equal((await importErp(db, "ERP-repeat.xlsm", records)).id, b.id);
});

test("different opening periods cannot produce an invented consolidated daily history", () => {
 const rows = snapshotRows(original);
 const second = rows.find(r => r.ledger === "BANK-02")!;
 second.normalized!.periodStart = "2026-09-02";
 const p = project(rows);
 assert.equal(p.bankActivity!.closing, p.available);
 assert.equal(p.bankActivity!.from, null);
 assert.equal(p.bankActivity!.daily.length, 0);
 assert.match(p.bankActivity!.periodIssue, /períodos de origen distintos/);
 // Rows outside the active snapshot never leak into the registered indicators.
 const removed: TreasuryRow = { ...rows[0], id: "removed", inLatest: false };
 assert.equal(project([...rows, removed]).bankActivity!.closing, p.available);
});
