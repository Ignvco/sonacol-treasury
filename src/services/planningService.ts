import { treasuryRpc } from "./decisionService";
import { workingDate } from "./workingDate";
import type { BusinessDecision, RawSnapshot } from "@/financial-engine/snapshot";

export const planningService = {
  load: () => treasuryRpc<RawSnapshot>("get_daily_base_snapshot", { p_batch_id: workingDate.batch() }),
  async save(batch: string, kind: BusinessDecision["kind"], target: string, values: BusinessDecision["values_json"], previous?: BusinessDecision, remove = false) {
    const saved = await treasuryRpc<BusinessDecision>("treasury_save_business", { p_batch: batch, p_id: previous?.id ?? null, p_revision: previous?.revision ?? null, p_kind: kind, p_target: target, p_values: values, p_delete: remove });
    workingDate.refresh();
    return saved;
  },
};
