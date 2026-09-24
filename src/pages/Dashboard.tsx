import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  RefreshCw,
  Wallet,
  CalendarDays,
  PiggyBank,
  TrendingUp,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  ReferenceLine,
} from "recharts";
import { useProjectionView } from "@/hooks/use-projection-view";
import { ProjectionControls } from "@/components/treasury/ProjectionControls";
import { ProjectionDay } from "@/components/treasury/ProjectionDay";
import { formatDateMedium } from "@/financial-engine/format";
import type {
  TreasuryRow,
  ForecastEvent,
} from "@/financial-engine/base-treasury";
import {
  SourceBreakdown,
  baseNumber,
} from "@/components/treasury/SourceBreakdown";
import { DataTable } from "@/components/treasury/DataTable";
import { PageHeader } from "@/components/treasury/PageHeader";
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
  const kpis = [
    {
      label: "Caja disponible",
      value: model.available,
      icon: Wallet,
      subtitle: "BANCO · suma de REAL al corte",
      rows: model.cashRows,
      primary: true,
    },
    {
      label: "Caja prevista al " + formatDateMedium(model.to),
      value: model.closing.final,
      icon: TrendingUp,
      subtitle: "Mismo saldo del detalle diario · " + filters.horizon + " días",
      rows: [...model.cashRows, ...model.events],
      day: model.to,
    },
    {
      label: "Ingresos esperados",
      value: model.collections,
      icon: ArrowDownLeft,
      subtitle: "Clientes, rescates y manuales",
      rows: model.collectionRows,
    },
    {
      label: "Egresos previstos",
      value: model.payments,
      icon: ArrowUpRight,
      subtitle: "Pagos incluidos en el horizonte",
      rows: model.paymentRows,
    },
    {
      label: "En inversiones",
      value: model.invested,
      icon: PiggyBank,
      subtitle: "Capital aún no rescatado",
      rows: model.investedRows,
    },
  ];
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
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {data.warning}
        </p>
      )}
      {!data.rows.length && (
        <div className="rounded-xl border bg-white p-5 text-sm">
          Todavía no hay filas BASE guardadas.{" "}
          <Link className="text-brand underline" to="/importations">
            Importa el libro Excel
          </Link>
          .
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {kpis.map((k) => (
          <button
            key={k.label}
            onClick={() =>
              k.day ? setSelectedDay(k.day) : open(k.label, k.rows)
            }
            className={`group min-w-0 rounded-2xl border p-5 text-left transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand ${k.primary ? "border-brand bg-brand text-white" : "bg-white"}`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium">{k.label}</span>
              <k.icon size={17} className="opacity-70" />
            </div>
            <p className="mt-4 break-words text-[clamp(1.1rem,1.45vw,1.5rem)] font-semibold tracking-tight tabular-nums">
              {formatAmount(k.value)}
            </p>
            <p
              className={`mt-2 text-[11px] ${k.primary ? "text-white/75" : "text-muted-foreground"}`}
            >
              {k.subtitle}
            </p>
            <p className="mt-4 flex items-center gap-1 text-[11px] opacity-70">
              {k.day ? "Ver cálculo del día" : "Ver desglose"}{" "}
              <ChevronRight size={12} />
            </p>
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        La caja de apertura ya está incluida en BANCO. El saldo previsto
        corresponde al cierre de una fecha; no suma los saldos acumulados de
        varios días.
      </p>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,2.3fr)_minmax(280px,1fr)]">
        <section className="min-w-0 rounded-2xl border border-border bg-card p-5 md:p-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="font-semibold">Evolución de caja</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Caja disponible + ingresos − egresos · próximos{" "}
                {filters.horizon} días
              </p>
            </div>
            <CalendarDays size={20} className="text-brand" />
          </div>
          <div
            className="h-[310px] w-full"
            aria-label="Gráfico de saldo proyectado"
          >
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={model.daily}
                margin={{ left: 5, right: 12, top: 12, bottom: 5 }}
              >
                <defs>
                  <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4263eb" stopOpacity={0.24} />
                    <stop
                      offset="100%"
                      stopColor="#4263eb"
                      stopOpacity={0.01}
                    />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 4"
                  vertical={false}
                  stroke="#e9edf3"
                />
                <XAxis
                  dataKey="date"
                  tickFormatter={(d) => String(d).slice(5)}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                  minTickGap={30}
                />
                <YAxis
                  width={75}
                  tickFormatter={(v) => formatAmount(Number(v), true)}
                  tick={{ fontSize: 11 }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  formatter={(v) => [formatAmount(Number(v)), "Saldo"]}
                  labelFormatter={(v) => String(v)}
                />
                <ReferenceLine y={0} stroke="#dc5965" strokeDasharray="4 4" />
                <Area
                  type="stepAfter"
                  dataKey="final"
                  stroke="#4263eb"
                  strokeWidth={2.5}
                  fill="url(#cashFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-4 flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
            <span>
              La tabla inferior permite revisar cada día y su cálculo.
            </span>
            <button
              className="font-medium text-brand underline"
              onClick={() =>
                open("Saldo mínimo del horizonte", [
                  ...model.cashRows,
                  ...model.events.filter(
                    (r) =>
                      r.effectiveDate <=
                      (model.days.find((d) => d.balance === model.minimum)
                        ?.date ?? cutoff),
                  ),
                ])
              }
            >
              Mínimo: {formatAmount(model.minimum)}
            </button>
          </div>
        </section>
        <aside className="space-y-4 rounded-2xl border bg-[#f5f7fc] p-5">
          <h2 className="font-semibold">Por revisar</h2>
          <button
            className="w-full rounded-xl border bg-white p-4 text-left"
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
              className="w-full rounded-xl border bg-white p-4 text-left"
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
            <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
              La proyección presenta un déficit dentro del período seleccionado.
            </div>
          )}
          {model.issues.map((issue) => (
            <p
              key={issue}
              role="alert"
              className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900"
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
            className="flex items-center justify-between rounded-xl bg-brand p-4 text-sm font-medium text-white"
          >
            Actualizar desde Excel <ChevronRight size={17} />
          </Link>
          <p className="text-xs leading-relaxed text-muted-foreground">
            MANUAL se edita en Proyecciones. BANCO, CLIENTES y COLOCACIONES se
            actualizan desde BASE o una entrega configurada de SAP.
          </p>
        </aside>
      </div>
      <section className="rounded-2xl border border-border bg-card p-5">
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
      <section className="rounded-2xl border border-border bg-card p-5">
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
                  className="text-emerald-700 underline decoration-dotted underline-offset-4"
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
                  className="text-red-700 underline decoration-dotted underline-offset-4"
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
