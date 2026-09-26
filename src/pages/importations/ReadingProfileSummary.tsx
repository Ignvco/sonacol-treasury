import { Link } from "react-router-dom";
import { SONACOL_BASE_PROFILE } from "@/import-engine/base-profile";
import type { BaseReadingSummary } from "@/import-engine/types";

export function ReadingProfileSummary({
  reading,
}: {
  reading: BaseReadingSummary;
}) {
  if (reading.profileId === "ERP-RAW-v1") return <section aria-label="Estructura ERP reconocida" className="mb-3 rounded-xl border bg-sunken p-4 text-sm">
    <h3 className="font-semibold">ERP · {reading.sheetName}</h3>
    <p>Encabezados en fila {reading.headerRow} · datos entre filas {reading.firstDataRow ?? "—"} y {reading.lastDataRow ?? "—"}.</p>
    <p className="mt-1 text-xs text-muted-foreground">Período declarado: {reading.periodStart ?? "pendiente"} a {reading.cutoff ?? "pendiente"} · {reading.localCurrency ?? "CLP"}. Último dato fechado: {reading.lastBankDate ?? "—"}.</p>
  </section>;
  return (
    <section
      aria-label="Estructura de Excel reconocida"
      className="mb-4 rounded-xl border bg-sunken p-4 text-sm"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold">
          Plantilla {SONACOL_BASE_PROFILE.name} · versión{" "}
          {SONACOL_BASE_PROFILE.version}
        </h3>
        <Link
          className="text-xs text-brand underline"
          to="/settings#excel-profile"
        >
          Ver reglas de lectura
        </Link>
      </div>
      <p className="mt-2">
        Hoja BASE · encabezados en fila {reading.headerRow}
        {reading.firstDataRow !== null
          ? ` · datos financieros entre filas ${reading.firstDataRow} y ${reading.lastDataRow}`
          : " · sin movimientos financieros"}
        .
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Corte {reading.cutoffSource === "user" ? "seleccionado" : "detectado"}: {reading.cutoff ?? "sin fecha válida"} ·{" "}
        {reading.cutoffSource === "user" ? "definido en la importación" : reading.cutoffSource === "AE7"
          ? "celda AE7"
          : "última FECHA de BANCO"}
        . {reading.ignoredRows.toLocaleString("es-CL")} filas sin movimiento
        financiero omitidas.
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        {reading.currencyColumn
          ? `Moneda indicada en columna ${reading.currencyColumn}.`
          : "Moneda identificada por la descripción de cuenta."}{" "}
        Los importes y las fechas de cada fila se revisan a continuación.
      </p>
      {reading.missingOptional.length > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          Sin encabezado complementario en: {reading.missingOptional.join(", ")}
          . Los datos obligatorios de cada movimiento se validan por separado.
        </p>
      )}
    </section>
  );
}
