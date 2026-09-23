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
  row,
  hash,
} from "./helpers/decision-db";
let db: PGlite;
before(async () => {
  db = await decisionDb();
});
after(() => db?.close());
test("operations: historical FX never looks ahead and rejects NaN; audit actor is verified", async () => {
  await query(
    db,
    "select treasury_set_fx('USD',900,'2026-09-01','Publicación A') s",
  );
  await query(
    db,
    "select treasury_set_fx('USD',950,'2026-09-20','Publicación B') s",
  );
  const past = await query(db, "select treasury_fx_rates('2026-09-19') s"),
    future = await query(db, "select treasury_fx_rates('2026-09-21') s");
  assert.equal(past.find((r) => r.currency === "USD").rate_to_clp, 900);
  assert.equal(future.find((r) => r.currency === "USD").rate_to_clp, 950);
  await assert.rejects(
    query(
      db,
      "select treasury_set_fx('USD','NaN'::numeric,'2026-09-19','Publicación C') s",
    ),
    /inválida/,
  );
  assert.equal(
    (
      await db.query(
        "select actor_id from audit_logs where action='Registró tasa histórica' limit 1",
      )
    ).rows[0].actor_id,
    admin,
  );
  await assert.rejects(
    db.exec("update fx_rates set rate_to_clp=2"),
    /permission denied/,
  );
});
test("operations: telemetry strips arbitrary payloads and operation status is service-only", async () => {
  await assert.rejects(
    query(db, "select treasury_operation('sap','forged','success','FAKE') s"),
    /permission denied/,
  );
  await assert.rejects(
    query(
      db,
      "select treasury_report_error('UNHANDLED','/reports?secret=1') s",
    ),
    /inválido/,
  );
  await query(db, "select treasury_report_error('UNHANDLED','/reports') s");
  assert.equal((await query(db, "select treasury_health() s")).recentErrors, 1);
  for (let i = 0; i < 20; i++)
    await query(db, "select treasury_assistant_authorize() s");
  await assert.rejects(
    query(db, "select treasury_assistant_authorize() s"),
    /minuto/,
  );
});
test("revisions: importing a later date does not alter the frozen historical revision", async () => {
  const first = await upload(db, "historical.xlsx", [row(), row("MANUAL", 10)]);
  const revision = await query(db, "select treasury_revision($1) s", [
    first.id,
  ]);
  await upload(db, "later.xlsx", [
    row("BANCO", 9, { cutoffDate: "2026-09-20", date: "2026-09-20" }),
    row("MANUAL", 10, { cutoffDate: "2026-09-20" }),
  ]);
  assert.equal(
    await query(db, "select treasury_revision($1) s", [first.id]),
    revision,
  );
});
test("SAP: approved service actor bypasses only MFA and source identity survives corrected amounts", async () => {
  const source = (amount: number) => [
    row("BANCO", 1, {
      sourceId: "journal-1",
      sourceProfile: "BASE-ONLY-SAP-v7",
      amount,
      cutoffDate: "2026-09-21",
    }),
  ];
  await db.exec(
    "reset role; set role service_role; select set_config('request.jwt.claims','{\"role\":\"service_role\"}',false);",
  );
  const a = await query(db, "select import_sap_daily($1,$2,$3::jsonb) s", [
    admin,
    hash("sap-a"),
    JSON.stringify(source(100)),
  ]);
  const b = await query(db, "select import_sap_daily($1,$2,$3::jsonb) s", [
    admin,
    hash("sap-b"),
    JSON.stringify(source(110)),
  ]);
  await session(db);
  const before = await query(db, "select get_daily_base_snapshot($1) s", [
      a.id,
    ]),
    after = await query(db, "select get_daily_base_snapshot($1) s", [b.id]);
  assert.equal(before.rows[0].id, after.rows[0].id);
  assert.equal(after.rows[0].normalized.amount, 110);
  await session(db, reader);
  await assert.rejects(
    query(db, "select import_sap_daily($1,$2,$3::jsonb) s", [
      admin,
      hash("sap-denied"),
      JSON.stringify(source(120)),
    ]),
    /permission denied/,
  );
  await session(db);
});

test("agenda: clearing a confirmed date restores the separately preserved estimate", async () => {
  await session(db);
  const batch = await upload(db, "date-estimate.xlsx", [
    row("BANCO", 9, { cutoffDate: "2026-10-01" }),
  ]);
  const values = {
    date: "2026-10-05",
    type: "expense",
    currency: "CLP",
    amount: 90,
    description: "Fecha estimada",
    status: "proyectado",
    category: "supplier",
  };
  const saved = await query(
    db,
    "select treasury_save_manual($1,null,null,$2::jsonb,$3::jsonb) s",
    [
      batch.id,
      JSON.stringify(values),
      JSON.stringify({ confirmed_date: "2026-10-08" }),
    ],
  );
  const ws = await query(db, "select treasury_workspace($1) s", [batch.id]);
  const detail = ws.details.find((d) => d.manual_id === saved[0].id);
  assert.equal(detail.estimated_date, "2026-10-05");
  assert.equal(detail.confirmed_date, "2026-10-08");
  assert.equal(saved[0].normalized_json.reportDate, "2026-10-08");
  const updated = await query(
    db,
    "select treasury_save_manual($1,$2,1,$3::jsonb,$4::jsonb) s",
    [
      batch.id,
      saved[0].id,
      JSON.stringify({ ...values, date: detail.estimated_date }),
      "{}",
    ],
  );
  assert.equal(updated[0].normalized_json.reportDate, "2026-10-05");
});
