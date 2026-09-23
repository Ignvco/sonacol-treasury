import { PGlite } from "@electric-sql/pglite";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
export const admin = "10000000-0000-0000-0000-000000000001",
  reader = "10000000-0000-0000-0000-000000000002";
export async function decisionDb() {
  const db = new PGlite();
  const tests = await readFile("tests/database.test.ts", "utf8");
  const setup = tests
    .slice(
      tests.indexOf("before(async()=>{") + "before(async()=>{".length,
      tests.indexOf("\nafter("),
    )
    .trim()
    .replace(/\}\);$/, "");
  await new Function(
    "db",
    "writer",
    "reader",
    "readFile",
    "return (async()=>{" + setup + "})();",
  )(db, admin, reader, readFile);
  await db.exec(
    `reset role; set request.jwt.claim.sub=''; create role service_role; update profiles set role='administrador' where id='${admin}'; create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims',true),'')::jsonb,'{}'); $$;`,
  );
  for (const file of (await readdir("supabase/migrations"))
    .filter((f) => f >= "20260917000000000")
    .sort())
    await db.exec(await readFile("supabase/migrations/" + file, "utf8"));
  await session(db);
  return db;
}
export async function session(db: PGlite, id = admin, aal = "aal2") {
  await db.exec(
    `reset role; set role authenticated; select set_config('request.jwt.claim.sub','${id}',false); select set_config('request.jwt.claims','{"aal":"${aal}","role":"authenticated"}',false);`,
  );
}
// SQL JSON RPC results intentionally have their database-defined shape.
export async function query(
  db: PGlite,
  sql: string,
  args: unknown[] = [],
): Promise<any> { // eslint-disable-line @typescript-eslint/no-explicit-any
  return (await db.query<{ s: unknown }>(sql, args)).rows[0]?.s;
}
export const hash = (s: string) => createHash("sha256").update(s).digest("hex");
export function row(
  origin = "BANCO",
  i = 9,
  extra: Record<string, unknown> = {},
) {
  return {
    sheet: "BASE",
    row: i,
    status: "VALID",
    entityType: {
      BANCO: "cash_flow",
      CLIENTES: "invoice",
      COLOCACIONES: "investment",
      MANUAL: "projection",
    }[origin],
    raw: { R: 100 },
    normalized: {
      sourceId: origin + ":" + i,
      sourceProfile: "BASE-ONLY-4",
      sourceOrigin: origin,
      amount: 100,
      currency: "CLP",
      type: "income",
      date: "2026-09-19",
      dueDate: "2026-09-25",
      bank: "Banco Test",
      ledgerCode: "1101",
      description: "Test " + i,
      status: origin === "MANUAL" ? "proyectado" : "pendiente",
      cutoffDate: "2026-09-19",
      document: String(i),
      ...extra,
    },
  };
}
export async function upload(
  db: PGlite,
  name: string,
  rows: unknown[] = [row(), row("MANUAL", 10)],
) {
  const p = await query(db, "select compare_daily_base($1::jsonb) s", [
    JSON.stringify(rows),
  ]);
  return query(db, "select import_daily_base($1,$2,$3::jsonb,$4,$5::int[]) s", [
    name,
    hash(name),
    JSON.stringify(rows),
    p.revision,
    [],
  ]);
}
