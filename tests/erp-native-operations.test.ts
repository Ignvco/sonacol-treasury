import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decisionDb, query, session, reader } from "./helpers/decision-db";
import { importErp, migrationSnapshot } from "./helpers/caja-migration";
import { erpContext, workbookBytes } from "./helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";
import { baseTreasury } from "../src/financial-engine/base-treasury";
import { snapshotRows, type BusinessDecision } from "../src/financial-engine/snapshot";

async function rawInput() {
  const records = processWorkbook(await parseWorkbook(workbookBytes()), undefined, { ERP: { ...erpContext.ERP, company: "SONACOL" } }).records;
  const movements = records.filter(r => r.normalized.recordRole === "bank_movement");
  movements[0].normalized.description = "PAGO PAC";
  movements[1].normalized.description = "COLOCACIONES";
  movements[2].normalized.description = "ABONO COPEC";
  return records;
}

test("empty installation operates from ERP alone: native rules, manual payments, customer policy, rescues and daily forecast", async () => {
  const db = await decisionDb();
  try {
    const records = await rawInput(), b = await importErp(db, "ERP-only.xlsx", records);
    let snap = await migrationSnapshot(db, b.id);
    assert.equal(await query(db, "select count(*)::int s from daily_base_batches"), 1);
    assert.equal(snap.business!.length, 16); assert.ok(snap.business!.every(d => d.kind === "rule" && !d.source_json && !d.values_json.sourceRecord));
    let invoice = snap.rows.find(r => r.kind === "invoice")!;
    assert.equal(invoice.normalized.dueDate, "2026-09-20"); assert.equal(invoice.normalized.reportDate, "2026-09-25");
    const category = (description: string) => snap.rows.find(r => r.normalized.description === description)!.normalized.category;
    assert.equal(category("PAGO PAC"), "direct_debit"); assert.equal(category("COLOCACIONES"), "investment_placement");
    assert.equal(category("ABONO COPEC"), "bank_credit"); // ABONO follows COPEC in business priority.
    assert.equal(baseTreasury(snapshotRows(snap), snap.links, snap.batch!.cutoff, 30, "CLP").available, 1300);
    const values = { ruleType: "collection", days: 7, priority: 10, bankLedger: "BANK-01" };
    const plan = await query(db, "select treasury_preview_collection_policy($1,'C001',$2::jsonb) s", [b.id, JSON.stringify(values)]);
    assert.equal(plan.releaseIds.length, 0);
    await query(db, "select treasury_apply_collection_policy($1,'C001',$2::jsonb,$3) s", [b.id, JSON.stringify(values), plan.revision]);
    const save = (kind: string, target: string, values: Record<string, unknown>, old?: BusinessDecision, remove = false) => query(db, "select treasury_save_business($1,$2,$3,$4,$5,$6::jsonb,$7) s", [b.id, old?.id ?? null, old?.revision ?? null, kind, target, JSON.stringify(values), remove]);
    await save("adjustment", invoice.normalized.businessKey, { date: "2026-09-28", note: "Compromiso confirmado en la plataforma" });
    const position = snap.rows.find(r => r.kind === "investment")!;
    const rescue = await save("redemption", position.normalized.businessKey, { date: "2026-09-25", amount: 500, currency: "CLP", status: "planned", bankLedger: "BANK-01" });
    await query(db, "select treasury_save_manual($1,null,null,$2::jsonb,'{}'::jsonb) s", [b.id, JSON.stringify({ date: "2026-09-26", amount: 900, currency: "CLP", type: "expense", category: "payroll", status: "proyectado", description: "Pago creado en plataforma", bank: "Banco de prueba" })]);
    snap = await migrationSnapshot(db, b.id);
    const model = baseTreasury(snapshotRows(snap), snap.links, snap.batch!.cutoff, 30, "CLP");
    assert.equal(model.available, 1300); assert.equal(model.invested, 13000); assert.equal(model.projected, 2900);
    assert.equal(model.days.find(d => d.date === "2026-09-25")!.balance, 1800);
    assert.equal(model.days.find(d => d.date === "2026-09-26")!.balance, 900);
    assert.equal(model.days.find(d => d.date === "2026-09-28")!.balance, 2900);
    invoice = snap.rows.find(r => r.kind === "invoice")!;
    assert.equal(invoice.normalized.reportDate, "2026-09-27"); assert.equal(invoice.normalized.adjustedDate, "2026-09-28"); assert.equal(invoice.normalized.settlementBank, "Banco de prueba");
    const raw = await query(db, "select normalized_json s from daily_base_rows where id=$1", [invoice.recordId]);
    assert.equal(raw.reportDate, null); assert.equal(raw.adjustedDate, null);
    const revision = await query(db, "select treasury_revision($1) s", [b.id]);
    const frozen = await query(db, "select treasury_freeze_forecast($1,$2,$3::jsonb) s", [b.id, revision, JSON.stringify({ cutoff: snap.batch!.cutoff, currency: "CLP", horizon: 30, minimum: 0 })]);
    const pac = snap.business!.find(d => d.values_json.contains === "PAGO PAC")!;
    await save("rule", pac.target_key, pac.values_json, pac, true);
    await save("redemption", rescue.target_key, { ...rescue.values_json, status: "executed" }, rescue);
    const next = structuredClone(records); next.forEach(r => { r.normalized.cutoffDate = "2026-09-11"; });
    const posting = next.find(r => r.normalized.description === "ABONO COPEC")!; posting.normalized.description = "Movimiento desconocido";
    const newInvoice = structuredClone(next.find(r => r.entityType === "invoice")!); newInvoice.row += 1;
    Object.assign(newInvoice.normalized, { erpDocument: "901", document: "501", originalFolio: "FE-501" }); next.push(newInvoice);
    const later = await importErp(db, "ERP-next.xlsx", next), carried = await migrationSnapshot(db, later.id);
    assert.equal(carried.business!.filter(d => d.kind === "rule").length, 16); // 15 starter + customer policy; retired PAC stays retired.
    assert.equal(carried.manual.filter(r => r.normalized.description === "Pago creado en plataforma").length, 1);
    assert.equal(carried.manual.filter(r => r.normalized.recordRole === "planned_redemption").length, 0);
    assert.equal(carried.rows.find(r => r.kind === "invoice" && r.normalized.document === "501")!.normalized.reportDate, "2026-09-27");
    assert.equal(carried.rows.find(r => r.id === invoice.id)!.normalized.adjustedDate, "2026-09-28");
    assert.equal(carried.rows.find(r => r.normalized.description === "Movimiento desconocido")!.normalized.category, "unclassified");
    assert.equal(baseTreasury(snapshotRows(carried), carried.links, carried.batch!.cutoff, 30, "CLP").available, 1300); // Marking executed never fabricates a bank receipt.
    assert.deepEqual((await query(db, "select snapshot s from treasury_forecasts where id=$1", [frozen.id])).business, frozen.snapshot.business);
    assert.equal((await importErp(db, "ERP-same-content.xlsx", next)).id, later.id);
  } finally { await db.close(); }
});

