import { treasuryRpc } from "./decisionService";
import { workingDate } from "./workingDate";

/** Explicit bank allocations for manual commitments, placements and redemptions. */
export const initialPlanService = {
  async execute(batch: string, manual: string, revision: number, record: string | null, amount: number, removeKey: string | null = null, redemption = false) {
    await treasuryRpc(redemption ? "treasury_record_redemption_execution" : "treasury_record_manual_execution", {
      p_batch: batch, p_manual: manual, p_revision: revision,
      p_record: record, p_amount: amount, p_remove_key: removeKey,
    });
    workingDate.refresh();
  },
};
