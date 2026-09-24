import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, RefreshCw } from "lucide-react";
import { useProjectionView } from "@/hooks/use-projection-view";
import { ProjectionControls } from "@/components/treasury/ProjectionControls";
import { ProjectionDay } from "@/components/treasury/ProjectionDay";
import type { TreasuryRow, ForecastEvent } from "@/financial-engine/base-treasury";
import {
  SourceBreakdown,
  baseNumber,
} from "@/components/treasury/SourceBreakdown";
import { DataTable } from "@/components/treasury/DataTable";
import { PageHeader } from "@/components/treasury/PageHeader";
import { ResumenBento } from "@/components/treasury/bento/ResumenBento";
import {
  LoadingState,
  ErrorState,
  EmptyState,
  NoBaseState,
} from "@/components/treasury/feedback";
import { ForecastLinks } from "./dashboard/ForecastLinks";

export default function Dashboard() {
  const [refresh, setRefresh] = useState(0),
    [linking, setLinking] = useState(false);
  const [detail, setDetail] = useState<{
    title: string;
    rows: (TreasuryRow | ForecastEvent)[];
  } | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const {
    data,
    loading,
    error,
    model,
    filters,
    setFilters,
    reset,
    formatAmount,
    amountDescription,
  } = useProjectionView(refresh);
  const cutoff = data?.cutoff ?? "";
  useEffect(() => {
    setDetail(null);
    setSelectedDay(null);
    setLinking(false);
  }, [data?.batch?.id, filters.horizon, filters.currency, filters.bank]);
  const open = (title: string, rows: (TreasuryRow | ForecastEvent)[]) =>
    setDetail({ title, rows });
  if (loading)
    return <LoadingState label="Calculando caja y proyecciones desde BASE…" />;
  if (error)
    return (
      <ErrorState message={error} onRetry={() => setRefresh((x) => x + 1)} />
    );
  if (!data || !model) return <NoBaseState />;
  return (
    <div className="t-fade-in min-w-0 space-y-6">
      <PageHeader
        title="Resumen"
        subtitle={
          "Foto ejecutiva de la caja al " +
          data.cutoff +
          ": composición, tendencia y detalle diario. Selecciona cualquier cifra para revisar su origen."
        }
        actions={
          <>
            <Link to="/today" className="t-button-secondary">
              Qué exige acción hoy
            </Link>
            <button
              aria-label="Actualizar dashboard"
              className="t-button-secondary"
              onClick={() => setRefresh((x) => x + 1)}
            >
              <RefreshCw size={15} /> Actualizar
            </button>
          </>
        }
      />
      <ProjectionControls
        data={data}
        filters={filters}
        setFilters={setFilters}
        reset={reset}
        from={model.from}
        to={model.to}
        amountDescription={amountDescription}
      />
      {data.warning && (
        <p
          role="alert"
          className="rounded-xl border border-warning/25 bg-warning-soft p-4 text-sm text-warning"
        >
          {data.warning}
        </p>
      )}
      {!data.rows.length && (
        <div className="rounded-xl border bg-card p-5 text-sm">
          Todavía no hay filas BASE guardadas.{" "}
          <Link className="text-brand underline" to="/importations">
            Importa el libro Excel
          </Link>
          .
        </div>
      )}

      <ResumenBento
        cutoff={data.cutoff}
        to={model.to}
        horizon={filters.horizon}
        currencyLabel={filters.currency}
        available={model.available}
        projected={model.closing.final}
        invested={model.invested}
        minimum={model.minimum}
        collections={model.collections}
        payments={model.payments}
        daily={model.daily}
        days={model.days}
        formatAmount={formatAmount}
        onOpenCash={() => open("Caja disponible", model.cashRows)}
        onOpenInvested={() => open("En inversiones", model.investedRows)}
        onOpenCollections={() => open("Ingresos esperados", model.collectionRows)}
        onOpenPayments={() => open("Egresos previstos", model.paymentRows)}
        onOpenDay={(date) => setSelectedDay(date)}
      />

      <p className="text-xs text-muted-foreground">
        La caja de apertura ya está incluida en BANCO. El saldo previsto
        corresponde al cierre de una fecha; no suma los saldos acumulados de
        varios días.
      </p>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,2.3fr)_minmax(280px,1fr)]">
        <section className="t-card min-w-0 p-5">
          <h2 className="mb-4 font-semibold">Saldo contable por banco</h2>
          <DataTable
            data={model.positions}
            rowKey={(r) => r.key}
            pageSize={9}
            storageKey="dashboard-banks"
            onRowClick={(r) => open(r.bank + " · " + r.ledger, r.rows)}
            columns={[
              { key: "bank", header: "Banco", sortValue: (r) => r.bank },
              { key: "ledger", header: "Código contable" },
              { key: "currency", header: "Moneda" },
              {
                key: "amount",
                header: "Saldo REAL",
                align: "right",
                render: (r) => baseNumber(r.amount),
                sortValue: (r) => r.amount,
              },
            ]}
          />
          <p className="mt-3 text-xs text-muted-foreground">
            Saldos calculados desde las partidas BANCO de BASE. La conciliación
            con cartola se consulta por separado.
          </p>
        </section>

        <aside className="space-y-4 rounded-[24px] border border-border bg-sunken p-5 shadow-bento">
          <h2 className="font-semibold">Por revisar</h2>
          <button
            className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand/40"
            onClick={() =>
              open("Pendientes anteriores al corte", model.overdue)
            }
          >
            <p className="text-sm font-semibold">
              {model.overdue.length} pendientes anteriores al corte
            </p>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Se muestran en el primer día proyectado. Su cobro o rescate
              todavía requiere confirmar la fecha.
            </p>
          </button>
          {model.omittedRows.length > 0 && (
            <button
              className="w-full rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-brand/40"
              onClick={() =>
                open("Registros fuera de la última BASE", model.omittedRows)
              }
            >
              <p className="text-sm font-semibold">
                {model.omittedRows.length} registros de cargas anteriores
              </p>
              <p className="mt-2 text-xs text-muted-foreground">
                No están en la última BASE. Se conservan para revisión y quedan
                fuera de la caja y la proyección activa.
              </p>
            </button>
          )}
          {model.minimum < 0 && (
            <div className="rounded-xl border border-danger/25 bg-danger-soft p-4 text-sm text-danger">
              La proyección presenta un déficit dentro del período seleccionado.
            </div>
          )}
          {model.issues.map((issue) => (
            <p
              key={issue}
              role="alert"
              className="rounded-xl bg-warning-soft p-3 text-xs text-warning"
            >
              {issue}
            </p>
          ))}
          <button
            className="t-button-secondary w-full justify-center"
            onClick={() => setLinking(true)}
          >
            Revisar vínculos de cobros
          </button>
          <Link
            to="/importations"
            className="flex items-center justify-between rounded-xl bg-brand p-4 text-sm font-medium text-primary-foreground"
          >
            Actualizar desde Excel <ChevronRight size={17} />
          </Link>
          <p className="text-xs leading-relaxed text-muted-foreground">
            MANUAL se edita en Proyecciones. BANCO, CLIENTES y COLOCACIONES se
            actualizan desde BASE o una entrega configurada de SAP.
          </p>
        </aside>
      </div>

      <section className="t-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Detalle diario de la proyección</h2>
          <Link
            to="/cashflow"
            className="text-[12px] font-semibold text-brand hover:text-brand-dark"
          >
            Ver la serie completa
          </Link>
        </div>
        <DataTable
          data={model.daily}
          rowKey={(r) => r.date}
          storageKey="dashboard-days"
          pageSize={7}
          columns={[
            { key: "date", header: "Día", sortValue: (r) => r.date },
            {
              key: "income",
              header: "Ingresos",
              align: "right",
              render: (r) => (
                <button
                  className="text-success underline decoration-dotted underline-offset-4"
                  onClick={() =>
                    open(
                      "Ingresos · " + r.date,
                      model.collectionRows.filter(
                        (e) => e.effectiveDate === r.date,
                      ),
                    )
                  }
                >
                  {formatAmount(r.income)}
                </button>
              ),
            },
            {
              key: "expense",
              header: "Egresos",
              align: "right",
              render: (r) => (
                <button
                  className="text-danger underline decoration-dotted underline-offset-4"
                  onClick={() =>
                    open(
                      "Egresos · " + r.date,
                      model.paymentRows.filter(
                        (e) => e.effectiveDate === r.date,
                      ),
                    )
                  }
                >
                  {formatAmount(r.expense)}
                </button>
              ),
            },
            {
              key: "final",
              header: "Caja al cierre",
              align: "right",
              render: (r) => (
                <button
                  className="font-semibold underline decoration-dotted underline-offset-4"
                  onClick={() => setSelectedDay(r.date)}
                >
                  {formatAmount(r.final)}
                </button>
              ),
            },
          ]}
        />
      </section>

      {selectedDay && (
        <ProjectionDay
          key={selectedDay}
          date={selectedDay}
          model={model}
          formatAmount={formatAmount}
          amountDescription={amountDescription}
          onClose={() => setSelectedDay(null)}
        />
      )}
      {detail && (
        <SourceBreakdown
          key={detail.title}
          {...detail}
          onClose={() => setDetail(null)}
        />
      )}
      {linking && (
        <ForecastLinks
          rows={data.rows}
          links={data.links}
          onClose={() => setLinking(false)}
          onRefresh={() => setRefresh((x) => x + 1)}
        />
      )}
    </div>
  );
}
