import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { decisionDb, query, session, reader } from "./helpers/decision-db";

// Local PostgreSQL isolated by PGlite; NO remote Supabase connection.
test("catalog is private, admin-verified, auditable, revision-safe and never alters financial ledgers", async () => {
 const db = await decisionDb();
 try {
  await db.exec("reset role");
  const before = await db.query<{count:string}>("select count(*)::text count from public.daily_base_batches");
  await db.exec(await readFile("scripts/treasury-bank-account-catalog.sql","utf8"));
  await session(db);
  assert.deepEqual(await query(db,"select public.treasury_bank_catalog() s"),[]);
  const save=(ledger:string,number:string,revision:number|null=null,evidence="CERT-001")=>query(db,
    "select public.treasury_save_bank_binding($1,$2,$3,$4,$5,$6,$7) s",
    ["SONACOL",ledger,"CLP","Banco Prueba",number,evidence,revision]);
  const created=await save("511010016","000 0123-4567");
  assert.equal(created.maskedNumber,"•••• 4567");
  assert.equal(created.revision,1);
  assert.equal(JSON.stringify(await query(db,"select public.treasury_bank_catalog() s")).includes("00001234567"),false);
  await assert.rejects(db.query("select account_number from public.treasury_bank_account_catalog"),/permission denied|permis/i);
  await assert.rejects(save("511010017","00001234567"),/ya vinculado/);
  await assert.rejects(save("511010016","000 0123-9999",null),/modificada/);
  await assert.rejects(save("511010018","00001234567",null,"00001234567"),/no debe incluir/);
  const changed=await save("511010016","00001239999",1,"CERT-002");
  assert.equal(changed.revision,2); assert.equal(changed.maskedNumber,"•••• 9999");
  assert.deepEqual((await query(db,"select public.treasury_bank_catalog() s")).map((x:{revision:number})=>x.revision),[2]);
  await db.exec("reset role");
  const logs=await db.query<{payload:string}>("select row_to_json(e)::text payload from public.treasury_bank_account_catalog_events e");
  assert.equal(logs.rows.length,2);
  assert.equal(logs.rows.some(x=>x.payload.includes("00001234567")||x.payload.includes("00001239999")),false);
  const after=await db.query<{count:string}>("select count(*)::text count from public.daily_base_batches");
  assert.deepEqual(after.rows,before.rows);
  await session(db,reader);
  await assert.rejects(query(db,"select public.treasury_save_bank_binding('SONACOL','test','CLP','Banco Prueba','00001230000','CERT-001',null) s"),/permite|Acceso|autoriz/i);
 } finally { await db.close(); }
});
