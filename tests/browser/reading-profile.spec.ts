import { test, expect } from "@playwright/test";
import * as XLSX from "xlsx";
import { setupDatabaseBrowser } from "./fixture";
import { profileWorkbook } from "../helpers/profile-workbook";

test("reading template is visible in Settings and previews; a shifted column cannot replace accepted BASE", async ({
  page,
}) => {
  const db = await setupDatabaseBrowser(page);
  try {
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", {
        name: "Plantilla de lectura Excel",
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByText("Ver columnas y reglas de lectura", { exact: true })
      .click();
    await expect(
      page.getByRole("row").filter({ hasText: "Importe con signo" }),
    ).toContainText("R");
    await page.setViewportSize({ width: 390, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.getByText("Fila 8", { exact: true }).scrollIntoViewIfNeeded();
    await page.screenshot({
      path: "test-results/reading-profile-mobile.png",
      fullPage: true,
    });
    await page
      .getByRole("row")
      .filter({ hasText: "Importe con signo" })
      .scrollIntoViewIfNeeded();
    await page.screenshot({ path: "test-results/reading-profile-columns-mobile.png" });
    await page.goto("/importations");
    const wb = profileWorkbook();
    await page
      .getByLabel("Seleccionar archivo Excel")
      .setInputFiles({
        name: "BASE-22.xlsm",
        mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
        buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsm" }),
      });
    const reading = page.getByRole("region", {
      name: "Estructura de Excel reconocida",
    });
    await expect(reading).toContainText("Plantilla SONACOL BASE · versión 1");
    await expect(reading).toContainText("encabezados en fila 8");
    await expect(reading).toContainText("Corte detectado: 2026-09-22");
    await expect(reading).toContainText("filas 9 y 9");
    await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
    await page
      .getByRole("button", { name: /Aplicar .* cambios|Confirmar revisión/ })
      .click();
    await expect(page.getByText("Detalle — BASE-22.xlsm")).toBeVisible();
    const count = () =>
      db.query<{ n: number }>("select count(*)::int n from daily_base_batches");
    expect((await count()).rows[0].n).toBe(1);
    await page.goto("/importations");
    wb.Sheets.BASE.N8 = { t: "s", v: "IMPORTE" };
    await page
      .getByLabel("Seleccionar archivo Excel")
      .setInputFiles({
        name: "BASE-mal-formada.xlsm",
        mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12",
        buffer: XLSX.write(wb, { type: "buffer", bookType: "xlsm" }),
      });
    await expect(
      page.getByText(/La plantilla espera VCTO en BASE!N8/),
    ).toBeVisible();
    expect((await count()).rows[0].n).toBe(1);
  } finally {
    await db.close();
  }
});
