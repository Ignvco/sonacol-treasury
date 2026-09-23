import assert from "node:assert/strict";
import { test } from "node:test";
import { decisionDb, upload, row, query } from "./helpers/decision-db";
import {
  snapshotRows,
  type RawSnapshot,
} from "../src/financial-engine/snapshot";
import { snapshotProjection } from "../src/financial-engine/projection";

test("BASE 17/18/22: updates and repeats preserve one active document, historical balances and MANUAL edits", async () => {
  const db = await decisionDb();
  try {
    const records = (day: string, cash: number, invoice: number) => [
      row("BANCO", 9, { amount: cash, date: day, cutoffDate: day }),
      row("CLIENTES", 10, {
        amount: invoice,
        date: "2026-09-17",
        dueDate: "2026-09-25",
        cutoffDate: day,
        customer: "Cliente",
        document: "F001",
      }),
      row("MANUAL", 11, {
        amount: 50,
        type: "expense",
        date: "2026-09-26",
        cutoffDate: day,
      }),
    ];
    const snapshot = (id: string | null = null): Promise<RawSnapshot> =>
      query(db, "select get_daily_base_snapshot($1) s", [id]);
    const forecast = (s: RawSnapshot) =>
      snapshotProjection({
        rows: snapshotRows(s),
        links: s.links,
        cutoff: s.batch!.cutoff,
      });
    const a = await upload(
      db,
      "BASE-17.xlsm",
      records("2026-09-17", 1000, 100),
    );
    const b = await upload(
      db,
      "BASE-18.xlsm",
      records("2026-09-18", 1100, 120),
    );
    const old = await snapshot(b.id),
      manual = old.manual[0];
    await query(db, "select save_daily_manual($1,$2,$3,$4::jsonb) s", [
      b.id,
      manual.id,
      manual.revision,
      JSON.stringify({ ...manual.normalized, amount: 75 }),
    ]);
    const c = await upload(
      db,
      "BASE-22.xlsm",
      records("2026-09-22", 1300, 150),
    );
    const latest = await snapshot();
    assert.equal(latest.batch?.id, c.id);
    assert.equal(latest.rows.length, 2);
    assert.equal(
      latest.rows.find((r) => r.kind === "invoice")?.id,
      old.rows.find((r) => r.kind === "invoice")?.id,
    );
    assert.equal(
      latest.rows.find((r) => r.kind === "invoice")?.normalized.amount,
      150,
    );
    assert.equal(latest.manual.length, 1);
    assert.equal(latest.manual[0].normalized.amount, 75);
    assert.equal(forecast(latest).projected, 1375);
    assert.equal(forecast(await snapshot(a.id)).projected, 1050);
    assert.equal(forecast(await snapshot(b.id)).projected, 1145);
    assert.equal(
      (await upload(db, "BASE-22.xlsm", records("2026-09-22", 1300, 150))).id,
      c.id,
    );
    assert.equal(forecast(await snapshot()).projected, 1375);
    const counts = await db.query<{ n: number }>(
      "select count(*)::int n from daily_base_batches",
    );
    assert.equal(counts.rows[0].n, 3);
    const correction = await upload(
      db,
      "BASE-22-corregida.xlsm",
      records("2026-09-22", 1300, 160),
    );
    assert.equal((await snapshot()).batch?.id, correction.id);
    assert.equal(forecast(await snapshot()).projected, 1385);
    assert.equal(forecast(await snapshot(c.id)).projected, 1375);
  } finally {
    await db.close();
  }
});