test("native initialization is explicit for existing data, guarded, and never overwrites configured or historical rules", async () => {
  const db = await decisionDb("20260926040000000");
  try {
    const records = await rawInput(), b = await importErp(db, "existing-ERP.xlsx", records);
    const before = await migrationSnapshot(db, b.id); assert.equal(before.business!.length, 0);
    await db.exec("reset role");
    await db.exec(await readFile("supabase/migrations/20260926040000000_erp_native_operations.sql", "utf8")); await session(db);
    assert.deepEqual((await migrationSnapshot(db, b.id)).rows, before.rows);
    await session(db, reader);
    await assert.rejects(query(db, "select treasury_initialize_operating_rules($1) s", [b.id]), /pendiente|rol/); await session(db);
    assert.equal(await query(db, "select treasury_initialize_operating_rules($1) s", [b.id]), 16);
    await assert.rejects(query(db, "select treasury_initialize_operating_rules($1) s", [b.id]), /configuración/);
    const old = structuredClone(records); old.forEach(r => { r.normalized.cutoffDate = "2026-09-04"; });
    const historical = await importErp(db, "historical-ERP.xlsx", old);
    assert.deepEqual((await migrationSnapshot(db, historical.id)).business, []);
    await assert.rejects(query(db, "select treasury_initialize_operating_rules($1) s", [historical.id]), /históricos/);
  } finally { await db.close(); }
});

test("initialization fills an unconfigured rule type without replacing existing collection policy", async () => {
  const db = await decisionDb("20260926040000000");
  try {
    const b = await importErp(db, "configured-ERP.xlsx", await rawInput());
    const existing = await query(db, "select treasury_save_business($1,null,null,'rule','*',$2::jsonb,false) s", [b.id, JSON.stringify({ ruleType: "collection", days: 12, priority: 0 })]);
    await db.exec("reset role"); await db.exec(await readFile("supabase/migrations/20260926040000000_erp_native_operations.sql", "utf8")); await session(db);
    assert.equal(await query(db, "select treasury_initialize_operating_rules($1) s", [b.id]), 15);
    const snap = await migrationSnapshot(db, b.id);
    assert.deepEqual(snap.business!.find(d => d.id === existing.id)!.values_json, existing.values_json);
    assert.equal(snap.rows.find(r => r.kind === "invoice")!.normalized.reportDate, "2026-10-02");
  } finally { await db.close(); }
});
