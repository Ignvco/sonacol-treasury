/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TreasuryRow, ForecastLink } from "./base-treasury";
export interface RawRow {
  id: string;
  kind: TreasuryRow["kind"];
  recordId: string | null;
  normalized: Record<string, any>;
  row: number | null;
  fileName: string;
  revision?: number;
  edited?: boolean;
}
export interface RawSnapshot {
  business?: BusinessDecision[];
  businessIssues?: string[];
  engineVersion?: string;
  coverage?: { currency: string; profile: string };
  batch: {
    id: string;
    cutoff: string;
    file_name: string;
    source: string;
    created_at: string;
    status: string;
  } | null;
  rows: RawRow[];
  manual: RawRow[];
  links: ForecastLink[];
  latestId: string | null;
}
export interface BusinessDecision {
  id: string; batch_id: string; kind: "adjustment" | "redemption" | "rule";
  target_key: string; values_json: Record<string, string | number | null>;
  revision: number; deleted: boolean; updated_at: string;
  source_json?: {
    recordId: string; entityId: string; kind: RawRow["kind"]; sourceKey: string;
    row: number; fileName: string; cutoff: string; normalized: RawRow["normalized"];
  } | null;
}
export function snapshotRows(data: RawSnapshot): TreasuryRow[] {
  return [...data.rows, ...data.manual].map((r) => {
    const n = r.normalized,
      date = n.date ?? n.issueDate ?? n.startDate ?? "";
    return {
      id: r.id,
      kind: r.kind,
      inLatest: true,
      origin: n.sourceOrigin,
      amount: Number(n.amount),
      currency: n.currency,
      type: n.type ?? "income",
      status:
        n.status ??
        (r.kind === "invoice"
          ? "por_vencer"
          : r.kind === "investment"
            ? "vigente"
            : "proyectado"),
      date,
      plannedDate:
        n.adjustedDate ?? n.reportDate ?? n.dueDate ?? n.endDate ?? date,
      bank:
        r.kind === "cash_flow"
          ? (n.bank ?? "Sin banco")
          : (n.settlementBank ?? n.bank ?? "Sin banco"),
      ledger: n.ledgerCode ?? "",
      description: n.description ?? "",
      document: n.document ?? "",
      customer: n.customer ?? "",
      interest:
        r.kind === "investment" && n.rateKnown !== false
          ? Number(n.interest ?? 0)
          : 0,
      cutoff: data.batch?.cutoff ?? n.cutoffDate ?? "",
      fileName: n.removedSourceFile
        ? String(n.removedSourceFile) + " (origen eliminado)"
        : r.fileName,
      row: r.row ?? n.removedSourceRow ?? null,
      recordId: r.recordId,
      normalized: n,
      revision: r.revision,
      batchId: data.batch?.id,
      edited: r.edited,
    };
  });
}
