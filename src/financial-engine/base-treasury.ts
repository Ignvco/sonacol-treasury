import { erpBankSigned, isErpBank } from "./bank-control";
/** Treasury calculations preserve signed ERP/BASE amounts and native currencies. */
export interface TreasuryRow {
  id: string; kind: "cash_flow" | "invoice" | "investment" | "projection";
  inLatest?: boolean;
  normalized?: Record<string, unknown>; revision?: number; batchId?: string; edited?: boolean;
  origin: string; amount: number; currency: string; type: string; status: string;
  date: string; plannedDate: string; bank: string; ledger: string; settlementLedger?: string; description: string;
  document: string; customer: string; interest: number; cutoff: string;
  fileName: string; row: number | null; recordId: string | null;
}
export interface ForecastLink { id: string; projection_id: string; target_kind: string; target_id: string; }
export interface ForecastEvent extends TreasuryRow { effectiveDate: string; overdue: boolean; signed: number; replaces?: string; }
export const total = (values: number[]) => values.reduce((sum, n) => sum + Math.round(n * 100), 0) / 100;
/** Original commitment remains editable/auditable; only its unpaid part is forecast. */
export const pendingProjectionAmount = (amount: number, executedAmount = 0) =>
  Math.max(0, total([amount, -executedAmount]));
export const isTreasuryDate = (date: string) => {
 const parsed = new Date(date+"T12:00:00Z");
 return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0,10)===date;
};
export const nextDate = (date: string, days: number) => {
  const value = new Date(date + "T12:00:00Z"); value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};
