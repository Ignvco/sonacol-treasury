import { ErpImportContext } from "./ErpImportContext";
import { useAuth } from "@/contexts/auth-context";
import { ReadingProfileSummary } from "./ReadingProfileSummary";
import { ImportCutoff } from "./ImportCutoff";
import { ImportControlTotals } from "./ImportControlTotals";
import { importCutoffIssue } from "@/import-engine/cutoff";
import { toast } from "sonner";
import { useState } from "react";
import { Check, Download } from "lucide-react";
import { DataTable } from "@/components/treasury/DataTable";
import { SectionCard } from "@/components/treasury/SectionCard";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import type {
  ImportOverrides,
  ImportPreview as Preview,
  ProcessedRecord,
  ImportComparisonRow,
} from "@/import-engine/types";
import { downloadCSV } from "@/lib/export";
const labels = {
  new: "Nuevas",
  modified: "Modificadas",
  unchanged: "Sin cambios",
  conflict: "Coincidencia ambigua",
  invalid: "Con errores",
};
const fields: Record<string, string> = {
  amount: "Importe",
  dueDate: "Vencimiento",
  reportDate: "Fecha prevista",
  adjustedDate: "Fecha ajustada",
  date: "Fecha",
  issueDate: "Emisión",
  endDate: "Rescate",
  startDate: "Inicio",
  currency: "Moneda",
  bank: "Banco",
  settlementBank: "Banco de cobro",
  description: "Descripción",
  category: "Categoría",
  status: "Estado",
  rate: "Tasa",
  interest: "Interés",
  ledgerCode: "Cuenta contable",
  type: "Ingreso/egreso",
};
const diffs = (c: ImportComparisonRow) =>
  Object.entries(fields)
    .filter(
      ([key]) =>
        JSON.stringify(c.before?.[key] ?? null) !==
        JSON.stringify(c.after[key] ?? null),
    )
    .map(
      ([key, label]) =>
        label +
        ": " +
        String(c.before?.[key] ?? "—") +
        " → " +
        String(c.after[key] ?? "—"),
    );
