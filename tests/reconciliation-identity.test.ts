import test from "node:test";
import assert from "node:assert/strict";
import { reconcileBankIdentity, reconciliationLegacyKey, assertSameReconciliationIdentity, type ReconciliationAccountSource } from "../src/financial-engine/reconciliation-identity";
import type { PublicBankAccountBinding } from "../src/financial-engine/bank-catalog-public";

const account = (company = "SONACOL", currency = "CLP"): ReconciliationAccountSource => ({
  bankName: "Banco Uno", accountNumber: "511010016", currency,
  rows: [{normalized:{sourceProfile:"ERP-RAW-v1", recordRole:"bank_opening", company}}],
});
const binding = (revision = 1): PublicBankAccountBinding => ({
 company:"SONACOL", ledger:"511010016", currency:"CLP", bank:"Banco Uno", maskedNumber:"•••• 1234", revision,
 verifiedAt:"2026-10-27T09:00:00-03:00",
});
const catalog = (bindings: PublicBankAccountBinding[] = [binding()]) => ({installed:true,bindings});

test("legacy reconciliation keys remain byte-for-byte bank-name + accounting-ledger",()=>{
 const a=account();const r=reconcileBankIdentity(a,catalog());
 assert.equal(r.legacyAccountKey,JSON.stringify(["Banco Uno","511010016"]));
 assert.equal(reconciliationLegacyKey(" Banco Uno ","0012"), '[" Banco Uno ","0012"]');
 assert.equal(r.maskedNumber,"•••• 1234");
 assert.equal(JSON.stringify(r).includes("00001234"),false);
});
test("verified ERP identity is additional evidence; writes require matching account, currency and revision",()=>{
 const r=reconcileBankIdentity(account(),catalog());
 assert.equal(r.state,"verified");assert.equal(r.mayWrite,true);assert.equal(r.revision,1);
 assert.doesNotThrow(()=>assertSameReconciliationIdentity(r,account(),catalog()));
});
test("installed catalog without mapping blocks new work but keeps historic key visible",()=>{
 const r=reconcileBankIdentity(account(),catalog([]));
 assert.equal(r.state,"unmapped");assert.equal(r.mayWrite,false);assert.equal(r.legacyAccountKey, '["Banco Uno","511010016"]');
 assert.throws(()=>assertSameReconciliationIdentity(r,account(),catalog()),/sin validación suficiente/);
});
test("bank mismatch blocks new work; no lookup by bank-name similarity",()=>{
 const b={...binding(),bank:"Banco Dos"};const r=reconcileBankIdentity(account(),catalog([b]));
 assert.equal(r.state,"bank_mismatch");assert.equal(r.maskedNumber,null);assert.equal(r.mayWrite,false);
});
test("company or currency mismatch cannot accidentally verify a different ERP account",()=>{
 assert.equal(reconcileBankIdentity(account("OTHER"),catalog()).state,"unmapped");
 assert.equal(reconcileBankIdentity(account("SONACOL","USD"),catalog()).state,"unmapped");
});
test("ambiguous or missing company blocks new operations",()=>{
 const a=account();a.rows=[a.rows[0],{normalized:{sourceProfile:"ERP-RAW-v1",recordRole:"bank_movement",company:"OTHER"}}];
 assert.equal(reconcileBankIdentity(a,catalog()).state,"ambiguous_company");
 assert.equal(reconcileBankIdentity(account(""),catalog()).mayWrite,false);
});
test("catalog installation is not required to read or operate on historical paths",()=>{
 const r=reconcileBankIdentity(account(),{installed:false,bindings:[]});
 assert.equal(r.state,"catalog_not_installed");assert.equal(r.mayWrite,true);
 assert.match(r.issue,/heredada/);
});
test("BASE-only historical snapshots never gain a fabricated ERP bank number",()=>{
 const a=account();a.rows=[{normalized:{sourceProfile:"BASE-ONLY-4",sourceOrigin:"BANCO"}}];
 const r=reconcileBankIdentity(a,catalog());
 assert.equal(r.state,"legacy_base");assert.equal(r.maskedNumber,null);assert.equal(r.mayWrite,true);
});
test("catalog activation or re-verification while a form is open fails before a new write",()=>{
 const initial=reconcileBankIdentity(account(),{installed:false,bindings:[]});
 assert.throws(()=>assertSameReconciliationIdentity(initial,account(),catalog()),/cambió/);
 const verified=reconcileBankIdentity(account(),catalog());
 assert.throws(()=>assertSameReconciliationIdentity(verified,account(),catalog([binding(2)])),/cambió/);
 assert.throws(()=>assertSameReconciliationIdentity(verified,account(),catalog([])),/sin validación suficiente/);
});
test("multiple physical account revisions never change stored account key",()=>{
 const a=account();
 assert.equal(reconcileBankIdentity(a,catalog([binding(1)])).legacyAccountKey,
  reconcileBankIdentity(a,catalog([{...binding(2),maskedNumber:"•••• 5678"}])).legacyAccountKey);
});