export const sourceKey = (r: Pick<TreasuryRow, "kind" | "id">) => r.kind + ":" + r.id;
export const CASH_POSITION_ENGINE = "erp-cash-position-v3";
export const includesCutoffDay = (engineVersion?: string) => engineVersion === CASH_POSITION_ENGINE;
/** Placements are already expenses in the forecast; this is a breakdown, not a second debit. */
export const isPlannedPlacement = (r: TreasuryRow) => r.kind === "projection" && r.type === "expense" && r.normalized?.category === "investment_placement";
export function baseTreasury(input: TreasuryRow[], links: ForecastLink[], cutoff: string, horizon = 30, currency = "BASE", bank = "", engineVersion?: string) {
  if (!isTreasuryDate(cutoff) || (!Number.isInteger(horizon) || horizon < 1 || horizon > 366)) throw new Error("Fecha u horizonte inválidos.");
  // Missing/older versions retain the exact next-day policy of saved forecasts.
  const includeCutoff = includesCutoffDay(engineVersion);
  const rows = [...new Map(input.map(r => [sourceKey(r), r])).values()];
  const matches = (r: TreasuryRow) => (currency === "BASE" || r.currency === currency) && (!bank || r.bank === bank);
  const sign = (r: TreasuryRow) => r.normalized && isErpBank(r.normalized) ? erpBankSigned(r.normalized) : r.type === "expense" ? -r.amount : r.amount;
  const cashRows = rows.filter(r => r.inLatest !== false && r.kind === "cash_flow" && r.origin === "BANCO" && r.date <= cutoff && matches(r));
  const allFuture = rows.filter(r => r.inLatest !== false && r.normalized?.isPosition !== true && (r.kind !== "cash_flow" || r.origin === "PLATAFORMA") && !["pagado","conciliado","rescatada","cancelado","borrador"].includes(r.status));
  const byKey = new Map(rows.map(r => [sourceKey(r), r]));
  const suppressed = new Set<string>();
  const replacement = new Map<string,string>();
  const issues: string[] = [];
  for (const link of links) {
    const projectionKey = "projection:" + link.projection_id, targetKey = link.target_kind + ":" + link.target_id;
    const p = byKey.get(projectionKey), target = byKey.get(targetKey);
    if (!p || p.inLatest === false) continue;
    if (target?.inLatest === false || !target || p.currency !== target.currency || p.type !== "income" || Math.abs(p.amount - target.amount - target.interest) > 0.005) {
      suppressed.add(projectionKey);
      issues.push("Revisar vínculo de " + p.description + ": cambió el registro relacionado. La proyección vinculada queda fuera del total hasta corregir el vínculo.");
    } else if (["pagado","rescatada"].includes(target.status)) {
      suppressed.add(projectionKey);
    } else if (!["cancelado","borrador"].includes(p.status)) {
      suppressed.add(targetKey); replacement.set(projectionKey, targetKey);
    }
  }
  const events: ForecastEvent[] = allFuture.filter(r => !suppressed.has(sourceKey(r))).map(r => {
    const executed = r.kind === "projection" ? Number(r.normalized?.executedAmount ?? 0) : 0;
    if (!Number.isFinite(executed) || executed < 0 || total([executed, -r.amount]) > 0)
      throw new Error(`La ejecución registrada supera o invalida el importe de ${r.description}. Revisa el compromiso o el supuesto del escenario.`);
    const remaining = r.kind === "projection" ? pendingProjectionAmount(r.amount, executed) : r.amount;
    if (includeCutoff && !isTreasuryDate(r.plannedDate))
      throw new Error(`Falta una fecha prevista válida para ${r.description || r.document || r.id}. Revisa la planificación.`);
    return {
      ...r, amount: remaining,
      effectiveDate: r.plannedDate < cutoff || (!includeCutoff && r.plannedDate === cutoff) ? nextDate(cutoff, 1) : r.plannedDate,
      overdue: includeCutoff ? r.plannedDate < cutoff : r.plannedDate <= cutoff,
      signed: sign({ ...r, amount: remaining }) + r.interest, replaces: replacement.get(sourceKey(r)),
    };
  }).filter(r => !(r.kind === "projection" && r.amount === 0 && Number(r.normalized?.executedAmount ?? 0) > 0) && matches(r) && r.effectiveDate <= nextDate(cutoff, horizon)).sort((a,b) => a.effectiveDate.localeCompare(b.effectiveDate));
  const available = total(cashRows.map(sign));
  // The cutoff row is pending activity after the imported cash position, not
  // another copy of the bank movements already contained in available.
  const days = Array.from({length:horizon + (includeCutoff ? 1 : 0)}, (_,i) => {
    const date = nextDate(cutoff,i + (includeCutoff ? 0 : 1)), movements = events.filter(r => r.effectiveDate === date);
    const placements = total(movements.filter(isPlannedPlacement).map(r => -r.signed));
    const balance = total([available,...events.filter(r=>r.effectiveDate<=date).map(r=>r.signed)]);
    return {date, income:total(movements.filter(r=>r.signed>0).map(r=>r.signed)), expense:total(movements.filter(r=>r.signed<0).map(r=>-r.signed)),
      placements, beforePlacements: total([balance, placements]), balance};
  });
  const positions = [...new Set(cashRows.map(r=>r.bank+"|"+r.ledger+"|"+r.currency))].map(key=>{
    const items = cashRows.filter(r=>r.bank+"|"+r.ledger+"|"+r.currency===key);
    return {key,bank:items[0].bank,ledger:items[0].ledger,currency:items[0].currency,amount:total(items.map(sign)),rows:items};
  }).sort((a,b)=>b.amount-a.amount);
  const collectionRows = events.filter(r=>r.signed>0), paymentRows=events.filter(r=>r.signed<0);
  const investedRows = rows.filter(r=>r.inLatest!==false && r.kind==="investment" && !["rescatada","cancelado"].includes(r.status) && matches(r));
  const cutoffEvents = includeCutoff ? events.filter(r => r.effectiveDate === cutoff) : [];
  const cutoffIncome = total(cutoffEvents.filter(r => r.signed > 0).map(r => r.signed));
  const cutoffExpense = total(cutoffEvents.filter(r => r.signed < 0).map(r => -r.signed));
  const accountEvents = new Map<string, ForecastEvent[]>();
  const unassigned: ForecastEvent[] = [];
  for (const event of cutoffEvents) {
    const ledger = event.settlementLedger || (event.kind === "projection" ? event.ledger : "");
    const candidates = positions.filter(p => p.currency === event.currency &&
      (ledger ? p.ledger === ledger : p.bank === event.bank));
    if (candidates.length !== 1) { unassigned.push(event); continue; }
    const key = candidates[0].key;
    accountEvents.set(key, [...(accountEvents.get(key) ?? []), event]);
  }
  const cutoffAccounts = positions.map(p => {
    const movements = accountEvents.get(p.key) ?? [];
    const income = total(movements.filter(r => r.signed > 0).map(r => r.signed));
    const expense = total(movements.filter(r => r.signed < 0).map(r => -r.signed));
    const placements = total(movements.filter(isPlannedPlacement).map(r => -r.signed));
    const closing = total([p.amount, income, -expense]);
    return { ...p, income, expense, placements, operatingExpense: total([expense, -placements]), beforePlacements: total([closing, placements]), closing, events: movements };
  });
  const cutoffPlacements = total(cutoffEvents.filter(isPlannedPlacement).map(r => -r.signed));
  const cutoffPosition = includeCutoff ? {
    date: cutoff, available, income: cutoffIncome, expense: cutoffExpense,
    placements: cutoffPlacements, operatingExpense: total([cutoffExpense, -cutoffPlacements]),
    beforePlacements: total([available, cutoffIncome, -cutoffExpense, cutoffPlacements]),
    closing: total([available, cutoffIncome, -cutoffExpense]), events: cutoffEvents,
    accounts: cutoffAccounts, unassigned,
  } : null;
  if (unassigned.length)
    issues.push(`${unassigned.length} pendientes del corte no tienen una cuenta bancaria única dentro de la cobertura. Se incluyen en el total de su moneda, pero no se asignan a otra cuenta ni se inventa un saldo bancario.`);
  if (includeCutoff && events.some(r => r.overdue))
    issues.push("Los pendientes anteriores al corte se mantienen provisionalmente en el día siguiente. No están incluidos en el cierre previsto del corte; revisa sus fechas. No se presume su cobro ni pago.");
  return {available,cashRows,events,days,positions,collectionRows,paymentRows,investedRows,cutoffPosition,engineVersion,
    collections:total(collectionRows.map(r=>r.signed)),payments:total(paymentRows.map(r=>-r.signed)),
    invested:total(investedRows.map(r=>r.amount)),projected:days[days.length-1]?.balance??available,
    overdue:events.filter(r=>r.overdue),omittedRows:rows.filter(r=>r.inLatest===false),issues,minimum:Math.min(available,...days.map(r=>r.balance))};
}
