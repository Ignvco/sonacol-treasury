import type { PGlite } from "@electric-sql/pglite";
import { query, upload, row, hash } from "./decision-db";
import { erpContext, workbookBytes } from "./erp-workbook";
import { parseWorkbook, processWorkbook } from "../../src/import-engine/pipeline";
import type { ProcessedRecord } from "../../src/import-engine/types";
import type { RawSnapshot } from "../../src/financial-engine/snapshot";

export async function importErp(db: PGlite, name: string, rows: ProcessedRecord[]) {
  const p = await query(db, "select compare_erp_import($1::jsonb) s", [JSON.stringify(rows)]);
  return query(db, "select import_erp_daily($1,$2,$3::jsonb,$4) s", [name, hash(name), JSON.stringify(rows), p.revision]);
}
export const migrationSnapshot = (db: PGlite, id: string): Promise<RawSnapshot> => query(db, "select get_daily_base_snapshot($1) s", [id]);
export async function migrationFixture(db: PGlite) {
  const records = processWorkbook(await parseWorkbook(workbookBytes()), undefined, erpContext).records;
  const invoice = records.find(r => r.entityType === "invoice")!;
  for (let i = 1; i <= 3; i++) {
    const copy = structuredClone(invoice); copy.row += i;
    Object.assign(copy.normalized, { erpDocument: String(900 + i), document: String(500 + i), originalFolio: "FE-" + (500 + i) });
    records.push(copy);
  }
  const legacy = await upload(db, "CAJA-referencia.xlsx", [
    row("BANCO", 9, { amount: 1300, bank: "Banco de prueba", ledgerCode: "BANK-01", date: "2026-09-10", cutoffDate: "2026-09-10" }),
    ...[0, 1, 2, 3].map(i => row("CLIENTES", 10 + i, { amount: 2000, customer: i === 2 ? "Nombre antiguo" : invoice.normalized.customer, document: String(500 + i), issueDate: "2026-09-01", dueDate: "2026-09-20", adjustedDate: i === 1 ? "2026-09-28" : null, reportDate: i === 1 ? "2026-09-28" : "2026-09-25", settlementBank: "Banco de prueba", cutoffDate: "2026-09-10" })),
    row("COLOCACIONES", 14, { amount: 5000, bank: "Banco de inversión CAJA", ledgerCode: "FUND-01", endDate: "2026-09-26", reportDate: "2026-09-26", cutoffDate: "2026-09-10" }),
    row("MANUAL", 15, { amount: 2000, bank: "Banco de prueba", date: "2026-09-27", reportDate: "2026-09-27", description: "Cobro vinculado", cutoffDate: "2026-09-10" }),
  ]);
  const before = await migrationSnapshot(db, legacy.id), linked = before.rows.find(r => r.normalized.document === "502")!;
  await query(db, "select link_daily_forecast($1,$2,'invoice',$3,false) s", [legacy.id, before.manual[0].id, linked.id]);
  const batch = await importErp(db, "ERP-inicial.xlsx", records);
  return { batch: batch.id as string, legacy: legacy.id as string, records };
}
