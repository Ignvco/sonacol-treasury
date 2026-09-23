import { useState } from "react";
import { useAsyncData } from "@/hooks/use-async";
import { baseTreasuryService } from "@/services/baseTreasuryService";
import { decisionService, snapshotRows } from "@/services/decisionService";
import {
  cashBridge,
  compareSnapshots,
  type RowChange,
} from "@/financial-engine/decisions";
import { PageHeader } from "@/components/treasury/PageHeader";
import { DataTable } from "@/components/treasury/DataTable";
import { SectionCard } from "@/components/treasury/SectionCard";
import { KpiCard } from "@/components/treasury/KpiCard";
import { LoadingState, ErrorState } from "@/components/treasury/feedback";
import {
  SourceBreakdown,
  baseNumber,
} from "@/components/treasury/SourceBreakdown";
import type { TreasuryRow } from "@/financial-engine/base-treasury";
export default function Changes() {
  const batches = useAsyncData(() => baseTreasuryService.batches());
  const [before, setBefore] = useState(""),
    [after, setAfter] = useState(""),
    [currency, setCurrency] = useState("CLP"),
    [selected, setSelected] = useState<TreasuryRow[] | null>(null);
  const a = before || batches.data?.[1]?.id,
    b = after || batches.data?.[0]?.id;
  const state = useAsyncData(
    async () =>
      a && b
        ? Promise.all([
            decisionService.snapshot(a),
            decisionService.snapshot(b),
          ])
        : null,
    [a, b],
  );
  if (batches.loading) return <LoadingState />;
  if (batches.error) return <ErrorState message={batches.error} />;
  const rows = state.data ? state.data.map(snapshotRows) : null;
  const changes = rows ? compareSnapshots(rows[0], rows[1]) : [];
  const bridge =
    rows && state.data
      ? cashBridge(
          rows[0],
          rows[1],
          currency,
          state.data[0].batch!.cutoff,
          state.data[1].batch!.cutoff,
        )
      : null;
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Explicar cambios"
        subtitle="Compara dos BASE completas, con las ediciones MANUAL propias de cada fecha."
      />
      <div className="flex flex-wrap gap-3">
        {[
          { label: "Desde", value: a, set: setBefore },
          { label: "Hasta", value: b, set: setAfter },
        ].map((f) => (
          <label className="grid min-w-0 flex-1 gap-1 text-sm" key={f.label}>
            {f.label}
            <select
              className="t-input min-w-0"
              value={f.value ?? ""}
              onChange={(e) => f.set(e.target.value)}
            >
              <option value="">Selecciona una BASE</option>
              {batches.data?.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.cutoff} · {x.file_name}
                </option>
              ))}
            </select>
          </label>
        ))}
        <label className="grid gap-1 text-sm">
          Moneda
          <select
            className="t-input"
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
          >
            {["CLP", "USD", "UF", "UTM"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
      </div>
      {state.loading ? (
        <LoadingState />
      ) : state.error ? (
        <ErrorState message={state.error} />
      ) : !bridge ? (
        <p className="rounded-xl border p-5">
          Carga al menos dos BASE para comparar fechas.
        </p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Caja inicial", bridge.opening],
              ["Variación", bridge.difference],
              ["Caja final", bridge.closing],
            ].map(([name, value]) => (
              <KpiCard
                key={String(name)}
                label={String(name)}
                value={Number(value)}
                valueText={baseNumber(Number(value)) + " " + currency}
              />
            ))}
          </div>
          <SectionCard
            title="Cambios en los movimientos"
            subtitle="Una baja indica que la fila falta en la segunda BASE. No implica pago ni conciliación."
          >
            <DataTable<RowChange>
              data={changes.filter(
                (c) => (c.after ?? c.before)?.currency === currency,
              )}
              rowKey={(r) => r.key}
              search
              searchText={(r) =>
                (r.after ?? r.before)!.description + " " + r.change
              }
              onRowClick={(r) =>
                setSelected(
                  [r.before, r.after].filter((r): r is TreasuryRow => !!r),
                )
              }
              columns={[
                {
                  key: "change",
                  header: "Cambio",
                  render: (r) =>
                    ({
                      added: "Alta",
                      removed: "Baja",
                      changed: "Modificación",
                    })[r.change],
                },
                {
                  key: "origin",
                  header: "Origen",
                  render: (r) => (r.after ?? r.before)!.origin,
                },
                {
                  key: "description",
                  header: "Movimiento",
                  render: (r) => (r.after ?? r.before)!.description,
                  className: "!whitespace-normal",
                },
                {
                  key: "before",
                  header: "Antes",
                  render: (r) =>
                    r.before
                      ? baseNumber(r.before.amount) +
                        " · " +
                        r.before.plannedDate
                      : "—",
                },
                {
                  key: "after",
                  header: "Después",
                  render: (r) =>
                    r.after
                      ? baseNumber(r.after.amount) + " · " + r.after.plannedDate
                      : "—",
                },
                {
                  key: "fields",
                  header: "Campos",
                  render: (r) => r.fields.join(", ") || "Fila completa",
                },
              ]}
            />
          </SectionCard>
        </>
      )}
      {selected && (
        <SourceBreakdown
          title="Trazabilidad antes y después"
          rows={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
