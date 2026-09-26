import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import { decisionDb, query, hash, session, reader } from "./helpers/decision-db";
import { erpContext, workbookBytes } from "./helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";
import { snapshotRows, type RawSnapshot, type BusinessDecision } from "../src/financial-engine/snapshot";
import { baseTreasury } from "../src/financial-engine/base-treasury";
import type { ProcessedRecord } from "../src/import-engine/types";
let db: PGlite, records: ProcessedRecord[], batch: string;
before(async () => { db = await decisionDb(); records = processWorkbook(await parseWorkbook(workbookBytes()), undefined, erpContext).records; batch = await upload("first", records); });
after(() => db?.close());
async function upload(name: string, rows: ProcessedRecord[]) {
 const plan = await query(db, "select compare_erp_import($1::jsonb) s", [JSON.stringify(rows)]);
 return (await query(db, "select import_erp_daily($1,$2,$3::jsonb,$4) s", [name, hash(name), JSON.stringify(rows), plan.revision])).id as string;
}
const snapshot = (id = batch): Promise<RawSnapshot> => query(db, "select get_daily_base_snapshot($1) s", [id]);
const save = (kind: string, target: string, values: Record<string, unknown>, old?: BusinessDecision, id = batch): Promise<BusinessDecision> => query(db, "select treasury_save_business($1,$2,$3,$4,$5,$6::jsonb,false) s", [id, old?.id ?? null, old?.revision ?? null, kind, target, JSON.stringify(values)]);

test("positions are derived from signed ledger amounts and never become automatic future income", async () => {
 const snap = await snapshot(), model = baseTreasury(snapshotRows(snap), [], snap.batch!.cutoff, 30, "CLP");
 assert.equal(model.available, 1300); assert.equal(model.invested, 13000); assert.equal(model.collections, 2000);
 assert.equal(snap.rows.filter(r => r.kind === "investment").length, 1);
 assert.equal(model.events.filter(r => r.kind === "investment").length, 0);
});
test("collection rule and explicit override change forecast, retaining original ERP due date", async () => {
 const original = await snapshot(), invoice = original.rows.find(r => r.kind === "invoice")!;
 await save("rule", "*", { ruleType: "collection", days: 5, priority: 10, bankLedger: "BANK-01", note: "Política de prueba" });
 let snap = await snapshot(); assert.equal(snap.rows.find(r => r.id === invoice.id)!.normalized.reportDate, "2026-09-25");
 await save("adjustment", invoice.normalized.businessKey, { date: "2026-09-28", note: "Compromiso confirmado" });
 snap = await snapshot(); const adjusted = snap.rows.find(r => r.id === invoice.id)!;
 assert.equal(adjusted.normalized.adjustedDate, "2026-09-28"); assert.equal(adjusted.normalized.dueDate, "2026-09-20");
 assert.equal(adjusted.normalized.erpOriginal.adjustedDate, null);
 const raw = await query(db, "select normalized_json s from daily_base_rows where id=$1", [invoice.recordId]); assert.equal(raw.reportDate, null); assert.equal(raw.adjustedDate, null);
});
test("partial rescues reserve capital once; cancellation releases it; overbooking is rejected", async () => {
 const snap = await snapshot(), position = snap.rows.find(r => r.kind === "investment")!;
 const a = await save("redemption", position.normalized.businessKey, { date: "2026-09-24", amount: 5000, currency: "CLP", bankLedger: "BANK-01", status: "planned", description: "Remuneraciones" });
 await save("redemption", position.normalized.businessKey, { date: "2026-09-25", amount: 3000, currency: "CLP", bankLedger: "BANK-01", status: "planned", description: "Proveedores" });
 let state = await snapshot(), p = state.rows.find(r => r.kind === "investment")!;
 assert.equal(p.normalized.reservedAmount, 8000); assert.equal(p.normalized.remainingAmount, 5000);
 assert.equal(baseTreasury(snapshotRows(state), [], state.batch!.cutoff, 30, "CLP").collections, 10000);
 await assert.rejects(save("redemption", position.normalized.businessKey, { date: "2026-09-26", amount: 5001, currency: "CLP", bankLedger: "BANK-01", status: "planned" }), /exceden/);
 await save("redemption", a.target_key, { ...a.values_json, status: "cancelled" }, a);
 state = await snapshot(); p = state.rows.find(r => r.kind === "investment")!;
 assert.equal(p.normalized.reservedAmount, 3000); assert.equal(p.normalized.remainingAmount, 10000);
 assert.equal(baseTreasury(snapshotRows(state), [], state.batch!.cutoff, 30, "CLP").collections, 5000);
});
test("reimport preserves decisions by identity and old snapshots retain their rules and adjustments", async () => {
 const before = await snapshot(), invoice = before.rows.find(r => r.kind === "invoice")!;
 const next = structuredClone(records); for (const r of next) r.normalized.cutoffDate = "2026-09-11";
 const changed = next.find(r => r.entityType === "invoice")!; changed.normalized.amount = 2500; changed.normalized.signedAmount = 2500;
 const newBatch = await upload("next", next), after = await snapshot(newBatch);
 assert.equal(after.business!.length, before.business!.length);
 const carried = after.rows.find(r => r.id === invoice.id)!; assert.equal(carried.normalized.adjustedDate, "2026-09-28"); assert.equal(carried.normalized.amount, 2500);
 const adjustment = after.business!.find(d => d.kind === "adjustment")!;
 await save("adjustment", adjustment.target_key, { ...adjustment.values_json, date: "2026-09-29" }, adjustment, newBatch);
 assert.equal((await snapshot()).rows.find(r => r.id === invoice.id)!.normalized.adjustedDate, "2026-09-28");
 assert.equal((await snapshot(newBatch)).rows.find(r => r.id === invoice.id)!.normalized.adjustedDate, "2026-09-29");
});
test("stale edits and attempts to rewrite accounting values are refused", async () => {
 const snap = await snapshot(), d = snap.business!.find(r => r.kind === "adjustment")!;
 await assert.rejects(save("adjustment", d.target_key, { date: "2026-09-28", amount: 1 }, d), /importe/);
 await assert.rejects(save("adjustment", d.target_key, { date: "2026-09-28" }, { ...d, revision: 0 }), /cambió/);
 await session(db, reader); await assert.rejects(save("rule", "*", { ruleType: "collection", days: 0, priority: 1 }), /pendiente|rol/); await session(db);
});

