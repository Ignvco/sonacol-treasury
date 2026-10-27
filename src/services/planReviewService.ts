import { treasuryRpc } from "./decisionService";
import { workingDate } from "./workingDate";
import type { RawRow } from "@/financial-engine/snapshot";

export type PlanKind = "commitment" | "placement" | "redemption" | "collection" | "collection_rule";
export const planKinds: Record<PlanKind, string> = {
  commitment: "Compromisos", placement: "Colocaciones", redemption: "Rescates", collection_rule: "Políticas de cobro", collection: "Cobranzas por factura",
};
export interface PlanReference {
  key: string; kind: PlanKind; sheet: string; row: number; date: string;
  description: string; amount: number; currency: string; type: string;
  bankLedger: string; bank: string | null; category: string;
  covered: boolean; known: string[]; targets: string[]; suggestions: string[]; overdue: boolean;
  overrideDate?: string | null; amountBasis: string; customerCode?: string; dueDate?: string; issueDate?: string;
}
export interface ExistingPlanItem {
  id: string; kind: PlanKind; type: string; currency: string; description: string;
  date: string | null; amount: number | null; bankLedger: string | null; deleted: boolean;
  status: string | null; revision: number; executedAmount: number; refs: string[];
  legacy: boolean; reviewed?: string | null; linked: boolean; targetKey?: string;
  values?: Record<string, string | number | null>;
}
export interface PlanReviewPreview {
  revision: string; cutoff: string; canApply: boolean; referenceDate: string;
  file: string; sha256: string; rows: PlanReference[]; existing: ExistingPlanItem[]; positions: RawRow[]; invoices: RawRow[];
}
export interface PlanChoice { action: "new" | "keep" | "update"; id?: string; target?: string; }
export const planReviewService = {
  preview: (batch: string) => treasuryRpc<PlanReviewPreview>("treasury_october_plan_preview", { p_batch: batch }),
  async apply(batch: string, preview: PlanReviewPreview, choices: Record<string, PlanChoice>, prior: Record<string, string>) {
    const result = await treasuryRpc<{ applied: number; reviewed: number }>("treasury_apply_october_plan", {
      p_batch: batch, p_expected: preview.revision,
      p_actions: Object.entries(choices).map(([key, choice]) => ({ key, ...choice })), p_prior: prior,
    });
    workingDate.refresh();
    return result;
  },
};