export function ImportPreview({
  preview,
  busy,
  onConfirm,
  onDiscard,
  onAnalyze,
  applied,
}: {
  preview: Preview;
  applied: ImportOverrides;
  busy: boolean;
  onAnalyze: (o: ImportOverrides) => void;
  onConfirm: (rows: number[]) => void;
  onDiscard: () => void;
}) {
  const { user } = useAuth();
  const baseSheet = preview.sheets.find((sheet) => sheet.reading);
  const reading = baseSheet?.reading;
  const isErp = reading?.profileId === "ERP-RAW-v1";
  const [contextDirty, setContextDirty] = useState(false);
  const [cutoffDate, setCutoffDate] = useState(reading?.cutoff ?? "");
  const cutoffIssue = importCutoffIssue(preview);
  const cutoffDirty = cutoffDate !== reading?.cutoff;
  const comparison = preview.comparison?.rows ?? [];
  const [selected, setSelected] = useState<number[]>([]);
  const [filter, setFilter] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const coordinate = (r: { sheet?: string; row: number }) => (r.sheet ?? baseSheet?.name ?? "BASE") + ":" + r.row;
  const byRow = new Map(comparison.map((r) => [coordinate(r), r]));
  const data = preview.records.filter(
    (r) => !filter || byRow.get(coordinate(r))?.change === filter,
  );
  const newCount = comparison.filter((r) => r.change === "new").length;
  const automatic = comparison.filter(
    (r) => r.change === "modified" && !r.manualEdited,
  ).length;
  const accepted = newCount + automatic + selected.length;
  const exportReview = () =>
    void downloadCSV(
      comparison.map((c) => ({
        Fila: c.row,
        Estado: labels[c.change],
        Cambios: diffs(c).join(" · "),
        Detalle: c.reason ?? "",
      })),
      "revision-cambios-base.csv",
    ).catch((e) => toast.error(e.message));
  return (
    <section aria-label="Vista previa de importación">
      <SectionCard
        title="Compara tu Excel antes de actualizar"
        subtitle={preview.fileName}
      >
        {isErp && <ErpImportContext initial={applied.ERP} busy={busy} onDirty={() => { setContextDirty(true); setReviewed(false); }} onApply={ERP => onAnalyze({ ...applied, ERP })} />}
        {isErp && cutoffIssue && <p role="alert" className="mb-4 text-sm text-danger">{cutoffIssue}</p>}
        {reading && !isErp && <ImportCutoff reading={reading} value={cutoffDate} issue={cutoffIssue} busy={busy}
          onChange={(date) => { setCutoffDate(date); setReviewed(false); }}
          onApply={() => {
            setReviewed(false);
            onAnalyze({ ...applied, [baseSheet!.name]: { ...applied[baseSheet!.name], cutoffDate } });
          }} />}
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {Object.entries(labels).map(([key, label]) => (
            <button
              key={key}
              className={`rounded-xl border p-4 text-left ${filter === key ? "border-brand bg-brand-soft" : "bg-sunken"}`}
              onClick={() => setFilter(filter === key ? "" : key)}
            >
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">
                {comparison.filter((c) => c.change === key).length}
              </p>
            </button>
          ))}
        </div>
        <p className="mb-4 rounded-xl bg-brand-soft p-4 text-sm">
          {isErp ? "Se leen los datos crudos de BANCOS, CLIENTES y COLOCACIONES. La plataforma conserva tus movimientos manuales, reglas y ajustes y genera las proyecciones. Los saldos de apertura no se consideran ingresos del período." : "Solo se lee BASE. BANCO, CLIENTES y COLOCACIONES se reemplazan por los datos completos de esta fecha. MANUAL conserva tus ediciones; selecciona únicamente las que quieras reemplazar con el Excel."}
        </p>
        {preview.sheets
          .filter((sheet) => sheet.reading)
          .map((sheet) => (
            <ReadingProfileSummary key={sheet.name} reading={sheet.reading!} />
          ))}
        <ImportControlTotals records={preview.records} />
        {!!preview.comparison?.uncoveredCurrencies?.length && <p role="alert" className="mb-4 rounded-xl border border-warning/25 bg-warning-soft p-4 text-sm">
          La carga anterior contenía {preview.comparison.uncoveredCurrencies.join(", ")}, fuera de la cobertura de esta exportación. Esos datos permanecen en el histórico. Confirmar esta carga no acredita que sus saldos sean cero.
        </p>}
        {preview.comparisonError && !cutoffIssue && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger"
          >
            {preview.comparisonError}
            <button
              className="t-button-secondary ml-3"
              disabled={busy}
              onClick={() => onAnalyze(applied)}
            >
              Reintentar comparación
            </button>
          </div>
        )}
        {preview.error > 0 && (
          <p role="alert" className="mb-4 text-sm text-danger">
            Hay errores en {isErp ? "ERP" : "BASE"}. Se conservará la carga anterior hasta que todas
            las filas sean válidas.
          </p>
        )}
        {preview.comparison?.historical && (
          <p className="mb-4 rounded-xl border border-warning/25 bg-warning-soft p-4 text-sm text-warning">
            Este archivo es histórico: podrás trabajar en su fecha sin cambiar
            la BASE actual.
          </p>
        )}
        {!!preview.comparison?.removed && (
          <p className="mb-4 text-sm">
            {preview.comparison.removed} filas ERP de la carga anterior no están
            en este archivo. Se conservarán en el historial de su fecha.
          </p>
        )}
        <div className="mb-4 flex flex-wrap gap-3">
          <button className="t-button-secondary" onClick={() => setFilter("")}>
            Mostrar todas
          </button>
          {user?.canExport && (
            <button className="t-button-secondary" onClick={exportReview}>
              <Download size={15} /> Descargar comparación
            </button>
          )}
        </div>
        <DataTable<ProcessedRecord>
          data={data}
          rowKey={coordinate}
          pageSize={8}
          search
          searchText={(r) =>
            r.row +
            " " +
            r.normalized.description +
            " " +
            r.normalized.customer +
            " " +
            r.normalized.document
          }
          columns={[
            {
              key: "row",
              header: "Hoja / fila",
              render: (r) => `${r.sheet} · ${r.row}`,
              sortValue: (r) => r.row,
            },
            {
              key: "kind",
              header: "Origen",
              render: (r) => String(r.normalized.sourceOrigin ?? r.entityType),
            },
            {
              key: "detail",
              header: "Descripción / cliente",
              className: "!whitespace-normal min-w-[180px] max-w-[280px]",
              render: (r) =>
                String(
                  r.normalized.customer || r.normalized.description || "—",
                ),
            },
            {
              key: "amount",
              header: "Importe",
              align: "right",
              render: (r) =>
                baseNumber(Number(r.normalized.amount ?? 0)) +
                " " +
                r.normalized.currency,
            },
            {
              key: "change",
              header: "Resultado",
              render: (r) => labels[byRow.get(coordinate(r))?.change ?? "invalid"],
            },
            {
              key: "diff",
              header: "Cambios y observaciones",
              className: "!whitespace-normal min-w-[260px] max-w-[400px]",
              render: (r) => {
                const c = byRow.get(coordinate(r));
                return (
                  <div className="space-y-1 text-xs">
                    {c?.change === "modified" &&
                      diffs(c).map((d) => <p key={d}>{d}</p>)}
                    {c?.reason && <p className="text-muted-foreground">{c.reason}</p>}
                    {r.warnings && <p className={r.status === "ERROR" ? "text-danger" : "text-muted-foreground"}>{r.warnings}</p>}
                    {!c?.reason && !r.warnings && <p className="text-muted-foreground">Validación correcta</p>}
                  </div>
                );
              },
            },
            {
              key: "apply",
              header: "Aplicar",
              render: (r) =>
                byRow.get(coordinate(r))?.change === "modified" &&
                byRow.get(coordinate(r))?.manualEdited ? (
                  <input
                    type="checkbox"
                    aria-label={"Aplicar cambio fila " + r.row}
                    checked={selected.includes(r.row)}
                    disabled={busy}
                    onChange={(e) => {
                      setSelected((s) =>
                        e.target.checked
                          ? [...s, r.row]
                          : s.filter((n) => n !== r.row),
                      );
                      setReviewed(false);
                    }}
                  />
                ) : byRow.get(coordinate(r))?.change === "new" ? (
                  "Se añadirá"
                ) : byRow.get(coordinate(r))?.change === "modified" ? (
                  "Actualización diaria"
                ) : (
                  "—"
                ),
            },
          ]}
        />
        <label className="my-5 flex items-start gap-3 rounded-xl border p-4 text-sm">
          <input
            className="mt-1"
            type="checkbox"
            checked={reviewed}
            disabled={busy || (isErp ? contextDirty : cutoffDirty) || !!cutoffIssue}
            onChange={(e) => setReviewed(e.target.checked)}
          />
          <span>
            Revisé la comparación, la fecha de corte {reading?.cutoff} y sus advertencias. Se añadirán {newCount}{" "}
            filas y se actualizarán {automatic + selected.length}. Se guardará
            la fotografía completa de la cobertura declarada.
          </span>
        </label>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Si alguien modifica los datos antes de guardar, deberás volver a
            analizar el archivo.
          </p>
          <div className="flex gap-2">
            <button
              disabled={busy}
              className="t-button-secondary"
              onClick={onDiscard}
            >
              Descartar
            </button>
            <button
              disabled={
                busy ||
                (isErp ? contextDirty : cutoffDirty) ||
                !!cutoffIssue ||
                !reviewed ||
                !preview.comparison ||
                preview.error > 0 ||
                !preview.total ||
                preview.valid + preview.warning === 0
              }
              className="t-button-primary"
              onClick={() => onConfirm(selected)}
            >
              <Check size={15} />
              {accepted
                ? "Aplicar " + accepted + " cambios"
                : "Confirmar revisión sin cambios"}
            </button>
          </div>
        </div>
      </SectionCard>
    </section>
  );
}
