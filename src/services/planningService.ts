import { treasuryRpc } from "./decisionService";
import { workingDate } from "./workingDate";
import type { BusinessDecision, RawSnapshot } from "@/financial-engine/snapshot";

export interface CollectionPolicyPreview {
  revision: string; invoiceCount: number; releaseIds: string[]; preservedDates: number;
}
export const planningService = {
  load: () => treasuryRpc<RawSnapshot>("get_daily_base_snapshot", { p_batch_id: workingDate.batch() }),
  async save(batch: string, kind: BusinessDecision["kind"], target: string, values: BusinessDecision["values_json"], previous?: BusinessDecision, remove = false) {
    const saved = await treasuryRpc<BusinessDecision>("treasury_save_business", { p_batch: batch, p_id: previous?.id ?? null, p_revision: previous?.revision ?? null, p_kind: kind, p_target: target, p_values: values, p_delete: remove });
    workingDate.refresh();
    return saved;
  },
  previewCollection: (batch: string, target: string, values: BusinessDecision["values_json"]) =>
    treasuryRpc<CollectionPolicyPreview>("treasury_preview_collection_policy", { p_batch: batch, p_target: target, p_values: values }),
  async adoptCollection(batch: string, target: string, values: BusinessDecision["values_json"], expected: string) {
    const saved = await treasuryRpc<BusinessDecision>("treasury_apply_collection_policy", { p_batch: batch, p_target: target, p_values: values, p_expected: expected });
    workingDate.refresh();
    return saved;
  },
};
