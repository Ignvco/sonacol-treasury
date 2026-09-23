import {
  baseTreasury,
  isTreasuryDate,
  nextDate,
  sourceKey,
  total,
  type ForecastLink,
  type TreasuryRow,
} from "./base-treasury";
export interface DecisionContext {
  cutoff: string;
  currency: string;
  horizon: number;
  minimum: number;
  bank?: string;
}
export interface Adjustment {
  key: string;
  date?: string;
  amount?: number;
  excluded?: boolean;
}
export interface RowChange {
  key: string;
  change: "added" | "removed" | "changed";
  before?: TreasuryRow;
  after?: TreasuryRow;
  fields: string[];
}
export const COMPARED_FIELDS = [
  "amount",
  "currency",
  "type",
  "date",
  "plannedDate",
  "status",
  "bank",
  "ledger",
  "description",
  "interest",
] as const;
export function compareSnapshots(
  before: TreasuryRow[],
  after: TreasuryRow[],
): RowChange[] {
  const a = new Map(before.map((r) => [sourceKey(r), r])),
    b = new Map(after.map((r) => [sourceKey(r), r]));
  return [...new Set([...a.keys(), ...b.keys()])].flatMap<RowChange>((key) => {
    const x = a.get(key),
      y = b.get(key);
    if (!x) return [{ key, change: "added", after: y, fields: [] }];
    if (!y) return [{ key, change: "removed", before: x, fields: [] }];
    const fields = COMPARED_FIELDS.filter((f) => x[f] !== y[f]);
    return fields.length
      ? [{ key, change: "changed", before: x, after: y, fields }]
      : [];
  });
}
export function scenarioRows(
  rows: TreasuryRow[],
  adjustments: Adjustment[],
): TreasuryRow[] {
  const map = new Map<string, Adjustment>();
  for (const a of adjustments) {
    const target = rows.find((r) => sourceKey(r) === a.key);
    if (!target || target.kind === "cash_flow" || map.has(a.key))
      throw new Error("Supuesto duplicado o movimiento futuro inexistente.");
    if (a.amount !== undefined && (!Number.isFinite(a.amount) || a.amount <= 0))
      throw new Error("El importe debe ser positivo.");
    if (a.date !== undefined && !isTreasuryDate(a.date))
      throw new Error("Fecha de supuesto inválida.");
    map.set(a.key, a);
  }
  return rows.map((r) => {
    const a = map.get(sourceKey(r));
    return a
      ? {
          ...r,
          amount: a.amount ?? r.amount,
          plannedDate: a.date ?? r.plannedDate,
          status: a.excluded ? "cancelado" : r.status,
        }
      : r;
  });
}
export function decisionModel(
  rows: TreasuryRow[],
  links: ForecastLink[],
  context: DecisionContext,
  adjustments: Adjustment[] = [],
) {
  if (
    !["CLP", "USD", "UF", "UTM"].includes(context.currency) ||
    !Number.isFinite(context.minimum) ||
    context.minimum < 0
  )
    throw new Error("Elige una moneda original y un umbral válido.");
  const m = baseTreasury(
    scenarioRows(rows, adjustments),
    links,
    context.cutoff,
    context.horizon,
    context.currency,
    context.bank,
  );
  const path = [{ date: context.cutoff, balance: m.available }, ...m.days];
  return {
    ...m,
    firstRisk: path.find((d) => d.balance < context.minimum)?.date ?? null,
    daysBelow: path.filter((d) => d.balance < context.minimum).length,
    lowest: path.reduce((a, b) => (b.balance < a.balance ? b : a)),
  };
}
export function cashBridge(
  before: TreasuryRow[],
  after: TreasuryRow[],
  currency: string,
  from: string,
  to: string,
) {
  const amount = (r: TreasuryRow | undefined, cutoff: string) =>
    r?.kind === "cash_flow" &&
    r.origin === "BANCO" &&
    r.currency === currency &&
    r.date <= cutoff
      ? r.type === "expense"
        ? -r.amount
        : r.amount
      : 0;
  const a = new Map(before.map((r) => [sourceKey(r), r])),
    b = new Map(after.map((r) => [sourceKey(r), r]));
  const changes = [...new Set([...a.keys(), ...b.keys()])]
    .map((key) => ({
      key,
      row: b.get(key) ?? a.get(key)!,
      amount: total([amount(b.get(key), to), -amount(a.get(key), from)]),
    }))
    .filter((r) => r.amount !== 0)
    .sort((x, y) => Math.abs(y.amount) - Math.abs(x.amount));
  return {
    changes,
    difference: total(changes.map((r) => r.amount)),
    opening: total(before.map((r) => amount(r, from))),
    closing: total(after.map((r) => amount(r, to))),
  };
}
export function recurrenceDates(
  start: string,
  frequency: "weekly" | "monthly",
  count: number,
) {
  if (
    !isTreasuryDate(start) ||
    !Number.isInteger(count) ||
    count < 1 ||
    count > 60
  )
    throw new Error("Recurrencia inválida.");
  return Array.from({ length: count }, (_, i) => {
    if (frequency === "weekly") return nextDate(start, 7 * i);
    const d = new Date(start + "T12:00:00Z"),
      day = d.getUTCDate();
    d.setUTCDate(1);
    d.setUTCMonth(d.getUTCMonth() + i);
    const last = new Date(
      Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
    ).getUTCDate();
    d.setUTCDate(Math.min(day, last));
    return d.toISOString().slice(0, 10);
  });
}
export interface Observation {
  date: string;
  currency: string;
  amount: number;
}
export function forecastAccuracy(
  days: { date: string; balance: number }[],
  observations: Observation[],
  currency: string,
  cutoff: string,
) {
  const seen = new Set<string>();
  const pairs = observations
    .filter((o) => {
      if (o.currency !== currency || o.date <= cutoff || seen.has(o.date))
        return false;
      seen.add(o.date);
      return true;
    })
    .flatMap((o) => {
      const p = days.find((d) => d.date === o.date);
      return p
        ? [
            {
              date: o.date,
              expected: p.balance,
              observed: Number(o.amount),
              error: total([Number(o.amount), -p.balance]),
            },
          ]
        : [];
    })
    .sort((a, b) => a.date.localeCompare(b.date));
  return {
    pairs,
    count: pairs.length,
    mae: pairs.length
      ? total(pairs.map((p) => Math.abs(p.error))) / pairs.length
      : null,
    bias: pairs.length ? total(pairs.map((p) => p.error)) / pairs.length : null,
  };
}
export interface BankMovement {
  id: string;
  date: string;
  amount: number;
  reference: string;
  description: string;
  allocated: number;
}
export function suggestMatches(
  ledger: TreasuryRow[],
  bank: BankMovement[],
  allocations: { id: string; amount: number }[],
) {
  const allocated = new Map(allocations.map((a) => [a.id, Number(a.amount)]));
  return ledger.flatMap((r) => {
    const remaining = total([r.amount, -(allocated.get(r.id) ?? 0)]);
    if (remaining <= 0) return [];
    const candidates = bank.filter(
      (b) =>
        Math.sign(b.amount) === (r.type === "expense" ? -1 : 1) &&
        Math.abs(Math.abs(b.amount) - Number(b.allocated) - remaining) <
          0.005 &&
        Math.abs(new Date(b.date).getTime() - new Date(r.date).getTime()) <=
          3 * 86400000,
    );
    const exact = candidates.filter(
      (b) =>
        b.reference &&
        r.document &&
        b.reference.toLowerCase() === r.document.toLowerCase(),
    );
    const chosen = exact.length ? exact : candidates;
    return chosen.length
      ? [
          {
            ledger: r,
            candidates: chosen,
            amount: remaining,
            reason: exact.length
              ? "Referencia, importe y fecha"
              : "Importe y fecha cercana",
            ambiguous: chosen.length !== 1,
          },
        ]
      : [];
  });
}
