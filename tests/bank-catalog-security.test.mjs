import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const sql=readFileSync("scripts/treasury-bank-account-catalog.sql","utf8");
const service=readFileSync("src/services/bankAccountCatalogService.ts","utf8");
const dto=readFileSync("src/financial-engine/bank-catalog-public.ts","utf8");
test("catalog is opt-in and isolated from financial postings",()=>{
 assert.match(sql,/create table public\.treasury_bank_account_catalog\s*\(/);
 assert.doesNotMatch(sql,/\b(?:delete from|truncate|drop table|update)\s+public\.(?:daily_|erp_|treasury_forecasts)/i);
 assert.doesNotMatch(sql,/^\s*(?:select|perform)\s+.*(?:db push|migration repair)/mi);
});
test("raw bank number stays behind revoked RLS tables and redacted RPC",()=>{
 assert.match(sql,/alter table public\.treasury_bank_account_catalog enable row level security/i);
 assert.match(sql,/revoke all on public\.treasury_bank_account_catalog,public\.treasury_bank_account_catalog_events from public,anon,authenticated/i);
 assert.match(sql,/right\(c\.account_number,4\)/);
 assert.doesNotMatch(sql,/'accountNumber',c\.account_number/);
 assert.match(service,/parsePublicBankCatalog/);
 assert.match(dto,/maskedNumber/);
});
test("save requires privileged MFA role and optimistic revision",()=>{
 assert.match(sql,/perform public\.treasury_require\(true\)/);
 assert.match(sql,/public\.current_role\(\) is distinct from 'administrador'/);
 assert.match(sql,/p_expected_revision is distinct from previous\.revision/);
 assert.match(sql,/evidence_ref/);
});
test("client handles catalog-not-installed without changing legacy bank calculations",()=>{
 assert.match(service,/PGRST202/);
 assert.match(service,/installed:false,bindings:\[\]/);
});
