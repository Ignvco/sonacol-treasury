/* eslint-disable @typescript-eslint/no-explicit-any */
import { workingDate } from "./workingDate";
import { supabase } from "@/integrations/supabase/client";
import type {
  ImportBatch,
  ImportRecord,
  ImportRecordStatus,
  SyncHistory,
} from "@/financial-engine/types";
import type { Json } from "@/integrations/supabase/types";
import { MAX_FILE_BYTES, type ImportSummary } from "@/import-engine/types";
import type { ImportComparison, ImportOverrides, ImportPreview } from "@/import-engine/types";
import { importCutoffIssue } from "@/import-engine/cutoff";

const db = supabase;
export interface ImportProgress {
  phase: string;
  done: number;
  total: number;
}
export interface ExcelDeletionPlan {
  revision: string;
  batchIds: string[];
  legacyIds: string[];
  files: number;
  legacyFiles: number;
  rows: number;
  legacyRows: number;
  legacyOrphans: number;
  manual: number;
  editedManual: number;
  carriedManual: number;
  dependentWork?: Record<string, number>;
  latestAfter: {
    id: string;
    fileName: string;
    cutoff: string;
    source: string;
  } | null;
}
export interface ExcelDeletionResult {
  deletedBatchIds: string[];
  deletedFiles: number;
  deletedRows: number;
  deletedManual: number;
  latestId: string | null;
  remainingBatches: number;
}

function deletionError(error: { code?: string; message?: string }): string {
  if (["PGRST202", "42883"].includes(error.code ?? ""))
    return "Falta habilitar la eliminación de Excel. Aplica la migración 20260918000000000_delete_excel_imports.sql y vuelve a intentar.";
  if (error.code === "57014")
    return "No se recibió confirmación del borrado. Actualiza el historial antes de volver a intentarlo.";
  return (
    error.message ||
    "No se pudo eliminar. Actualiza el historial para comprobar el resultado."
  );
}

const toImportBatch = (r: any): ImportBatch => ({
  id: r.id,
  fileName: r.file_name,
  source: r.source,
  uploadedBy: r.uploaded_by,
  status: r.status,
  totalRecords: r.total_records,
  validRecords: r.valid_records,
  warningRecords: r.warning_records,
  errorRecords: r.error_records,
  duplicateRecords: r.duplicate_records,
  createdAt: r.created_at,
  importedRecords: r.imported_records ?? null,
});
const toImportRecord = (r: any): ImportRecord => ({
  id: r.id,
  importBatchId: r.batch_id,
  sourceSheet: "BASE",
  sourceRow: r.source_row,
  status: r.status as ImportRecordStatus,
  entityType: r.entity_type,
  entityId: r.entity_id,
  raw: r.raw_json ?? {},
  normalized: r.normalized_json ?? {},
  warnings: r.warnings ?? "",
  createdAt: r.created_at,
});
function message(error: { code?: string; message?: string }): string {
  if (error.code === "PGRST202" || error.code === "42883")
    return "Falta actualizar la base de datos del proyecto. Aplica la migración de importación incluida en esta versión y vuelve a intentar.";
  if (error.code === "42501")
    return "Tu sesión o rol no permite esta operación. Inicia sesión con permisos de Tesorería o Administrador.";
  if (error.code === "57014")
    return "El servidor agotó el tiempo de respuesta. La vista previa se conserva. Revisa el historial antes de volver a guardar.";
  return (
    error.message || "No se pudo completar la operación. Revisa tu conexión."
  );
}

