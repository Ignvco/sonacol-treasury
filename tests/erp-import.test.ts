import test from "node:test";
import assert from "node:assert/strict";
import { parseWorkbook, processWorkbook } from "../src/import-engine/pipeline";
import { importCutoffIssue } from "../src/import-engine/cutoff";
import { erpContext, erpWorkbook, workbookBytes } from "./helpers/erp-workbook";
const parse = async (wb = erpWorkbook()) => processWorkbook(await parseWorkbook(workbookBytes(wb)), undefined, erpContext);

test("ERP reads raw reports without BASE or MANUAL; repeated postings retain their value", async () => {
  const p = await parse(); assert.equal(p.error, 0); assert.equal(p.duplicate, 0); assert.equal(p.total, 8);
  assert.equal(p.records.filter(r => r.entityType === "cash_flow").reduce((sum, r) => sum + Number(r.normalized.signedAmount), 0), 1300);
  assert.equal(p.records.filter(r => r.entityType === "investment").reduce((sum, r) => sum + Number(r.normalized.signedAmount), 0), 13000);
  assert.equal(p.records.find(r => r.entityType === "invoice")!.normalized.rut, null);
  assert.ok(p.records.every(r => !r.normalized.reportDate && !r.normalized.adjustedDate));
  assert.equal(importCutoffIssue(p), null);
});
test("ERP requires declared cutoff and per-report periods, never file name or latest movement", async () => {
  const sheets = await parseWorkbook(workbookBytes());
  assert.match(importCutoffIssue(processWorkbook(sheets))!, /corte/);
  const p = processWorkbook(sheets, undefined, { ERP: { ...erpContext.ERP, investmentPeriodStart: undefined } });
  assert.match(importCutoffIssue(p)!, /COLOCACIONES/);
});
test("ERP rejects missing/duplicated headers and keeps malformed financial rows reviewable", async () => {
  const missing = erpWorkbook(); delete missing.Sheets.CLIENTES.A1;
  await assert.rejects(parse(missing), /CLIENTES.*encabezados/);
  const invalid = erpWorkbook(); invalid.Sheets.BANCOS.J3 = { t: "s", v: "CLP error" };
  assert.ok((await parse(invalid)).records.some(r => r.sheet === "BANCOS" && r.row === 3 && r.status === "ERROR"));
  const balance = erpWorkbook(); balance.Sheets.COLOCACIONES.I4 = { t: "s", v: "CLP 12.000" };
  assert.match((await parse(balance)).records.find(r => r.sheet === "COLOCACIONES" && r.row === 4)!.warnings, /Saldo acumulado/);
});
test("ERP columns can move without changing their meaning or losing cell provenance", async () => {
  const wb = erpWorkbook(), sheet = wb.Sheets.CLIENTES;
  for (const row of [1, 2]) [sheet[`A${row}`], sheet[`J${row}`]] = [sheet[`J${row}`], sheet[`A${row}`]];
  const p = await parse(wb), invoice = p.records.find(r => r.entityType === "invoice")!;
  assert.equal(invoice.normalized.amount, 2000); assert.equal(invoice.normalized.erpDocument, "900");
  assert.ok(Object.keys(invoice.raw).some(k => k.startsWith("A2 · Importe")));
});
