import { treasuryRpc } from "./decisionService";
import { workingDate } from "./workingDate";

export interface InitialPlanRow {
  key: string; row: number; date: string; description: string;
  amount: number; currency: string; type: "income" | "expense";
  bankLedger: string; bank: string | null; category: string;
  state: "missing" | "existing" | "review" | "uncovered";
  matches: { id: string; description: string; date: string; amount: number; deleted: boolean }[]; overdue: boolean;
}
export interface InitialPlanPreview {
  revision: string; cutoff: string; canApply: boolean; referenceDate: string;
  rows: InitialPlanRow[];
}
export const initialPlanService = {
  preview: (batch: string) => treasuryRpc<InitialPlanPreview>("treasury_initial_plan_preview", { p_batch: batch }),
  async apply(batch: string, revision: string, keys: string[], bindings: Record<string, string>) {
    const result = await treasuryRpc<{ inserted: number; bound: number }>("treasury_apply_initial_plan", {
      p_batch: batch, p_expected: revision, p_keys: keys,
      p_bindings: Object.entries(bindings).filter(([, id]) => id).map(([key, manualId]) => ({ key, manualId })),
    });
    workingDate.refresh();
    return result;
  },
  async execute(batch: string, manual: string, revision: number, record: string | null, amount: number, removeKey: string | null = null) {
    await treasuryRpc("treasury_record_manual_execution", {
      p_batch: batch, p_manual: manual, p_revision: revision,
      p_record: record, p_amount: amount, p_remove_key: removeKey,
    });
    workingDate.refresh();
  },
};