/** All worker outcomes release memory, including file read failures, cancellation and timeout. */
export async function analyzeFile(
  file: File,
  onProgress?: (p: ImportProgress) => void,
  overrides: ImportOverrides = {},
  signal?: AbortSignal,
): Promise<ImportPreview> {
  if (!/\.(xlsx|xlsm|xls)$/i.test(file.name))
    throw new Error("Selecciona un archivo .xlsx, .xlsm o .xls.");
  if (!file.size) throw new Error("El archivo está vacío.");
  if (file.size > MAX_FILE_BYTES)
    throw new Error(
      "El archivo supera 20 MB. Divide el libro e inténtalo nuevamente.",
    );
  if (signal?.aborted) throw new Error("Análisis cancelado.");
  const buffer = await file.arrayBuffer();
  const parsed = await new Promise<ImportPreview>((resolve, reject) => {
    const worker = new Worker(
      new URL("../workers/xlsx.worker.ts", import.meta.url),
      { type: "module" },
    );
    const cleanup = () => {
      worker.terminate();
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
    };
    const fail = (reason: string) => {
      cleanup();
      reject(new Error(reason));
    };
    const abort = () => fail("Análisis cancelado.");
    const timer = setTimeout(
      () =>
        fail(
          "El análisis superó dos minutos. Vuelve a intentarlo y comprueba que usas la versión actualizada del importador.",
        ),
      120000,
    );
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) return abort();
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") onProgress?.(data);
      else if (data.type === "done") {
        if (
          typeof data.fileHash !== "string" ||
          !/^[a-f0-9]{64}$/.test(data.fileHash)
        ) {
          fail(
            "No se pudo identificar el archivo. Recarga la aplicación y vuelve a intentar.",
          );
          return;
        }
        cleanup();
        resolve({
          ...(data.summary as ImportSummary),
          fileHash: data.fileHash,
        });
      } else fail(data.message || "No se pudo analizar el archivo.");
    };
    worker.onerror = (event) =>
      fail(
        event.message ||
          "No se pudo iniciar el lector Excel. Recarga la aplicación.",
      );
    worker.onmessageerror = () =>
      fail("No se pudo leer el resultado del archivo.");
    worker.postMessage({ file: buffer, name: file.name, overrides }, [buffer]);
  });
  if (signal?.aborted) throw new Error("Análisis cancelado.");
  const cutoffIssue = importCutoffIssue(parsed);
  if (cutoffIssue) return { ...parsed, comparisonError: cutoffIssue };
  onProgress?.({
    phase: "Comparando BASE con los registros guardados…",
    done: 0,
    total: 0,
  });
  let request = db.rpc("compare_daily_base", {
    p_records: parsed.records.map(({ raw, ...record }) => record) as unknown as Json,
  });
  if (signal) request = request.abortSignal(signal);
  const { data: comparisonData, error } = await request;
  // El RPC devuelve jsonb: se declara la forma que espera la vista previa.
  const comparison = comparisonData as unknown as ImportComparison | null;
  if (signal?.aborted) throw new Error("Análisis cancelado.");
  if (error) return { ...parsed, comparisonError: message(error) };
  if (!comparison?.revision || !Array.isArray(comparison.rows))
    return {
      ...parsed,
      comparisonError:
        "No se pudo confirmar la comparación. Vuelve a analizar el archivo.",
    };
  return { ...parsed, comparison };
}

