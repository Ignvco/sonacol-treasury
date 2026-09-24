import { setupDatabaseBrowser } from "./fixture";
import { test, expect, type Page } from "@playwright/test";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
const writer = "10000000-0000-0000-0000-000000000001",
  reader = "10000000-0000-0000-0000-000000000002";
const setup = setupDatabaseBrowser;
/** The working date lives in the shell header as a chip with a version menu. */
async function pickWorkingDate(page: Page, option: RegExp) {
  await page.getByRole("button", { name: "Fecha de trabajo" }).click();
  await page
    .getByTestId("working-date-menu")
    .getByRole("button", { name: option })
    .click();
}
function workbook(day = 12, amount = 45000) {
  const sheet = XLSX.utils.aoa_to_sheet(Array.from({ length: 7 }, () => []));
  sheet.AE7 = { t: "d", v: new Date(Date.UTC(2026, 8, day)) };
  const headers = [
    "TABLA ORIGEN",
    "EMPRESA",
    "MES",
    "FECHA",
    "CODIGO CTA",
    "DESCRIPCION CTA",
    "COMP",
    "RUT",
    "RAZON SOCIAL",
    "TIPO DOCTO",
    "N DOCTO",
    "GLOSA",
    "VCTO REAL",
    "VCTO",
    "AJ VCTO",
    "DEBE",
    "HABER",
    "REAL",
    "ESTADO",
    "CUENTA INFORME",
    "OPERACIÓN",
  ];
  const date = new Date(Date.UTC(2026, 8, 11)),
    future = new Date(Date.UTC(2026, 8, day + 7));
  const records = [
    [
      "BANCO",
      "TEST",
      "SEPTIEMBRE",
      date,
      511010007,
      "Banco BCI",
      1,
      "",
      "",
      "",
      "",
      "Cobro ERP",
      null,
      date,
      null,
      amount,
      0,
      amount,
      "CONCILIADO",
      "Banco BCI",
      "Recaudacion Clientes",
    ],
    [
      "CLIENTES",
      "TEST",
      "SEPTIEMBRE",
      date,
      1,
      "Clientes",
      2,
      "12345678-K",
      "Cliente prueba",
      "FACTURA",
      "F001",
      "Factura ERP",
      future,
      future,
      null,
      900,
      0,
      900,
      "",
      "Banco BCI",
      "Recaudacion Clientes",
    ],
    [
      "COLOCACIONES",
      "TEST",
      "SEPTIEMBRE",
      date,
      2,
      "Colocaciones",
      3,
      "",
      "Banco BCI",
      "",
      "INV001",
      "Inversión ERP",
      future,
      future,
      null,
      500,
      0,
      500,
      "",
      "Banco BCI",
      "Rescate",
    ],
    [
      "MANUAL",
      "TEST",
      "SEPTIEMBRE",
      date,
      3,
      "Manual",
      4,
      "",
      "",
      "",
      "M001",
      "Pago manual",
      future,
      future,
      null,
      0,
      100,
      -100,
      "",
      "Banco BCI",
      "Proveedores",
    ],
  ];
  XLSX.utils.sheet_add_aoa(sheet, [headers, ...records], { origin: "A8" });
  sheet["!ref"] = "A7:AE12";
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "BASE");
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["NO LEER"], ["#ERROR"]]),
    "MACRO BANCO",
  );
  return XLSX.write(wb, { bookType: "xlsx", type: "buffer" });
}
async function upload(page: Page, name: string, day: number, amount: number) {
  await page.goto("/importations");
  await page
    .getByLabel("Seleccionar archivo Excel")
    .setInputFiles({
      name,
      mimeType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer: workbook(day, amount),
    });
  await expect(
    page.getByRole("heading", { name: "Compara tu Excel antes de actualizar" }),
  ).toBeVisible();
  await page.getByRole("checkbox", { name: /Revisé la comparación/ }).check();
  await page
    .getByRole("button", { name: /Aplicar .* cambios|Confirmar revisión/ })
    .click();
  await expect(page.getByText("Detalle — " + name)).toBeVisible();
}
test("daily workflow uses real SQL: two different workbooks, editable MANUAL, history and populated reconciliation", async ({
  page,
}) => {
  test.setTimeout(90000);
  const db = await setup(page);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await upload(page, "day-one.xlsx", 12, 45000);
    await page.goto("/projections");
    await page
      .getByRole("button", { name: "Editar Pago manual", exact: true })
      .click();
    await page.getByLabel("Importe", { exact: true }).fill("240");
    await page
      .getByRole("button", { name: "Guardar proyección", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page.getByText("−240 CLP", { exact: true })).toBeVisible();
    await upload(page, "day-two.xlsx", 13, 47000);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("button", { name: /Caja disponible.*47.000/ }),
    ).toBeVisible();
    await page.goto("/projections");
    await expect(page.getByText("−240 CLP", { exact: true })).toBeVisible();
    await pickWorkingDate(page, /day-one\.xlsx/);
    await page
      .getByRole("button", { name: "Editar Pago manual", exact: true })
      .click();
    await page.getByLabel("Importe", { exact: true }).fill("333");
    await page
      .getByRole("button", { name: "Guardar proyección", exact: true })
      .click();
    await expect(page.getByText("−333 CLP", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByText("−333 CLP", { exact: true })).toBeVisible();
    await pickWorkingDate(page, /Última BASE disponible/);
    await expect(page.getByText("−240 CLP", { exact: true })).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/reconciliation");
    await expect(
      page.getByRole("row").filter({ hasText: "47.000 CLP" }),
    ).toBeVisible();
    await expect(
      page.getByText("Pendiente de cartola", { exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "docs/screenshots/conciliacion-diaria-mobile.png",
      fullPage: true,
    });
    await page.getByRole("row").filter({ hasText: "47.000 CLP" }).click();
    await expect(page.getByRole("dialog")).toContainText("Cobro ERP");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Cerrar", exact: true })
      .click();
    await page.goto("/investments");
    await expect(
      page.getByRole("heading", { name: "Inversiones", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", {
        name: /Editar|Programar rescate|Marcar como rescatada/,
      }),
    ).toHaveCount(0);
    await page.goto("/payments");
    await expect(page).toHaveURL(/\/projections$/);
    expect(errors).toEqual([]);
  } finally {
    await db.close();
  }
});
test("consultation role has no MANUAL editing actions", async ({ page }) => {
  const db = await setup(page, true);
  try {
    await page.goto("/projections");
    await expect(
      page.getByRole("heading", { name: "Proyecciones", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Nueva proyección", exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.close();
  }
});

test("deleting Excel updates cash, history, MANUAL and reconciliation; the same workbook can be imported again", async ({
  page,
}) => {
  test.setTimeout(90000);
  const db = await setup(page);
  try {
    await upload(page, "first.xlsx", 12, 45000);
    await upload(page, "second.xlsx", 13, 47000);
    const selected = await page.evaluate(
      (user) => localStorage.getItem("sonacol.working-date:" + user) ?? "",
      writer,
    );
    await page
      .getByRole("button", { name: "Eliminar second.xlsx", exact: true })
      .click();
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toContainText("2026-09-12");
    await expect(
      dialog.getByRole("button", {
        name: "Confirmar eliminación",
        exact: true,
      }),
    ).toBeDisabled();
    await dialog.getByRole("button", { name: "Cancelar", exact: true }).click();
    expect(
      (await db.query("select * from daily_base_batches")).rows,
    ).toHaveLength(2);
    await page
      .getByRole("button", { name: "Eliminar second.xlsx", exact: true })
      .click();
    await dialog.getByLabel("Escribe ELIMINAR para confirmar").fill("ELIMINAR");
    await dialog
      .getByRole("button", { name: "Confirmar eliminación", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Eliminar second.xlsx", exact: true }),
    ).toHaveCount(0);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("button", { name: /Caja disponible.*45.000/ }),
    ).toBeVisible();
    // Another browser tab may still remember the batch that has just been removed.
    await page.evaluate(
      ({ id, user }) =>
        localStorage.setItem("sonacol.working-date:" + user, id),
      { id: selected, user: writer },
    );
    await page.reload();
    await expect(
      page.getByRole("button", { name: /Caja disponible.*45.000/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Fecha de trabajo" }),
    ).toContainText("Última BASE");
    await page.goto("/importations");
    await page.setViewportSize({ width: 390, height: 844 });
    await page
      .getByRole("button", { name: "Vaciar Excel", exact: true })
      .click();
    await dialog
      .getByLabel("Escribe VACIAR EXCEL para confirmar")
      .fill("VACIAR EXCEL");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "docs/screenshots/eliminar-excel-mobile.png",
      fullPage: true,
      animations: "disabled",
    });
    await dialog
      .getByRole("button", { name: "Confirmar eliminación", exact: true })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      page.getByRole("button", { name: "Eliminar first.xlsx", exact: true }),
    ).toHaveCount(0);
    await page.goto("/dashboard");
    await expect(
      page.getByText("Todavía no hay filas BASE guardadas.", { exact: false }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Caja disponible.*0.*Ver desglose/ }),
    ).toBeVisible();
    await page.goto("/projections");
    await expect(
      page.getByRole("button", { name: "Editar Pago manual", exact: true }),
    ).toHaveCount(0);
    await page.goto("/reconciliation");
    await expect(page.getByText("45.000 CLP", { exact: true })).toHaveCount(0);
    expect(
      (await db.query("select * from daily_base_batches")).rows,
    ).toHaveLength(0);
    await upload(page, "first.xlsx", 12, 45000);
    await page.goto("/dashboard");
    await expect(
      page.getByRole("button", { name: /Caja disponible.*45.000/ }),
    ).toBeVisible();
  } finally {
    await db.close();
  }
});

test("consultation role cannot access Excel deletion controls", async ({
  page,
}) => {
  const db = await setup(page, true);
  try {
    await page.goto("/importations");
    await expect(
      page.getByRole("heading", { name: "Importaciones", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Vaciar Excel", exact: true }),
    ).toHaveCount(0);
  } finally {
    await db.close();
  }
});
