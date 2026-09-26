/// <reference lib="webworker" />
/* ============================================================
 * Web Worker — parsea y procesa el workbook fuera del hilo
 * principal para que la interfaz nunca se congele.
 * ============================================================ */

import { parseWorkbook, processWorkbook } from "@/import-engine/pipeline";
import { importFileHash, importIdentityOverrides } from "@/import-engine/file-hash";
import type { ImportSummary, ImportOverrides } from "@/import-engine/types";

const ctx = self as unknown as Worker;

interface ImportMessage {
  file: ArrayBuffer;
  name: string;
  overrides?: ImportOverrides;
}

ctx.onmessage = async (e: MessageEvent<ImportMessage>) => {
  const { file, name, overrides } = e.data;
  try {
    ctx.postMessage({ type: "progress", done: 0, total: 0, phase: "Preparando archivo…" });
    const sheets = await parseWorkbook(file, true);
    const fileHash = importFileHash(file, importIdentityOverrides(overrides ?? {}, sheets));
    if (sheets.length === 0) {
      ctx.postMessage({ type: "error", message: "El archivo no contiene hojas con datos." });
      return;
    }
    ctx.postMessage({
      type: "progress",
      done: 0,
      total: sheets.length,
      phase: "Analizando el perfil del archivo…",
    });
    const summary: ImportSummary = processWorkbook(sheets, (done, total, phase) => {
      ctx.postMessage({ type: "progress", done, total, phase });
    }, overrides);
    summary.fileName = name;
    ctx.postMessage({ type: "done", summary, fileHash });
  } catch (err) {
    ctx.postMessage({
      type: "error",
      message: err instanceof Error ? err.message : "No se pudo analizar el archivo.",
    });
  }
};
