import { test, expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { setupDatabaseBrowser } from "./fixture";
import { erpWithBankBalances, workbookBytes } from "../helpers/erp-workbook";
import { query } from "../helpers/decision-db";

async function analyze(page: Page, wb: XLSX.WorkBook, name: string) {
 await page.getByLabel("Seleccionar archivo Excel").setInputFiles({ name, mimeType: "application/vnd.ms-excel", buffer: Buffer.from(workbookBytes(wb, "xls")) });
 await page.getByLabel("Fecha de corte ERP", { exact: true }).fill("2026-09-13");
 await page.getByLabel("Inicio del mayor bancario", { exact: true }).fill("2026-09-01");
 await page.getByLabel("Inicio del mayor de inversiones", { exact: true }).fill("2026-09-01");
 await page.getByRole("button", { name: "Aplicar cobertura y comparar", exact: true }).click();
 await expect(page.getByRole("heading", { name: "Revisión de actualización ERP", exact: true })).toBeVisible();
}
async function confirm(page: Page) {
 await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
 await page.getByRole("button", { name: /Aplicar \d+ cambios|Confirmar revisión sin cambios/ }).click();
 await expect(page.getByRole("heading", { name: "Actualización ERP confirmada", exact: true })).toBeVisible();
}
test("monthly same-day updates expose actual counts, retain omitted expense and block source corrections", async ({ page }) => {
 test.setTimeout(90000);
 const db = await setupDatabaseBrowser(page);
 try {
  await page.goto("/importations"); const wb = erpWithBankBalances();
  await analyze(page, wb, "ERP-08h.xls"); await confirm(page);
  const summary = page.getByRole("region", { name: "Actualización incremental ERP", exact: true });
  await expect(summary).toContainText("Apertura mensual: 2026-09");
  await expect(summary).toContainText("Corte: 2026-09-13");
  await expect(summary.locator("dl > div").filter({ hasText: "Nuevos incorporados" })).toContainText("2");
  const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets.BANCOS, { header: 1 });
  rows.push(["03/09/2026", "03/09/2026", "Primario", "RC 03", null, 102, "BANK-01", "Cobro", "CLP 500.000"]);
  rows.splice(1, 1); // Omitted expense is retained from the already imported source.
  wb.Sheets.BANCOS = XLSX.utils.aoa_to_sheet(rows);
  await analyze(page, wb, "ERP-13h.xls"); await confirm(page);
  await expect(summary.locator("dl > div").filter({ hasText: "Nuevos incorporados" })).toContainText("1");
  await expect(summary.locator("dl > div").filter({ hasText: "Ya registrados" })).toContainText("1");
  await expect(summary.getByRole("status")).toContainText("-200.000");
  await expect(summary).toContainText("1.800.000");
  const snapshot = await query(db, "select get_daily_base_snapshot(null) s");
  expect(snapshot.rows.filter((r: { normalized: { recordRole: string } }) => r.normalized.recordRole === "bank_movement")).toHaveLength(3);
  await analyze(page, wb, "ERP-repeat.xls"); await confirm(page);
  await expect(summary).toContainText("No se encontraron movimientos bancarios adicionales");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  rows[1][8] = "CLP 600.000"; wb.Sheets.BANCOS = XLSX.utils.aoa_to_sheet(rows);
  await analyze(page, wb, "ERP-corrected.xls");
  await expect(summary.getByRole("alert")).toContainText("bloqueada");
  await expect(page.getByRole("button", { name: /Aplicar \d+ cambios|Confirmar revisión sin cambios/ })).toBeDisabled();
  expect((await query(db, "select get_daily_base_snapshot(null) s")).batch.id).toBe(snapshot.batch.id);
 } finally { await db.close(); }
});

test("public translations load on navigation/reload with regional cookie normalization", async ({ page, context }) => {
 const db = await setupDatabaseBrowser(page);
 try {
  await context.addCookies([{ name: "i18next", value: "es-CL", url: test.info().project.use.baseURL as string }]);
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/ruta-inexistente");
  await expect(page.getByText("No encontramos esta página", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
  await page.reload(); await expect(page.getByText("No encontramos esta página", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Volver a Hoy", exact: true }).click();
  await expect(page).toHaveURL(/\/today$/); expect(errors).toEqual([]);
 } finally { await db.close(); }
});
