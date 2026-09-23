import { total } from "../financial-engine/base-treasury";
import type { ProcessedRecord } from "./types";

/** Control of the parsed file. Not a forecast and never a cross-currency total. */
export function importControlTotals(records: ProcessedRecord[]) {
  const groups = new Map<string, { origin: string; currency: string; amounts: number[] }>();
  for (const record of records) {
    if (!["VALID", "WARNING"].includes(record.status)) continue;
    const n = record.normalized;
    const origin = String(n.sourceOrigin), currency = String(n.currency);
    const amount = Number(n.amount) * (n.type === "expense" ? -1 : 1);
    if (!Number.isFinite(amount)) continue;
    const key = origin + ":" + currency;
    const group = groups.get(key) ?? { origin, currency, amounts: [] };
    group.amounts.push(amount);
    groups.set(key, group);
  }
  return [...groups.values()].map((g) => ({
    origin: g.origin, currency: g.currency, rows: g.amounts.length, amount: total(g.amounts),
  })).sort((a, b) => a.origin.localeCompare(b.origin) || a.currency.localeCompare(b.currency));
}
