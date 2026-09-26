import { validDate } from "./detect";
import type { BaseReadingSummary, ImportSummary, SheetOverride } from "./types";

/** A cutoff belongs to the imported snapshot, never to a browser display filter. */
export function resolveBaseCutoff(reading: BaseReadingSummary, choice?: SheetOverride) {
  if (reading.profileId === "ERP-RAW-v1") {
    const cutoff = choice?.cutoffDate ?? null;
    const periodStart = reading.sheetName?.trim().toUpperCase() === "COLOCACIONES" ? choice?.investmentPeriodStart ?? null : choice?.periodStart ?? null;
    const company = choice?.company?.trim() || "SONACOL", localCurrency = choice?.localCurrency ?? "CLP";
    const cutoffIssue = !cutoff || !validDate(cutoff) ? "Define la fecha de corte de los datos ERP."
      : !periodStart || !validDate(periodStart) || periodStart > cutoff ? `Define el inicio del período de ${reading.sheetName ?? "ERP"}.`
      : reading.lastBankDate && cutoff < reading.lastBankDate ? `ERP contiene datos hasta ${reading.lastBankDate}; el corte no puede ser anterior.`
      : !["CLP", "USD", "UF", "UTM"].includes(localCurrency) ? "Moneda local inválida."
      : company.length > 100 ? "La empresa admite hasta 100 caracteres." : null;
    return { ...reading, cutoff, periodStart, company, localCurrency, cutoffSource: "user" as const, cutoffIssue };
  }
  const explicit = choice?.cutoffDate !== undefined;
  const cutoff = explicit ? choice.cutoffDate! : reading.cutoff;
  let cutoffIssue = explicit ? null : reading.cutoffIssue;
  if (!cutoff || !validDate(cutoff))
    cutoffIssue = "Define una fecha de corte válida antes de importar.";
  else if (reading.lastBankDate && cutoff < reading.lastBankDate)
    cutoffIssue = `BASE contiene movimientos BANCO hasta ${reading.lastBankDate}. El corte no puede ser anterior porque excluiría movimientos reales. Para consultar otra fecha, selecciona su BASE histórica.`;
  return {
    ...reading,
    cutoff,
    cutoffSource: explicit ? "user" as const : reading.cutoffSource,
    cutoffIssue,
  };
}

export function importCutoffIssue(summary: Pick<ImportSummary, "sheets" | "records">): string | null {
  const anyIssue = summary.sheets.find(s => s.reading?.cutoffIssue)?.reading?.cutoffIssue;
  if (anyIssue) return anyIssue;
  const reading = summary.sheets.find((sheet) => sheet.reading)?.reading;
  if (!reading) return "No se encontró la fecha de corte de BASE.";
  if (reading.cutoffIssue) return reading.cutoffIssue;
  if (!reading.cutoff || !validDate(reading.cutoff))
    return "Define una fecha de corte válida antes de importar.";
  if (summary.records.some((r) => r.normalized.cutoffDate !== reading.cutoff))
    return "La fecha de corte cambió. Actualiza la comparación antes de importar.";
  return null;
}
