/** SONACOL Treasury financial contract v1 — additive and side-effect-free. */
export const FINANCIAL_CONTRACT_VERSION = "sonacol-financial-v1" as const;
export const FINANCIAL_TIME_ZONE = "America/Santiago" as const;
export type MinorUnits = bigint;
export type MoneyInput = string | number;

/** Exact decimal -> minor units. Invalid precision is an error, never rounded. */
export function toMinorUnits(input: MoneyInput): MinorUnits {
  if (typeof input === "number" && !Number.isFinite(input)) throw new Error("Importe inválido.");
  const m = /^([+-]?)(\d+)(?:\.(\d{1,2}))?$/.exec(String(input).trim());
  if (!m) throw new Error("Importe inválido: se requieren máximo dos decimales exactos.");
  const result = BigInt(m[2]) * 100n + BigInt((m[3] || "").padEnd(2, "0"));
  return m[1] === "-" ? -result : result;
}
export function minorUnitsToDecimal(cents: MinorUnits): string {
  const a = cents < 0n ? -cents : cents;
  return (cents < 0n ? "-" : "") + String(a / 100n) + "." + String(a % 100n).padStart(2, "0");
}
/** For legacy UI only; money calculations must remain in minor units. */
export function toSafeDisplayNumber(cents: MinorUnits): number {
  if (cents > BigInt(Number.MAX_SAFE_INTEGER) || cents < BigInt(-Number.MAX_SAFE_INTEGER)) throw new Error("Importe fuera del rango numérico seguro.");
  return Number(cents) / 100;
}

export interface AccountIdentity { company: string; ledger: string; currency: string; }
export function accountKey(a: AccountIdentity): string {
  const company = a.company.trim(), ledger = a.ledger.trim(), currency = a.currency.trim().toUpperCase();
  if (!company || !ledger || !/^[A-Z]{3}$/.test(currency)) throw new Error("Cuenta incompleta: empresa, cuenta contable y moneda obligatorias.");
  return JSON.stringify([company, ledger, currency]);
}
export interface FinancialDates {
  effectiveOn: string | null; postedOn: string | null; extractedAt: string | null;
  importedAt: string; cutoffOn: string; dueOn: string | null; plannedOn: string | null;
}
export function isoDate(d: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error("Fecha inválida.");
  const utc = new Date(d + "T12:00:00Z");
  if (!Number.isFinite(utc.getTime()) || utc.toISOString().slice(0, 10) !== d) throw new Error("Fecha inválida.");
  return d;
}
export function nextDate(d: string, days = 1): string {
  isoDate(d);
  if (!Number.isInteger(days) || Math.abs(days) > 3660) throw new Error("Desplazamiento inválido.");
  const utc = new Date(d + "T12:00:00Z");
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}
export function monthStart(d: string): string { return isoDate(d).slice(0, 7) + "-01"; }
export function nextMonthStart(d: string): string { return monthStart(nextDate(monthStart(d), 32)); }
export function firstProjectionDate(cutoff: string): string { return nextDate(cutoff); }
export function validateDates(d: FinancialDates): void {
  for (const date of [d.effectiveOn, d.postedOn, d.cutoffOn, d.dueOn, d.plannedOn]) if (date !== null) isoDate(date);
  for (const instant of [d.extractedAt, d.importedAt]) {
    if (instant !== null && (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(instant) || !Number.isFinite(Date.parse(instant)))) {
      throw new Error("Instante sin zona horaria explícita.");
    }
  }
}

/** ERP accounting sign convention: monthly opening + Cargo - Abono. */
export function bankClosing(opening: MoneyInput | null, charges: readonly MoneyInput[], credits: readonly MoneyInput[]): MinorUnits {
  if (opening === null) throw new Error("Apertura ausente: cobertura desconocida, no saldo cero.");
  const sum = (v: readonly MoneyInput[]) => v.reduce<bigint>((acc, x) => acc + toMinorUnits(x), 0n);
  for (const charge of charges) if (toMinorUnits(charge) < 0n) throw new Error("Cargo negativo.");
  for (const credit of credits) if (toMinorUnits(credit) < 0n) throw new Error("Abono negativo.");
  return toMinorUnits(opening) + sum(charges) - sum(credits);
}

export type PostingStatus = "vigente" | "pendiente_revision" | "correccion_acreditada" | "anulacion_confirmada" | "reemplazado" | "sin_cobertura_suficiente";
export interface CorrectionEvidence {
  sourceKey: string; state: "correccion_acreditada" | "anulacion_confirmada" | "reemplazado";
  approvedBy: string; approvedAt: string; effectiveFrom: string; reason: string; evidenceRef: string;
}
/** A missing line never implies cancellation. Validity requires separate approval. */
export function isPostingEffective(status: PostingStatus, sourceKey: string, cutoff: string, evidence: CorrectionEvidence | null): boolean {
  isoDate(cutoff);
  if (status === "vigente") {
    if (evidence) throw new Error("Movimiento vigente con corrección incompatible.");
    return true;
  }
  if (status === "pendiente_revision" || status === "sin_cobertura_suficiente") throw new Error("Movimiento sin resolución financiera verificable.");
  if (!evidence || evidence.sourceKey !== sourceKey || evidence.state !== status || !evidence.approvedBy.trim() || !evidence.reason.trim() || !evidence.evidenceRef.trim()) throw new Error("Corrección sin autorización o evidencia.");
  validateDates({ effectiveOn:null, postedOn:null, extractedAt:null, importedAt:evidence.approvedAt, cutoffOn:evidence.effectiveFrom, dueOn:null, plannedOn:null });
  return isoDate(evidence.effectiveFrom) > cutoff;
}

export interface MonthlyClose {
  account: AccountIdentity; month: string;
  opening: MinorUnits; charges: MinorUnits; credits: MinorUnits; authorizedAdjustments: MinorUnits;
  closing: MinorUnits; reportedClosing: MinorUnits | null;
  reconciled: boolean; approvedBy: string | null; approvedAt: string | null;
  evidenceRef: string | null; revision: number;
}
/** Historical closing -> next month's opening; no auto-balancing adjustments. */
export function approvedNextOpening(c: MonthlyClose): { accountKey: string; month: string; opening: MinorUnits; fromRevision: number } {
  const key = accountKey(c.account);
  if (monthStart(c.month) !== c.month) throw new Error("Período mensual inválido.");
  if (c.closing !== c.opening + c.charges - c.credits + c.authorizedAdjustments) throw new Error("Cierre no cuadra.");
  if (!c.reconciled || c.reportedClosing === null || c.reportedClosing !== c.closing || !c.approvedBy?.trim() || !c.approvedAt || !c.evidenceRef?.trim() || !Number.isSafeInteger(c.revision) || c.revision < 1) throw new Error("Cierre no conciliado o aprobado.");
  validateDates({ effectiveOn:null, postedOn:null, extractedAt:null, importedAt:c.approvedAt, cutoffOn:c.month, dueOn:null, plannedOn:null });
  return { accountKey:key, month:nextMonthStart(c.month), opening:c.closing, fromRevision:c.revision };
}
