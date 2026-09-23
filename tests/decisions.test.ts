import test from "node:test";
import assert from "node:assert/strict";
import {
  decisionModel,
  scenarioRows,
  sourceKey,
  compareSnapshots,
  cashBridge,
  forecastAccuracy,
  recurrenceDates,
  suggestMatches,
} from "./helpers/decision-domain";
import {
  answerTreasury,
  classifyQuestion,
} from "../src/financial-engine/assistant";
import { executiveReport } from "../src/financial-engine/report";
import {
  csvCells,
  parseStatement,
  statementMapping,
} from "../src/import-engine/statement";
import { createReportPdf } from "../src/lib/pdf-report";
import { PDFDocument } from "pdf-lib";
import type { TreasuryRow } from "../src/financial-engine/base-treasury";
const context = {
  cutoff: "2026-09-19",
  currency: "CLP",
  horizon: 7,
  minimum: 80,
};
const row = (extra: Partial<TreasuryRow> = {}): TreasuryRow => ({
  id: "bank",
  kind: "cash_flow",
  origin: "BANCO",
  amount: 100,
  currency: "CLP",
  type: "income",
  status: "pendiente",
  date: context.cutoff,
  plannedDate: context.cutoff,
  bank: "Banco",
  ledger: "1101",
  description: "Caja",
  document: "123",
  customer: "",
  interest: 0,
  cutoff: context.cutoff,
  fileName: "BASE.xlsm",
  row: 9,
  recordId: "trace-9",
  ...extra,
});
const rows = [
  row(),
  row({
    id: "payment",
    kind: "projection",
    origin: "MANUAL",
    type: "expense",
    amount: 40,
    plannedDate: "2026-09-20",
    description: "Egreso",
  }),
  row({
    id: "investment",
    kind: "investment",
    origin: "COLOCACIONES",
    amount: 50,
    interest: 5,
    plannedDate: "2026-09-21",
  }),
  row({ id: "usd", currency: "USD", amount: 999 }),
];
test("decisions: native currency, opening risk and scenario isolation preserve cash", () => {
  const original = structuredClone(rows),
    m = decisionModel(rows, [], context, [
      { key: "projection:payment", amount: 90, date: "2026-09-21" },
    ]);
  assert.equal(m.available, 100);
  assert.equal(m.projected, 65);
  assert.equal(m.firstRisk, "2026-09-21");
  assert.deepEqual(rows, original);
  assert.equal(
    decisionModel(rows, [], { ...context, minimum: 101 }).firstRisk,
    context.cutoff,
  );
  assert.throws(
    () => scenarioRows(rows, [{ key: sourceKey(rows[0]), amount: 1 }]),
    /futuro/,
  );
  assert.throws(
    () => scenarioRows(rows, [{ key: "projection:payment", amount: NaN }]),
    /positivo/,
  );
});
test("decisions: bridge explains signed changes and detects a change of direction", () => {
  const before = [row()],
    after = [row({ type: "expense" })];
  assert.deepEqual(compareSnapshots(before, after)[0].fields, ["type"]);
  assert.deepEqual(
    cashBridge(before, after, "CLP", context.cutoff, context.cutoff).difference,
    -200,
  );
});
test("accuracy: repeated observation dates and unrelated currencies never inflate evidence", () => {
  const a = forecastAccuracy(
    [{ date: "2026-09-20", balance: 60 }],
    [
      { date: "2026-09-20", currency: "CLP", amount: 50 },
      { date: "2026-09-20", currency: "CLP", amount: 90 },
      { date: "2026-09-21", currency: "CLP", amount: 50 },
      { date: "2026-09-20", currency: "USD", amount: 2 },
    ],
    "CLP",
    context.cutoff,
  );
  assert.equal(a.count, 1);
  assert.equal(a.mae, 10);
  assert.equal(a.bias, -10);
  assert.equal(forecastAccuracy([], [], "CLP", context.cutoff).mae, null);
});
test("agenda: month-end recurrence does not drift after February", () => {
  assert.deepEqual(recurrenceDates("2027-01-31", "monthly", 3), [
    "2027-01-31",
    "2027-02-28",
    "2027-03-31",
  ]);
});
test("assistant and report use identical source calculations including investment interest", async () => {
  const a = answerTreasury("cash", rows, [], context),
    report = executiveReport(rows, [], context, {
      id: "batch",
      fileName: "BASE.xlsm",
      revision: "revision",
    });
  assert.match(a.text, /100 CLP/);
  assert.equal(a.rows.length, 1);
  assert.equal(report.model.projected, 115);
  assert.equal(
    report.sections[2].rows.reduce((n, r) => n + Number(r.Flujo), 0),
    115,
  );
  assert.equal(classifyQuestion("¿Qué cobros están vencidos?"), "overdue");
  assert.equal(answerTreasury("changes", rows, [], context).rows.length, 0);
  const bytes = await createReportPdf({ ...report, chart: report.model.days });
  assert.equal(Buffer.from(bytes).subarray(0, 4).toString(), "%PDF");
  assert.ok((await PDFDocument.load(bytes)).getPageCount() >= 1);
});
test("cartola: quoted line breaks, Chilean signs and ambiguous columns are validated", () => {
  const cells = csvCells(
    'Fecha;Monto;Referencia;Descripción\r\n19-09-2026;"1.234,50";A;"Cobro\nBanco"\r\n20-09-2026;-234,50;B;Cargo',
  );
  const parsed = parseStatement(cells, statementMapping(cells[0]));
  assert.deepEqual(
    parsed.map((r) => r.amount),
    [1234.5, -234.5],
  );
  assert.equal(parsed[0].description, "Cobro\nBanco");
  assert.throws(() => csvCells('"inconcluso'), /Comillas/);
  const sides = csvCells("Fecha;Cargo;Abono\n19-09-2026;10;20");
  assert.throws(
    () => parseStatement(sides, statementMapping(sides[0])),
    /ambiguos/,
  );
});
test("reconciliation: equal candidates require review and consumed allocations disappear", () => {
  const bank = [
    {
      id: "a",
      date: context.cutoff,
      amount: 100,
      allocated: 0,
      reference: "123",
      description: "",
    },
    {
      id: "b",
      date: context.cutoff,
      amount: 100,
      allocated: 0,
      reference: "123",
      description: "",
    },
  ];
  assert.equal(suggestMatches([row()], bank, [])[0].ambiguous, true);
  assert.equal(
    suggestMatches([row()], bank, [{ id: "bank", amount: 100 }]).length,
    0,
  );
});
