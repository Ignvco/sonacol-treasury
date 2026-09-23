import assert from "node:assert/strict";
import { test } from "node:test";
import * as XLSX from "xlsx";
import { profileWorkbook } from "./helpers/profile-workbook";
import { readSonacol } from "../src/import-engine/sonacol";
import { processWorkbook } from "../src/import-engine/pipeline";
import { importCutoffIssue } from "../src/import-engine/cutoff";
import { importControlTotals } from "../src/import-engine/control-totals";
import { importFileHash, importIdentityOverrides } from "../src/import-engine/file-hash";

const analyze = (wb: XLSX.WorkBook, cutoffDate?: string) => processWorkbook(readSonacol(wb), undefined,
  cutoffDate === undefined ? {} : { BASE: { cutoffDate } });

test("cutoff: a cached TODAY value remains a reference until the user selects the data date", () => {
  const wb = profileWorkbook();
  wb.Sheets.BASE.AE7 = { t: "n", v: 46288, f: "TODAY()" };
  const before = analyze(wb);
  assert.match(importCutoffIssue(before)!, /fórmula/);
  const after = analyze(wb, "2026-09-22");
  assert.equal(importCutoffIssue(after), null);
  assert.equal(after.records[0].normalized.cutoffDate, "2026-09-22");
  assert.equal(after.records[0].normalized.workbookCutoff, "2026-09-23");
  assert.equal(after.records[0].normalized.cutoffSource, "user");
  assert.equal(after.records[0].dedupeKey, before.records[0].dedupeKey);
  assert.deepEqual(after.records[0].raw, before.records[0].raw);
  assert.equal(wb.Sheets.BASE.AE7.f, "TODAY()");
});

test("cutoff: missing and erroneous AE7 can be resolved without modifying the workbook", () => {
  for (const cell of [undefined, { t: "s", v: "sin fecha" }, { t: "e", v: 42 }, { t: "n", f: "OTHER!A1" }] as (XLSX.CellObject | undefined)[]) {
    const wb = profileWorkbook();
    if (cell) wb.Sheets.BASE.AE7 = cell;
    else delete wb.Sheets.BASE.AE7;
    const result = analyze(wb, "2026-09-22");
    assert.equal(importCutoffIssue(result), null);
    assert.equal(result.error, 0);
  }
});

test("cutoff: impossible dates and dates before actual bank movements cannot hide cash rows", () => {
  for (const cutoff of ["", "1900-01-05", "2026-02-30", "2026-09-21"])
    assert.ok(importCutoffIssue(analyze(profileWorkbook(), cutoff)));
  assert.equal(importCutoffIssue(analyze(profileWorkbook(), "2026-09-23")), null);
});

test("cutoff: mixed row dates cannot pass the client commit guard", () => {
  const result = analyze(profileWorkbook(), "2026-09-22");
  result.records[0].normalized.cutoffDate = "2026-09-23";
  assert.match(importCutoffIssue(result)!, /fecha de corte cambió/);
});

test("cutoff: retrying the same file and date is stable; a different date is a separate snapshot", () => {
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  const options = { BASE: { cutoffDate: "2026-09-22" } };
  assert.equal(importFileHash(bytes, options), importFileHash(bytes, structuredClone(options)));
  assert.notEqual(importFileHash(bytes, options), importFileHash(bytes, { BASE: { cutoffDate: "2026-09-23" } }));
});

test("cutoff: confirming the detected date keeps the old file identity; a genuine correction changes it", () => {
  const sheets = readSonacol(profileWorkbook());
  const options = { BASE: { cutoffDate: "2026-09-22" } };
  const bytes = new Uint8Array([1, 2, 3]).buffer;
  assert.equal(importFileHash(bytes, importIdentityOverrides(options, sheets)), importFileHash(bytes));
  assert.deepEqual(options, { BASE: { cutoffDate: "2026-09-22" } });
  const correction = importIdentityOverrides({ BASE: { cutoffDate: "2026-09-23" } }, sheets);
  assert.notEqual(importFileHash(bytes, correction), importFileHash(bytes));
});

test("reading control: native currencies stay separate and equal bank postings retain their multiplicity", () => {
  const wb = profileWorkbook(), ws = wb.Sheets.BASE;
  for (const [address, cell] of Object.entries(ws)) if (/^[A-Z]+9$/.test(address)) {
    ws[address.replace("9", "10")] = structuredClone(cell);
    ws[address.replace("9", "11")] = structuredClone(cell);
  }
  ws.F11 = { t: "s", v: "Banco Test USD" };
  ws.Q11 = { t: "n", v: 25.25 }; ws.R11 = { t: "n", v: -25.25 };
  const result = analyze(wb);
  assert.equal(result.duplicate, 0);
  assert.deepEqual(importControlTotals(result.records), [
    { origin: "BANCO", currency: "CLP", rows: 2, amount: -200 },
    { origin: "BANCO", currency: "USD", rows: 1, amount: -25.25 },
  ]);
});

test("planned dates: an erroneous N/O cannot silently fall back to another date", () => {
  for (const column of ["N", "O"]) for (const cell of [
    { t: "e", v: 42 }, { t: "s", v: "05-01-1900" }, { t: "n", f: "OTHER!A1" },
  ] as XLSX.CellObject[]) {
    const wb = profileWorkbook(), ws = wb.Sheets.BASE;
    ws.A9 = { t: "s", v: "MANUAL" };
    ws.N9 = { t: "n", v: 46288 };
    ws[column + "9"] = cell;
    const result = analyze(wb);
    assert.equal(result.error, 1);
    assert.match(result.records[0].warnings, new RegExp(`BASE!${column}9`));
  }
});
