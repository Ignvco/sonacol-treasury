/**
 * PATCH 09 — pure, read-only monthly closing proposal.
 *
 * The ERP opening is an independent source. An authoritative monthly opening
 * must come from an approved previous-month closing, account-by-account.
 * This module never updates source data or approves a closing.
 */
export type MonthlyStatus = "sin_cobertura" | "requiere_revision" | "borrador";
export type MonthlyPosting = {
  sourceKey: string;
  company: string;
  ledger: string;
  currency: string;
  postedOn: string;
  cargo: string;
  abono: string;
};
export type PreviousApprovedClose = {
  month: string;
  closing: string;
  versionId: string;
  revision: number;
  status: "aprobado";
};
export type MonthlyCloseInput = {
  company: string;
  ledger: string;
  currency: string;
  month: string;
  erpOpening: string | null;
  previousApprovedClose: PreviousApprovedClose | null;
  postings: readonly MonthlyPosting[];
  coverageComplete: boolean;
  sourceRunIds: readonly string[];
  sourceCutoff: string | null;
  approvedSourceKeys?: readonly string[];
};
export type MonthlyCloseProposal = {
  identity: { company: string; ledger: string; currency: string; month: string };
  status: MonthlyStatus;
  opening: string | null;
  openingOrigin: "approved_previous_close" | "missing_previous_close";
  erpOpening: string | null;
  erpDifference: string | null;
  cargo: string;
  abono: string;
  closing: string | null;
  sourceKeys: string[];
  sourceRunIds: string[];
  sourceCutoff: string | null;
  warnings: string[];
};

