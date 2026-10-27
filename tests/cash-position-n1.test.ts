import test from "node:test";
import assert from "node:assert/strict";
import { baseTreasury, CASH_POSITION_ENGINE, CASH_POSITION_ENGINE_N1, type TreasuryRow } from "../src/financial-engine/base-treasury";
const cutoff = "2026-10-14";
const make = (id: string, kind: TreasuryRow["kind"], amount: number, type: string, plannedDate: string, other: Partial<TreasuryRow> = {}): TreasuryRow => ({
  id,kind,origin:kind==="cash_flow"?"BANCO":"MANUAL",amount,type,plannedDate,date:plannedDate,currency:"CLP",status:kind==="cash_flow"?"conciliado":"proyectado",bank:"Banco Prueba",ledger:"BANK-01",settlementLedger:"BANK-01",description:id,document:id,customer:"",interest:0,cutoff,fileName:"fixture.xls",row:null,recordId:null,...other,
});
const opening = make("opening","cash_flow",1000,"income","2026-09-30");
const booked = make("booked","cash_flow",100,"expense",cutoff);
const collection = make("collection","projection",200,"income",cutoff);
const payment = make("payment","projection",50,"expense",cutoff);
const overdue = make("overdue","projection",25,"expense","2026-10-13");
const tomorrow = make("tomorrow","projection",80,"income","2026-10-15");
const rows = [opening,booked,collection,payment,overdue,tomorrow];
const evaluate = (engineVersion: string | undefined = CASH_POSITION_ENGINE_N1, input: TreasuryRow[] = rows, currency="CLP") => baseTreasury(input,[],cutoff,7,currency,"",engineVersion);

test("v4 starts exactly N+1 while separately showing real N and expected close N", () => {
  const m=evaluate();
  assert.equal(m.available,900);
  assert.equal(m.cutoffPosition!.date,cutoff);
  assert.equal(m.cutoffPosition!.available,900);
  assert.equal(m.cutoffPosition!.income,200);
  assert.equal(m.cutoffPosition!.expense,50);
  assert.equal(m.cutoffPosition!.closing,1050);
  assert.equal(m.days.length,7);
  assert.equal(m.days[0].date,"2026-10-15");
  assert.equal(m.days[0].income,280);
  assert.equal(m.days[0].expense,75);
  assert.equal(m.days[0].balance,1105);
  assert.equal(m.days[1].date,"2026-10-16");
  assert.equal(m.days[1].balance,1105);
  assert.equal(m.projected,1105);
  assert.equal(m.days.some(d=>d.date===cutoff),false);
  assert.equal(m.cutoffPosition!.accounts[0].closing,1050);
});
test("v4 overdue and N-day pending are carried exactly once to N+1, not booked twice",()=>{
 const m=evaluate();
 assert.equal(m.events.filter(e=>e.effectiveDate==="2026-10-15").length,4);
 assert.equal(m.events.filter(e=>e.date===cutoff&&e.origin==="BANCO").length,0);
 assert.equal(m.overdue.length,3);
 assert.equal(m.days[0].income-m.days[0].expense,205);
 assert.equal(m.days[0].balance-m.available,205);
 assert.match(m.issues.join(" "),/N\+1/);
});
test("v3 and historical missing-version policies remain unchanged",()=>{
 const legacy=evaluate(CASH_POSITION_ENGINE), old=evaluate("erp-business-plan-v2");
 assert.equal(legacy.days.length,8);
 assert.equal(legacy.days[0].date,cutoff);
 assert.equal(legacy.days[0].balance,1050);
 assert.equal(legacy.days[1].balance,1105);
 assert.equal(old.cutoffPosition,null);
 assert.equal(old.days.length,7);
 assert.equal(old.days[0].date,"2026-10-15");
 assert.equal(old.days[0].balance,1105);
});
test("v4 keeps cent-exact balances and partial manual executions without rounding",()=>{
 const r=[make("start","cash_flow",0.1,"income","2026-09-30"),make("other","cash_flow",0.2,"income",cutoff),make("partial","projection",0.3,"expense",cutoff,{normalized:{executedAmount:0.1}})];
 const m=evaluate(CASH_POSITION_ENGINE_N1,r);
 assert.equal(m.available,0.3);
 assert.equal(m.cutoffPosition!.closing,0.1);
 assert.equal(m.days[0].balance,0.1);
 assert.equal(m.events[0].amount,0.2);
 assert.equal(m.events[0].signed,-0.2);
});
test("v4 does not mix currencies when a native-currency filter is selected",()=>{
 const usd=make("usd","cash_flow",500,"income",cutoff,{currency:"USD",ledger:"BANK-USD",settlementLedger:"BANK-USD"});
 const m=evaluate(CASH_POSITION_ENGINE_N1,[...rows,usd],"CLP");
 assert.equal(m.available,900);
 assert.equal(m.positions.length,1);
 assert.equal(m.positions[0].currency,"CLP");
});
test("v4 validates planned date rather than inferring date from extraction",()=>{
 assert.throws(()=>evaluate(CASH_POSITION_ENGINE_N1,[opening, make("bad","projection",10,"income","")]),/fecha prevista/i);
});
test("v4 preserves separate investment holdings; no automatic rescues",()=>{
 const invested=make("fund","investment",800,"income","2026-10-20",{status:"vigente",origin:"COLOCACIONES"});
 const m=evaluate(CASH_POSITION_ENGINE_N1,[opening,invested]);
 assert.equal(m.available,1000);
 assert.equal(m.invested,800);
 assert.equal(m.projected,1000);
 assert.equal(m.events.length,0);
});
test("v4 follows October to November calendar without duplicating monthly opening",()=>{
 const m=baseTreasury([make("opening","cash_flow",100,"income","2026-09-30"),make("receivable","projection",10,"income","2026-11-01")],[],"2026-10-31",3,"CLP","",CASH_POSITION_ENGINE_N1);
 assert.deepEqual(m.days.map(d=>d.date),["2026-11-01","2026-11-02","2026-11-03"]);
 assert.equal(m.days[0].balance,110);
});
