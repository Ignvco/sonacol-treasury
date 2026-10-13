/** Optional migration audit: user-supplied reference values never change treasury calculations. */
import { isTreasuryDate } from "./base-treasury";
import type { SnapshotProjection } from "./projection";
import { bankControls } from "./bank-control";

export const cashMetrics = [
  { key: "available", label: "Saldo bancario real" },
  { key: "income", label: "Ingresos pendientes del corte" },
  { key: "operatingExpense", label: "Pagos pendientes sin colocaciones" },
  { key: "beforePlacements", label: "Caja antes de colocar" },
  { key: "placements", label: "Colocaciones pendientes" },
  { key: "closing", label: "Liquidez tras colocaciones" },
] as const;
export type CashMetric = typeof cashMetrics[number]["key"];
export type CashReference = Record<CashMetric, string>;
export const emptyCashReference = (): CashReference => ({
  available: "", income: "", operatingExpense: "", beforePlacements: "", placements: "", closing: "",
});
// Explicit decimal notation: reject thousands separators instead of guessing.
export function referenceAmount(text: string): number | null {
  if (!/^-?\d+(?:[.,]\d{1,2})?$/.test(text.trim())) return null;
  const value = Number(text.trim().replace(",", "."));
  return Number.isSafeInteger(Math.round(value * 100)) ? Math.round(value * 100) : null;
}
export function cashEquivalence(model: SnapshotProjection, reference: CashReference, date: string, source: string, confirmedScope: boolean) {
  const issues: string[] = [];
  if (!source.trim()) issues.push("Identifica el documento o cierre de referencia.");
  if (!isTreasuryDate(date) || date !== model.cutoff) issues.push("La referencia y la plataforma deben tener el mismo corte.");
  if (model.filters.currency === "BASE") issues.push("Selecciona una moneda específica; no se comparan importes de distintas monedas sumados.");
  if (!confirmedScope) issues.push("Confirma que la referencia incluye las mismas cuentas y los mismos pendientes del corte.");
  const contextMatches = isTreasuryDate(date) && date === model.cutoff && model.filters.currency !== "BASE" && confirmedScope;
  const controls = bankControls(model.cashRows.filter(r => r.normalized).map(r => ({ normalized: r.normalized!, row: r.row })));
  if (!controls.length) issues.push("No hay cuentas ERP para comprobar apertura + cargos − abonos.");
  issues.push(...controls.flatMap(c => c.issues));
  const bankCents = controls.reduce((sum, c) => sum + Math.round(c.calculated * 100), 0);
  if (!Number.isSafeInteger(bankCents) || bankCents !== Math.round(model.available * 100)) issues.push("El control bancario independiente no coincide con el saldo real mostrado.");
  const rows = cashMetrics.map(metric => {
    const expected = referenceAmount(reference[metric.key]);
    const actual = model.cutoffPosition?.[metric.key];
    const actualCents = actual === undefined ? null : Math.round(actual * 100);
    if (expected === null) issues.push(`Completa ${metric.label} con un importe válido; un campo vacío no representa cero.`);
    if (expected !== null && ["income", "operatingExpense", "placements"].includes(metric.key) && expected < 0)
      issues.push(`${metric.label} debe expresarse como magnitud positiva o cero.`);
    if (actualCents === null || !Number.isSafeInteger(actualCents)) issues.push(`La plataforma no tiene un importe válido para ${metric.label}.`);
    return { ...metric, expected, actual: actualCents, difference: !contextMatches || expected === null || actualCents === null ? null : actualCents - expected };
  });
  const values = Object.fromEntries(rows.map(r => [r.key, r.expected])) as Record<CashMetric, number | null>;
  if (Object.values(values).every(v => v !== null)) {
    const before = values.available! + values.income! - values.operatingExpense!;
    const after = values.beforePlacements! - values.placements!;
    if (!Number.isSafeInteger(before) || !Number.isSafeInteger(after)) issues.push("La referencia excede el rango monetario seguro.");
    else {
      if (before !== values.beforePlacements) issues.push("La referencia no cumple: saldo real + ingresos pendientes − pagos pendientes = caja antes de colocar.");
      if (after !== values.closing) issues.push("La referencia no cumple: caja antes de colocar − colocaciones = liquidez final.");
    }
  }
  if (model.cutoffPosition?.unassigned.length) issues.push("Hay pendientes sin cuenta bancaria única; revisa su asignación.");
  // A matching total is not proof that unresolved business/coverage issues are settled.
  issues.push(...model.auditIssues);
  const comparable = issues.length === 0;
  const matches = comparable && rows.every(r => r.difference === 0);
  return { rows, issues: [...new Set(issues)], comparable, matches };
}
