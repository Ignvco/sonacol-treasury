import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { profileWorkbook } from "./helpers/profile-workbook";
import { processWorkbook, parseWorkbook } from "../src/import-engine/pipeline";
import { readSonacol, BASE_READER_VERSION } from "../src/import-engine/sonacol";

const analyze = (wb: XLSX.WorkBook) => processWorkbook(readSonacol(wb));

test("reading profile exposes physical range and cutoff without changing the existing record identity", () => {
  const result = analyze(profileWorkbook());
  assert.equal(result.error, 0);
  assert.deepEqual(result.sheets[0].reading, {
    profileId: "SONACOL-BASE-v1",
    headerRow: 8,
    firstDataRow: 9,
    lastDataRow: 9,
    ignoredRows: 0,
    missingOptional: [],
    currencyColumn: null,
    cutoffSource: "AE7",
    cutoff: "2026-09-22",
    workbookCutoff: "2026-09-22",
    cutoffFormula: null,
    lastBankDate: "2026-09-22",
    cutoffIssue: null,
  });
  assert.equal(result.records[0].normalized.sourceProfile, BASE_READER_VERSION);
  assert.equal(result.records[0].normalized.amount, 100);
  assert.equal(result.records[0].normalized.type, "expense");
  assert.equal(result.records[0].normalized.cutoffDate, "2026-09-22");
});

test("reading profile permits growing rows, large blank gaps and a relocated header without a fixed row limit", async () => {
  const wb = profileWorkbook(12),
    ws = wb.Sheets.BASE;
  for (const [address, cell] of Object.entries(ws))
    if (/^[A-Z]+13$/.test(address))
      ws[address.replace("13", "6501")] = structuredClone(cell);
  ws.G6501.v = "002";
  ws["!ref"] = "A1:AE6501";
  const bytes = XLSX.write(wb, { type: "array", bookType: "xlsm" });
  ws.A1048576 = { t: "z" };
  ws.R1048576 = { t: "z" };
  ws["!ref"] = "A1:XFD1048576";
  assert.equal(analyze(wb).total, 2);
  const result = processWorkbook(await parseWorkbook(bytes));
  assert.equal(result.total, 2);
  assert.equal(result.error, 0);
  assert.deepEqual(
    result.records.map((r) => r.row),
    [13, 6501],
  );
  assert.equal(result.sheets[0].reading?.headerRow, 12);
  assert.equal(result.sheets[0].reading?.lastDataRow, 6501);
});

test("reading profile accepts known header variants without changing normalized values or identities", () => {
  const wb = profileWorkbook(),
    original = analyze(wb).records[0];
  wb.Sheets.BASE.A8.v = " Tabla de Origen ";
  wb.Sheets.BASE.E8.v = "CÓDIGO CTA.";
  wb.Sheets.BASE.F8.v = "Descripción Cuenta";
  wb.Sheets.BASE.K8.v = "N° DOCTO";
  const actual = analyze(wb).records[0];
  assert.deepEqual(actual.normalized, original.normalized);
  assert.equal(actual.dedupeKey, original.dedupeKey);
});

test("reading profile rejects shifted money columns and names the expected and actual cells", () => {
  const wb = profileWorkbook();
  [wb.Sheets.BASE.R8, wb.Sheets.BASE.Q8] = [
    wb.Sheets.BASE.Q8,
    wb.Sheets.BASE.R8,
  ];
  assert.throws(() => analyze(wb), /REAL: se espera en R8 y aparece en Q8/);
});

test("reading profile rejects shifted complementary columns and ambiguous header tables", () => {
  const wb = profileWorkbook();
  wb.Sheets.BASE.AO8 = wb.Sheets.BASE.M8;
  delete wb.Sheets.BASE.M8;
  assert.throws(() => analyze(wb), /VCTO REAL.*M8.*AO8/);
  const repeated = profileWorkbook();
  for (const [address, cell] of Object.entries(repeated.Sheets.BASE))
    if (/^[A-Z]+8$/.test(address))
      repeated.Sheets.BASE[address.replace("8", "20")] = structuredClone(cell);
  assert.throws(() => analyze(repeated), /encabezados repetidos.*8, 20/);
});

test("reading profile permits unused absent headings and the original second ESTADO outside mapped columns", () => {
  const wb = profileWorkbook();
  delete wb.Sheets.BASE.J8;
  wb.Sheets.BASE.X8 = { t: "s", v: "ESTADO" };
  assert.equal(analyze(wb).error, 0);
  assert.deepEqual(analyze(wb).sheets[0].reading?.missingOptional, ["J"]);
  wb.Sheets.BASE.J8 = { t: "z" };
  assert.equal(analyze(wb).error, 0);
  assert.deepEqual(analyze(wb).sheets[0].reading?.missingOptional, ["J"]);
});

test("reading profile requires a single explicit currency column", () => {
  const wb = profileWorkbook(),
    ws = wb.Sheets.BASE;
  ws.AG8 = { t: "s", v: "MONEDA" };
  ws.AG9 = { t: "s", v: "USD" };
  assert.equal(analyze(wb).records[0].normalized.currency, "USD");
  assert.equal(analyze(wb).sheets[0].reading?.currencyColumn, "AG");
  ws.AH8 = { t: "s", v: "MONEDA" };
  assert.throws(() => analyze(wb), /más de una columna MONEDA.*AG, AH/);
});

test("reading profile distinguishes an absent cutoff from an invalid or uncached cutoff", () => {
  const wb = profileWorkbook();
  delete wb.Sheets.BASE.AE7;
  const result = analyze(wb);
  assert.equal(result.sheets[0].reading?.cutoffSource, "last-bank-date");
  assert.equal(result.sheets[0].reading?.cutoff, "2026-09-22");
  assert.equal(result.records[0].normalized.cutoffDate, "2026-09-22");
  for (const cell of [
    { t: "s", v: "mañana" },
    { t: "n", f: "OTRA!A1" },
    { t: "e", v: 42 },
  ] as XLSX.CellObject[]) {
    wb.Sheets.BASE.AE7 = cell;
    assert.match(analyze(wb).sheets[0].reading!.cutoffIssue!, /BASE!AE7.*fecha válida/);
  }
});
