import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../scripts/treasury-activate-n1.sql",import.meta.url),"utf8");
test("abort on unknown preexisting schema instead of rerunning old migrations",()=>{
 assert.match(sql,/to_regprocedure\('public\.import_erp_daily\(text,text,jsonb,text\)'\)/);
 assert.match(sql,/current_rule is null/);
 assert.match(sql,/erp-cash-position-v4' in current_rule/);
 assert.match(sql,/pg_advisory_xact_lock\(728394107\)/);
});
test("historical batches are not upgraded with UPDATE; only new inserts trigger v4",()=>{
 assert.match(sql,/before insert on public\.daily_base_batches/i);
 assert.match(sql,/new\.projection_engine_version:='erp-cash-position-v4'/);
 assert.doesNotMatch(sql,/update\s+public\.daily_base_batches\s+set\s+projection_engine_version/i);
 assert.match(sql,/from public\.daily_base_batches\s+where id=/i);
 assert.match(sql,/rename to get_daily_base_snapshot_before_n1/);
 assert.match(sql,/rename to treasury_validate_scenario_before_n1/);
});
test("the ERP RPC controls transaction marker and restores it",()=>{
 assert.match(sql,/p_records->0->'normalized'->>'sourceProfile'='ERP-RAW-v1'/);
 assert.match(sql,/perform public\.treasury_require\(true\)/);
 assert.match(sql,/perform set_config\('sonacol\.erp_new_batch_engine',old_context,true\)/);
 assert.match(sql,/public\.import_erp_daily_before_n1\(/);
});
test("read policy and scenario validator use persisted version rather than a UI flag",()=>{
 assert.match(sql,/select projection_engine_version into version from public\.daily_base_batches/i);
 assert.match(sql,/snap->>'engineVersion'='erp-cash-position-v4'/);
 assert.match(sql,/p_context->>'engineVersion'\) is distinct from \(snap->>'engineVersion'/);
 assert.doesNotMatch(sql,/insert\s+into\s+supabase_migrations/i);
});
