import test from "node:test";
import assert from "node:assert/strict";
import { toMinorUnits, minorUnitsToDecimal, toSafeDisplayNumber, accountKey, isoDate, nextDate, nextMonthStart, firstProjectionDate, validateDates, bankClosing, isPostingEffective, approvedNextOpening } from "../src/financial-engine/financial-contract-core.ts";

const account = {company:"Fixture",ledger:"BANK-01",currency:"CLP"};
test("monetary decimals are exact and reject third decimal/exponents/overflow", () => {
  assert.equal(toMinorUnits("0.10") + toMinorUnits("0.20"),30n);
  assert.equal(minorUnitsToDecimal(-83200000000n),"-832000000.00");
  assert.equal(toMinorUnits("100000000000000000.09"),10000000000000000009n);
  assert.equal(toSafeDisplayNumber(105n),1.05);
  assert.throws(() => toSafeDisplayNumber(10000000000000000009n),/seguro/);
  for (const x of ["0.001","1e6","1,10",Infinity]) assert.throws(() => toMinorUnits(x),/inválido/);
});
test("financial account identity excludes bank label and never mixes currencies", () => {
  assert.equal(accountKey(account),JSON.stringify(["Fixture","BANK-01","CLP"]));
  assert.notEqual(accountKey(account),accountKey({...account,currency:"USD"}));
  assert.throws(() => accountKey({...account,ledger:""}),/incompleta/);
});
test("calendar uses cutoff N, not extraction/import date; N+1 and month rollover", () => {
  assert.equal(firstProjectionDate("2026-10-14"),"2026-10-15");
  assert.equal(nextDate("2024-02-28"),"2024-02-29");
  assert.equal(nextMonthStart("2026-10-01"),"2026-11-01");
  assert.equal(nextMonthStart("2026-12-01"),"2027-01-01");
  assert.throws(() => isoDate("2026-02-30"),/inválida/);
  validateDates({effectiveOn:"2026-10-13",postedOn:"2026-10-14",extractedAt:"2026-10-14T08:00:00-03:00",importedAt:"2026-10-14T08:30:00-03:00",cutoffOn:"2026-10-14",dueOn:null,plannedOn:null});
  assert.throws(() => validateDates({effectiveOn:null,postedOn:null,extractedAt:null,importedAt:"2026-10-14T08:30:00",cutoffOn:"2026-10-14",dueOn:null,plannedOn:null}),/zona horaria/);
});
test("bank real balance uses opening + Cargo - Abono and never invents missing opening", () => {
  assert.equal(bankClosing("1000.00",["500.10"],["200.05"]),130005n);
  assert.equal(bankClosing("0",["0.10","0.20"],[]),30n);
  assert.throws(() => bankClosing(null,[],[]),/Apertura ausente/);
  assert.throws(() => bankClosing("0",["-1"],[]),/negativo/);
});
test("omitted posting is still effective; explicit corrections require evidence and preserve historical as-of", () => {
  assert.equal(isPostingEffective("vigente","posting-a","2026-10-14",null),true);
  assert.throws(() => isPostingEffective("anulacion_confirmada","posting-a","2026-10-14",null),/autorización/);
  const e = {sourceKey:"posting-a",state:"anulacion_confirmada" as const,approvedBy:"responsable",approvedAt:"2026-10-14T14:00:00-03:00",effectiveFrom:"2026-10-14",reason:"Ajuste ERP confirmado",evidenceRef:"folio-verificado"};
  assert.equal(isPostingEffective("anulacion_confirmada","posting-a","2026-10-13",e),true);
  assert.equal(isPostingEffective("anulacion_confirmada","posting-a","2026-10-14",e),false);
});
test("approved reconciliation alone creates next monthly opening without silently balancing", () => {
  const c = {account,month:"2026-10-01",opening:100000n,charges:50010n,credits:20005n,authorizedAdjustments:0n,closing:130005n,reportedClosing:130005n,reconciled:true,approvedBy:"tesorería",approvedAt:"2026-10-31T19:00:00-03:00",evidenceRef:"cartola-test",revision:1};
  assert.deepEqual(approvedNextOpening(c),{accountKey:accountKey(account),month:"2026-11-01",opening:130005n,fromRevision:1});
  assert.throws(() => approvedNextOpening({...c,closing:130006n}),/no cuadra/);
  assert.throws(() => approvedNextOpening({...c,reportedClosing:130006n}),/no conciliado/);
});
