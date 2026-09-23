/** The UI and reader share this contract. Changes require a reviewed code version. */
export const SONACOL_BASE_PROFILE = {
  id: "SONACOL-BASE-v1",
  name: "SONACOL BASE",
  version: 1,
  sheet: "BASE",
  usualHeaderRow: 8,
  cutoff: { cell: "AE7", column: "AE", row: 7 },
  fields: {
    origin: {
      column: "A",
      header: "TABLA ORIGEN",
      aliases: ["TABLA DE ORIGEN"],
      required: true,
      use: "BANCO, CLIENTES, COLOCACIONES o MANUAL",
    },
    company: {
      column: "B",
      header: "EMPRESA",
      aliases: [],
      required: false,
      use: "Empresa de origen",
    },
    date: {
      column: "D",
      header: "FECHA",
      aliases: [],
      required: true,
      use: "Fecha del movimiento, emisión o inicio",
    },
    ledger: {
      column: "E",
      header: "CODIGO CTA",
      aliases: ["CÓDIGO CUENTA"],
      required: true,
      use: "Código contable",
    },
    accountDescription: {
      column: "F",
      header: "DESCRIPCION CTA",
      aliases: ["DESCRIPCIÓN CUENTA"],
      required: false,
      use: "Cuenta, banco y referencia de moneda",
    },
    voucher: {
      column: "G",
      header: "COMP",
      aliases: ["COMPROBANTE"],
      required: false,
      use: "Comprobante",
    },
    rut: {
      column: "H",
      header: "RUT",
      aliases: [],
      required: false,
      use: "Identificación del cliente",
    },
    customer: {
      column: "I",
      header: "RAZON SOCIAL",
      aliases: [],
      required: false,
      use: "Cliente o entidad de la inversión",
    },
    documentType: {
      column: "J",
      header: "TIPO DOCTO",
      aliases: ["TIPO DOCUMENTO"],
      required: false,
      use: "Tipo de documento",
    },
    document: {
      column: "K",
      header: "N DOCTO",
      aliases: ["N DOCUMENTO", "NÚMERO DOCUMENTO"],
      required: false,
      use: "Número de documento",
    },
    description: {
      column: "L",
      header: "GLOSA",
      aliases: [],
      required: false,
      use: "Descripción del movimiento",
    },
    dueDate: {
      column: "M",
      header: "VCTO REAL",
      aliases: ["VENCIMIENTO REAL"],
      required: false,
      use: "Vencimiento original",
    },
    reportDate: {
      column: "N",
      header: "VCTO",
      aliases: ["VENCIMIENTO"],
      required: false,
      use: "Fecha de planificación",
    },
    adjustedDate: {
      column: "O",
      header: "AJ VCTO",
      aliases: ["AJUSTE VCTO"],
      required: false,
      use: "Fecha ajustada; prioritaria para MANUAL",
    },
    debit: {
      column: "P",
      header: "DEBE",
      aliases: [],
      required: true,
      use: "Importe al debe",
    },
    credit: {
      column: "Q",
      header: "HABER",
      aliases: [],
      required: true,
      use: "Importe al haber",
    },
    real: {
      column: "R",
      header: "REAL",
      aliases: [],
      required: true,
      use: "Importe con signo; se contrasta con DEBE − HABER",
    },
    status: {
      column: "S",
      header: "ESTADO",
      aliases: [],
      required: false,
      use: "Estado del movimiento BANCO",
    },
    settlement: {
      column: "T",
      header: "CUENTA INFORME",
      aliases: [],
      required: false,
      use: "Banco de recepción o pago",
    },
    operation: {
      column: "U",
      header: "OPERACIÓN",
      aliases: [],
      required: false,
      use: "Clasificación del movimiento",
    },
  },
} as const;

type Field =
  (typeof SONACOL_BASE_PROFILE.fields)[keyof typeof SONACOL_BASE_PROFILE.fields];
export const BASE_COLUMNS = Object.fromEntries(
  Object.entries(SONACOL_BASE_PROFILE.fields).map(([key, field]) => [
    key,
    field.column,
  ]),
) as {
  [K in keyof typeof SONACOL_BASE_PROFILE.fields]: (typeof SONACOL_BASE_PROFILE.fields)[K]["column"];
};

const text = (cell: unknown): string => {
  const value =
    cell && typeof cell === "object" ? ("v" in cell ? cell.v : null) : cell;
  return value == null ? "" : String(value).trim();
};
const key = (cell: unknown) =>
  text(cell)
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
const matches = (cell: unknown, field: Field) =>
  [field.header, ...field.aliases].some((label) => key(cell) === key(label));

/** Fixed column meanings, detected header position, and no fixed last data row. */
export function detectBaseLayout(rows: Map<number, Record<string, unknown>>) {
  const fields = Object.values(SONACOL_BASE_PROFILE.fields);
  const required = fields.filter((field) => field.required);
  const candidates: number[] = [];
  let closest = 0,
    highestScore = 0;
  for (const [rowNumber, row] of rows) {
    if (required.every((field) => matches(row[field.column], field)))
      candidates.push(rowNumber);
    const cells = Object.values(row);
    const score = required.filter((field) =>
      cells.some((cell) => matches(cell, field)),
    ).length;
    if (score > highestScore) {
      highestScore = score;
      closest = rowNumber;
    }
  }
  if (candidates.length > 1)
    throw new Error(
      `BASE contiene encabezados repetidos en las filas ${candidates.sort((a, b) => a - b).join(", ")}. La plantilla necesita una única tabla BASE.`,
    );
  const header = candidates[0];
  if (!header) {
    const candidate = rows.get(closest) ?? {};
    const differences = required
      .filter((field) => !matches(candidate[field.column], field))
      .map((field) => {
        const found = Object.entries(candidate).find(([, cell]) =>
          matches(cell, field),
        );
        return `${field.header}: se espera en ${field.column}${highestScore >= 2 ? closest : ""}${found ? ` y aparece en ${found[0]}${closest}` : ""}`;
      });
    throw new Error(
      `BASE no tiene los encabezados esperados por la plantilla ${SONACOL_BASE_PROFILE.name} v${SONACOL_BASE_PROFILE.version}. ${differences.join("; ")}. No se leyeron otras hojas.`,
    );
  }
  const cells = rows.get(header)!;
  const missingOptional: string[] = [];
  for (const field of fields.filter((field) => !field.required)) {
    if (!text(cells[field.column])) {
      const moved = Object.entries(cells).find(([, cell]) =>
        matches(cell, field),
      );
      if (moved)
        throw new Error(
          `La plantilla espera ${field.header} en BASE!${field.column}${header}, pero aparece en ${moved[0]}${header}. No se reasignaron columnas automáticamente.`,
        );
      missingOptional.push(field.column);
      continue;
    }
    if (!matches(cells[field.column], field))
      throw new Error(
        `La plantilla espera ${field.header} en BASE!${field.column}${header}, pero encontró «${text(cells[field.column]).slice(0, 80)}». Revisa la estructura antes de importar; no se reasignaron columnas automáticamente.`,
      );
  }
  const currencyColumns = Object.entries(cells)
    .filter(([, cell]) => key(cell) === "MONEDA")
    .map(([column]) => column);
  if (currencyColumns.length > 1)
    throw new Error(
      `BASE contiene más de una columna MONEDA (${currencyColumns.join(", ")}). No se puede elegir una moneda sin ambigüedad.`,
    );
  return { header, missingOptional, currencyColumn: currencyColumns[0] };
}
