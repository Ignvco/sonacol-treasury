import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decisionDb, query, session, reader } from "./helpers/decision-db";
import { importErp, migrationFixture, migrationSnapshot } from "./helpers/caja-migration";
import { snapshotRows, type BusinessDecision } from "../src/financial-engine/snapshot";
import { baseTreasury } from "../src/financial-engine/base-treasury";
import { compareMigration } from "../src/financial-engine/migration-comparison";

const policy = { ruleType: "collection", days: 5, priority: 10, bankLedger: "BANK-01" };
test("installed stage 1 upgrades in place; formula adoption preserves manual dates and rejects stale previews", async () => {
  const db = await decisionDb("20260926030000000");
  try {
    const { batch, legacy } = await migrationFixture(db);
    const before = await migrationSnapshot(db, batch);
    await db.exec("reset role");
    await db.exec(await readFile("supabase/migrations/20260926030000000_caja_business_migration.sql", "utf8"));
    await session(db);
    const snap = await migrationSnapshot(db, batch);
    assert.deepEqual(snap.business!.map(d => d.values_json), before.business!.map(d => d.values_json));
    assert.equal(snap.business!.filter(d => d.source_json).length, 5);
    const preview = () => query(db, "select treasury_preview_collection_policy($1,'C001',$2::jsonb) s", [batch, JSON.stringify(policy)]);
    const plan = await preview(); assert.equal(plan.invoiceCount, 4); assert.equal(plan.releaseIds.length, 2); assert.equal(plan.preservedDates, 1);
    const edited = snap.business!.find(d => d.source_json?.normalized.document === "503")!;
    await query(db, "select treasury_save_business($1,$2,$3,'adjustment',$4,$5::jsonb,false) s", [batch, edited.id, edited.revision, edited.target_key, JSON.stringify({ ...edited.values_json, date: "2026-09-29" })]);
    await assert.rejects(query(db, "select treasury_apply_collection_policy($1,'C001',$2::jsonb,$3) s", [batch, JSON.stringify(policy), plan.revision]), /cambió/);
    const revised = await preview(); assert.equal(revised.releaseIds.length, 1); assert.equal(revised.preservedDates, 2);
    await query(db, "select treasury_apply_collection_policy($1,'C001',$2::jsonb,$3) s", [batch, JSON.stringify(policy), revised.revision]);
    const after = await migrationSnapshot(db, batch), invoice = (doc: string) => after.rows.find(r => r.kind === "invoice" && r.normalized.document === doc)!.normalized;
    assert.equal(invoice("500").adjustedDate, null); assert.equal(invoice("500").reportDate, "2026-09-25");
    assert.equal(invoice("501").adjustedDate, "2026-09-28"); assert.equal(invoice("503").adjustedDate, "2026-09-29");
    assert.equal(after.business!.find(d => d.id === revised.releaseIds[0])!.source_json!.normalized.reportDate, "2026-09-25");
    assert.equal((await migrationSnapshot(db, legacy)).rows.find(r => r.normalized.document === "500")!.normalized.reportDate, "2026-09-25");
    await assert.rejects(preview(), /prioridad/);
    await session(db, reader);
    await assert.rejects(query(db, "select treasury_apply_collection_policy($1,'C001',$2::jsonb,$3) s", [batch, JSON.stringify(policy), revised.revision]), /pendiente|rol/);
    await session(db);
    await assert.rejects(query(db, "select treasury_save_business_v1($1,null,null,'rule','*',$2::jsonb,false) s", [batch, JSON.stringify(policy)]), /permission denied/);
  } finally { await db.close(); }
});

