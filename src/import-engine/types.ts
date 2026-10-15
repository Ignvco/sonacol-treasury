/* ============================================================
 * ETL types — capa de importación Excel → entidades internas.
 * ============================================================ */

import type { ImportEntityType, ImportRecordStatus } from "@/financial-engine/types";
import type { ErpSheet } from "./erp-profile";

export interface DetectedColumn {
  key: string;
  header: string;
  index: number;
  type: "string" | "date" | "amount" | "id";
}

export interface SheetResult {
  reading?: BaseReadingSummary;
  profile?: string;
  note?: string;
  name: string;
  headerIndex: number;
  columns: DetectedColumn[];
  dataRows: number;
  entityType: ImportEntityType;
  headers?: string[];
  sample?: string[][];
}

export interface BaseReadingSummary {
  erpReport?: ErpSheet;
  firstMovementDate?: string | null;
  sheetName?: string;
  periodStart?: string | null;
  company?: string;
  localCurrency?: string;
  profileId: string;
  headerRow: number;
  firstDataRow: number | null;
  lastDataRow: number | null;
  ignoredRows: number;
  missingOptional: string[];
  currencyColumn: string | null;
  cutoffSource: "AE7" | "last-bank-date" | "user";
  cutoff: string | null;
  workbookCutoff: string | null;
  cutoffFormula: string | null;
  lastBankDate: string | null;
  cutoffIssue: string | null;
}

export interface ProcessedRecord {
  sheet: string;
  row: number; // fila en la hoja (1-based, fila de Excel)
  status: ImportRecordStatus;
  entityType: ImportEntityType;
  normalized: Record<string, unknown>;
  raw: Record<string, unknown>;
  warnings: string;
  /** Clave de deduplicación */
  dedupeKey: string;
}

export interface ImportSummary {
  fileName: string;
  sheets: SheetResult[];
  total: number;
  valid: number;
  warning: number;
  error: number;
  duplicate: number;
  records: ProcessedRecord[];
}

export type ImportIssue =
  | { kind: "error"; message: string }
  | { kind: "warning"; message: string };

/** Explicit choices override detection, keyed by worksheet name. */
export interface SheetOverride {
  investmentPeriodStart?: string;
  periodStart?: string;
  company?: string;
  localCurrency?: string;
  cutoffDate?: string;
  numberLocale?: "es-CL" | "en-US";
  entityType?: ImportEntityType;
  headerIndex?: number;
  mapping?: Record<string, number>;
  skip?: boolean;
}
export type ImportOverrides = Record<string, SheetOverride>;
export interface ImportComparisonRow {
 sheet?: string;
 manualEdited?:boolean; row:number; change:"new"|"modified"|"unchanged"|"conflict"|"invalid"; entityId:string|null;
 before:Record<string,unknown>|null; after:Record<string,unknown>; reason:string|null;
}
export interface ErpRefreshReview {
  blocking: boolean;
  verified: number;
  uncoveredAccounts: { ledger: string; currency: string }[];
  executions: {
    kind: "manual" | "redemption"; id: string; description: string | null;
    sourceKey: string; ledger: string; currency: string; date: string;
    amount: number; bankAmount: number; incomingAmount: number | null;
    allocated: number; periodStart: string | null;
    state: "uncovered_account" | "before_period" | "missing_movement" | "changed_movement" | "overallocated" | "ambiguous_duplicate";
  }[];
}
export interface ErpIncrementalResult {
 mode: "monthly_incremental"; state: "preview" | "completed";
 cutoff: string; periodStart: string; movementsRead: number; newMovements: number; existingMovements: number;
 retainedMovements: number; retainedNet: number; rejected: number; ambiguous: number; blocking: boolean;
 recognizedPrevious?: number; reusedSnapshot?: boolean;
 retainedDetails?: { sourceKey: string; ledger: string; date: string; document: string; signedAmount: number; currency: string; fileName: string; sheet: string; row: number }[];
 issues: { sourceKey?: string; ledger?: string; document?: string; date?: string; state: string; message: string }[];
 openings: { ledger: string; bank: string; currency: string; periodStart: string; cutoff: string; opening: number;
  income: number; expense: number; calculated: number; reported: number | null; difference: number | null }[];
}
export interface ImportComparison {revision:string;rows:ImportComparisonRow[];cutoff?:string;historical?:boolean;removed?:number;uncoveredCurrencies?:string[];refreshReview?:ErpRefreshReview;incremental?:ErpIncrementalResult;}
export interface ImportPreview extends ImportSummary { fileHash: string; comparison?:ImportComparison; comparisonError?:string; }
export const MAX_FILE_BYTES = 20 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 20000;
