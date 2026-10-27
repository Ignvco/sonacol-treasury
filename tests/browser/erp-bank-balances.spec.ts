import { test, expect, type Page } from "@playwright/test";
import * as XLSX from "xlsx";
import { setupDatabaseBrowser } from "./fixture";
import { erpWithBankBalances, workbookBytes } from "../helpers/erp-workbook";
import { query } from "../helpers/decision-db";
async function preview(page: Page, wb = erpWithBankBalances()) {
 await page.goto("/importations");
 await page.getByLabel("Seleccionar archivo Excel").setInputFiles({ name: "ERP.xlsm", mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12", buffer: Buffer.from(workbookBytes(wb, "xlsm")) });
 await page.getByLabel("Fecha de corte ERP", { exact: true }).fill("2026-09-10");
 await page.getByLabel("Inicio del mayor bancario", { exact: true }).fill("2026-09-01");
 await page.getByLabel("Inicio del mayor de inversiones", { exact: true }).fill("2026-09-01");
 await page.getByRole("button", { name: "Aplicar cobertura y comparar", exact: true }).click();
}

test("SALDOS preview, bank balances, expense detail and dashboard share the signed cash calculation", async ({ page }) => {
 test.setTimeout(60000);
 const db = await setupDatabaseBrowser(page);
 try {
  await preview(page);
  const account = page.getByTestId("bank-control-BANK-01");
  await expect(account).toContainText("1.300.000");
  await expect(account).toContainText("No informado");
  await expect(account).toContainText("No comprobable");
  await expect(page.getByTestId("bank-control-BANK-02")).toContainText("0 movimientos");
  await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
  await page.getByRole("button", { name: /Aplicar \d+ cambios/ }).click();
  await expect(page.getByRole("heading", { name: "Cobertura de la exportación ERP" })).not.toBeVisible();
  await page.goto("/banks");
  await expect(page.getByTestId("bank-control-BANK-01")).toContainText("1.300.000");
  await expect(page.getByText("1.300.500", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/bank-control-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
  const scroller = page.getByRole("region", { name: "Control bancario por cuenta" }).locator("div.overflow-x-auto");
  await scroller.evaluate(el => { el.scrollLeft = el.scrollWidth; });
  await expect(page.getByTestId("bank-control-BANK-01").getByRole("cell", { name: "No comprobable", exact: true })).toBeVisible();
  await page.getByRole("region", { name: "Control bancario por cuenta" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/bank-control-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/cashflow");
  const expense = page.getByRole("row").filter({ hasText: "ABONO transferencia" });
  await expect(expense).toContainText("Egreso"); await expect(expense).toContainText("-$200.000");
  await expect(page.getByRole("cell", { name: /Saldo de apertura/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Revisar saldo del 2026-09-11", exact: true })).toContainText("1.300.500");
  await page.goto("/dashboard");
  await expect(page.getByRole("button", { name: /Caja prevista al.*Ver cálculo del día/ })).toContainText("1.302.500");
  const snap = await query(db, "select get_daily_base_snapshot(null) s");
  expect(snap.rows.filter((r: { normalized: { recordRole: string } }) => r.normalized.recordRole === "bank_opening")).toHaveLength(2);
 } finally { await db.close(); }
});

test("reported closing mismatch is visible per account and blocks replacing a valid ERP", async ({ page }) => {
 const db = await setupDatabaseBrowser(page);
 try {
  await preview(page);
  await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
  await page.getByRole("button", { name: /Aplicar \d+ cambios/ }).click();
  await expect(page.getByRole("heading", { name: "Cobertura de la exportación ERP" })).not.toBeVisible();
  const current = await query(db, "select get_daily_base_snapshot(null) s");
  const bad = erpWithBankBalances();
  XLSX.utils.sheet_add_aoa(bad.Sheets["SALDOS BANCOS"], [["Saldo Final"], [1299000], [500]], { origin: "D2" });
  await preview(page, bad);
  const account = page.getByTestId("bank-control-BANK-01");
  await expect(account).toContainText("1.299.000");
  await expect(account).toContainText("1.000");
  await expect(account.getByRole("alert").first()).toContainText("diferencia 1000");
  await expect(page.getByRole("checkbox", { name: /Revisé la comparación/ })).toBeDisabled();
  expect((await query(db, "select get_daily_base_snapshot(null) s")).batch.id).toBe(current.batch.id);
 } finally { await db.close(); }
});
