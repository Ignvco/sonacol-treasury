import { test, expect } from "@playwright/test";
import { setupDatabaseBrowser } from "./fixture";
import { erpContext, erpWorkbook, erpWithoutInvestmentOpening, renamedErpWorkbook, workbookBytes } from "../helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../../src/import-engine/pipeline";
import { importErp } from "../helpers/caja-migration";
import { query } from "../helpers/decision-db";

test("ERP.xlsm can be refreshed on the same or another cutoff with renamed tabs and retained decisions", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    const upload = async (wb: ReturnType<typeof erpWorkbook>, cutoff: string) => {
      await page.getByLabel("Seleccionar archivo Excel").setInputFiles({ name: "ERP.xlsm", mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12", buffer: Buffer.from(workbookBytes(wb, "xlsm")) });
      await expect(page.getByRole("heading", { name: "Cobertura de la exportación ERP" })).toBeVisible();
      await page.getByLabel("Fecha de corte ERP", { exact: true }).fill(cutoff);
      await page.getByLabel("Inicio del mayor bancario", { exact: true }).fill("2026-09-01");
      await page.getByLabel("Inicio del mayor de inversiones", { exact: true }).fill("2026-09-01");
      await page.getByRole("button", { name: "Aplicar cobertura y comparar", exact: true }).click();
      await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
      await page.getByRole("button", { name: /Aplicar .* cambios|Confirmar revisión/ }).click();
      await expect(page.getByRole("heading", { name: "Cobertura de la exportación ERP" })).not.toBeVisible();
    };
    await page.goto("/importations"); await upload(erpWorkbook(), "2026-09-10");
    await page.goto("/planning");
    await page.getByRole("button", { name: "Ajustar", exact: true }).click();
    await page.getByLabel("Fecha prevista", { exact: true }).fill("2026-09-28");
    await page.getByRole("button", { name: "Guardar decisión", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await page.goto("/importations");
    await upload(renamedErpWorkbook(), "2026-09-10");
    expect(await query(db, "select count(*)::int s from daily_base_batches")).toBe(1);
    const next = erpWorkbook(); next.Sheets.BANCOS.I5 = { t: "s", v: "CLP 600" };
    const renamedNext = renamedErpWorkbook(next);
    await upload(renamedNext, "2026-09-11");
    const current = await query(db, "select get_daily_base_snapshot(null) s");
    expect(current.batch.cutoff).toBe("2026-09-11");
    expect(current.rows.find((r: { kind: string }) => r.kind === "invoice").normalized.adjustedDate).toBe("2026-09-28");
    expect(current.rows.filter((r: { kind: string }) => r.kind === "cash_flow").reduce((sum: number, r: { normalized: { signedAmount: number } }) => sum + r.normalized.signedAmount, 0)).toBe(1400);
    await upload(renamedNext, "2026-09-11");
    expect(await query(db, "select count(*)::int s from daily_base_batches")).toBe(2);
    const incomplete = renamedErpWorkbook(); delete incomplete.Sheets.BANCO; incomplete.SheetNames.shift();
    await page.getByLabel("Seleccionar archivo Excel").setInputFiles({ name: "ERP.xlsm", mimeType: "application/vnd.ms-excel.sheet.macroEnabled.12", buffer: Buffer.from(workbookBytes(incomplete, "xlsm")) });
    await expect(page.getByRole("alert").filter({ hasText: "No se reconocieron los reportes ERP BANCOS" })).toBeVisible();
    expect(await query(db, "select daily_latest() s")).toBe(current.batch.id);
  } finally { await db.close(); }
});

test("planning forms contain long ERP labels and keep actions reachable on desktop and small phones", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    const wb = erpWorkbook();
    wb.Sheets.CLIENTES.F2 = { t: "s", v: "Cliente con razón social extensa ".repeat(8) };
    wb.Sheets.BANCOS.H2 = { t: "s", v: "Banco y cuenta receptora de tesorería ".repeat(6) };
    wb.Sheets.BANCOS.H3 = { t: "s", v: "DESCRIPCION_LARGA_SIN_ESPACIOS_".repeat(12) };
    const batch = await importErp(db, "ERP.xlsm", processWorkbook(await parseWorkbook(workbookBytes(wb)), undefined, erpContext).records);
    await page.goto("/planning");
    for (const width of [1366, 390, 320]) {
      await page.setViewportSize({ width, height: 768 });
      for (const name of ["Crear ajuste", "Crear rescate", "Configurar cobranzas"]) {
        await page.getByRole("button", { name, exact: true }).click();
        const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
        const overflow = await dialog.evaluate(element => {
          const bounds = element.getBoundingClientRect();
          return { extra: element.scrollWidth - element.clientWidth, left: bounds.left, right: bounds.right, controls: [...element.querySelectorAll("input,select,textarea,button")].every(el => { const r = el.getBoundingClientRect(); return r.left >= bounds.left && r.right <= bounds.right; }) };
        });
        expect(overflow.extra).toBeLessThanOrEqual(1);
        expect(overflow.left).toBeGreaterThanOrEqual(0); expect(overflow.right).toBeLessThanOrEqual(width);
        expect(overflow.controls).toBe(true);
        if (name === "Crear ajuste") {
          const select = dialog.getByRole("combobox", { name: "Documento o movimiento", exact: true });
          await select.selectOption({ index: 1 });
          await dialog.getByLabel("Observaciones o condiciones", { exact: true }).fill(`Ajuste desde ${width}px`);
          await dialog.getByRole("button", { name: "Guardar decisión", exact: true }).scrollIntoViewIfNeeded();
          expect(await dialog.evaluate(e => e.scrollWidth - e.clientWidth)).toBeLessThanOrEqual(1);
          await page.screenshot({ path: `test-results/planning-form-${width}.png`, animations: "disabled" });
        }
        await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
        await expect(dialog).not.toBeVisible();
      }
    }
    await page.getByRole("button", { name: "Ajustar", exact: true }).click();
    await page.getByLabel("Fecha prevista", { exact: true }).fill("2026-09-28");
    await page.getByRole("button", { name: "Guardar decisión", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    expect((await query(db, "select get_daily_base_snapshot($1) s", [batch.id])).rows.find((r: { kind: string }) => r.kind === "invoice").normalized.adjustedDate).toBe("2026-09-28");
  } finally { await db.close(); }
});

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
    await expect(page.getByRole("region", { name: "Operación de caja" })).toContainText("16 reglas activas");
    await expect(page.getByRole("combobox", { name: "Carga CAJA de referencia", exact: true })).toHaveCount(0);
    await expect(page.getByRole("cell", { name: "2026-09-25", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Configurar cobranzas", exact: true }).click();
    await page.getByRole("dialog").getByRole("combobox", { name: "Cliente ERP", exact: true }).selectOption("C001");
    await page.getByLabel("Días naturales", { exact: true }).fill("7");
    await page.getByRole("dialog").getByRole("combobox", { name: "Cuenta receptora de la regla", exact: true }).selectOption("BANK-01");
    await page.getByRole("button", { name: "Revisar impacto", exact: true }).click();
    await expect(page.getByRole("region", { name: "Impacto de la regla" })).toContainText("1 facturas alcanzadas");
    await page.getByRole("button", { name: "Aplicar regla revisada", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();
    await expect(page.getByRole("cell", { name: "2026-09-27", exact: true })).toBeVisible();
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
