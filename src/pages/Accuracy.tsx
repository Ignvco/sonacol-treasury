import { useState } from "react";
import { useAsyncData } from "@/hooks/use-async";
import {
  treasuryRpc,
  snapshotRows,
  type Forecast,
} from "@/services/decisionService";
import {
  decisionModel,
  forecastAccuracy,
  type Observation,
} from "@/financial-engine/decisions";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { KpiCard } from "@/components/treasury/KpiCard";
import { DataTable } from "@/components/treasury/DataTable";
import { LoadingState, ErrorState } from "@/components/treasury/feedback";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import { Link } from "react-router-dom";
export default function Accuracy() {
  const [offset, setOffset] = useState(0);
  const state = useAsyncData(async () => {
    const [forecasts, observations] = await Promise.all([
      treasuryRpc<Forecast[]>("treasury_read", {
        p_kind: "forecasts",
        p_offset: offset,
      }),
      treasuryRpc<Observation[]>("treasury_read", { p_kind: "observations" }),
    ]);
    return { forecasts, observations };
  }, [offset]);
  const [selected, setSelected] = useState("");
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} />;
  if (!state.data) return null;
  const forecast =
      state.data.forecasts.find((f) => f.id === selected) ??
      state.data.forecasts[0],
    model = forecast
      ? decisionModel(
          snapshotRows(forecast.snapshot),
          forecast.snapshot.links,
          forecast.context,
        )
      : null;
  const accuracy =
    forecast && model
      ? forecastAccuracy(
          model.days,
          state.data.observations,
          forecast.context.currency,
          forecast.context.cutoff,
        )
      : null;
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Precisión de las previsiones"
        subtitle="Contrasta lo que planificaste con el saldo contable de las BASE posteriores."
      />
      <p className="rounded-xl border bg-white p-4 text-sm">
        La observación es la última BASE aceptada de cada fecha y moneda. No se
        inventan valores para días sin carga ni se equipara el saldo contable a
        una cartola conciliada.
      </p>
      <div className="flex flex-wrap gap-2">
        <label className="grid min-w-0 flex-1 gap-1 text-sm">
          Previsión congelada
          <select
            className="t-input min-w-0"
            value={forecast?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {state.data.forecasts.map((f) => (
              <option value={f.id} key={f.id}>
                {f.context.cutoff} · {f.context.currency} · {f.context.horizon}{" "}
                días · {new Date(f.created_at).toLocaleString("es-CL")}
              </option>
            ))}
          </select>
        </label>
        <button
          disabled={offset === 0}
          className="t-button-secondary"
          onClick={() => setOffset(Math.max(0, offset - 50))}
        >
          Anteriores
        </button>
        <button
          disabled={state.data.forecasts.length < 50}
          className="t-button-secondary"
          onClick={() => setOffset(offset + 50)}
        >
          Más antiguas
        </button>
      </div>
      {!forecast ? (
        <SectionCard title="Construye un historial de decisiones">
          <p className="my-3 text-sm">
            Congela una previsión antes de recibir nuevas BASE. Aquí podrás
            medirla cuando lleguen datos de fechas posteriores.
          </p>
          <Link className="t-button-primary" to="/scenarios">
            Ir al laboratorio
          </Link>
        </SectionCard>
      ) : (
        accuracy && (
          <>
            <div className="grid gap-4 sm:grid-cols-3">
              <KpiCard
                label="Días observados"
                value={accuracy.count}
                plain
                subtext={"De " + forecast.context.horizon + " días previstos"}
              />
              <KpiCard
                label="Error absoluto medio"
                value={accuracy.mae ?? 0}
                valueText={
                  accuracy.mae === null
                    ? "Sin observaciones"
                    : baseNumber(accuracy.mae) + " " + forecast.context.currency
                }
              />
              <KpiCard
                label="Sesgo: observado − previsto"
                value={accuracy.bias ?? 0}
                valueText={
                  accuracy.bias === null
                    ? "Sin observaciones"
                    : baseNumber(accuracy.bias) +
                      " " +
                      forecast.context.currency
                }
              />
            </div>
            <SectionCard
              title="Comparación por fecha"
              subtitle="Una muestra pequeña describe ese periodo; no demuestra capacidad predictiva futura."
            >
              <DataTable
                data={accuracy.pairs}
                rowKey={(r) => r.date}
                columns={[
                  { key: "date", header: "Fecha" },
                  {
                    key: "expected",
                    header: "Previsto", align: "right",
                    render: (r) => baseNumber(r.expected),
                  },
                  {
                    key: "observed",
                    header: "Observado", align: "right",
                    render: (r) => baseNumber(r.observed),
                  },
                  {
                    key: "error",
                    header: "Diferencia", align: "right",
                    render: (r) => baseNumber(r.error),
                  },
                ]}
              />
            </SectionCard>
          </>
        )
      )}
    </div>
  );
}