const MONTH_RE = /^(20\d{2}|19\d{2})-(0[1-9]|1[0-2])$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const AMOUNT_RE = /^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export function parseExactCents(value: string): bigint {
  if (typeof value !== "string" || !AMOUNT_RE.test(value)) {
    throw new Error("Importe inválido: se exige decimal exacto de hasta dos dígitos.");
  }
  const negative = value.startsWith("-");
  const positive = negative ? value.slice(1) : value;
  const [whole, fraction = ""] = positive.split(".");
  const amount = BigInt(whole) * 100n + BigInt((fraction + "00").slice(0, 2));
  return negative ? -amount : amount;
}
export function formatExactCents(value: bigint): string {
  const sign = value < 0n ? "-" : "";
  const abs = value < 0n ? -value : value;
  return sign + (abs / 100n).toString() + "." + (abs % 100n).toString().padStart(2, "0");
}
function dateInMonth(day: string, month: string): boolean {
  if (!DAY_RE.test(day) || !day.startsWith(month + "-")) return false;
  const [year, mon, date] = day.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, mon - 1, date));
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === mon - 1 &&
    parsed.getUTCDate() === date;
}
function shiftMonth(month: string, by: number): string {
  if (!MONTH_RE.test(month)) throw new Error("Mes inválido (AAAA-MM).");
  const [year, mon] = month.split("-").map(Number);
  const d = new Date(Date.UTC(year, mon - 1 + by, 1));
  return String(d.getUTCFullYear()).padStart(4, "0") + "-" +
    String(d.getUTCMonth() + 1).padStart(2, "0");
}
function strictIdentity(input: MonthlyCloseInput): void {
  if (!input.company.trim() || !input.ledger.trim() ||
      !/^[A-Z]{3}$/.test(input.currency) || !MONTH_RE.test(input.month)) {
    throw new Error("Identidad mensual inválida: empresa, cuenta, moneda o mes.");
  }
}
export function proposeMonthlyClose(input: MonthlyCloseInput): MonthlyCloseProposal {
  strictIdentity(input);
  const warnings: string[] = [];
  const { company, ledger, currency, month } = input;
  const prior = input.previousApprovedClose;
  if (prior && (prior.month !== shiftMonth(month, -1) ||
       prior.status !== "aprobado" || !prior.versionId.trim() ||
       !Number.isSafeInteger(prior.revision) || prior.revision < 1)) {
    throw new Error("El cierre previo no pertenece al mes anterior o no está aprobado.");
  }
  const erp = input.erpOpening === null ? null : parseExactCents(input.erpOpening);
  const opening = prior ? parseExactCents(prior.closing) : null;
  if (!prior) warnings.push("No hay cierre conciliado y aprobado del mes anterior.");
  if (erp === null) warnings.push("SALDOS BANCOS no informa apertura para esta cuenta.");
  if (opening !== null && erp !== null && opening !== erp) {
    warnings.push("La apertura ERP difiere del cierre anterior aprobado; no se ajusta automáticamente.");
  }
  if (!input.coverageComplete) warnings.push("La cobertura de movimientos del mes no está confirmada.");
  if (!input.sourceCutoff || !DAY_RE.test(input.sourceCutoff) ||
      input.sourceCutoff.slice(0, 7) !== month || !dateInMonth(input.sourceCutoff, month)) {
    warnings.push("El corte ERP del período está ausente o es inválido.");
  }
  const bySource = new Map<string, string>();
  let cargo = 0n;
  let abono = 0n;
  for (const p of input.postings) {
    if (p.company !== company || p.ledger !== ledger || p.currency !== currency) {
      throw new Error("Movimiento ajeno a la empresa/cuenta/moneda del cierre.");
    }
    if (!p.sourceKey.trim() || !dateInMonth(p.postedOn, month)) {
      throw new Error("Movimiento sin clave o con fecha efectiva fuera del mes de cierre.");
    }
    const debit = parseExactCents(p.cargo);
    const credit = parseExactCents(p.abono);
    if (debit < 0n || credit < 0n || (debit > 0n && credit > 0n)) {
      throw new Error("Cargo y abono inválidos; no se permite doble efecto por línea.");
    }
    const canonical = JSON.stringify([p.company, p.ledger, p.currency, p.postedOn,
      formatExactCents(debit), formatExactCents(credit)]);
    const existing = bySource.get(p.sourceKey);
    if (existing !== undefined) {
      if (existing !== canonical) throw new Error("Misma clave ERP con hechos contradictorios.");
      continue;
    }
    bySource.set(p.sourceKey, canonical);
    cargo += debit;
    abono += credit;
  }
  const sourceKeys = [...bySource.keys()].sort();
  if (input.approvedSourceKeys) {
    const approved = new Set(input.approvedSourceKeys);
    if (sourceKeys.some(k => !approved.has(k)) || [...approved].some(k => !bySource.has(k))) {
      warnings.push("Movimientos posteriores al cierre aprobado: requiere revisión firmada.");
    }
  }
  const sourceRunIds = [...new Set(input.sourceRunIds)].sort();
  if (!sourceRunIds.length) warnings.push("No hay evidencia de lotes de importación ERP.");
  const difference = opening !== null && erp !== null ? opening - erp : null;
  const status: MonthlyStatus = opening === null || !input.coverageComplete ||
    erp === null || !sourceRunIds.length ? "sin_cobertura" :
    warnings.length ? "requiere_revision" : "borrador";
  return {
    identity: { company, ledger, currency, month },
    status,
    opening: opening === null ? null : formatExactCents(opening),
    openingOrigin: opening === null ? "missing_previous_close" : "approved_previous_close",
    erpOpening: erp === null ? null : formatExactCents(erp),
    erpDifference: difference === null ? null : formatExactCents(difference),
    cargo: formatExactCents(cargo), abono: formatExactCents(abono),
    closing: opening === null ? null : formatExactCents(opening + cargo - abono),
    sourceKeys, sourceRunIds, sourceCutoff: input.sourceCutoff, warnings
  };
}
export function proposedNextOpening(approved: {
  company: string; ledger: string; currency: string;
  month: string; closing: string; versionId: string;
  revision: number; status: "aprobado";
}): { month: string; opening: string; sourceVersion: string; idempotencyKey: string } {
  if (approved.status !== "aprobado" || !approved.versionId.trim() ||
      !Number.isSafeInteger(approved.revision) || approved.revision < 1) {
    throw new Error("Se requiere cierre aprobado y versionado.");
  }
  const month = shiftMonth(approved.month, 1);
  strictIdentity({company: approved.company,ledger: approved.ledger,currency: approved.currency,
    month,erpOpening:null,previousApprovedClose:null,postings:[],coverageComplete:false,
    sourceRunIds:[],sourceCutoff:null});
  return {
    month, opening: formatExactCents(parseExactCents(approved.closing)),
    sourceVersion: approved.versionId,
    idempotencyKey: JSON.stringify([approved.company,approved.ledger,approved.currency,month,approved.versionId])
  };
}
