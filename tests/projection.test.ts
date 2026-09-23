import assert from "node:assert/strict";
import { test } from "node:test";
import {
  baseTreasury,
  total,
  type TreasuryRow,
} from "../src/financial-engine/base-treasury";
import { projectCashFlow } from "../src/financial-engine/calculations";
import { decisionModel } from "../src/financial-engine/decisions";
import { executiveReport } from "../src/financial-engine/report";
import {
  snapshotProjection,
  PROJECTION_DEFAULTS,
} from "../src/financial-engine/projection";
import type { BankAccount, CashFlow } from "../src/financial-engine/types";

const row = (id: string, changes: Partial<TreasuryRow> = {}): TreasuryRow => ({
  id,
  kind: "cash_flow",
  origin: "BANCO",
  amount: 1000.25,
  currency: "CLP",
  type: "income",
  status: "conciliado",
  date: "2026-09-18",
  plannedDate: "2026-09-18",
  bank: "BCI",
  ledger: "01",
  description: id,
  document: id,
  customer: "",
  interest: 0,
  cutoff: "2026-09-18",
  fileName: "BASE-18.xlsm",
  row: 9,
  recordId: null,
  ...changes,
});
const rows = [
  row("cash"),
  row("debit", { amount: 100.1, type: "expense" }),
  row("cash-usd", { amount: 1500, currency: "USD" }),
  row("overdue", {
    kind: "invoice",
    origin: "CLIENTES",
    amount: 30,
    status: "pendiente",
    plannedDate: "2026-09-17",
  }),
  row("client", {
    kind: "invoice",
    origin: "CLIENTES",
    amount: 200.55,
    status: "pendiente",
    plannedDate: "2026-09-25",
  }),
  row("investment", {
    kind: "investment",
    origin: "COLOCACIONES",
    amount: 400,
    interest: 3.25,
    status: "vigente",
    plannedDate: "2026-09-30",
  }),
  row("manual", {
    kind: "projection",
    origin: "MANUAL",
    amount: 50.05,
    type: "expense",
    status: "proyectado",
    plannedDate: "2026-09-20",
  }),
  row("settled", {
    kind: "invoice",
    origin: "CLIENTES",
    amount: 500,
    status: "pagado",
    plannedDate: "2026-09-25",
  }),
];
const snapshot = { rows, links: [], cutoff: "2026-09-18" };

test("operational projection preserves the existing daily calculation, cents and overdue policy", () => {
  const before = structuredClone(rows);
  const model = snapshotProjection(snapshot);
  // Reference path used by Flujo de caja before this correction.
  const old = baseTreasury(rows, [], snapshot.cutoff, 366, "CLP");
  const flow: CashFlow[] = old.events.map((r) => ({
    id: r.id,
    date: r.effectiveDate,
    type: r.signed < 0 ? "expense" : "income",
    amount: Math.abs(r.signed),
    currency: "CLP",
    category: "other_income",
    description: r.description,
    bankId: "BCI",
    status: "proyectado",
    origin: "excel",
  }));
  const accounts: BankAccount[] = [
    {
      id: "01",
      bankId: "BCI",
      accountNumber: "01",
      currency: "CLP",
      status: "activo",
      balance: old.available,
      reconciledBalance: 0,
      lastReconciliation: snapshot.cutoff,
    },
  ];
  const reference = projectCashFlow(flow, accounts, 30, "2026-09-19");
  assert.deepEqual(
    model.daily,
    reference.map((d) => ({
      ...d,
      initial: total([d.initial]),
      income: total([d.income]),
      expense: total([d.expense]),
      final: total([d.final]),
      variation: total([d.variation]),
    })),
  );
  assert.equal(model.available, 900.15);
  assert.equal(model.closing.final, 1483.9);
  assert.equal(model.to, "2026-10-18");
  assert.equal(model.overdue[0].effectiveDate, "2026-09-19");
  assert.equal(model.daily[0].income, 30);
  assert.deepEqual(rows, before);
});

test("snapshot cutoff overrides stale view preferences; upload date never becomes the accounting date", () => {
  const latest = {
    ...snapshot,
    cutoff: "2026-09-22",
    created_at: "2026-09-23T02:30:00Z",
  };
  const stale = { ...PROJECTION_DEFAULTS, cutoff: "2026-09-17" };
  const model = snapshotProjection(latest, stale);
  assert.equal(model.cutoff, "2026-09-22");
  assert.equal(model.from, "2026-09-23");
  assert.equal(model.to, "2026-10-22");
  assert.equal(model.available, 900.15);
  assert.equal(snapshotProjection(snapshot, stale).from, "2026-09-19");
});

test("closing KPI is one daily balance, never a sum of accumulated balances", () => {
  const seven = snapshotProjection(snapshot, {
    ...PROJECTION_DEFAULTS,
    horizon: 7,
  });
  assert.equal(seven.projected, 1080.65);
  assert.equal(
    seven.projected,
    seven.daily.find((d) => d.date === "2026-09-25")?.final,
  );
  assert.notEqual(seven.projected, total(seven.daily.map((d) => d.final)));
  assert.equal(
    snapshotProjection({
      rows: [row("only-cash")],
      links: [],
      cutoff: snapshot.cutoff,
    }).projected,
    1000.25,
  );
});

test("native currency and bank filters stay explicit; literal BASE remains a separate option", () => {
  assert.equal(
    snapshotProjection(snapshot, { ...PROJECTION_DEFAULTS, currency: "USD" })
      .projected,
    1500,
  );
  assert.equal(
    snapshotProjection(snapshot, { ...PROJECTION_DEFAULTS, currency: "BASE" })
      .projected,
    2983.9,
  );
  assert.equal(
    snapshotProjection(snapshot, { ...PROJECTION_DEFAULTS, bank: "Other bank" })
      .projected,
    0,
  );
});

test("operational daily balances agree with scenarios and reports for identical context", () => {
  for (const horizon of [7, 15, 30]) {
    const context = {
      cutoff: snapshot.cutoff,
      horizon,
      currency: "CLP",
      minimum: 0,
    };
    const operational = snapshotProjection(snapshot, {
      ...PROJECTION_DEFAULTS,
      horizon,
    });
    const decision = decisionModel(rows, [], context);
    const report = executiveReport(rows, [], context, {
      id: "batch18",
      fileName: "BASE-18.xlsm",
      revision: "1",
    });
    assert.equal(operational.closing.final, decision.projected);
    assert.equal(operational.closing.final, report.model.projected);
    assert.deepEqual(
      operational.daily.map((d) => d.final),
      report.model.days.map((d) => d.balance),
    );
  }
});
