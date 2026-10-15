import { test, expect } from "@playwright/test";
import { setupDatabaseBrowser } from "./fixture";
import { erpContext, erpWithBankBalances, workbookBytes } from "../helpers/erp-workbook";
import { importErp } from "../helpers/caja-migration";
import { query } from "../helpers/decision-db";
import { parseWorkbook, processWorkbook } from "../../src/import-engine/pipeline";
async function fixture(db: Awaited<ReturnType<typeof setupDatabaseBrowser>>, withPayment = false) {
 const rows = processWorkbook(await parseWorkbook(workbookBytes(erpWithBankBalances())), undefined, erpContext).records;
 const batch = await importErp(db, "ERP.xlsm", rows);
 if (withPayment) await query(db, "select treasury_save_manual($1,null,null,$2::jsonb,'{}'::jsonb) s", [batch.id, JSON.stringify({ date: "2026-09-12", amount: 50000, currency: "CLP", type: "expense", category: "supplier", status: "proyectado", description: "Pago futuro" })]);
}

test("Resumen and Flujo show registered Abono expenses, source details and daily cash separately from future payments", async ({ page }) => {
 test.setTimeout(60000);
 const db = await setupDatabaseBrowser(page);
 try {
  await fixture(db, true);
  for (const route of ["/dashboard", "/cashflow"]) {
   await page.goto(route);
   await expect(page.getByTestId("bank-activity-expense")).toContainText("200.000");
   await expect(page.getByTestId("bank-activity-income")).toContainText("500.000");
   await expect(page.getByTestId("bank-activity-opening")).toContainText("1.000.500");
   await expect(page.getByTestId("bank-activity-closing")).toContainText("1.300.500");
   await expect(page.getByRole("button", { name: /Caja prevista al.*Ver cálculo del día/ })).toContainText("1.252.500");
   await page.getByTestId("bank-activity-expense").click();
   await expect(page.getByRole("dialog")).toContainText("ABONO transferencia");
   await expect(page.getByRole("dialog")).toContainText("-200.000");
   await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();
   await page.getByText("Ver flujo bancario diario", { exact: true }).click();
   const region = page.getByRole("region", { name: "Flujo bancario registrado" });
   await expect(region.getByRole("row").filter({ hasText: "2026-09-02" })).toContainText("800.500");
   await region.getByRole("button", { name: "Ver egresos del 2026-09-02", exact: true }).click();
   await expect(page.getByRole("dialog")).toContainText("-200.000");
   await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();
  }
  await page.getByRole("combobox", { name: "Banco", exact: true }).selectOption("Banco sin movimientos");
  await expect(page.getByTestId("bank-activity-expense")).toContainText("0 filas");
  await expect(page.getByTestId("bank-activity-closing")).toContainText("500");
  await page.goto("/dashboard");
  await expect(page.getByTestId("bank-activity-closing")).toContainText("500");
  await expect(page.getByText("Sin ingresos ni egresos previstos en este período.", { exact: true })).toBeVisible();
  await expect(page.getByText("Ingresos 50%", { exact: true })).toHaveCount(0);
  await page.getByRole("combobox", { name: "Banco", exact: true }).selectOption("");
  await page.reload();
  await expect(page.getByTestId("bank-activity-expense")).toContainText("200.000");
  await page.getByRole("region", { name: "Flujo bancario registrado" }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: "test-results/cashflow-activity-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("region", { name: "Flujo bancario registrado" }).scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/cashflow-activity-mobile.png" });
  await page.getByTestId("bank-activity-expense").click();
  await expect(page.getByRole("dialog")).toContainText("-200.000");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 } finally { await db.close(); }
});

test("a minimum at the cutoff opens actual cash and a negative future net keeps its minus sign", async ({ page }) => {
 const db = await setupDatabaseBrowser(page);
 try {
  await fixture(db);
  const before = await query(db, "select get_daily_base_snapshot(null) s");
  const invoice = before.rows.find((r: { kind: string }) => r.kind === "invoice");
  await query(db, "select treasury_save_business($1,null,null,'adjustment',$2,$3::jsonb,false) s", [before.batch.id, invoice.normalized.businessKey, JSON.stringify({ date: "2026-09-11" })]);
  await page.goto("/dashboard");
  const minimum = page.getByRole("button", { name: /^Mínimo desde el corte:/ });
  await expect(minimum).toContainText("1.300.500");
  await minimum.click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Caja disponible", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toContainText("1.300.500");
  await page.getByRole("dialog").getByRole("button", { name: "Cerrar", exact: true }).click();
  const snap = await query(db, "select get_daily_base_snapshot(null) s");
  await query(db, "select treasury_save_manual($1,null,null,$2::jsonb,'{}'::jsonb) s", [snap.batch.id, JSON.stringify({ date: "2026-09-12", amount: 50000, currency: "CLP", type: "expense", category: "supplier", status: "proyectado", description: "Pago neto negativo" })]);
  for (const route of ["/cashflow", "/dashboard"]) {
   await page.goto(route);
   await expect(page.getByText("Neto -$48.000", { exact: true })).toBeVisible();
  }
 } finally { await db.close(); }
});
