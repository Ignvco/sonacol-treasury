import type { Investment } from "./types";

/** Calendar days at the selected financial cutoff, independent of timezone/DST. */
export function maturityDays(date: string | null | undefined, cutoff: string): number | null {
  const epoch = (value: string | null | undefined) => {
    if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const time = Date.parse(`${value}T00:00:00Z`);
    return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value ? time : null;
  };
  const end = epoch(date), start = epoch(cutoff);
  return end === null || start === null ? null : (end - start) / 86_400_000;
}
export interface InvestmentCalendarEntry {
  id: string; investmentId: string; date: string; days: number;
  amount: number; currency: string; ledger: string; description: string;
  origin: string; sourceEvidence: boolean;
}
/** Source inflows are date evidence, never remaining lots or automatic cash inflows. */
export function investmentCalendar(items: Investment[], cutoff: string): InvestmentCalendarEntry[] {
  return items.filter(i => i.status !== "rescatada").flatMap(i => {
    if (i.maturityEntries !== undefined) return i.maturityEntries.flatMap(e => {
      const days = maturityDays(e.endDate, cutoff);
      if (days === null || !e.endDate || e.signedAmount <= 0) return [];
      return [{ id: `${i.id}:${e.sourceKey}`, investmentId: i.id, date: e.endDate, days,
        amount: e.signedAmount, currency: e.currency, ledger: e.ledger, description: e.description,
        origin: `${e.sourceSheet}!${e.sourceRow}`, sourceEvidence: true }];
    });
    const days = maturityDays(i.endDate, cutoff);
    return days === null ? [] : [{ id: i.id, investmentId: i.id, date: i.endDate, days,
      amount: i.amount, currency: i.currency, ledger: i.bankId, description: "Inversión histórica",
      origin: "CAJA histórico", sourceEvidence: false }];
  }).sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}
