import { supabase } from "@/integrations/supabase/client";
import { baseTreasuryService, type DailyBatch } from "./baseTreasuryService";
import { snapshotRows, type RawSnapshot } from "@/financial-engine/snapshot";
import type { DecisionContext, Adjustment } from "@/financial-engine/decisions";
export { snapshotRows };
export type { RawSnapshot };
interface RpcClient {
  rpc(
    name: string,
    args?: Record<string, unknown>,
  ): Promise<{
    data: unknown;
    error: { code?: string; message: string } | null;
  }>;
}
export async function treasuryRpc<T = unknown>(
  name: string,
  args?: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await (supabase as unknown as RpcClient).rpc(
    name,
    args,
  );
  if (error)
    throw new Error(
      ["42883", "PGRST202", "42P01"].includes(error.code ?? "")
        ? "Falta instalar la ampliación de tesorería. Revisa Base de datos en README.md."
        : error.message,
    );
  return data as T;
}
export interface Member {
  id: string;
  name: string;
  role: string;
}
export interface Task {
  id: string;
  batch_id: string | null;
  title: string;
  note: string;
  due_date: string;
  assignee: string | null;
  status: "open" | "done";
  revision: number;
}
export interface ManualDetails {
  estimated_date: string | null;
  manual_id: string;
  due_date: string | null;
  confirmed_date: string | null;
  assignee: string | null;
  recurrence_id: string | null;
}
export interface Scenario {
  id: string;
  batch_id: string;
  name: string;
  context: DecisionContext;
  adjustments: Adjustment[];
  snapshot: RawSnapshot;
  source_revision: string;
  revision: number;
  engine_version: string;
}
export interface Forecast {
  id: string;
  context: DecisionContext;
  snapshot: RawSnapshot;
  created_at: string;
  engine_version: string;
}
export interface Workspace {
  revision: string;
  previous: RawSnapshot | null;
  settings: { minimums: Record<string, number>; stale_hours: number };
  tasks: Task[];
  scenarios: Scenario[];
  details: ManualDetails[];
  comments: {
    id: string;
    manual_id: string;
    body: string;
    author: string;
    created_at: string;
  }[];
  attachments: { id: string; manual_id: string; name: string; size: number }[];
}
export const decisionService = {
  workspace: (id: string | null = null) =>
    treasuryRpc<Workspace>("treasury_workspace", { p_batch: id }),
  snapshot: (id: string) =>
    treasuryRpc<RawSnapshot>("get_daily_base_snapshot", { p_batch_id: id }),
  members: () => treasuryRpc<Member[]>("treasury_members"),
  async load() {
    const bundle = await baseTreasuryService.load();
    const [workspace, members] = await Promise.all([
      this.workspace(bundle.batch?.id ?? null),
      this.members(),
    ]);
    return { bundle, workspace, members };
  },
  async search(text: string) {
    const bundle = await baseTreasuryService.load();
    const q = text.trim().toLocaleLowerCase("es");
    return q.length < 2
      ? []
      : bundle.rows
          .filter((r) =>
            [r.description, r.document, r.customer, r.bank, r.origin, r.ledger]
              .join(" ")
              .toLocaleLowerCase("es")
              .includes(q),
          )
          .slice(0, 60);
  },
  saveScenario: (s: {
    id?: string;
    revision?: number;
    batch: DailyBatch;
    sourceRevision: string;
    name: string;
    context: DecisionContext;
    adjustments: Adjustment[];
  }) =>
    treasuryRpc<Scenario>("treasury_save_scenario", {
      p_id: s.id ?? null,
      p_revision: s.revision ?? null,
      p_batch: s.batch.id,
      p_source_revision: s.sourceRevision,
      p_name: s.name,
      p_context: s.context,
      p_adjustments: s.adjustments,
    }),
  freeze: (batch: string, revision: string, context: DecisionContext) =>
    treasuryRpc<Forecast>("treasury_freeze_forecast", {
      p_batch: batch,
      p_source_revision: revision,
      p_context: context,
    }),
  saveTask: (task: Partial<Task>) =>
    treasuryRpc<Task>("treasury_save_task", {
      p_id: task.id ?? null,
      p_revision: task.revision ?? null,
      p_batch: task.batch_id ?? null,
      p_title: task.title,
      p_note: task.note ?? "",
      p_date: task.due_date,
      p_assignee: task.assignee || null,
      p_status: task.status ?? "open",
    }),
};
