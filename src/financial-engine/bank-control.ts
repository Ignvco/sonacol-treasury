/** Raw ERP bank contract: Cargo increases cash, Abono decreases cash. Categories never determine the sign. */
import { toMinorUnits, toSafeDisplayNumber, minorUnitsToDecimal, type MinorUnits } from "./financial-contract-core";
import { resolveBankAccount, type VerifiedBankAccountBinding, type BankAccountResolution } from "./bank-account-identity";

export const isErpBank = (n: Record<string, unknown>) => n.sourceProfile === "ERP-RAW-v1" && ["bank_opening", "bank_movement"].includes(String(n.recordRole));
const cents = (value: unknown): MinorUnits => {
  if (typeof value !== "number" && typeof value !== "string") throw new Error("Importe bancario inválido.");
  try {
    const units = toMinorUnits(value);
    // The current presentation layer exposes numbers. Never silently convert
    // values whose minor units cannot be represented as a safe JS integer.
    toSafeDisplayNumber(units);
    return units;
  } catch { throw new Error("Importe bancario inválido: requiere centavos exactos y rango seguro."); }
};
export function erpBankSigned(n: Record<string, unknown>) {
  const signed = cents(n.signedAmount), amount = cents(n.amount);
  if (n.recordRole === "bank_movement") {
    const debit = cents(n.debe), credit = cents(n.haber);
    if (debit < 0n || credit < 0n || (debit > 0n && credit > 0n) || signed !== debit - credit) throw new Error("El movimiento bancario no coincide con Cargo menos Abono.");
  }
  if ((signed < 0n ? -signed : signed) !== amount || n.type !== (signed < 0n ? "expense" : "income")) throw new Error("Ingreso/egreso bancario incompatible con su importe con signo.");
  return toSafeDisplayNumber(signed);
}
export interface BankControlInput { normalized: Record<string, unknown>; row?: number | null; sheet?: string; status?: string; warnings?: string; }
export interface BankControl {
  key: string; company: string; bank: string; ledger: string; currency: string; periodStart: string; cutoff: string;
  bankAccount: BankAccountResolution;
  opening: number; income: number; expense: number; calculated: number; reported: number | null; difference: number | null;
  movements: number; issues: string[]; references: string[];
}
/** Independent per-account reconciliation in cents; absent reported balances stay unknown. */
export function bankControls(records: BankControlInput[], bindings: readonly VerifiedBankAccountBinding[] = []): BankControl[] {
  const grouped = new Map<string, BankControlInput[]>();
  for (const record of records.filter(r => isErpBank(r.normalized))) {
    const n = record.normalized, key = JSON.stringify([n.company, n.ledgerCode, n.currency]);
    const items = grouped.get(key) ?? [];
    items.push(record); grouped.set(key, items);
  }
  return [...grouped].map(([key, items]) => {
    const n = items[0].normalized, issues: string[] = [], openings = items.filter(r => r.normalized.recordRole === "bank_opening");
    let opening = 0n, income = 0n, expense = 0n, reported: MinorUnits | null = null;
    for (const item of items) {
      const value = item.normalized;
      if (item.status === "ERROR") issues.push(item.warnings || "Fila bancaria inválida.");
      try {
        erpBankSigned(value);
        if (value.recordRole === "bank_opening") {
          opening += cents(value.signedAmount);
          if (value.bankReportedClosing != null) reported = cents(value.bankReportedClosing);
        } else { income += cents(value.debe); expense += cents(value.haber); }
      } catch (e) { issues.push(e instanceof Error ? e.message : "Importe bancario inválido."); }
    }
    // ERP's ledger is NOT a physical bank-account number. A bank mismatch within
    // the same company/ledger/currency is a source conflict, never a new balance.
    const banks = new Set(items.map(r => String(r.normalized.bank ?? "").trim().toUpperCase()));
    if (banks.size !== 1 || banks.has("")) issues.push("Los movimientos de una misma cuenta contable pertenecen a bancos distintos o sin identificar.");
    if (openings.length !== 1) issues.push(`Cuenta ${n.ledgerCode}: se requiere un único saldo inicial; se encontraron ${openings.length}.`);
    if (new Set(items.map(r => r.normalized.periodStart)).size > 1 || new Set(items.map(r => r.normalized.cutoffDate)).size > 1) issues.push("Los saldos y movimientos tienen períodos distintos.");
    const calculated = opening + income - expense, difference = reported === null ? null : calculated - reported;
    // Refuse to display unsafe totals instead of rounding financial evidence.
    for (const amount of [opening, income, expense, calculated, ...(reported === null ? [] : [reported, difference!])]) toSafeDisplayNumber(amount);
    if (difference !== null && difference !== 0n) issues.push(`Cuenta ${n.ledgerCode}: saldo calculado ${minorUnitsToDecimal(calculated)}, informado ${minorUnitsToDecimal(reported!)}, diferencia ${minorUnitsToDecimal(difference)}.`);
    const bank = String(openings[0]?.normalized.bank ?? n.bank ?? "Sin banco");
    const company = String(n.company ?? "");
    const bankAccount = resolveBankAccount({ company, ledger: String(n.ledgerCode ?? ""), currency: String(n.currency ?? ""), bank }, bindings);
    if (bankAccount.state === "bank_mismatch") issues.push(bankAccount.issue);
    return { key, company, bank, bankAccount, ledger: String(n.ledgerCode ?? ""), currency: String(n.currency ?? ""),
      periodStart: String(n.periodStart ?? ""), cutoff: String(n.cutoffDate ?? ""), opening: toSafeDisplayNumber(opening), income: toSafeDisplayNumber(income), expense: toSafeDisplayNumber(expense),
      calculated: toSafeDisplayNumber(calculated), reported: reported === null ? null : toSafeDisplayNumber(reported), difference: difference === null ? null : toSafeDisplayNumber(difference),
      movements: items.length - openings.length, issues: [...new Set(issues)], references: items.map(r => `${r.sheet ?? r.normalized.sourceSheet}!${r.row ?? ""}`) };
  }).sort((a, b) => a.ledger.localeCompare(b.ledger) || a.currency.localeCompare(b.currency));
}
