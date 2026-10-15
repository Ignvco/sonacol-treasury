import { bankControls, erpBankSigned, isErpBank } from "./bank-control";
import { isTreasuryDate, nextDate, total, type TreasuryRow } from "./base-treasury";
import type { DailyProjection } from "./calculations";

/** Receives the already filtered cash rows of the selected snapshot. Past
 * expenses explain today's cash; they must never be projected a second time. */
export function bankActivity(cashRows: TreasuryRow[], cutoff: string) {
  const rows = cashRows.filter(r => r.normalized && isErpBank(r.normalized));
  if (!rows.length) return null; // Legacy BASE does not identify separate openings reliably.
  const controls = bankControls(rows.map(r => ({ normalized: r.normalized!, row: r.row })));
  const issues = controls.flatMap(c => c.issues);
  if (issues.length) throw new Error(issues.join(" · "));
  const openings = rows.filter(r => r.normalized!.recordRole === "bank_opening");
  const movements = rows.filter(r => r.normalized!.recordRole === "bank_movement");
  const incomeRows = movements.filter(r => erpBankSigned(r.normalized!) > 0);
  const expenseRows = movements.filter(r => erpBankSigned(r.normalized!) < 0);
  const opening = total(openings.map(r => erpBankSigned(r.normalized!)));
  const income = total(incomeRows.map(r => erpBankSigned(r.normalized!)));
  const expense = total(expenseRows.map(r => -erpBankSigned(r.normalized!)));
  const net = total([income, -expense]), closing = total([opening, net]);
  const periods = [...new Set(controls.map(c => c.periodStart))];
  const from = periods.length === 1 ? periods[0] : null;
  const daily: DailyProjection[] = [];
  if (from) {
    if (!isTreasuryDate(from) || !isTreasuryDate(cutoff) || from > cutoff) throw new Error("Período bancario inválido.");
    const byDate = new Map<string, { income: number; expense: number }>();
    for (const r of movements) {
      if (!isTreasuryDate(r.date) || r.date < from || r.date > cutoff) throw new Error("Movimiento bancario fuera del período declarado.");
      const d = byDate.get(r.date) ?? { income: 0, expense: 0 };
      const signed = erpBankSigned(r.normalized!);
      if (signed > 0) d.income = total([d.income, signed]);
      else d.expense = total([d.expense, -signed]);
      byDate.set(r.date, d);
    }
    let balance = opening;
    for (let date = from; date <= cutoff; date = nextDate(date, 1)) {
      const d = byDate.get(date) ?? { income: 0, expense: 0 };
      const initial = balance, variation = total([d.income, -d.expense]);
      balance = total([initial, variation]);
      daily.push({ date, initial, ...d, final: balance, variation });
    }
    if (balance !== closing) throw new Error("El flujo bancario diario no coincide con el saldo al corte.");
  }
  return { from, cutoff, opening, income, expense, net, closing, daily, openings, movements, incomeRows, expenseRows, rows,
    periodIssue: from ? "" : "Las cuentas tienen períodos de origen distintos. Selecciona un banco con un período común para consultar el flujo diario." };
}
export type BankActivityModel = ReturnType<typeof bankActivity>;
