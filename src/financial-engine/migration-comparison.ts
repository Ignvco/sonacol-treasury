import { baseTreasury, sourceKey, total, type ForecastEvent } from "./base-treasury";
import { snapshotRows, type RawSnapshot } from "./snapshot";

export interface MigrationEventChange {
  id: string; label: string; reason: string; before?: ForecastEvent; after?: ForecastEvent;
}
const bucket = (e: ForecastEvent) => e.kind === "invoice" ? "collections" : e.kind === "investment" || e.normalized?.recordRole === "planned_redemption" ? "redemptions" : "manual";
const sum = (events: ForecastEvent[], date: string, group: string) => total(events.filter(e => e.effectiveDate === date && bucket(e) === group).map(e => e.signed));

/** Same financial engine and context on both sides; never shift a batch's declared cut. */
export function compareMigration(reference: RawSnapshot, current: RawSnapshot, currency: string, horizon = 30) {
  const blocks: string[] = [], warnings: string[] = [];
  if (!reference.batch || !current.batch) blocks.push("Selecciona dos cargas completas.");
  if (reference.batch?.cutoff !== current.batch?.cutoff) blocks.push(`Los cortes difieren: CAJA ${reference.batch?.cutoff} y ERP ${current.batch?.cutoff}. Se requiere una referencia del mismo corte.`);
  if (reference.coverage?.profile === "ERP-RAW-v1") blocks.push("La referencia debe ser una carga CAJA/BASE trabajada.");
  if (current.coverage?.profile !== "ERP-RAW-v1") blocks.push("La carga actual debe utilizar el perfil ERP crudo.");
  if (!currency || currency === "BASE") blocks.push("Selecciona una moneda original; no se agregan monedas diferentes.");
  if ([reference, current].some(s => s.batch?.status === "partial")) blocks.push("Una carga incompleta no permite validar la migración.");
  const leftRows = snapshotRows(reference), rightRows = snapshotRows(current);
  for (const [name, rows] of [["CAJA", leftRows], ["ERP", rightRows]] as const) {
    if (!rows.some(r => r.kind === "cash_flow" && r.origin === "BANCO" && r.currency === currency)) blocks.push(`${name} no incluye saldos bancarios en ${currency}; su ausencia no equivale a saldo cero.`);
  }
  if (blocks.length) return { blocks, warnings, days: [], changes: [], openingDelta: null, maxDifference: null, numericallyEqual: false };
  const left = baseTreasury(leftRows, reference.links, reference.batch!.cutoff, horizon, currency);
  const right = baseTreasury(rightRows, current.links, current.batch!.cutoff, horizon, currency);
  const leftAccounts = new Set(left.positions.map(p => p.ledger)), rightAccounts = new Set(right.positions.map(p => p.ledger));
  const absent = [...new Set([...leftAccounts, ...rightAccounts])].filter(k => !leftAccounts.has(k) || !rightAccounts.has(k));
  if (absent.length) warnings.push(`Cobertura de cuentas diferente: ${absent.join(", ")}. No acredita equivalencia.`);
  warnings.push(...(current.businessIssues ?? []), ...left.issues, ...right.issues);
  const mapping = new Map<string, string>();
  for (const d of current.business ?? []) {
    if (!d.source_json || d.deleted || d.kind === "rule") continue;
    const destination = d.kind === "redemption" ? right.events.find(e => e.id === d.id) : rightRows.find(r => r.normalized?.businessKey === d.target_key);
    if (destination) mapping.set(`${d.source_json.kind}:${d.source_json.entityId}`, sourceKey(destination));
  }
  const rightById = new Map(right.events.map(e => [sourceKey(e), e])), used = new Set<string>();
  const changes: MigrationEventChange[] = [];
  for (const before of left.events) {
    const key = sourceKey(before), target = mapping.get(key) ?? key, after = rightById.get(target);
    if (after) used.add(target);
    const differences = !after ? ["Solo en CAJA dentro del horizonte"] : [
      before.effectiveDate !== after.effectiveDate ? "Fecha prevista" : "",
      total([before.signed, -after.signed]) !== 0 ? "Importe" : "",
      before.bank !== after.bank ? "Banco receptor" : "",
    ].filter(Boolean);
    if (differences.length) changes.push({ id: key, label: before.customer || before.description, reason: differences.join(" · "), before, after });
  }
  for (const after of right.events) if (!used.has(sourceKey(after))) changes.push({ id: "new:" + sourceKey(after), label: after.customer || after.description, reason: "Solo en ERP/plataforma dentro del horizonte", after });
  const days = left.days.map((day, i) => ({ date: day.date, reference: day.balance, current: right.days[i].balance,
    delta: total([right.days[i].balance, -day.balance]),
    collections: total([sum(right.events, day.date, "collections"), -sum(left.events, day.date, "collections")]),
    redemptions: total([sum(right.events, day.date, "redemptions"), -sum(left.events, day.date, "redemptions")]),
    manual: total([sum(right.events, day.date, "manual"), -sum(left.events, day.date, "manual")]),
  }));
  const openingDelta = total([right.available, -left.available]);
  const maxDifference = Math.max(Math.abs(openingDelta), ...days.map(d => Math.abs(d.delta)));
  return { blocks, warnings, days, changes, openingDelta, maxDifference, numericallyEqual: maxDifference === 0 && warnings.length === 0 };
}
