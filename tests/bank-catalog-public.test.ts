import test from "node:test";
import assert from "node:assert/strict";
import { parsePublicBankCatalog, resolvePublicBankAccount } from "../src/financial-engine/bank-catalog-public";
import { bankControls } from "../src/financial-engine/bank-control";
const record = {company:"SONACOL",ledger:"511010016",currency:"CLP",bank:"Banco Prueba",maskedNumber:"•••• 4567",revision:1,verifiedAt:"2026-10-27T03:00:00+00:00"};
const opening = {normalized:{sourceProfile:"ERP-RAW-v1",recordRole:"bank_opening",company:"SONACOL",ledgerCode:"511010016",currency:"CLP",bank:"Banco Prueba",signedAmount:100,amount:100,type:"income",periodStart:"2026-10-01",cutoffDate:"2026-10-14"}};
const movement = {normalized:{sourceProfile:"ERP-RAW-v1",recordRole:"bank_movement",company:"SONACOL",ledgerCode:"511010016",currency:"CLP",bank:"Banco Prueba",debe:50,haber:0,signedAmount:50,amount:50,type:"income",periodStart:"2026-10-01",cutoffDate:"2026-10-14"}};
test("RPC payload contains only masked account identifiers",()=>{
 const [b]=parsePublicBankCatalog([record]);
 assert.equal(b.maskedNumber,"•••• 4567");
 assert.equal(JSON.stringify(b).includes("00001234567"),false);
});
test("reject malformed and unmasked RPC entries",()=>{
 for(const x of [{...record,maskedNumber:"00001234567"},{...record,revision:0},{...record,verifiedAt:"2026-10-27"},{...record,bank:""}])
  assert.throws(()=>parsePublicBankCatalog([x]));
 assert.throws(()=>parsePublicBankCatalog({}));
});
test("duplicate ledger mapping never silently selects first entry",()=>{
 assert.throws(()=>parsePublicBankCatalog([record,{...record,maskedNumber:"•••• 1234"}]));
});
test("same ledger remains distinct across company and currency",()=>{
 const all=parsePublicBankCatalog([record,{...record,company:"OTHER"},{...record,currency:"USD"}]);
 assert.equal(all.length,3);
 assert.equal(resolvePublicBankAccount({...record,company:"OTHER"},all).state,"verified");
});
test("mismatched bank and unknown ledger never expose a physical number",()=>{
 const list=parsePublicBankCatalog([record]);
 assert.equal(resolvePublicBankAccount({...record,bank:"Banco Distinto"},list).state,"bank_mismatch");
 assert.equal(resolvePublicBankAccount({...record,ledger:"511010017"},list).state,"unmapped");
 assert.equal(resolvePublicBankAccount(record,[]).state,"catalog_absent");
});
test("ERP money equation remains unchanged when catalog supplies masked identity",()=>{
 const [before]=bankControls([opening,movement]);
 const [after]=bankControls([opening,movement],[],parsePublicBankCatalog([record]));
 assert.equal(before.calculated,150);
 assert.equal(after.calculated,150);
 assert.equal(after.bankAccount.state,"verified");
 assert.equal(after.bankAccount.maskedNumber,"•••• 4567");
 assert.equal(JSON.stringify(after).includes("00001234567"),false);
});
test("verified bank mismatch raises issue but never redistributes posting",()=>{
 const [c]=bankControls([opening,movement],[],parsePublicBankCatalog([{...record,bank:"Otro Banco"}]));
 assert.equal(c.calculated,150);
 assert.match(c.issues.join(" "),/no coincide/i);
});
