import * as XLSX from "xlsx";
import { profileWorkbook } from "./profile-workbook";

/** Dates and amounts are synthetic. M is contractual; N schedules the forecast. */
export function cutoffWorkbook() {
  const wb = profileWorkbook(), ws = wb.Sheets.BASE;
  ws.AE7 = { t: "n", v: 46288, f: "TODAY()" }; // Cached Sept 23, bank Sept 22.
  ws.P9 = { t: "n", v: 100 }; ws.Q9 = { t: "n", v: 0 }; ws.R9 = { t: "n", v: 100 };
  for (const [row, values] of [
    [10, { A: "CLIENTES", B: "TEST", D: 46287, E: "1201", F: "Clientes", G: "2", I: "Cliente ficticio", K: "F001", L: "Cobro de prueba", M: 46288, N: 46289, P: 300, Q: 0, R: 300, T: "Banco Test", U: "Recaudacion Clientes" }],
    [11, { A: "MANUAL", B: "TEST", D: 46287, E: "2101", F: "Proyección", G: "3", K: "M001", L: "Pago de prueba", N: 46290, P: 0, Q: 50, R: -50, T: "Banco Test", U: "Proveedores" }],
  ] as [number, Record<string, string | number>][]) {
    for (const [column, value] of Object.entries(values))
      ws[column + row] = { t: typeof value === "number" ? "n" : "s", v: value };
  }
  ws["!ref"] = "A1:AE11";
  return wb;
}
