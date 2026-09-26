import { test, expect } from "@playwright/test";
import { setupDatabaseBrowser } from "./fixture";
import { migrationFixture, migrationSnapshot } from "../helpers/caja-migration";

test("CAJA review, formula adoption and daily comparison work with retained source evidence", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    const { batch, legacy } = await migrationFixture(db);
    const snapshot = await migrationSnapshot(db, batch);
    await page.goto("/planning");
    await expect(page.getByText("Correspondencias pendientes (2)", { exact: true })).toBeVisible();
    await page.getByRole("row").filter({ hasText: "Nombre antiguo" }).getByRole("button", { name: "Revisar correspondencia" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Origen conservado de CAJA", { exact: true })).toBeVisible();
    await dialog.getByRole("combobox", { name: "Documento o movimiento", exact: true }).selectOption(snapshot.rows.find(r => r.kind === "invoice" && r.normalized.document === "502")!.normalized.businessKey);
    await dialog.getByRole("button", { name: "Guardar decisión" }).click();
    await expect(dialog.getByRole("alert")).toContainText("Confirma la correspondencia");
    await dialog.getByRole("checkbox", { name: /Confirmo que revisé/ }).check();
    await dialog.getByRole("button", { name: "Guardar decisión" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText("Correspondencias pendientes (1)", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Adoptar cobranza CAJA", exact: true }).click();
    await dialog.getByRole("combobox", { name: "Cliente ERP", exact: true }).selectOption("C001");
    await dialog.getByRole("button", { name: "Revisar impacto" }).click();
    await expect(dialog.getByRole("region", { name: "Impacto de la regla" })).toContainText("2 fechas calculadas");
    await expect(dialog.getByRole("region", { name: "Impacto de la regla" })).toContainText("2 fechas explícitas");
    await dialog.getByRole("button", { name: "Aplicar regla revisada" }).click();
    await expect(dialog).not.toBeVisible();
    await page.getByRole("button", { name: "Revisar correspondencia", exact: true }).click();
    await expect(dialog.getByText("Banco de inversión CAJA", { exact: true })).toBeVisible();
    await dialog.getByRole("combobox", { name: "Posición de inversión", exact: true }).selectOption(snapshot.rows.find(r => r.kind === "investment")!.normalized.businessKey);
    await dialog.getByRole("combobox", { name: "Cuenta receptora", exact: true }).selectOption("BANK-01");
    await dialog.getByRole("checkbox", { name: /Confirmo que revisé/ }).check();
    await dialog.getByRole("button", { name: "Guardar decisión" }).click();
    await expect(dialog).not.toBeVisible();
    await expect(page.getByText(/Correspondencias pendientes \(/)).toHaveCount(0);
    await page.getByRole("combobox", { name: "Carga CAJA de referencia", exact: true }).selectOption(legacy);
    await expect(page.getByText(/Coincidencia numérica en este corte y moneda/)).toBeVisible();
    await page.screenshot({ path: "test-results/caja-migration-desktop.png", fullPage: true, animations: "disabled" });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await page.screenshot({ path: "test-results/caja-migration-mobile.png", fullPage: true, animations: "disabled" });
  } finally { await db.close(); }
});
