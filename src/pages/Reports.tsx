import { useState } from "react";
import { useAsyncData } from "@/hooks/use-async";
import { useDecisionFilters } from "@/hooks/use-decision-filters";
import { useAuth } from "@/contexts/auth-context";
import { decisionService } from "@/services/decisionService";
import { executiveReport } from "@/financial-engine/report";
import { downloadWorkbook } from "@/lib/export";
import { downloadReportPdf } from "@/lib/pdf-report";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DecisionControls } from "@/components/treasury/DecisionControls";
import { DecisionChart } from "@/components/treasury/DecisionChart";
import { BentoStats } from "@/components/treasury/bento/BentoStats";
import { DataTable } from "@/components/treasury/DataTable";
import { LoadingState, ErrorState } from "@/components/treasury/feedback";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
export default function Reports() {
  const state = useAsyncData(() => decisionService.load()),
    filters = useDecisionFilters(),
    { user } = useAuth();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
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
    report = executiveReport(bundle.rows, bundle.links, context, {
      id: bundle.batch?.id ?? "",
      fileName: bundle.batch?.file_name ?? "Sin BASE",
      revision: workspace.revision,
    });
  const download = async (pdf: boolean) => {
    setBusy(true);
    setError("");
    try {
      const filename = "sonacol-" + bundle.cutoff + "-" + filters.currency;
      if (pdf)
        await downloadReportPdf(
          {
            ...report,
            chart: [
              { date: bundle.cutoff, balance: report.model.available },
              ...report.model.days,
            ],
          },
          filename,
        );
      else
        await downloadWorkbook(
          [
            {
              title: "Contexto",
              rows: [
                {
                  Corte: bundle.cutoff,
                  Moneda: filters.currency,
                  Horizonte: filters.horizon,
                  Umbral: context.minimum,
                  Lote: report.source.id,
                  Archivo: report.source.fileName,
                  Revisión: report.source.revision,
                  Motor: "decision-v1",
                },
              ],
            },
            ...report.sections,
          ],
          filename,
        );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo exportar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Informe ejecutivo"
        subtitle="Cifras, proyección y trazabilidad desde el mismo cálculo de la plataforma."
        actions={
          user?.canExport && bundle.batch ? (
            <div className="flex gap-2">
              <button
                className="t-button-secondary"
                disabled={busy}
                onClick={() => void download(false)}
              >
                Excel completo
              </button>
              <button
                className="t-button-primary"
                disabled={busy}
                onClick={() => void download(true)}
              >
                Informe PDF
              </button>
            </div>
          ) : undefined
        }
      />
      <DecisionControls
        {...filters}
        onCurrency={filters.setCurrency}
        onHorizon={filters.setHorizon}
      />
      <p className="text-xs text-muted-foreground">
        {report.subtitle} · {report.source.fileName}. Importes en moneda
        original, sin convertir con tasas de otra fecha.
      </p>
      <BentoStats
        items={report.sections[0].rows.slice(0, 3).map((r, i) => ({
          key: String(i),
          label: String(r.Métrica),
          valueText: baseNumber(Number(r.Valor)) + " " + filters.currency,
          subtext: i === 0 ? report.source.fileName : undefined,
        }))}
      />
      <SectionCard title="Proyección de caja">
        <DecisionChart
          days={report.model.days}
          minimum={context.minimum}
          currency={filters.currency}
        />
      </SectionCard>
      <SectionCard title="Detalle diario">
        <DataTable
          data={report.model.days}
          rowKey={(r) => r.date}
          columns={[
            { key: "date", header: "Fecha" },
            {
              key: "income",
              header: "Ingresos", align: "right",
              render: (r) => baseNumber(r.income),
            },
            {
              key: "expense",
              header: "Egresos", align: "right",
              render: (r) => baseNumber(r.expense),
            },
            {
              key: "balance",
              header: "Saldo", align: "right",
              render: (r) => baseNumber(r.balance),
            },
          ]}
        />
      </SectionCard>
      {report.warnings.map((w) => (
        <p key={w} className="text-sm text-danger">
          {w}
        </p>
      ))}
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
