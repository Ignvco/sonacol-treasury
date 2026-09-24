import { useState } from "react";
import { useAsyncData } from "@/hooks/use-async";
import { useDecisionFilters } from "@/hooks/use-decision-filters";
import { decisionService, snapshotRows } from "@/services/decisionService";
import { supabase } from "@/integrations/supabase/client";
import {
  ASSISTANT_TOOLS,
  ASSISTANT_PROMPTS,
  answerTreasury,
  classifyQuestion,
  type AssistantTool,
} from "@/financial-engine/assistant";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DecisionControls } from "@/components/treasury/DecisionControls";
import { SourceBreakdown } from "@/components/treasury/SourceBreakdown";
import { LoadingState, ErrorState } from "@/components/treasury/feedback";
export default function Assistant() {
  const state = useAsyncData(() => decisionService.load()),
    filters = useDecisionFilters();
  const [tool, setTool] = useState<AssistantTool>("help"),
    [question, setQuestion] = useState(""),
    [external, setExternal] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [detail, setDetail] = useState(false);
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} />;
  if (!state.data) return null;
  const { bundle, workspace } = state.data,
    context = {
      cutoff: bundle.cutoff,
      currency: filters.currency,
      horizon: filters.horizon,
      minimum: Number(workspace.settings.minimums[filters.currency] ?? 0),
    },
    previous = workspace.previous?.batch
      ? {
          rows: snapshotRows(workspace.previous),
          cutoff: workspace.previous.batch.cutoff,
        }
      : undefined,
    answer = answerTreasury(tool, bundle.rows, bundle.links, context, previous);
  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (external) {
        const { data, error } = await supabase.functions.invoke(
          "treasury-assistant",
          { body: { question } },
        );
        if (error || !ASSISTANT_TOOLS.includes(data?.tool))
          throw new Error(
            "La IA opcional no está disponible. Puedes usar las consultas verificadas de esta pantalla.",
          );
        setTool(data.tool);
      } else setTool(classifyQuestion(question));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo consultar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Asistente de tesorería"
        subtitle="Respuestas explicables, con el mismo cálculo y fuentes a un clic."
      />
      <DecisionControls
        {...filters}
        cutoff={bundle.cutoff}
        onCurrency={filters.setCurrency}
        onHorizon={filters.setHorizon}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {ASSISTANT_TOOLS.filter((t) => t !== "help").map((t) => (
          <button
            className={
              "rounded-2xl border p-4 text-left text-sm font-medium " +
              (t === tool
                ? "border-brand bg-brand-soft text-brand"
                : "bg-card hover:border-brand/40")
            }
            key={t}
            onClick={() => {
              setTool(t);
              setError("");
            }}
          >
            {ASSISTANT_PROMPTS[t]}
          </button>
        ))}
      </div>
      <SectionCard title="Tu consulta">
        <form className="grid gap-3" onSubmit={ask}>
          <label className="grid gap-1 text-sm">
            Pregunta
            <input
              className="t-input"
              minLength={2}
              maxLength={1000}
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="Por ejemplo: ¿cuándo tendré menos caja?"
            />
          </label>
          <label className="flex items-start gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={external}
              onChange={(e) => setExternal(e.target.checked)}
            />
            Interpretar con IA externa, si TI la configuró. Solo se envía el
            texto de tu pregunta; evita incluir datos confidenciales. Las cifras
            se calculan dentro de la plataforma.
          </label>
          <button
            className="t-button-primary justify-self-start"
            disabled={busy}
          >
            Consultar
          </button>
        </form>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {error}
          </p>
        )}
      </SectionCard>
      <SectionCard
        title={answer.title}
        subtitle={
          "Corte " +
          context.cutoff +
          " · " +
          context.currency +
          " · " +
          context.horizon +
          " días"
        }
      >
        <p className="text-base leading-relaxed">{answer.text}</p>
        {answer.rows.length > 0 && (
          <button
            className="t-button-secondary mt-4"
            onClick={() => setDetail(true)}
          >
            Ver {answer.rows.length} movimientos de respaldo
          </button>
        )}
        {answer.limitations.map((l) => (
          <p className="mt-3 text-xs text-muted-foreground" key={l}>
            {l}
          </p>
        ))}
        <p className="mt-4 text-xs text-muted-foreground">
          BASE: {bundle.batch?.file_name ?? "Sin datos"} · Revisión{" "}
          {workspace.revision.slice(0, 12)}
        </p>
      </SectionCard>
      {detail && (
        <SourceBreakdown
          title="Fuentes de la respuesta"
          rows={answer.rows}
          onClose={() => setDetail(false)}
        />
      )}
    </div>
  );
}
