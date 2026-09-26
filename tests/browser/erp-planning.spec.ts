import { test, expect } from "@playwright/test";
import { setupDatabaseBrowser } from "./fixture";
import { erpWithoutInvestmentOpening, workbookBytes } from "../helpers/erp-workbook";

test("raw ERP import, collection adjustment and partial rescue work through the UI", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    await page.goto("/importations");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "ERP.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(workbookBytes()) });
    await expect(page.getByRole("heading", { name: "Cobertura de la exportación ERP" })).toBeVisible();
    await page.getByLabel("Fecha de corte ERP", { exact: true }).fill("2026-09-10");
    await page.getByLabel("Inicio del mayor bancario", { exact: true }).fill("2026-09-01");
    await page.getByLabel("Inicio del mayor de inversiones", { exact: true }).fill("2026-09-01");
    await page.getByRole("button", { name: "Aplicar cobertura y comparar" }).click();
    await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
    await page.getByRole("button", { name: /Aplicar \d+ cambios/ }).click();
    await expect(page.getByRole("heading", { name: "Cobertura de la exportación ERP" })).not.toBeVisible();
    await page.goto("/planning");
    await expect(page.getByRole("heading", { name: "Planificación y reglas" })).toBeVisible();
    await expect(page.getByText("13.000 CLP", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Ajustar", exact: true }).click();
    await page.getByLabel("Fecha prevista", { exact: true }).fill("2026-09-28");
    await page.getByRole("button", { name: "Guardar decisión" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByRole("cell", { name: "2026-09-28", exact: true })).toHaveCount(2);
    await page.getByRole("button", { name: "Programar rescate", exact: true }).click();
    await page.getByLabel("Fecha prevista", { exact: true }).fill("2026-09-25");
    await page.getByLabel(/Importe del rescate/).fill("5000");
    await page.getByRole("dialog").getByRole("combobox", { name: "Cuenta receptora", exact: true }).selectOption("BANK-01");
    await page.getByRole("button", { name: "Guardar decisión" }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByText("Programado: 5.000 · Remanente: 8.000", { exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/erp-planning-desktop.png", fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("heading", { name: "Planificación y reglas" })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: "test-results/erp-planning-mobile.png", fullPage: true, animations: "disabled" });
  } finally { await db.close(); }
});

test("ERP without OB explains a wrong reporting period and imports after correcting it", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    await page.goto("/importations");
    await page.locator('input[type="file"]').first().setInputFiles({ name: "ERP-sin-OB.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(workbookBytes(erpWithoutInvestmentOpening("31/08/2026"))) });
    await page.getByLabel("Fecha de corte ERP", { exact: true }).fill("2026-09-10");
    await page.getByLabel("Inicio del mayor bancario", { exact: true }).fill("2026-09-01");
    await page.getByLabel("Inicio del mayor de inversiones", { exact: true }).fill("2026-09-01");
    await page.getByRole("button", { name: "Aplicar cobertura y comparar" }).click();
    await expect(page.getByText("COLOCACIONES contiene un movimiento del 2026-08-31; el inicio de su mayor no puede ser posterior a esa fecha.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: /Con errores\s+1/ }).click();
    await expect(page.getByRole("cell", { name: "COLOCACIONES · 3", exact: true })).toBeVisible();
    await expect(page.getByRole("checkbox", { name: /Revisé la comparación/ })).toBeDisabled();
    await page.getByRole("button", { name: "Usar 2026-08-31 para inversiones", exact: true }).click();
    await page.getByRole("button", { name: "Aplicar cobertura y comparar" }).click();
    await expect(page.getByText("Aperturas de inversión calculadas", { exact: true })).toBeVisible();
    await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
    await page.getByRole("button", { name: "Aplicar 7 cambios", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Cobertura de la exportación ERP" })).not.toBeVisible();
    await page.goto("/planning");
    await expect(page.getByText("13.000 CLP", { exact: true })).toBeVisible();
    await expect(page.getByText(/Apertura calculada: 10.000 CLP/)).toBeVisible();
    await page.screenshot({ path: "test-results/erp-opening-planning.png", fullPage: true, animations: "disabled" });
  } finally { await db.close(); }
});
