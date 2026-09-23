import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAsyncData } from "@/hooks/use-async";
import { useCanWrite } from "@/contexts/auth-context";
import {
  decisionService,
  treasuryRpc,
  snapshotRows,
  type Scenario,
} from "@/services/decisionService";
import {
  decisionModel,
  type Adjustment,
  type DecisionContext,
} from "@/financial-engine/decisions";
import { sourceKey, type TreasuryRow } from "@/financial-engine/base-treasury";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { KpiCard } from "@/components/treasury/KpiCard";
import { DecisionChart } from "@/components/treasury/DecisionChart";
import { DecisionControls } from "@/components/treasury/DecisionControls";
import { DataTable } from "@/components/treasury/DataTable";
import { LoadingState, ErrorState } from "@/components/treasury/feedback";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
export default function Scenarios() {
  const state = useAsyncData(() => decisionService.load());
  const canWrite = useCanWrite();
  const [saved, setSaved] = useState<Scenario | null>(null),
    [adjustments, setAdjustments] = useState<Adjustment[]>([]),
    [name, setName] = useState("Mi escenario"),
    [context, setContext] = useState<DecisionContext>({
      cutoff: "2026-01-01",
      currency: "CLP",
      horizon: 30,
      minimum: 0,
    }),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    if (!state.data) return;
    setSaved(null);
    setAdjustments([]);
    setContext({
      cutoff: state.data.bundle.cutoff,
      currency: "CLP",
      horizon: 30,
      minimum: Number(state.data.workspace.settings.minimums.CLP ?? 0),
    });
  }, [state.data?.bundle.batch?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} />;
  if (!state.data) return null;
  const { bundle, workspace } = state.data;
  const rows = saved ? snapshotRows(saved.snapshot) : bundle.rows,
    links = saved ? saved.snapshot.links : bundle.links;
  const safeContext = {
    ...context,
    cutoff: saved?.snapshot.batch?.cutoff ?? bundle.cutoff,
  };
  const model = decisionModel(rows, links, safeContext, adjustments),
    reference = decisionModel(rows, links, safeContext);
  const update = (key: string, value: Partial<Adjustment>) =>
    setAdjustments((prev) => {
      const current = prev.find((a) => a.key === key);
      return [
        ...prev.filter((a) => a.key !== key),
        { ...current, key, ...value },
      ];
    });
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };
  const save = () =>
    run(async () => {
      if (!bundle.batch) return;
      const s = await decisionService.saveScenario({
        id: saved?.id,
        revision: saved?.revision,
        batch: bundle.batch,
        sourceRevision: saved?.source_revision ?? workspace.revision,
        name,
        context: safeContext,
        adjustments,
      });
      setSaved(s);
      toast.success("Escenario guardado con su BASE de referencia");
    });
  const load = (id: string) =>
    run(async () => {
      if (!id) {
        setSaved(null);
        setAdjustments([]);
        return;
      }
      const s = await treasuryRpc<Scenario>("treasury_read", {
        p_kind: "scenario",
        p_id: id,
      });
      if (!s) throw new Error("Escenario no disponible.");
      setSaved(s);
      setName(s.name);
      setContext(s.context);
      setAdjustments(s.adjustments);
    });
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Laboratorio de caja"
        subtitle="Prueba fechas, importes y exclusiones. Los datos originales de BASE permanecen intactos."
      />
      {!bundle.batch ? (
        <p className="rounded-xl border p-5">
          Carga una BASE para crear tu primer escenario.
        </p>
      ) : (
        <>
          <SectionCard title="Supuestos del escenario">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">
                Abrir escenario
                <select
                  className="t-input"
                  value={saved?.id ?? ""}
                  disabled={busy}
                  onChange={(e) => void load(e.target.value)}
                >
                  <option value="">Nuevo escenario</option>
                  {[
                    ...new Map(
                      [...workspace.scenarios, ...(saved ? [saved] : [])].map(
                        (s) => [s.id, s],
                      ),
                    ).values(),
                  ].map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Nombre
                <input
                  className="t-input"
                  maxLength={120}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </label>
              <DecisionControls
                currency={context.currency}
                horizon={context.horizon}
                onCurrency={(currency) =>
                  setContext({
                    ...context,
                    currency,
                    minimum: Number(workspace.settings.minimums[currency] ?? 0),
                  })
                }
                onHorizon={(horizon) => setContext({ ...context, horizon })}
              />
              <label className="grid gap-1 text-sm">
                Umbral de caja
                <input
                  type="number"
                  className="t-input"
                  min="0"
                  value={context.minimum}
                  onChange={(e) =>
                    setContext({
                      ...context,
                      minimum: Math.max(0, Number(e.target.value)),
                    })
                  }
                />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {canWrite && (
                <button
                  className="t-button-primary"
                  disabled={busy}
                  onClick={() => void save()}
                >
                  Guardar escenario
                </button>
              )}
              <button
                className="t-button-secondary"
                disabled={busy}
                onClick={() => {
                  const keys = new Set(bundle.rows.map(sourceKey));
                  setAdjustments((a) => a.filter((x) => keys.has(x.key)));
                  setSaved(null);
                  setContext((c) => ({ ...c, cutoff: bundle.cutoff }));
                  toast.info(
                    "Revisa los supuestos antes de guardar sobre la BASE actual.",
                  );
                }}
              >
                Rebasar sobre datos actuales
              </button>
              {canWrite && (
                <button
                  className="t-button-secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await decisionService.freeze(
                        bundle.batch!.id,
                        workspace.revision,
                        { ...safeContext, cutoff: bundle.cutoff },
                      );
                      toast.success(
                        "Previsión actual congelada para medir su precisión",
                      );
                    })
                  }
                >
                  Congelar previsión actual
                </button>
              )}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Congelar guarda la previsión actual sin supuestos. Guardar
              escenario conserva sus supuestos y una copia verificable de los
              datos de origen.
            </p>
            {saved && saved.source_revision !== workspace.revision && (
              <p className="mt-3 text-sm text-warning">
                Hay cambios posteriores en MANUAL. Revisa las diferencias y
                rebasa antes de guardar.
              </p>
            )}
          </SectionCard>
          <div className="grid gap-4 sm:grid-cols-3">
            <KpiCard
              label="Saldo mínimo del escenario"
              value={model.minimum}
              valueText={baseNumber(model.minimum) + " " + context.currency}
            />
            <KpiCard
              label="Variación del saldo final"
              value={model.projected - reference.projected}
              valueText={
                baseNumber(model.projected - reference.projected) +
                " " +
                context.currency
              }
            />
            <KpiCard
              label="Días bajo el umbral"
              value={model.daysBelow}
              plain
              subtext={
                model.firstRisk
                  ? "Primer cruce: " + model.firstRisk
                  : "Sin cruces"
              }
            />
          </div>
          <SectionCard
            title="Escenario frente a la referencia"
            subtitle="Línea azul: escenario. Línea discontinua: previsión sin cambios."
          >
            <DecisionChart
              days={[
                { date: safeContext.cutoff, balance: model.available },
                ...model.days,
              ]}
              reference={[
                { date: safeContext.cutoff, balance: reference.available },
                ...reference.days,
              ]}
              currency={context.currency}
              minimum={context.minimum}
            />
            {model.issues.map((i) => (
              <p key={i} className="mt-2 text-sm text-danger">
                {i}
              </p>
            ))}
          </SectionCard>
          <SectionCard
            title="Movimientos futuros"
            subtitle="Cada cambio es un supuesto; incluso CLIENTES y COLOCACIONES siguen siendo de solo lectura fuera de este laboratorio."
          >
            <DataTable<TreasuryRow>
              data={rows.filter(
                (r) =>
                  r.kind !== "cash_flow" && r.currency === context.currency,
              )}
              rowKey={sourceKey}
              search
              searchText={(r) => r.description + " " + r.origin}
              columns={[
                {
                  key: "description",
                  header: "Movimiento",
                  render: (r) => (
                    <>
                      <p>{r.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.origin} · {r.amount} {r.currency}
                      </p>
                    </>
                  ),
                  className: "!whitespace-normal min-w-[180px]",
                },
                {
                  key: "date",
                  header: "Fecha del escenario",
                  render: (r) => (
                    <input
                      className="t-input min-w-36"
                      aria-label={"Fecha " + r.description}
                      type="date"
                      value={
                        adjustments.find((a) => a.key === sourceKey(r))?.date ??
                        r.plannedDate
                      }
                      onChange={(e) => {
                        if (e.target.value)
                          update(sourceKey(r), { date: e.target.value });
                      }}
                    />
                  ),
                },
                {
                  key: "amount",
                  header: "Importe",
                  render: (r) => (
                    <input
                      className="t-input w-36"
                      aria-label={"Importe " + r.description}
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={
                        adjustments.find((a) => a.key === sourceKey(r))
                          ?.amount ?? r.amount
                      }
                      onChange={(e) => {
                        const amount = Number(e.target.value);
                        if (amount > 0) update(sourceKey(r), { amount });
                      }}
                    />
                  ),
                },
                {
                  key: "excluded",
                  header: "Excluir",
                  render: (r) => (
                    <input
                      aria-label={"Excluir " + r.description}
                      type="checkbox"
                      checked={
                        adjustments.find((a) => a.key === sourceKey(r))
                          ?.excluded ?? false
                      }
                      onChange={(e) =>
                        update(sourceKey(r), { excluded: e.target.checked })
                      }
                    />
                  ),
                },
              ]}
            />
          </SectionCard>
        </>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-danger-soft p-4 text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
