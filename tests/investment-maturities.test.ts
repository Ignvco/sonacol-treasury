import test from "node:test";
import assert from "node:assert/strict";
import { investmentCalendar, maturityDays } from "../src/financial-engine/investment-maturities";
import type { Investment, InvestmentMaturity } from "../src/financial-engine/types";
const entry = (extra: Partial<InvestmentMaturity> = {}): InvestmentMaturity => ({ sourceKey: "1", sourceRow: 3, sourceSheet: "COLOCACIONES", operationDate: "2026-09-02", endDate: "2026-09-15", signedAmount: 5000, currency: "CLP", ledger: "FUND-01", counterpartLedger: "BANK-01", description: "Aporte", role: "investment_movement", transaction: "200", ...extra });
const position = (extra: Partial<Investment> = {}): Investment => ({ id: "position", bankId: "bank", type: "fondo_mutuo", amount: 13000, currency: "CLP", startDate: "2026-09-01", endDate: "", rate: 0, estimatedInterest: 0, status: "vigente", ...extra });
test("calendar days use explicit valid dates and the cutoff, including DST and leap years", () => {
  for (const date of [null, "", "invalid", "2026-02-30", "2026-2-03", "2026-09-15T00:00:00Z"]) assert.equal(maturityDays(date, "2026-09-10"), null);
  assert.equal(maturityDays("2026-09-15", ""), null);
  assert.equal(maturityDays("2026-09-07", "2026-09-05"), 2);
  assert.equal(maturityDays("2028-02-29", "2028-02-28"), 1);
  assert.equal(maturityDays("2026-09-09", "2026-09-10"), -1);
});
test("calendar retains equal legitimate inflows but does not turn withdrawals into maturities or allocate residual capital", () => {
  const p = position({ maturityEntries: [entry(), entry({ sourceKey: "2", sourceRow: 4 }), entry({ sourceKey: "3", signedAmount: -2000 }), entry({ sourceKey: "4", endDate: null }), entry({ sourceKey: "5", endDate: "2026-02-30" })] });
  const before = structuredClone(p), dates = investmentCalendar([p], "2026-09-10");
  assert.equal(dates.length, 2); assert.equal(new Set(dates.map(e => e.id)).size, 2);
  assert.deepEqual(dates.map(e => [e.date, e.days, e.amount]), [["2026-09-15", 5, 5000], ["2026-09-15", 5, 5000]]);
  assert.deepEqual(p, before); assert.equal(p.amount, 13000);
});
test("source money stays in native currency; legacy and missing dates remain distinct", () => {
  const dates = investmentCalendar([
    position({ maturityEntries: [entry({ signedAmount: 200, currency: "USD" })] }),
    position({ id: "legacy", endDate: "2026-09-14" }),
    position({ id: "empty-source", endDate: "2026-09-14", maturityEntries: [] }),
    position({ id: "closed", endDate: "2026-09-14", status: "rescatada" }),
  ], "2026-09-10");
  assert.equal(dates.length, 2); assert.equal(dates[0].sourceEvidence, false);
  assert.deepEqual([dates[1].currency, dates[1].amount, dates[1].sourceEvidence], ["USD", 200, true]);
});
