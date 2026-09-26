import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { cutoffWorkbook } from "../helpers/cutoff-workbook";
import { setupDatabaseBrowser } from "./fixture";

test("user defines cutoff in preview, changing it requires comparison, repeats preserve cash and dates agree across views", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    const buffer = XLSX.write(cutoffWorkbook(), { bookType: "xlsm", type: "buffer" });
    const open = async () => {
      await page.goto("/importations");
      await page.getByLabel("Seleccionar archivo Excel").setInputFiles({ name: "BASE.xlsm", mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12", buffer });
    };
    const confirm = page.getByRole("button", { name: /Aplicar .* cambios|Confirmar revisión/ });
    const editor = page.getByRole("region", { name: "Fecha de corte de la importación" });
    await open();
    await expect(editor).toContainText("contiene una fórmula");
    await expect(confirm).toBeDisabled();
    expect((await db.query("select * from daily_base_batches")).rows.length).toBe(0);
    await page.getByRole("button", { name: "Usar última fecha BANCO", exact: true }).click();
    await expect(page.getByLabel("Fecha de corte", { exact: true })).toHaveValue("2026-09-22");
    await page.getByRole("button", { name: "Aplicar fecha de corte", exact: true }).click();
    await expect(page.getByRole("region", { name: "Estructura de Excel reconocida" })).toContainText("Corte seleccionado: 2026-09-22");
    const totals = page.getByRole("region", { name: "Control de importes de BASE" });
    await expect(totals.getByRole("row").filter({ hasText: "BANCO" })).toContainText("100");
    await expect(totals.getByRole("row").filter({ hasText: "CLIENTES" })).toContainText("300");
    await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
    await expect(confirm).toBeEnabled();
    await page.getByLabel("Fecha de corte", { exact: true }).fill("2026-09-21");
    await expect(confirm).toBeDisabled();
    await page.getByRole("button", { name: "Aplicar fecha de corte", exact: true }).click();
    await expect(editor).toContainText("El corte no puede ser anterior");
    await page.getByLabel("Fecha de corte", { exact: true }).fill("2026-09-22");
    await page.getByRole("button", { name: "Aplicar fecha de corte", exact: true }).click();
    await expect(editor.getByRole("alert")).toHaveCount(0);
    await page.setViewportSize({ width: 390, height: 844 });
    await editor.scrollIntoViewIfNeeded();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/import-cutoff-mobile.png" });
    await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
    await confirm.click();
    await expect(page.getByText("Detalle — BASE.xlsm")).toBeVisible();
    for (const route of ["/dashboard", "/cashflow"]) {
      await page.goto(route);
      await expect(page.getByTestId("projection-period")).toContainText(/BASE al 22 .*2026/);
      await expect(page.getByTestId("projection-period")).toContainText(/Proyección del 23 .*2026/);
      await expect(page.getByRole("button", { name: /Caja prevista al/ })).toContainText("350");
    }
    await open();
    await page.getByLabel("Fecha de corte", { exact: true }).fill("2026-09-22");
    await page.getByRole("button", { name: "Aplicar fecha de corte", exact: true }).click();
    await expect(editor.getByRole("alert")).toHaveCount(0);
    await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
    await confirm.click();
    await expect(page.getByText("Detalle — BASE.xlsm")).toBeVisible();
    expect((await db.query("select cutoff::text from daily_base_batches")).rows).toEqual([{ cutoff: "2026-09-22" }]);
    await expect(page.getByRole("link", { name: "Eliminar Excel", exact: true })).toBeVisible();
  } finally { await db.close(); }
});

test("an invalid AE7 can be corrected on screen, but an erroneous planned date cannot replace a saved snapshot", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    const wb = cutoffWorkbook(); wb.Sheets.BASE.AE7 = { t: "e", v: 42 };
    const open = async () => {
      await page.goto("/importations");
      await page.getByLabel("Seleccionar archivo Excel").setInputFiles({ name: "BASE.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: XLSX.write(wb, { bookType: "xlsx", type: "buffer" }) });
      await page.getByLabel("Fecha de corte", { exact: true }).fill("2026-09-22");
      await page.getByRole("button", { name: "Aplicar fecha de corte", exact: true }).click();
      await expect(page.getByRole("region", { name: "Fecha de corte de la importación" }).getByRole("alert")).toHaveCount(0);
    };
    await open();
    await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
    await page.getByRole("button", { name: /Aplicar .* cambios|Confirmar revisión/ }).click();
    await expect(page.getByText("Detalle — BASE.xlsx")).toBeVisible();
    wb.Sheets.BASE.N10 = { t: "e", v: 42 };
    await open();
    await expect(page.getByText("Hay errores en BASE.", { exact: false })).toBeVisible();
    await expect(page.getByText("BASE!N10 contiene un error de Excel.", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: /Aplicar .* cambios|Confirmar revisión/ })).toBeDisabled();
    expect((await db.query("select * from daily_base_batches")).rows.length).toBe(1);
  } finally { await db.close(); }
});
