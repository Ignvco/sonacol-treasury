import { test, expect, type Page } from "@playwright/test";
import { setupDatabaseBrowser } from "./fixture";
import { upload, row, admin, query } from "../helpers/decision-db";

async function expectClosing(page: Page, amount: string) {
  const card = page.getByRole("button", {
    name: /Caja prevista al.*Ver cálculo del día/,
  });
  await expect(card).toContainText(amount);
  await card.click();
  await expect(page.getByTestId("projection-day-formula")).toContainText(
    amount,
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Cerrar", exact: true })
    .click();
}

test("Resumen and daily flow share cutoff, horizon, currency and closing formula despite stale filters", async ({
  page,
}) => {
  test.setTimeout(60000);
  const db = await setupDatabaseBrowser(page);
  try {
    await upload(db, "BASE-22.xlsm", [
      row("BANCO", 9, {
        amount: 1000,
        date: "2026-09-22",
        cutoffDate: "2026-09-22",
      }),
      row("BANCO", 10, {
        amount: 700,
        currency: "USD",
        date: "2026-09-22",
        cutoffDate: "2026-09-22",
      }),
      row("CLIENTES", 11, {
        amount: 200,
        dueDate: "2026-09-25",
        cutoffDate: "2026-09-22",
        customer: "Cliente",
      }),
      row("MANUAL", 12, {
        amount: 50,
        type: "expense",
        date: "2026-09-26",
        cutoffDate: "2026-09-22",
      }),
      row("CLIENTES", 13, {
        amount: 300,
        dueDate: "2026-10-15",
        cutoffDate: "2026-09-22",
        customer: "Cliente",
      }),
      row("BANCO", 14, {
        amount: 500,
        bank: "Otro banco",
        date: "2026-09-22",
        cutoffDate: "2026-09-22",
      }),
      row("CLIENTES", 15, {
        amount: 50,
        bank: "Otro banco",
        dueDate: "2026-09-25",
        cutoffDate: "2026-09-22",
        customer: "Cliente",
      }),
    ]);
    await page.addInitScript(
      ({ admin }) => {
        localStorage.setItem(
          `sonacol:view:${admin}:dashboard-v6`,
          JSON.stringify({
            cutoff: "2026-09-17",
            horizon: 7,
            currency: "BASE",
            bank: "",
          }),
        );
      },
      { admin },
    );
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/dashboard");
    await expect(page.getByLabel("Corte de movimientos BANCO")).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: "Valores", exact: true }),
    ).toHaveValue("CLP");
    await expect(
      page.getByRole("combobox", { name: "Horizonte", exact: true }),
    ).toHaveValue("30");
    await expectClosing(page, "2.000");
    await page
      .getByRole("combobox", { name: "Horizonte", exact: true })
      .selectOption("7");
    await expectClosing(page, "1.700");
    await page.goto("/cashflow");
    await expect(
      page.getByRole("combobox", { name: "Horizonte", exact: true }),
    ).toHaveValue("7");
    await expectClosing(page, "1.700");
    await expect(
      page.getByRole("button", {
        name: "Revisar saldo del 2026-09-29",
        exact: true,
      }),
    ).toContainText("1.700");
    await page
      .getByRole("combobox", { name: "Valores", exact: true })
      .selectOption("USD");
    await expectClosing(page, "700");
    await page.goto("/dashboard");
    await expect(
      page.getByRole("combobox", { name: "Valores", exact: true }),
    ).toHaveValue("USD");
    await expectClosing(page, "700");
    await page
      .getByRole("combobox", { name: "Valores", exact: true })
      .selectOption("CLP");
    await page
      .getByRole("combobox", { name: "Banco", exact: true })
      .selectOption("Banco Test");
    await page.reload();
    await expectClosing(page, "1.150");
    await page.goto("/cashflow");
    await expectClosing(page, "1.150");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: /Caja prevista al.*Ver cálculo del día/ })
      .click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/projection-formula-mobile.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await db.close();
  }
});

test("Configuration selects one BASE globally, keeps history on reload, and latest follows a later version", async ({
  page,
}) => {
  test.setTimeout(60000);
  const db = await setupDatabaseBrowser(page);
  try {
    const records = (day: string, amount: number) => [
      row("BANCO", 9, { amount, date: day, cutoffDate: day }),
      row("MANUAL", 10, {
        amount: 100,
        type: "expense",
        date: "2026-09-26",
        cutoffDate: day,
      }),
    ];
    const a = await upload(db, "BASE-17.xlsm", records("2026-09-17", 1000));
    const b = await upload(db, "BASE-18.xlsm", records("2026-09-18", 1200));
    const c = await upload(db, "BASE-22.xlsm", records("2026-09-22", 1500));
    await page.goto("/settings");
    await page
      .getByRole("combobox", { name: "BASE de consulta", exact: true })
      .selectOption(b.id);
    await expect(
      page.getByRole("combobox", { name: "Fecha de trabajo", exact: true }),
    ).toHaveValue(b.id);
    await page.goto("/dashboard");
    await expectClosing(page, "1.100");
    await page.reload();
    await expectClosing(page, "1.100");
    await page.goto("/cashflow");
    await expectClosing(page, "1.100");
    await page.goto("/settings");
    await page
      .getByRole("combobox", { name: "BASE de consulta", exact: true })
      .selectOption(a.id);
    await page.goto("/cashflow");
    await expectClosing(page, "900");
    await page.goto("/settings");
    await page
      .getByRole("combobox", { name: "BASE de consulta", exact: true })
      .selectOption("");
    await page.goto("/dashboard");
    await expectClosing(page, "1.400");
    // Same workbook request is idempotent: it cannot add another opening balance.
    expect(
      (await upload(db, "BASE-22.xlsm", records("2026-09-22", 1500))).id,
    ).toBe(c.id);
    await page.reload();
    await expectClosing(page, "1.400");
    await upload(db, "BASE-22-revision.xlsm", records("2026-09-22", 1700));
    await page.reload();
    await expectClosing(page, "1.600");
    await page.goto("/settings");
    await page
      .getByRole("combobox", { name: "BASE de consulta", exact: true })
      .selectOption(c.id);
    await page.goto("/dashboard");
    await expectClosing(page, "1.400");
    const current = await query(db, "select get_daily_base_snapshot() s");
    expect(current.rows.length).toBe(1);
    expect(current.manual.length).toBe(1);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/settings");
    await expect(
      page.getByRole("combobox", { name: "BASE de consulta", exact: true }),
    ).toHaveValue(c.id);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/base-settings-mobile.png",
      fullPage: true,
    });
  } finally {
    await db.close();
  }
});
