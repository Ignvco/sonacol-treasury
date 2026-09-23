import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import * as XLSX from "xlsx";
import { PDFDocument } from "pdf-lib";
import { setupDatabaseBrowser } from "./fixture";
import {
  upload,
  row,
  query,
  admin,
  reader,
  session,
} from "../helpers/decision-db";
test("decision center: task, scenario, frozen forecast and sourced assistant persist through reload", async ({
  page,
}) => {
  const db = await setupDatabaseBrowser(page);
  try {
    await upload(db, "decision-browser.xlsm", [
      row("BANCO", 9, { amount: 100000, description: "Caja inicial" }),
      row("MANUAL", 10, {
        amount: 30000,
        type: "expense",
        date: "2026-09-22",
        description: "Arriendo septiembre",
      }),
    ]);
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Hoy", exact: true }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Nueva tarea", exact: true })
      .click();
    await page.getByLabel("Título", { exact: true }).fill("Confirmar depósito");
    await page
      .getByRole("combobox", { name: "Responsable", exact: true })
      .selectOption(admin);
    await page.getByRole("button", { name: "Guardar tarea" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Completar Confirmar depósito" }),
    ).toBeVisible();
    await page.goto("/scenarios");
    await page.getByLabel("Nombre", { exact: true }).fill("Cobros prudentes");
    await page.getByLabel("Importe Arriendo septiembre").fill("40000");
    await page
      .getByRole("button", { name: "Guardar escenario", exact: true })
      .click();
    await expect(
      page.getByText("Escenario guardado con su BASE de referencia", {
        exact: true,
      }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Congelar previsión actual" })
      .click();
    await expect
      .poll(async () =>
        Number(
          (await db.query("select count(*) n from treasury_forecasts")).rows[0]
            .n,
        ),
      )
      .toBe(1);
    await page.reload();
    await page
      .getByRole("combobox", { name: "Abrir escenario", exact: true })
      .selectOption({ label: "Cobros prudentes" });
    await expect(page.getByLabel("Importe Arriendo septiembre")).toHaveValue(
      "40000",
    );
    const snap = await query(db, "select get_daily_base_snapshot() s");
    expect(snap.manual[0].normalized.amount).toBe(30000);
    await page.goto("/assistant");
    await page
      .getByRole("button", { name: "¿Cómo se compone mi caja?", exact: true })
      .click();
    await expect(
      page.getByText(/La caja disponible.*100.000 CLP/),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Ver 1 movimientos de respaldo" })
      .click();
    await expect(page.getByRole("dialog")).toContainText("Caja inicial");
    await page.getByRole("button", { name: "Cerrar", exact: true }).click();
    await page.screenshot({
      path: "test-results/assistant-desktop.png",
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    await db.close();
  }
});
test("agenda: recurring MANUAL, single exception, comments and attachment use real SQL", async ({
  page,
}) => {
  const db = await setupDatabaseBrowser(page);
  try {
    await upload(db, "agenda.xlsm");
    await page.goto("/projections");
    await page
      .getByRole("button", { name: "Nueva proyección", exact: true })
      .click();
    await page
      .getByRole("textbox", { name: "Descripción", exact: true })
      .fill("Arriendo recurrente");
    await page
      .getByRole("combobox", { name: "Tipo", exact: true })
      .selectOption("expense");
    await page.getByLabel("Importe", { exact: true }).fill("25");
    await page.getByLabel("Fecha estimada").fill("2026-09-21");
    await page
      .getByRole("combobox", { name: "Repetición", exact: true })
      .selectOption("monthly");
    await page.getByLabel("Ocurrencias").fill("3");
    await page
      .getByRole("button", { name: "Guardar proyección", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(
      page.getByRole("button", {
        name: "Editar Arriendo recurrente",
        exact: true,
      }),
    ).toHaveCount(3);
    await page
      .getByRole("button", { name: "Editar Arriendo recurrente", exact: true })
      .first()
      .click();
    await page
      .getByLabel("Comentario", { exact: true })
      .fill("Pendiente de comprobante");
    await page.getByRole("button", { name: "Comentar", exact: true }).click();
    await expect(
      page.getByText("Pendiente de comprobante", { exact: true }),
    ).toBeVisible();
    await page
      .getByLabel(/Adjuntar PDF/)
      .setInputFiles({
        name: "respaldo.txt",
        mimeType: "text/plain",
        buffer: Buffer.from("Respaldo de prueba"),
      });
    await expect(
      page.getByRole("button", { name: /respaldo.txt/ }),
    ).toBeVisible();
    await page.getByLabel("Fecha confirmada").fill("2026-09-24");
    await page
      .getByRole("button", { name: "Guardar proyección", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const snapshot = await query(db, "select get_daily_base_snapshot() s");
    expect(
      snapshot.manual
        .filter((r) => r.normalized.description === "Arriendo recurrente")
        .map((r) => r.normalized.date)
        .sort(),
    ).toEqual(["2026-09-24", "2026-10-21", "2026-11-21"]);
    await page.getByRole("button", {name:"Editar Arriendo recurrente",exact:true}).first().click();
    await expect(page.getByLabel("Fecha estimada")).toHaveValue("2026-09-21");
    await page.getByLabel("Fecha confirmada").fill("");
    await page.getByRole("button", {name:"Guardar proyección",exact:true}).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const restored=await query(db,"select get_daily_base_snapshot() s");
    expect(restored.manual.filter(r=>r.normalized.description==='Arriendo recurrente').map(r=>r.normalized.reportDate).sort()).toEqual(['2026-09-21','2026-10-21','2026-11-21']);
    await page.getByRole("button", { name: "Agenda visual" }).click();
    await page
      .getByRole("combobox", { name: "Vista", exact: true })
      .selectOption("week");
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(
      page.getByRole("combobox", { name: "Vista", exact: true }),
    ).toBeVisible();
    await page.screenshot({
      path: "test-results/agenda-mobile.png",
      fullPage: true,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  } finally {
    await db.close();
  }
});
test("independent bank statement: import, partial match and reversal recalculate available allocations", async ({
  page,
}) => {
  const db = await setupDatabaseBrowser(page);
  try {
    await upload(db, "bank.xlsm", [
      row("BANCO", 9, { description: "Cobro factura 9" }),
    ]);
    await page.goto("/reconciliation");
    await page.getByRole("button", { name: "Importar cartola CSV" }).click();
    await page
      .getByLabel("Archivo CSV")
      .setInputFiles({
        name: "cartola.csv",
        mimeType: "text/csv",
        buffer: Buffer.from(
          "Fecha;Monto;Referencia;Descripción\n19-09-2026;100;9;Abono cartola",
        ),
      });
    await page.getByLabel("Saldo inicial (opcional)").fill("0");
    await page.getByLabel("Saldo final (opcional)").fill("100");
    await page
      .getByLabel("Revisé cuenta, moneda, fechas y sentido de los movimientos.")
      .check();
    await page.getByRole("button", { name: "Guardar cartola" }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("button", { name: "Preparar selección" }).click();
    await page.getByLabel("Asignar BASE Cobro factura 9").fill("40");
    await page.getByLabel("Asignar cartola Abono cartola").fill("40");
    await page
      .getByLabel("Motivo de la conciliación")
      .fill("Abono parcial verificado");
    await page.getByRole("button", { name: "Revisar conciliación" }).click();
    await expect(page.getByRole("dialog")).toContainText("por 40 CLP");
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText("Confirmada", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Revertir", exact: true }).click();
    await page.getByLabel("Motivo de reversa").fill("Corregir imputación");
    await page.getByRole("button", { name: "Confirmar", exact: true }).click();
    await expect(
      page.getByText("Revertida · Corregir imputación", { exact: true }),
    ).toBeVisible();
    const state = await query(db, "select treasury_reconciliation($1,$2) s", [
      '["Banco Test","1101"]',
      "CLP",
    ]);
    expect(Number(state.transactions[0].allocated)).toBe(0);
  } finally {
    await db.close();
  }
});
test("executive exports: PDF and Excel download the selected context and exact figures", async ({
  page,
}) => {
  const db = await setupDatabaseBrowser(page);
  try {
    await upload(db, "reports.xlsm", [
      row("BANCO", 9, { amount: 14000 }),
      row("MANUAL", 10, { date: "2026-09-21", type: "expense", amount: 2000 }),
    ]);
    await page.goto("/reports");
    await page
      .getByRole("combobox", { name: "Horizonte", exact: true })
      .selectOption("7");
    const excelEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Excel completo" }).click();
    const excel = await excelEvent;
    const book = XLSX.read(await readFile((await excel.path())!), {
      type: "buffer",
    });
    const context = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      book.Sheets.Contexto,
    )[0];
    expect(context.Horizonte).toBe(7);
    expect(context.Moneda).toBe("CLP");
    const summary = XLSX.utils.sheet_to_json<Record<string, unknown>>(
      book.Sheets.Resumen,
    );
    expect(summary[0].Valor).toBe(14000);
    expect(summary[1].Valor).toBe(12000);
    const pdfEvent = page.waitForEvent("download");
    await page.getByRole("button", { name: "Informe PDF" }).click();
    const pdf = await pdfEvent;
    const bytes = await readFile((await pdf.path())!);
    expect((await PDFDocument.load(bytes)).getPageCount()).toBeGreaterThan(0);
    await pdf.saveAs("test-results/informe-ejecutivo.pdf");
  } finally {
    await db.close();
  }
});
test("admission: pending users see no treasury and writing requires a second factor", async ({
  page,
}) => {
  const db = await setupDatabaseBrowser(page, false, "aal1");
  try {
    await page.goto("/");
    await expect(
      page.getByRole("heading", { name: "Protege tu sesión" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Configurar segundo factor" }),
    ).toBeVisible();
    await expect(page.getByRole("navigation")).toHaveCount(0);
  } finally {
    await db.close();
  }
  const pending = await setupDatabaseBrowser(page, true);
  try {
    await session(pending);
    await query(pending, "select treasury_set_access($1,$2,$3,false,false) s", [
      reader,
      "pending",
      "consulta",
    ]);
    await session(pending, reader);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Acceso pendiente de autorización" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Buscar en BASE" }),
    ).toHaveCount(0);
  } finally {
    await pending.close();
  }
});
test("mobile decision routes fit the screen, read-only users cannot export or mutate", async ({
  page,
}) => {
  const db = await setupDatabaseBrowser(page, true);
  try {
    await session(db);
    await upload(db, "mobile.xlsm");
    await session(db, reader);
    await page.setViewportSize({ width: 390, height: 844 });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const [url, heading] of [
      ["/", "Hoy"],
      ["/changes", "Explicar cambios"],
      ["/scenarios", "Laboratorio de caja"],
      ["/accuracy", "Precisión de las previsiones"],
      ["/reports", "Informe ejecutivo"],
      ["/assistant", "Asistente de tesorería"],
      ["/security", "Seguridad y control"],
      ["/integrations", "Centro de Integraciones"],
    ]) {
      await page.goto(url);
      await expect(
        page.getByRole("heading", { name: heading, exact: true }),
      ).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        url,
      ).toBe(true);
    }
    await page.goto("/reports");
    await expect(page.getByRole("button", { name: "Informe PDF" })).toHaveCount(
      0,
    );
    await page.goto("/scenarios");
    await expect(
      page.getByRole("button", { name: "Guardar escenario", exact: true }),
    ).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally {
    await db.close();
  }
});
