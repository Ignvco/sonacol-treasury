import test, { before, after } from "node:test";
import assert from "node:assert/strict";
import type { PGlite } from "@electric-sql/pglite";
import {
  decisionDb,
  query,
  session,
  admin,
  reader,
  upload,
} from "./helpers/decision-db";
let db: PGlite;
let batch: string;
before(async () => {
  db = await decisionDb();
  batch = (await upload(db, "decision.xlsx")).id;
});
after(() => db?.close());
test("admission: pending cannot read financial tables or use snapshot RPC; audit cannot be forged", async () => {
  await session(db, reader);
  assert.equal(
    (await db.query("select * from daily_base_rows")).rows.length,
    0,
  );
  await assert.rejects(
    query(db, "select get_daily_base_snapshot() s"),
    /pendiente/,
  );
  await assert.rejects(
    db.exec(
      "insert into audit_logs(actor,role,action,entity) values('fake','administrador','fake','fake')",
    ),
    /permission denied/,
  );
  await session(db);
});
test("admission: approval and financial mutations require MFA, approved readers cannot write", async () => {
  await session(db, admin, "aal1");
  await assert.rejects(
    query(db, "select treasury_set_access($1,$2,$3,$4,$5) s", [
      reader,
      "approved",
      "consulta",
      false,
      false,
    ]),
    /segundo factor/,
  );
  await session(db);
  await query(db, "select treasury_set_access($1,$2,$3,$4,$5) s", [
    reader,
    "approved",
    "consulta",
    false,
    false,
  ]);
  await session(db, reader);
  assert.equal(
    (await query(db, "select get_daily_base_snapshot() s")).rows.length,
    1,
  );
  await assert.rejects(
    query(db, "select treasury_export_authorize('test') s"),
    /permiso/,
  );
  await assert.rejects(
    query(db, "select save_daily_manual($1,null,null,$2::jsonb) s", [
      batch,
      "{}",
    ]),
    /rol/,
  );
  await session(db);
});
test("scenarios: server freezes source, duplicate forecasts dedupe and stale source cannot overwrite", async () => {
  const ws = await query(db, "select treasury_workspace($1) s", [batch]);
  const context = {
    cutoff: "2026-09-19",
    currency: "CLP",
    horizon: 30,
    minimum: 20,
  };
  const scenario = await query(
    db,
    "select treasury_save_scenario(null,null,$1,$2,$3,$4::jsonb,$5::jsonb) s",
    [batch, ws.revision, "Prueba", JSON.stringify(context), "[]"],
  );
  assert.equal(scenario.snapshot.rows.length, 1);
  const a = await query(
    db,
    "select treasury_freeze_forecast($1,$2,$3::jsonb) s",
    [batch, ws.revision, JSON.stringify(context)],
  );
  const b = await query(
    db,
    "select treasury_freeze_forecast($1,$2,$3::jsonb) s",
    [batch, ws.revision, JSON.stringify(context)],
  );
  assert.equal(a.id, b.id);
  await assert.rejects(
    query(
      db,
      "select treasury_save_scenario($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb) s",
      [
        scenario.id,
        scenario.revision,
        batch,
        "stale",
        "Test",
        JSON.stringify(context),
        "[]",
      ],
    ),
    /cambiaron/,
  );
  const key = "cash_flow:" + scenario.snapshot.rows[0].id;
  await assert.rejects(
    query(
      db,
      "select treasury_save_scenario(null,null,$1,$2,$3,$4::jsonb,$5::jsonb) s",
      [
        batch,
        ws.revision,
        "Invalid",
        JSON.stringify(context),
        JSON.stringify([{ key, amount: 2 }]),
      ],
    ),
    /futuros/,
  );
});
test("agenda: month-end recurrence clamps dates, an exception only edits its own occurrence", async () => {
  const values = {
    date: "2027-01-31",
    type: "expense",
    currency: "CLP",
    amount: 90,
    description: "Arriendo",
    status: "proyectado",
    category: "supplier",
  };
  const rows = await query(
    db,
    "select treasury_save_manual($1,null,null,$2::jsonb,$3::jsonb,$4,$5) s",
    [batch, JSON.stringify(values), "{}", "monthly", 3],
  );
  assert.deepEqual(
    rows.map((r) => r.normalized_json.date),
    ["2027-01-31", "2027-02-28", "2027-03-31"],
  );
  await query(
    db,
    "select treasury_save_manual($1,$2,$3,$4::jsonb,$5::jsonb) s",
    [
      batch,
      rows[1].id,
      1,
      JSON.stringify({ ...values, date: "2027-02-25", amount: 80 }),
      "{}",
    ],
  );
  const snap = await query(db, "select get_daily_base_snapshot($1) s", [batch]);
  assert.equal(
    snap.manual.find((r) => r.id === rows[0].id).normalized.amount,
    90,
  );
});
test("reconciliation: independent statements dedupe, partial allocations conserve both sides and reversals restore availability", async () => {
  const { hash } = await import("./helpers/decision-db");
  const account = '["Banco Test", "1101"]';
  const rows = [
    { date: "2026-09-19", amount: 100, reference: "9", description: "Cobro" },
  ];
  const stmt = await query(
    db,
    "select treasury_import_statement($1,$2,$3,$4,$5::jsonb,0,100) s",
    ["cartola.csv", hash("cartola"), account, "CLP", JSON.stringify(rows)],
  );
  const repeat = await query(
    db,
    "select treasury_import_statement($1,$2,$3,$4,$5::jsonb,0,100) s",
    ["cartola.csv", hash("cartola"), account, "CLP", JSON.stringify(rows)],
  );
  assert.equal(stmt.id, repeat.id);
  const bank = await query(db, "select treasury_reconciliation($1,$2) s", [
    account,
    "CLP",
  ]);
  const snap = await query(db, "select get_daily_base_snapshot($1) s", [batch]);
  const ledger = [{ id: snap.rows[0].recordId, amount: 40 }],
    transaction = [{ id: bank.transactions[0].id, amount: 40 }];
  const match = await query(
    db,
    "select treasury_confirm_match($1,$2,$3,$4::jsonb,$5::jsonb,$6) s",
    [
      batch,
      account,
      "CLP",
      JSON.stringify(ledger),
      JSON.stringify(transaction),
      "Abono parcial",
    ],
  );
  const current = await query(db, "select treasury_reconciliation($1,$2) s", [
    account,
    "CLP",
  ]);
  assert.equal(Number(current.transactions[0].allocated), 40);
  await assert.rejects(
    query(
      db,
      "select treasury_confirm_match($1,$2,$3,$4::jsonb,$5::jsonb,$6) s",
      [
        batch,
        account,
        "CLP",
        JSON.stringify([{ ...ledger[0], amount: 70 }]),
        JSON.stringify([{ ...transaction[0], amount: 70 }]),
        "Duplicado",
      ],
    ),
    /supera/,
  );
  await query(db, "select treasury_void_match($1,$2) s", [
    match,
    "Revisar respaldo",
  ]);
  assert.equal(
    Number(
      (
        await query(db, "select treasury_reconciliation($1,$2) s", [
          account,
          "CLP",
        ])
      ).transactions[0].allocated,
    ),
    0,
  );
  await assert.rejects(
    query(
      db,
      "select treasury_import_statement($1,$2,$3,$4,$5::jsonb,0,90) s",
      ["bad.csv", hash("badcartola"), account, "CLP", JSON.stringify(rows)],
    ),
    /no coincide/,
  );
});
test("deletion: dependent work is previewed and stale approval cannot remove a new comment", async () => {
  const plan = await query(db, "select excel_deletion_plan($1) s", [batch]);
  assert.equal(plan.dependentWork.scenarios, 1);
  assert.equal(plan.dependentWork.forecasts, 1);
  const snap = await query(db, "select get_daily_base_snapshot($1) s", [batch]);
  await query(db, "select treasury_comment($1,$2,$3) s", [
    batch,
    snap.manual[0].id,
    "Comentario nuevo",
  ]);
  await assert.rejects(
    query(db, "select delete_excel_imports($1,$2,$3) s", [
      batch,
      plan.revision,
      "ELIMINAR",
    ]),
    /cambiaron/,
  );
  const updated = await query(db, "select excel_deletion_plan($1) s", [batch]);
  await query(db, "select delete_excel_imports($1,$2,$3) s", [
    batch,
    updated.revision,
    "ELIMINAR",
  ]);
  assert.equal(
    (await db.query("select * from treasury_scenarios")).rows.length,
    0,
  );
  assert.equal(
    (await db.query("select * from treasury_statements")).rows.length,
    1,
  );
});
