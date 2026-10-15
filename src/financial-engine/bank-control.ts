/** Raw ERP bank contract: Cargo increases cash, Abono decreases cash. Categories never determine the sign. */
export const isErpBank = (n: Record<string, unknown>) => n.sourceProfile === "ERP-RAW-v1" && ["bank_opening", "bank_movement"].includes(String(n.recordRole));
const cents = (value: unknown) => {
  if (typeof value !== "number" || !Number.isFinite(value) || !Number.isSafeInteger(Math.round(value * 100))) throw new Error("Importe bancario inválido.");
  return Math.round(value * 100);
};
export function erpBankSigned(n: Record<string, unknown>) {
  const signed = cents(n.signedAmount), amount = cents(n.amount);
  if (n.recordRole === "bank_movement") {
    const debit = cents(n.debe), credit = cents(n.haber);
    if (debit < 0 || credit < 0 || (debit > 0 && credit > 0) || signed !== debit - credit) throw new Error("El movimiento bancario no coincide con Cargo menos Abono.");
  }
  if (Math.abs(signed) !== amount || n.type !== (signed < 0 ? "expense" : "income")) throw new Error("Ingreso/egreso bancario incompatible con su importe con signo.");
  return signed / 100;
}
export interface BankControlInput { normalized: Record<string, unknown>; row?: number | null; sheet?: string; status?: string; warnings?: string; }
export interface BankControl {
  key: string; bank: string; ledger: string; currency: string; periodStart: string; cutoff: string;
  opening: number; income: number; expense: number; calculated: number; reported: number | null; difference: number | null;
  movements: number; issues: string[]; references: string[];
}
/** Independent per-account reconciliation in cents; absent reported balances stay unknown. */
export function bankControls(records: BankControlInput[]): BankControl[] {
  const grouped = new Map<string, BankControlInput[]>();
  for (const record of records.filter(r => isErpBank(r.normalized))) {
    const n = record.normalized, key = JSON.stringify([n.company, n.ledgerCode, n.currency]);
    const items = grouped.get(key) ?? [];
    items.push(record); grouped.set(key, items);
  }
  return [...grouped].map(([key, items]) => {
    const n = items[0].normalized, issues: string[] = [], openings = items.filter(r => r.normalized.recordRole === "bank_opening");
    let opening = 0, income = 0, expense = 0, reported: number | null = null;
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
    if (openings.length !== 1) issues.push(`Cuenta ${n.ledgerCode}: se requiere un único saldo inicial; se encontraron ${openings.length}.`);
    if (new Set(items.map(r => r.normalized.periodStart)).size > 1 || new Set(items.map(r => r.normalized.cutoffDate)).size > 1) issues.push("Los saldos y movimientos tienen períodos distintos.");
    const calculated = opening + income - expense, difference = reported === null ? null : calculated - reported;
    if (![opening, income, expense, calculated].every(Number.isSafeInteger)) issues.push("Acumulado bancario fuera del rango seguro.");
    if (difference !== null && difference !== 0) issues.push(`Cuenta ${n.ledgerCode}: saldo calculado ${calculated / 100}, informado ${reported! / 100}, diferencia ${difference / 100}.`);
    return { key, bank: String(openings[0]?.normalized.bank ?? n.bank ?? "Sin banco"), ledger: String(n.ledgerCode ?? ""), currency: String(n.currency ?? ""),
      periodStart: String(n.periodStart ?? ""), cutoff: String(n.cutoffDate ?? ""), opening: opening / 100, income: income / 100, expense: expense / 100,
      calculated: calculated / 100, reported: reported === null ? null : reported / 100, difference: difference === null ? null : difference / 100,
      movements: items.length - openings.length, issues: [...new Set(issues)], references: items.map(r => `${r.sheet ?? r.normalized.sourceSheet}!${r.row ?? ""}`) };
  }).sort((a, b) => a.ledger.localeCompare(b.ledger) || a.currency.localeCompare(b.currency));
}
