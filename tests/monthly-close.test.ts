import test from "node:test";
import assert from "node:assert/strict";
import {
  parseExactCents, formatExactCents, proposeMonthlyClose, proposedNextOpening,
  type MonthlyCloseInput
} from "../src/financial-engine/monthly-close";

const sept: MonthlyCloseInput["previousApprovedClose"] = {
  month: "2026-09", closing: "1000.00", versionId: "approved-sept-v1",
  revision: 1, status: "aprobado"
};
const input = (changes: Partial<MonthlyCloseInput> = {}): MonthlyCloseInput => ({
  company: "SONACOL", ledger: "511010016", currency: "CLP", month: "2026-10",
  erpOpening: "1000.00", previousApprovedClose: sept, coverageComplete: true,
  sourceRunIds: ["erp-2026-10-14-am"], sourceCutoff: "2026-10-14",
  postings: [
    {sourceKey: "line-1",company: "SONACOL",ledger: "511010016",currency: "CLP",
      postedOn: "2026-10-13", cargo: "3.10",abono: "0.00"},
    {sourceKey: "line-2",company: "SONACOL",ledger: "511010016",currency: "CLP",
      postedOn: "2026-10-14", cargo: "0.00",abono: "0.30"}
  ], ...changes
});

test("PATCH09: September approved closing opens October, then October opens November", () => {
  const oct = proposeMonthlyClose(input());
  assert.equal(oct.status, "borrador");
  assert.equal(oct.opening, "1000.00");
  assert.equal(oct.cargo, "3.10");
  assert.equal(oct.abono, "0.30");
  assert.equal(oct.closing, "1002.80");
  assert.equal(oct.erpDifference, "0.00");
  const nov = proposedNextOpening({
    company: "SONACOL", ledger: "511010016", currency: "CLP",
    month: "2026-10",closing: oct.closing!, status:"aprobado",
    versionId:"approved-oct-v1",revision:1
  });
  assert.equal(nov.month, "2026-11");
  assert.equal(nov.opening, "1002.80");
  assert.equal(nov.sourceVersion, "approved-oct-v1");
  assert.deepEqual(nov, proposedNextOpening({
    company:"SONACOL",ledger:"511010016",currency:"CLP",month:"2026-10",
    closing:"1002.80",status:"aprobado",versionId:"approved-oct-v1",revision:1
  }));
});

test("PATCH09: duplicate identical ERP lines cannot inflate closing", () => {
  const baseline = input();
  const twice = proposeMonthlyClose(input({
    postings: [...baseline.postings,...baseline.postings],
    sourceRunIds:["erp-2026-10-14-am","erp-2026-10-14-am"]
  }));
  assert.equal(twice.closing, proposeMonthlyClose(baseline).closing);
  assert.deepEqual(twice.sourceKeys, ["line-1","line-2"]);
  assert.deepEqual(twice.sourceRunIds, ["erp-2026-10-14-am"]);
});

test("PATCH09: a conflicting source key is rejected, never silently merged", () => {
  const baseline=input();
  assert.throws(()=>proposeMonthlyClose(input({
    postings:[...baseline.postings,{...baseline.postings[0],cargo:"99.00"}]
  })),/contradictorios/);
});

test("PATCH09: ERP opening differs from the previous approved close", () => {
  const result=proposeMonthlyClose(input({erpOpening:"999.00"}));
  assert.equal(result.status,"requiere_revision");
  assert.equal(result.opening,"1000.00");
  assert.equal(result.erpDifference,"1.00");
  assert.equal(result.closing,"1002.80");
  assert.match(result.warnings.join(" "),/difiere/);
});

test("PATCH09: missing prior closing is not invented from SALDOS BANCOS", () => {
  const result=proposeMonthlyClose(input({previousApprovedClose:null}));
  assert.equal(result.status,"sin_cobertura");
  assert.equal(result.opening,null);
  assert.equal(result.closing,null);
  assert.equal(result.erpOpening,"1000.00");
  assert.equal(result.openingOrigin,"missing_previous_close");
});

test("PATCH09: late postings after approval demand review, never rewrite prior closing", () => {
  const result=proposeMonthlyClose(input({approvedSourceKeys:["line-1"]}));
  assert.equal(result.status,"requiere_revision");
  assert.match(result.warnings.join(" "),/posteriores al cierre/);
});

test("PATCH09: coverage gaps, missing ERP runs and source cutoffs are explicit", () => {
  const result=proposeMonthlyClose(input({
    coverageComplete:false,sourceRunIds:[],sourceCutoff:null,erpOpening:null
  }));
  assert.equal(result.status,"sin_cobertura");
  assert.equal(result.erpDifference,null);
  assert.ok(result.warnings.length>=4);
});

test("PATCH09: CLP/USD never mix and different account identity is rejected", () => {
  const baseline=input();
  assert.throws(()=>proposeMonthlyClose(input({
    postings:[{...baseline.postings[0],currency:"USD"}]
  })),/ajeno/);
  assert.throws(()=>proposeMonthlyClose(input({
    postings:[{...baseline.postings[0],ledger:"511010017"}]
  })),/ajeno/);
});

test("PATCH09: money uses exact decimal cents, not binary floats", () => {
  assert.equal(formatExactCents(parseExactCents("0.10")+parseExactCents("0.20")),"0.30");
  assert.equal(formatExactCents(parseExactCents("-0.01")),"-0.01");
  for(const invalid of ["0.001","1e5","NaN","1,000"," 1.00",""]) {
    assert.throws(()=>parseExactCents(invalid),/Importe inválido/);
  }
  const baseline=input();
  assert.throws(()=>proposeMonthlyClose(input({
    postings:[{...baseline.postings[0],cargo:"1.234"}]
  })),/Importe inválido/);
  assert.throws(()=>proposeMonthlyClose(input({
    postings:[{...baseline.postings[0],cargo:"1.00",abono:"1.00"}]
  })),/Cargo y abono inválidos/);
});

test("PATCH09: dates and opening versions must belong to the period", () => {
  const baseline=input();
  assert.throws(()=>proposeMonthlyClose(input({
    postings:[{...baseline.postings[0],postedOn:"2026-09-30"}]
  })),/fuera del mes/);
  assert.throws(()=>proposeMonthlyClose(input({
    postings:[{...baseline.postings[0],postedOn:"2026-10-35"}]
  })),/fuera del mes/);
  assert.throws(()=>proposeMonthlyClose(input({
    previousApprovedClose:{...sept!,month:"2026-08"}
  })),/mes anterior/);
  assert.equal(proposedNextOpening({
    company:"SONACOL",ledger:"511010016",currency:"CLP",
    month:"2026-12",closing:"1.01",versionId:"dec-v1",
    revision:1,status:"aprobado"
  }).month,"2027-01");
});
