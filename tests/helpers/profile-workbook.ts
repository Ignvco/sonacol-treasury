import * as XLSX from "xlsx";

/** Independent fixture of the existing Excel layout; contains no client data. */
export function profileWorkbook(headerRow = 8) {
  const ws = XLSX.utils.aoa_to_sheet([]);
  XLSX.utils.sheet_add_aoa(
    ws,
    [
      [
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
      ],
    ],
    { origin: `A${headerRow}` },
  );
  ws.AE7 = { t: "n", v: 46287 };
  const values = {
    A: "BANCO",
    B: "TEST",
    D: 46287,
    E: "1101",
    F: "Banco Test",
    G: "001",
    L: "Movimiento de prueba",
    P: 0,
    Q: 100,
    R: -100,
    S: "CONCILIADO",
    T: "Banco Test",
    U: "Proveedores",
  };
  for (const [column, value] of Object.entries(values))
    ws[column + (headerRow + 1)] = {
      t: typeof value === "number" ? "n" : "s",
      v: value,
    };
  ws["!ref"] = `A1:AE${headerRow + 1}`;
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "BASE");
  return wb;
}