export const importService = {
  analyzeFile,
  async commitImport(
    preview: ImportPreview,
    onProgress?: (p: ImportProgress) => void,
    applyRows: number[] = [],
  ): Promise<ImportBatch> {
    const cutoffIssue = importCutoffIssue(preview);
    if (cutoffIssue) throw new Error(cutoffIssue);
    if (!preview.total || preview.valid + preview.warning === 0)
      throw new Error(
        "No hay filas válidas para importar. Revisa el mapeo y los errores.",
      );
    if (!preview.comparison)
      throw new Error(
        "Vuelve a analizar el archivo para comparar los cambios.",
      );
    const { data: session, error: sessionError } =
      await supabase.auth.getSession();
    if (sessionError || !session.session)
      throw new Error("Tu sesión expiró. Vuelve a iniciar sesión.");
    onProgress?.({
      phase: "Guardando registros y trazabilidad…",
      done: 0,
      total: 0,
    });
    const { data, error } = await db.rpc("import_daily_base", {
      p_file_name: preview.fileName,
      p_file_hash: preview.fileHash,
      p_records: preview.records as unknown as Json,
      p_revision: preview.comparison.revision,
      p_apply_rows: applyRows,
    });
    // Never retry through another write path: an interrupted response may already have committed.
    if (error) throw new Error(message(error));
    const batch = data as unknown as ImportBatch | null;
    if (!batch?.id || !["completed", "partial", "failed"].includes(batch.status))
      throw new Error(
        "No se recibió confirmación. Revisa el historial antes de volver a importar.",
      );
    onProgress?.({ phase: "Importación verificada", done: 1, total: 1 });
    workingDate.select(batch.id);
    return batch;
  },
  async runFileImport(
    file: File,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportBatch> {
    return this.commitImport(await analyzeFile(file, onProgress), onProgress);
  },
  async getBatches(): Promise<ImportBatch[]> {
    const all: ImportBatch[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db
        .from("daily_base_batches")
        .select("*")
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .range(offset, offset + 499);
      if (error) throw new Error(message(error));
      all.push(...(data ?? []).map(toImportBatch));
      if (!data || data.length < 500) return all;
    }
  },
  async previewDeletion(batchId: string | null): Promise<ExcelDeletionPlan> {
    const { data, error } = await db.rpc("excel_deletion_plan", {
      p_batch_id: batchId,
    });
    if (error) throw new Error(deletionError(error));
    const plan = data as unknown as ExcelDeletionPlan | null;
    if (!plan?.revision || !Array.isArray(plan.batchIds))
      throw new Error("No se pudo comprobar qué datos se eliminarán.");
    return plan;
  },
  async deleteExcel(
    batchId: string | null,
    revision: string,
    confirmation: string,
  ): Promise<ExcelDeletionResult> {
    const { data, error } = await db.rpc("delete_excel_imports", {
      p_batch_id: batchId,
      p_revision: revision,
      p_confirmation: confirmation,
    });
    if (error) throw new Error(deletionError(error));
    const result = data as unknown as ExcelDeletionResult | null;
    if (
      !Array.isArray(result?.deletedBatchIds) ||
      typeof result.remainingBatches !== "number"
    )
      throw new Error(
        "No se recibió confirmación del borrado. Actualiza el historial antes de reintentar.",
      );
    workingDate.afterDeletion(result.deletedBatchIds);
    return result;
  },
  async getBatchRecords(batchId: string): Promise<ImportRecord[]> {
    const result: ImportRecord[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await db
        .from("daily_base_rows")
        .select("*")
        .eq("batch_id", batchId)
        .order("source_row")
        .order("id")
        .range(offset, offset + 499);
      if (error) throw new Error(message(error));
      result.push(...(data ?? []).map(toImportRecord));
      if (!data || data.length < 500) return result;
    }
  },
  async getIntegrationStatus(): Promise<{
    records: number;
    lastSyncAt: string | null;
    errors: number;
    history: SyncHistory[];
  }> {
    const { data, error } = await db.rpc("get_daily_import_status");
    if (error) throw new Error(message(error));
    // El RPC devuelve jsonb: se declara la forma que muestra Integraciones.
    const status = data as unknown as {
      records: unknown;
      last_sync_at: string | null;
      errors: unknown;
      history: Array<{
        id: string;
        source: string;
        records: unknown;
        status: SyncHistory["status"];
        error_message: string | null;
        synced_at: string;
      }>;
    } | null;
    if (!status || !Array.isArray(status.history))
      throw new Error("No se pudo leer el estado de la importación.");
    return {
      records: Number(status.records),
      lastSyncAt: status.last_sync_at,
      errors: Number(status.errors),
      history: status.history.map((r) => ({
        id: r.id,
        source: r.source,
        records: Number(r.records),
        durationSeconds: 0,
        status: r.status,
        errorMessage: r.error_message,
        syncedAt: r.synced_at,
        verified: true,
      })),
    };
  },
  async runSync(source: "erp" | "excel" | "banks"): Promise<void> {
    throw new Error(
      source === "excel"
        ? "Ve a Importaciones y selecciona un archivo para actualizar tus datos."
        : "Esta integración todavía no tiene un conector configurado. No se sincronizaron registros.",
    );
  },
};
