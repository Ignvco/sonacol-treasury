import { snapshotRows, type RawSnapshot } from "@/financial-engine/snapshot";
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from "@/integrations/supabase/client";
import type {
  ForecastLink,
  TreasuryRow,
} from "@/financial-engine/base-treasury";
import { workingDate } from "./workingDate";
const db = supabase;
export interface DailyBatch {
  id: string;
  cutoff: string;
  file_name: string;
  source: string;
  created_at: string;
  status: string;
}
export interface BaseBundle {
  rows: TreasuryRow[];
  links: ForecastLink[];
  cutoff: string;
  warning: string;
  batch: DailyBatch | null;
  latestId: string | null;
}
let cached: {
  key: string;
  expires: number;
  promise: Promise<BaseBundle>;
} | null = null;
const explain = (error: any) =>
  new Error(
    ["42P01", "42883", "PGRST202"].includes(error.code)
      ? "Falta habilitar BASE diaria y MANUAL en la base de datos. Revisa la sección Base de datos del README.md."
      : error.message,
  );
export const baseTreasuryService = {
  async load(): Promise<BaseBundle> {
    const selected = workingDate.batch(),
      key = String(selected) + ":" + workingDate.version();
    if (cached?.key === key && cached.expires > Date.now())
      return cached.promise;
    const promise = (async () => {
      const { data, error } = await db.rpc("get_daily_base_snapshot", {
        p_batch_id: selected,
      });
      if (error) throw explain(error);
      // El RPC devuelve jsonb: aquí se declara la forma que consume el motor.
      const snapshot = data as unknown as Partial<RawSnapshot> | null;
      if (!snapshot || !Array.isArray(snapshot.rows) || !Array.isArray(snapshot.manual))
        throw new Error("No se recibió la información diaria de BASE.");
      const rows = snapshotRows(snapshot as RawSnapshot);
      return {
        rows,
        links: snapshot.links ?? [],
        batch: snapshot.batch ?? null,
        latestId: snapshot.latestId ?? null,
        cutoff: snapshot.batch?.cutoff ?? new Date().toISOString().slice(0, 10),
        warning: snapshot.coverage
          ? [`Cobertura ERP: ${snapshot.coverage.currency}. Las monedas y cuentas no incluidas no se consideran saldos cero.`, ...(snapshot.businessIssues ?? [])].join(" · ")
          : snapshot.batch?.status === "partial"
            ? "Esta carga antigua quedó incompleta. Reimporta el Excel para guardar una BASE completa."
            : "",
      };
    })();
    cached = { key, expires: Date.now() + 3000, promise };
    promise.catch(() => {
      if (cached?.promise === promise) cached = null;
    });
    return promise;
  },
  async batches(): Promise<DailyBatch[]> {
    const all: DailyBatch[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db
        .from("daily_base_batches")
        .select("id,cutoff,file_name,source,created_at,status")
        .order("cutoff", { ascending: false })
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + 499);
      if (error) throw explain(error);
      all.push(...data);
      if (data.length < 500) return all;
    }
  },
  async trace(id: string) {
    const { data, error } = await db
      .from("daily_base_rows")
      .select("raw_json,normalized_json,source_row")
      .eq("id", id)
      .single();
    if (error) throw explain(error);
    return { ...data, source_sheet: (data.normalized_json as Record<string, unknown>)?.sourceSheet ?? "BASE" } as {
      raw_json: Record<string, unknown>;
      normalized_json: Record<string, unknown>;
      source_row: number;
      source_sheet: string;
    };
  },
  async link(projectionId: string, targetKind: string, targetId: string) {
    const bundle = await this.load();
    const { error } = await db.rpc("link_daily_forecast", {
      p_batch_id: bundle.batch?.id,
      p_projection_id: projectionId,
      p_target_kind: targetKind,
      p_target_id: targetId,
    });
    if (error) throw explain(error);
    workingDate.refresh();
  },
  async unlink(id: string) {
    const bundle = await this.load(),
      link = bundle.links.find((l) => l.id === id);
    if (!link) throw new Error("El vínculo cambió. Actualiza la pantalla.");
    const { error } = await db.rpc("link_daily_forecast", {
      p_batch_id: bundle.batch?.id,
      p_projection_id: link.projection_id,
      p_target_kind: link.target_kind,
      p_target_id: link.target_id,
      p_remove: true,
    });
    if (error) throw explain(error);
    workingDate.refresh();
  },
};