test("frozen forecasts include the effective rules, adjustments and rescues and survive later edits", async () => {
 const before = await snapshot(), revision = await query(db, "select treasury_revision($1) s", [batch]);
 const frozen = await query(db, "select treasury_freeze_forecast($1,$2,$3::jsonb) s", [batch, revision, JSON.stringify({ cutoff: before.batch!.cutoff, currency: "CLP", horizon: 30, minimum: 0 })]);
 assert.equal(frozen.snapshot.engineVersion, "erp-business-v1");
 assert.deepEqual(frozen.snapshot.business, before.business);
 const d = before.business!.find(r => r.kind === "adjustment")!;
 await save("adjustment", d.target_key, { ...d.values_json, date: "2026-09-30" }, d);
 const stored = await query(db, "select snapshot s from treasury_forecasts where id=$1", [frozen.id]);
 assert.equal(stored.rows.find((r: { kind: string }) => r.kind === "invoice").normalized.adjustedDate, "2026-09-28");
 assert.notEqual(await query(db, "select treasury_revision($1) s", [batch]), revision);
});

test("lower capital after reimport blocks existing excess rescues without erasing them", async () => {
 const next = structuredClone(records); for (const r of next) r.normalized.cutoffDate = "2026-09-12";
 const positionRows = next.filter(r => r.entityType === "investment");
 Object.assign(positionRows[0].normalized, { amount: 0, signedAmount: 0, balance: 0 });
 positionRows[1].normalized.balance = 5000;
 Object.assign(positionRows[2].normalized, { amount: 3000, signedAmount: -3000, haber: 3000, balance: 2000 });
 const current = await snapshot(await upload("lower-position", next));
 assert.equal(current.rows.find(r => r.kind === "investment")!.normalized.remainingAmount, -1000);
 assert.ok(current.businessIssues!.some(i => i.includes("exceden")));
 assert.equal(current.manual.find(r => r.normalized.recordRole === "planned_redemption")!.normalized.status, "borrador");
 assert.equal(baseTreasury(snapshotRows(current), [], current.batch!.cutoff, 30, "CLP").collections, 2000);
});

test("historical imports never inherit future decisions and changed decisions invalidate import reviews", async () => {
 const historical = structuredClone(records); for (const r of historical) r.normalized.cutoffDate = "2026-09-04";
 assert.deepEqual((await snapshot(await upload("historical", historical))).business, []);
 const proposed = structuredClone(records); for (const r of proposed) r.normalized.cutoffDate = "2026-09-13";
 const plan = await query(db, "select compare_erp_import($1::jsonb) s", [JSON.stringify(proposed)]);
 const latest = await query(db, "select daily_latest() s");
 const d = (await snapshot(latest)).business!.find(r => r.kind === "adjustment")!;
 await save("adjustment", d.target_key, { ...d.values_json, date: "2026-10-01" }, d, latest);
 await assert.rejects(query(db, "select import_erp_daily($1,$2,$3::jsonb,$4) s", ["stale", hash("stale"), JSON.stringify(proposed), plan.revision]), /cambiaron/);
});
