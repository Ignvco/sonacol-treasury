import { test, expect } from "@playwright/test";
import { setupDatabaseBrowser } from "./fixture";
import { importErp } from "../helpers/caja-migration";
import { erpContext, workbookBytes } from "../helpers/erp-workbook";
import { parseWorkbook, processWorkbook } from "../../src/import-engine/pipeline";

test("guide search, index and mobile navigation remain independent of operational forms", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/help");
    await expect(page.getByRole("heading", { name: "Guía de usuario", exact: true })).toBeVisible();
    const search = page.getByRole("searchbox", { name: "Buscar en la guía" });
    await search.fill("conciliacion");
    await expect(page.getByRole("heading", { name: "Conciliación con cartola", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Asistente de tesorería", exact: true })).toHaveCount(0);
    await search.fill("sin-coincidencia-123");
    await expect(page.getByText("No encontramos capítulos.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Limpiar búsqueda" }).click();
    await page.getByRole("navigation", { name: "Índice de la guía" }).getByRole("link", { name: "Glosario", exact: true }).click();
    await expect(page).toHaveURL(/#glosario$/);
    await expect(page.getByRole("heading", { name: "Glosario", exact: true })).toBeInViewport();
    await page.getByRole("button", { name: "Abrir navegación" }).click();
    await page.getByRole("link", { name: "Hoy", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Hoy", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Abrir navegación" }).click();
    await page.getByRole("link", { name: "Guía de usuario", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByRole("searchbox", { name: "Buscar en la guía" })).toBeVisible();
  } finally { await db.close(); }
});

test("all current modules render at desktop and phone widths with ERP data", async ({ page }) => {
  test.setTimeout(180000);
  const db = await setupDatabaseBrowser(page);
  try {
    await importErp(db, "ERP-ui-fixture.xlsx", processWorkbook(await parseWorkbook(workbookBytes()), undefined, erpContext).records);
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const routes = ["today", "dashboard", "cashflow", "banks", "receivables", "investments", "projections", "planning", "reconciliation", "changes", "scenarios", "accuracy", "assistant", "reports", "importations", "integrations", "security", "settings", "help"];
    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width === 1440 ? 1000 : 844 });
      for (const route of routes) {
        await page.goto(`/${route}`);
        await expect(page.locator("main h1"), `${route} at ${width}px`).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), `${route} document overflow at ${width}px`).toBeLessThanOrEqual(1);
        expect(await page.locator("main").evaluate(element => element.scrollWidth - element.clientWidth), `${route} main overflow at ${width}px`).toBeLessThanOrEqual(1);
        if (["dashboard", "help", "planning"].includes(route) && width !== 320) {
          await page.screenshot({ path: `test-results/ui-${route}-${width}.png`, animations: "disabled" });
        }
      }
    }
    expect(errors).toEqual([]);
  } finally { await db.close(); }
});
