import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { setupDatabaseBrowser } from "./fixture";
import { query } from "../helpers/decision-db";
import { importErp, migrationSnapshot } from "../helpers/caja-migration";
import { erpContext, erpWithBankBalances, workbookBytes } from "../helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../../src/import-engine/pipeline";

test("clearing imports cannot remove a manual commitment from the mobile UI", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    const b = await importErp(db, "ERP-protection.xls", processWorkbook(await parseWorkbook(workbookBytes(erpWithBankBalances())), undefined, erpContext).records);
    await query(db, "select treasury_save_manual($1,null,null,$2::jsonb,'{}'::jsonb) s", [b.id, JSON.stringify({ date: "2026-09-26", amount: 900, currency: "CLP", type: "expense", category: "payroll", status: "proyectado", description: "Compromiso que debe conservarse", bank: "Banco de prueba", bankLedger: "BANK-01" })]);
    const before = await migrationSnapshot(db, b.id);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/importations");
    await page.getByRole("button", { name: "Vaciar Excel", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("sin respaldo");
    await expect(dialog).toContainText("compromisos manuales: 1");
    await expect(dialog.getByRole("button", { name: "Confirmar eliminación" })).toBeDisabled();
    await expect(dialog.getByRole("textbox")).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    await dialog.getByRole("button", { name: "Cancelar" }).click();
    expect(await migrationSnapshot(db, b.id)).toEqual(before);
    await page.goto("/projections");
    await expect(page.getByText("Compromiso que debe conservarse", { exact: true })).toBeVisible();
  } finally { await db.close(); }
});

test("BIFF maturities survive persistence and render at the selected cutoff without changing cash", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    const wb = erpWithBankBalances();
    // Excel serial 46280 is 15/09/2026; a UTC JavaScript Date is written as
    // the previous local date by SheetJS in western timezones.
    XLSX.utils.sheet_add_aoa(wb.Sheets.COLOCACIONES, [["Fecha de vencimiento"], [null], [46280], ["16/09/2026"]], { origin: "P1" });
    wb.Sheets.COLOCACIONES.P3.z = "dd/mm/yyyy";
    const b = await importErp(db, "ERP-dates.xls", processWorkbook(await parseWorkbook(workbookBytes(wb, "xls")), undefined, erpContext).records);
    const before = await migrationSnapshot(db, b.id);
    await page.goto("/investments");
    const calendar = page.getByRole("region", { name: "Calendario de vencimientos", exact: true });
    await expect(calendar.locator('time[datetime="2026-09-15"]')).toBeVisible();
    await expect(calendar).toContainText("5 días");
    await expect(calendar).toContainText("5.000 CLP");
    await expect(calendar).toContainText("COLOCACIONES!3");
    await expect(calendar.locator('time[datetime="2026-09-16"]')).toHaveCount(0);
    await expect(page.getByText("1 fecha", { exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/stabilization-investments-desktop.png", animations: "disabled", fullPage: true });
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
    }
    await page.getByText("Detalle del mayor ERP", { exact: true }).click();
    await expect(page.getByText("Salida histórica de inversión", { exact: true })).toBeVisible();
    await expect(page.getByText(/1 registros sin vencimiento válido/)).toBeVisible();
    await page.getByRole("row").filter({ hasText: "Ver fechas ERP" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("region", { name: "Calendario de vencimientos" }).locator('time[datetime="2026-09-15"]')).toBeVisible();
    await page.screenshot({ path: "test-results/stabilization-investment-mobile.png", animations: "disabled" });
    expect(await dialog.evaluate(element => element.scrollWidth - element.clientWidth)).toBeLessThanOrEqual(1);
    expect(await migrationSnapshot(db, b.id)).toEqual(before);
    await dialog.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.goto("/banks");
    await expect(page.getByRole("row").filter({ hasText: "BANK-01" }).first()).toContainText("1.300.000");
  } finally { await db.close(); }
});

test("an older server contract disables import deletion instead of bypassing protection", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    await importErp(db, "ERP-old-contract.xls", processWorkbook(await parseWorkbook(workbookBytes(erpWithBankBalances())), undefined, erpContext).records);
    await page.route("**/rest/v1/rpc/excel_deletion_plan", route => route.fulfill({ json: { revision: "old", batchIds: [], files: 1 } }));
    await page.goto("/importations");
    await page.getByRole("button", { name: "Vaciar Excel", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog.getByRole("alert")).toContainText("Falta instalar la protección");
    await expect(dialog.getByRole("button", { name: "Confirmar eliminación" })).toBeDisabled();
  } finally { await db.close(); }
});