test("reviewed bindings move MANUAL links atomically and source evidence survives deletion and later reimports", async () => {
  const db = await decisionDb();
  try {
    const { batch, legacy, records } = await migrationFixture(db);
    const snap = await migrationSnapshot(db, batch), pending = snap.business!.find(d => d.source_json?.normalized.document === "502")!;
    assert.ok(pending.target_key.startsWith("legacy:"));
    const target = snap.rows.find(r => r.kind === "invoice" && r.normalized.document === "502")!;
    const save = (d: BusinessDecision, key: string, values = d.values_json) => query(db, "select treasury_save_business($1,$2,$3,$4,$5,$6::jsonb,false) s", [batch, d.id, d.revision, d.kind, key, JSON.stringify(values)]);
    const occupied = snap.rows.find(r => r.kind === "invoice" && r.normalized.document === "500")!;
    await assert.rejects(save(pending, occupied.normalized.businessKey), /unique|duplicate/);
    await assert.rejects(save(pending, target.normalized.businessKey, { ...pending.values_json, sourceRecord: "forged" }), /inmutable/);
    await assert.rejects(save(pending, snap.rows.find(r => r.kind === "cash_flow")!.normalized.businessKey), /factura/);
    const saved = await save(pending, target.normalized.businessKey);
    await assert.rejects(save(pending, target.normalized.businessKey), /cambió/);
    let after = await migrationSnapshot(db, batch);
    assert.equal(after.links[0].target_id, target.id);
    const model = baseTreasury(snapshotRows(after), after.links, after.batch!.cutoff, 30, "CLP");
    assert.equal(model.collections, 8000); assert.ok(!model.events.some(e => e.id === target.id)); assert.equal(model.issues.length, 0);
    assert.equal((await migrationSnapshot(db, legacy)).links[0].target_id, pending.source_json!.entityId);
    const rescue = after.business!.find(d => d.kind === "redemption")!, position = after.rows.find(r => r.kind === "investment")!;
    await assert.rejects(save(rescue, position.normalized.businessKey, { ...rescue.values_json, amount: 13001, bankLedger: "BANK-01" }), /exceden/);
    await save(rescue, position.normalized.businessKey, { ...rescue.values_json, bankLedger: "BANK-01" });
    after = await migrationSnapshot(db, batch); assert.equal(after.rows.find(r => r.kind === "investment")!.normalized.reservedAmount, 5000);
    const deletion = await query(db, "select excel_deletion_plan($1) s", [legacy]);
    await query(db, "select delete_excel_imports($1,$2,'ELIMINAR') s", [legacy, deletion.revision]);
    const next = structuredClone(records); next.forEach(r => { r.normalized.cutoffDate = "2026-09-11"; });
    const b = await importErp(db, "ERP-siguiente.xlsx", next), carried = await migrationSnapshot(db, b.id);
    const matched = carried.business!.find(d => d.id === saved.id)!;
    assert.equal(matched.target_key, target.normalized.businessKey); assert.deepEqual(matched.source_json, pending.source_json);
    assert.equal(carried.links[0].target_id, target.id);
    assert.equal(carried.rows.find(r => r.kind === "investment")!.normalized.reservedAmount, 5000);
    const revision = await query(db, "select treasury_revision($1) s", [b.id]);
    const frozen = await query(db, "select treasury_freeze_forecast($1,$2,$3::jsonb) s", [b.id, revision, JSON.stringify({ cutoff: "2026-09-11", currency: "CLP", horizon: 30, minimum: 0 })]);
    assert.deepEqual(frozen.snapshot.business.find((d: BusinessDecision) => d.id === saved.id).source_json, pending.source_json);
    const missing = structuredClone(next); missing.forEach(r => { r.normalized.cutoffDate = "2026-09-12"; });
    const replaced = missing.find(r => r.entityType === "invoice" && r.normalized.document === "502")!;
    Object.assign(replaced.normalized, { erpDocument: "904", document: "504", originalFolio: "FE-504" });
    const later = await importErp(db, "ERP-documento-fuera-de-cobertura.xlsx", missing), latest = await migrationSnapshot(db, later.id);
    assert.ok(latest.businessIssues!.some(issue => issue.includes("Ajuste sin registro")));
    const rebound = latest.business!.find(d => d.id === saved.id)!, replacement = latest.rows.find(r => r.kind === "invoice" && r.normalized.document === "504")!;
    await query(db, "select treasury_save_business($1,$2,$3,'adjustment',$4,$5::jsonb,false) s", [later.id, rebound.id, rebound.revision, replacement.normalized.businessKey, JSON.stringify(rebound.values_json)]);
    const resolved = await migrationSnapshot(db, later.id);
    assert.equal(resolved.links[0].target_id, replacement.id);
    assert.equal(baseTreasury(snapshotRows(resolved), resolved.links, resolved.batch!.cutoff, 30, "CLP").issues.length, 0);
    assert.equal((await migrationSnapshot(db, b.id)).links[0].target_id, target.id);
  } finally { await db.close(); }
});

test("daily comparison explains changes and refuses different cuts or missing currency coverage", async () => {
  const db = await decisionDb();
  try {
    const { batch, legacy } = await migrationFixture(db);
    const before = await migrationSnapshot(db, legacy), after = await migrationSnapshot(db, batch);
    let result = compareMigration(before, after, "CLP");
    assert.equal(result.blocks.length, 0); assert.equal(result.openingDelta, 0);
    assert.equal(result.numericallyEqual, false); assert.ok(result.changes.some(c => c.before?.kind === "investment" && !c.after));
    let cumulative = result.openingDelta!;
    for (const day of result.days) { cumulative += day.collections + day.redemptions + day.manual; assert.equal(day.delta, cumulative); }
    const mismatch = structuredClone(after); mismatch.batch!.cutoff = "2026-09-11";
    result = compareMigration(before, mismatch, "CLP"); assert.equal(result.days.length, 0); assert.match(result.blocks.join(), /cortes difieren/);
    assert.match(compareMigration(before, after, "USD").blocks.join(), /no incluye saldos/);
    assert.match(compareMigration(before, after, "BASE").blocks.join(), /moneda original/);
    const missingAccount = structuredClone(before); missingAccount.rows.find(r => r.kind === "cash_flow")!.normalized.ledgerCode = "OUTSIDE";
    assert.match(compareMigration(missingAccount, after, "CLP").warnings.join(), /Cobertura de cuentas/);
  } finally { await db.close(); }
});
