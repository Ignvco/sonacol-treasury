import { test, expect } from "@playwright/test";
import { setupDatabaseBrowser } from "./fixture";
import { admin, reader, row, session, query, upload } from "../helpers/decision-db";

test("Excel deletion stays reachable with hidden columns and on mobile, and restores the preceding BASE", async ({ page }) => {
  const db = await setupDatabaseBrowser(page);
  try {
    await upload(db, "BASE-18.xlsx", [row("BANCO", 9, { date: "2026-09-18", cutoffDate: "2026-09-18", amount: 45000 })]);
    const last = await upload(db, "BASE-22.xlsx", [row("BANCO", 9, { date: "2026-09-22", cutoffDate: "2026-09-22", amount: 47000 })]);
    await page.goto("/importations");
    await page.getByText("Vista de tabla", { exact: true }).click();
    await page.getByRole("checkbox", { name: "Fecha", exact: true }).uncheck();
    await expect(page.getByRole("checkbox", { name: "Acciones", exact: true })).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("button", { name: "Eliminar BASE-22.xlsx", exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("link", { name: "Eliminar Excel", exact: true }).click();
    const management = page.getByRole("region", { name: "Administrar archivos Excel" });
    await expect(management).toBeInViewport();
    await management.getByRole("combobox", { name: "Excel a eliminar" }).selectOption(last.id);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/excel-management-mobile.png" });
    await management.getByRole("button", { name: "Eliminar archivo", exact: true }).click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("BASE-22.xlsx");
    await expect(dialog).toContainText("BASE-18.xlsx");
    await expect(dialog.getByRole("button", { name: "Confirmar eliminación" })).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect((await db.query("select id from daily_base_batches")).rows).toHaveLength(2);
    await management.getByRole("button", { name: "Eliminar archivo", exact: true }).click();
    await dialog.getByLabel("Escribe ELIMINAR para confirmar").fill("ELIMINAR");
    await dialog.getByRole("button", { name: "Confirmar eliminación" }).click();
    await expect(dialog).toBeHidden();
    await expect(management.getByRole("combobox", { name: "Excel a eliminar" })).toHaveValue("");
    expect((await db.query("select id from daily_base_batches")).rows).toHaveLength(1);
    await page.goto("/dashboard");
    await expect(page.getByRole("button", { name: /Caja disponible.*45.000/ })).toBeVisible();
  } finally {
    await db.close();
  }
});

test("Treasury sees why deletion is unavailable and can refresh an administrator's grant without signing out", async ({ page }) => {
  const db = await setupDatabaseBrowser(page, true);
  try {
    await session(db, admin);
    const batch = await upload(db, "BASE-permisos.xlsx");
    await query(db, "select treasury_set_access($1,$2,$3,$4,$5) s", [reader, "approved", "tesoreria", true, false]);
    await session(db, reader);
    await page.goto("/importations");
    await expect(page.getByRole("link", { name: "Eliminar Excel", exact: true })).toBeVisible();
    const management = page.getByRole("region", { name: "Administrar archivos Excel" });
    await expect(management).toContainText("Tu cuenta no tiene habilitado el permiso");
    await management.getByRole("combobox", { name: "Excel a eliminar" }).selectOption(batch.id);
    await expect(management.getByRole("button", { name: "Eliminar archivo", exact: true })).toBeDisabled();
    await expect(management.getByRole("button", { name: "Vaciar Excel", exact: true })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Eliminar BASE-permisos.xlsx", exact: true })).toHaveCount(0);
    await expect(query(db, "select excel_deletion_plan($1) s", [batch.id])).rejects.toThrow(/permiso/);
    await expect(query(db, "select delete_excel_imports($1,$2,$3) s", [batch.id, "invalid", "ELIMINAR"])).rejects.toThrow(/permiso/);
    expect((await db.query("select id from daily_base_batches")).rows).toHaveLength(1);

    // Another authorized administrator grants the capability through its existing RPC.
    await session(db, admin);
    await query(db, "select treasury_set_access($1,$2,$3,$4,$5) s", [reader, "approved", "tesoreria", true, true]);
    await session(db, reader);
    await management.getByRole("button", { name: "Actualizar permisos", exact: true }).click();
    await expect(management.getByRole("button", { name: "Eliminar archivo", exact: true })).toBeEnabled();
    await expect(management.getByRole("button", { name: "Vaciar Excel", exact: true })).toBeEnabled();
    await expect(management).not.toContainText("Tu cuenta no tiene habilitado el permiso");
    await management.getByRole("button", { name: "Eliminar archivo", exact: true }).click();
    await expect(page.getByRole("alertdialog")).toContainText("BASE-permisos.xlsx");
  } finally {
    await db.close();
  }
});
