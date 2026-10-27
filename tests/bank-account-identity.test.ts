import test from "node:test";
import assert from "node:assert/strict";
import { canonicalBankAccountNumber, maskedBankAccountNumber, resolveBankAccount, verifyBankAccountBindings, type VerifiedBankAccountBinding } from "../src/financial-engine/bank-account-identity";
import { bankControls } from "../src/financial-engine/bank-control";
const make = (ledger: string, currency: string, accountNumber: string, bank = "Banco de Prueba", company = "SONACOL"): VerifiedBankAccountBinding => ({
  company, ledger, currency, accountNumber, bank, verifiedBy: "tesoreria", verifiedAt: "2026-10-27T09:30:00-03:00", evidenceRef: "cartola-validada",
});
const open = (ledger: string, bank: string, currency = "CLP", company = "SONACOL", signedAmount = 100) => ({
  normalized: { sourceProfile: "ERP-RAW-v1", recordRole: "bank_opening", company, ledgerCode: ledger, bank, currency,
    signedAmount, amount: Math.abs(signedAmount), type: signedAmount < 0 ? "expense" : "income",
    cutoffDate: "2026-10-14", periodStart: "2026-10-01" },sheet:"SALDOS BANCOS",row:3,
});
const movement = (ledger:string, bank:string, currency = "CLP", company="SONACOL") => ({
  normalized: { sourceProfile:"ERP-RAW-v1",recordRole:"bank_movement",company,ledgerCode:ledger,bank,currency,
    signedAmount:50,amount:50,type:"income",debe:50,haber:0,cutoffDate:"2026-10-14",periodStart:"2026-10-01" },sheet:"BANCOS",row:8,
});
test("bank account numbers are strings with significant leading zeros and masked presentation",()=>{
 assert.equal(canonicalBankAccountNumber("000 0123-4567"),"00001234567");
 assert.equal(maskedBankAccountNumber("000 0123-4567"),"•••• 4567");
 for (const bad of ["511", "1.234.567", "12AB4567", "1e10", "", " 0000  "]) assert.throws(()=>canonicalBankAccountNumber(bad));
});
test("physical bank account never inferred from accounting ledger or bank name",()=>{
 const r=resolveBankAccount({company:"SONACOL",ledger:"511010016",currency:"CLP",bank:"Banco de Prueba"},[]);
 assert.equal(r.state,"catalog_absent"); assert.equal(r.maskedNumber,null);
 assert.equal(resolveBankAccount({company:"SONACOL",ledger:"511010016",currency:"CLP",bank:"Banco de Prueba"},[make("511010017","CLP","0001234567")]).state,"unmapped");
});
test("verified bindings are isolated by company, ledger and currency",()=>{
 const b=[make("511010016","CLP","0001234567"),make("511010016","USD","0001234567"),make("511010016","CLP","0001234567","Banco de Prueba","OTHER")];
 assert.equal(verifyBankAccountBindings(b).size,3);
 assert.equal(resolveBankAccount({company:"SONACOL",ledger:"511010016",currency:"CLP",bank:"Banco de Prueba"},b).maskedNumber,"•••• 4567");
 assert.equal(resolveBankAccount({company:"SONACOL",ledger:"511010016",currency:"USD",bank:"Banco de Prueba"},b).state,"verified");
 assert.equal(resolveBankAccount({company:"OTHER",ledger:"511010016",currency:"CLP",bank:"Banco de Prueba"},b).state,"verified");
});
test("a physical bank account cannot silently feed two separate ERP ledgers",()=>{
 assert.throws(()=>verifyBankAccountBindings([make("511010016","CLP","0001234567"),make("511010017","CLP","0001234567")]),/dos cuentas contables/);
 assert.throws(()=>verifyBankAccountBindings([make("511010016","CLP","0001234567"),make("511010016","CLP","1111234567")]),/repetidas/);
});
test("verified bank mismatch is flagged, not auto-mapped by matching ledger",()=>{
 const r=resolveBankAccount({company:"SONACOL",ledger:"511010016",currency:"CLP",bank:"Banco Distinto"},[make("511010016","CLP","0001234567")]);
 assert.equal(r.state,"bank_mismatch"); assert.equal(r.maskedNumber,null);
});
test("invalid authorization or evidence rejects bank account registration",()=>{
 const b=make("511010016","CLP","0001234567");
 assert.throws(()=>verifyBankAccountBindings([{...b,evidenceRef:""}]),/evidencia/);
 assert.throws(()=>verifyBankAccountBindings([{...b,verifiedAt:"2026-10-27"}]),/verificación/);
});
test("bank controls retain exact equation while exposing only masked verified account",()=>{
 const c=bankControls([open("511010016","Banco de Prueba"),movement("511010016","Banco de Prueba")],[make("511010016","CLP","0001234567")])[0];
 assert.equal(c.calculated,150); assert.equal(c.opening,100); assert.equal(c.income,50);
 assert.equal(c.bankAccount.state,"verified"); assert.equal(c.bankAccount.maskedNumber,"•••• 4567");
 assert.equal(JSON.stringify(c).includes("0001234567"),false);
});
test("conflicting banks on the same ledger are reported without silently splitting or merging sums",()=>{
 const c=bankControls([open("511010016","Banco de Prueba"),movement("511010016","Banco Distinto")]);
 assert.equal(c.length,1);
 assert.match(c[0].issues.join(" "),/bancos distintos/);
 assert.equal(c[0].bankAccount.state,"catalog_absent");
});
test("unverified source never changes balance computation across currencies",()=>{
 const c=bankControls([open("511010016","Banco de Prueba","CLP"),open("511010016","Banco de Prueba","USD", "SONACOL",200)]);
 assert.deepEqual(c.map(x=>[x.currency,x.calculated]),[["CLP",100],["USD",200]]);
});
