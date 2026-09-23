import { cellToDate, cellToNumber } from "./detect";
export interface StatementRow {
  date: string;
  amount: number;
  reference: string;
  description: string;
}
export interface StatementMapping {
  date: number;
  amount: number;
  reference: number;
  description: number;
  charge: number;
  credit: number;
}
export function csvCells(text: string, separator = ";"): string[][] {
  if (text.length > 10485760) throw new Error("La cartola supera 10 MB.");
  const rows: string[][] = [];
  let row: string[] = [],
    cell = "",
    quoted = false;
  const input = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === '"') {
      if (quoted && input[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (quoted || cell === "") quoted = !quoted;
      else cell += c;
    } else if (c === separator && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((c === "\n" || c === "\r") && !quoted) {
      if (c === "\r" && input[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += c;
    if (rows.length > 20001) throw new Error("Máximo 20.000 movimientos.");
  }
  if (quoted) throw new Error("Comillas sin cerrar.");
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  if (rows.some((r) => r.length > 100)) throw new Error("Demasiadas columnas.");
  return rows;
}
export function statementMapping(headers: string[]): StatementMapping {
  const names = headers.map((s) =>
    s
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim(),
  );
  const find = (options: string[]) =>
    names.findIndex((n) => options.includes(n));
  return {
    date: find(["fecha", "date", "fecha movimiento"]),
    amount: find(["monto", "importe", "amount"]),
    reference: find(["referencia", "reference", "documento"]),
    description: find(["descripcion", "glosa", "description", "detalle"]),
    charge: find(["cargo", "egreso"]),
    credit: find(["abono", "ingreso"]),
  };
}
export function parseStatement(
  cells: string[][],
  mapping: StatementMapping,
  locale: "es-CL" | "en-US" = "es-CL",
): StatementRow[] {
  if (
    mapping.date < 0 ||
    (mapping.amount < 0 && (mapping.charge < 0 || mapping.credit < 0))
  )
    throw new Error("Asigna Fecha y Monto, o Fecha con Cargo y Abono.");
  if (cells.length < 2 || cells.length > 20001)
    throw new Error("Se requieren encabezados y entre 1 y 20.000 movimientos.");
  return cells.slice(1).map((row, i) => {
    const date = cellToDate(row[mapping.date]);
    if (!date.valid || !date.iso)
      throw new Error(`Fecha inválida en fila ${i + 2}.`);
    let amount: number | null;
    if (mapping.amount >= 0) amount = cellToNumber(row[mapping.amount], locale);
    else {
      const cargo = row[mapping.charge]?.trim()
          ? cellToNumber(row[mapping.charge], locale)
          : 0,
        abono = row[mapping.credit]?.trim()
          ? cellToNumber(row[mapping.credit], locale)
          : 0;
      if (
        cargo === null ||
        abono === null ||
        cargo < 0 ||
        abono < 0 ||
        (cargo > 0 && abono > 0)
      )
        throw new Error(`Cargo y abono ambiguos en fila ${i + 2}.`);
      amount = abono - cargo;
    }
    if (amount === null || amount === 0 || !Number.isFinite(amount))
      throw new Error(`Importe inválido en fila ${i + 2}.`);
    const reference = row[mapping.reference] ?? "",
      description = row[mapping.description] ?? "";
    if (reference.length > 200 || description.length > 1000)
      throw new Error(`Texto demasiado largo en fila ${i + 2}.`);
    return { date: date.iso, amount, reference, description };
  });
}
