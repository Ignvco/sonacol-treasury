import { Link } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Plus } from "lucide-react";
import { useSavedFilters } from "@/hooks/use-saved-filters";
import { useAsyncData } from "@/hooks/use-async";
import { useProjectionView } from "@/hooks/use-projection-view";
import { dataService } from "@/services/dataService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { KpiCard } from "@/components/treasury/KpiCard";
import { DataTable } from "@/components/treasury/DataTable";
import { FilterBar, FilterSelect } from "@/components/treasury/FilterBar";
import { ExportMenu } from "@/components/treasury/ExportMenu";
import { PeriodToggle } from "@/components/treasury/charts";
import { ProjectionControls } from "@/components/treasury/ProjectionControls";
import { ProjectionDay } from "@/components/treasury/ProjectionDay";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/components/treasury/feedback";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import { useCanWrite } from "@/contexts/auth-context";
import { aggregateProjection } from "@/financial-engine/calculations";
import {
  CASHFLOW_CATEGORY_LABEL,
  CASHFLOW_STATUS_LABEL,
  type CashFlow,
  type CashFlowCategory,
  type CashFlowType,
} from "@/financial-engine/types";
import {
  formatDateMedium,
  formatDateShort,
  formatMoney,
} from "@/financial-engine/format";
import { cn } from "@/lib/utils";

type ChartMode = "daily" | "weekly" | "monthly";
interface Filters {
  from: string;
  to: string;
  bankId: string;
  category: string;
  status: string;
  type: string;
}
const EMPTY_FILTERS: Filters = {
  from: "",
  to: "",
  bankId: "",
  category: "",
  status: "",
  type: "",
};

export default function CashFlow() {
  const view = useProjectionView();
  const {
    data,
    model,
    loading,
    error,
    filters,
    setFilters,
    reset,
    formatAmount,
    amountDescription,
  } = view;
  const { data: banks, error: banksError } = useAsyncData(
    () => dataService.getBanks(),
    [],
  );
  const [mode, setMode] = useState<ChartMode>("daily");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [movementFilters, setMovementFilters] = useSavedFilters(
    "cashflow-movements-v1",
    { ...EMPTY_FILTERS },
  );
  const canWrite = useCanWrite();
  const projection = useMemo(
    () => (model ? aggregateProjection(model.daily, mode) : []),
    [model, mode],
  );
  useEffect(() => {
    setSelectedDay(null);
  }, [data?.batch?.id, filters.horizon, filters.currency, filters.bank]);
  if (error || banksError)
    return (
      <ErrorState message={error || banksError || "Error al cargar BASE"} />
    );
  if (loading || !banks) return <LoadingState />;
  if (!data || !model) return <EmptyState />;
  const exportRows = projection.map((r) => ({
    BASE: data.batch?.file_name ?? "",
    Corte: data.cutoff,
    "Moneda de cálculo": filters.currency,
    Banco: filters.bank || "Todos",
    Horizonte: filters.horizon,
    Fecha: r.date,
    "Saldo inicial": r.initial,
    Ingresos: r.income,
    Egresos: r.expense,
    "Saldo proyectado": r.final,
    Variación: r.variation,
  }));
  return (
    <div className="t-fade-in flex min-w-0 flex-col gap-5">
      <PageHeader
        title="Flujo de caja"
        subtitle="La misma proyección diaria de Resumen: saldo inicial + ingresos − egresos"
        actions={
          <>
            <ExportMenu rows={exportRows} filename="flujo-de-caja" />
            {canWrite && (
              <Link to="/projections" className="t-button-primary">
                <Plus size={16} />
                Gestionar MANUAL
              </Link>
            )}
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
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"
        >
          {data.warning}
        </p>
      )}
      {model.issues.map((issue) => (
        <p
          key={issue}
          role="alert"
          className="rounded-xl bg-amber-50 p-3 text-xs"
        >
          {issue}
        </p>
      ))}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Saldo Inicial"
          value={model.available}
          valueText={formatAmount(model.available)}
          subtext={"BASE al " + formatDateMedium(data.cutoff)}
        />
        <KpiCard
          label="Ingresos"
          value={model.collections}
          valueText={formatAmount(model.collections)}
          subtext={"Próximos " + filters.horizon + " días"}
        />
        <KpiCard
          label="Egresos"
          value={model.payments}
          valueText={formatAmount(model.payments)}
          subtext={"Próximos " + filters.horizon + " días"}
          tone="warning"
        />
        <button
          className="min-w-0 rounded-2xl text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
          onClick={() => setSelectedDay(model.to)}
        >
          <KpiCard
            label={"Caja prevista al " + formatDateMedium(model.to)}
            value={model.closing.final}
            valueText={formatAmount(model.closing.final)}
            subtext="Ver cálculo del día · mismo saldo de Resumen"
            tone={model.closing.final < 0 ? "danger" : "success"}
          />
        </button>
      </div>
      <SectionCard
        title="Proyección de Liquidez"
        subtitle={amountDescription}
        action={
          <PeriodToggle<ChartMode>
            value={mode}
            onChange={setMode}
            options={[
              { value: "daily", label: "Diario" },
              { value: "weekly", label: "Semanal" },
              { value: "monthly", label: "Mensual" },
            ]}
          />
        }
        bodyClassName="px-2 pb-3"
      >
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={projection}
              barGap={2}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <CartesianGrid vertical={false} stroke="#F0F0F0" />
              <XAxis
                dataKey="date"
                tickFormatter={formatDateShort}
                tick={{ fontSize: 10 }}
                minTickGap={25}
              />
              <YAxis
                width={65}
                tick={{ fontSize: 10 }}
                tickFormatter={(v) => formatAmount(Number(v), true)}
              />
              <Tooltip
                formatter={(v, name) => [
                  formatAmount(Number(v)),
                  name === "income"
                    ? "Ingresos"
                    : name === "expense"
                      ? "Egresos"
                      : "Saldo",
                ]}
                labelFormatter={(v) => formatDateMedium(String(v))}
              />
              <Bar
                dataKey="income"
                fill="#0320A5"
                radius={[5, 5, 0, 0]}
                maxBarSize={22}
              />
              <Bar
                dataKey="expense"
                fill="#FF9400"
                fillOpacity={0.85}
                radius={[5, 5, 0, 0]}
                maxBarSize={22}
              />
              <Line
                type="stepAfter"
                dataKey="final"
                stroke="#0320A5"
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>
      <SectionCard
        title={
          mode === "daily"
            ? "Saldo Proyectado Diario"
            : mode === "weekly"
              ? "Saldo Proyectado Semanal"
              : "Saldo Proyectado Mensual"
        }
        subtitle="Saldo inicial + ingresos − egresos. Selecciona el saldo de un día para revisar su cálculo."
      >
        <DataTable
          data={projection}
          rowKey={(r) => r.date}
          pageSize={10}
          defaultSort={{ key: "date", dir: "asc" }}
          columns={[
            {
              key: "date",
              header: "Fecha",
              sortValue: (r) => r.date,
              render: (r) => (
                <span className="font-medium">{formatDateMedium(r.date)}</span>
              ),
            },
            {
              key: "initial",
              header: "Saldo inicial",
              align: "right",
              sortValue: (r) => r.initial,
              render: (r) => formatAmount(r.initial),
            },
            {
              key: "income",
              header: "Ingresos",
              align: "right",
              sortValue: (r) => r.income,
              render: (r) => (
                <span className="text-success">{formatAmount(r.income)}</span>
              ),
            },
            {
              key: "expense",
              header: "Egresos",
              align: "right",
              sortValue: (r) => r.expense,
              render: (r) => (
                <span className="text-danger">{formatAmount(r.expense)}</span>
              ),
            },
            {
              key: "final",
              header: "Saldo proyectado",
              align: "right",
              sortValue: (r) => r.final,
              render: (r) =>
                mode === "daily" ? (
                  <button
                    className="font-semibold underline decoration-dotted underline-offset-4"
                    aria-label={"Revisar saldo del " + r.date}
                    onClick={() => setSelectedDay(r.date)}
                  >
                    {formatAmount(r.final)}
                  </button>
                ) : (
                  <span className="font-semibold">{formatAmount(r.final)}</span>
                ),
            },
            {
              key: "variation",
              header: "Variación",
              align: "right",
              sortValue: (r) => r.variation,
              render: (r) => formatAmount(r.variation),
            },
          ]}
        />
      </SectionCard>
      <MovementsDetail
        filters={movementFilters}
        setFilters={setMovementFilters}
        refreshKey={0}
        banks={banks.map((b) => ({ value: b.id, label: b.name }))}
      />
      {selectedDay && (
        <ProjectionDay
          key={selectedDay}
          model={model}
          date={selectedDay}
          formatAmount={formatAmount}
          amountDescription={amountDescription}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </div>
  );
}

function MovementsDetail({
  filters,
  setFilters,
  refreshKey,
  banks,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  refreshKey: number;
  banks: { value: string; label: string }[];
}) {
  const {
    data: movements,
    loading,
    error,
  } = useAsyncData(
    () =>
      dataService.getMovementsFiltered({
        status: filters.status || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        bankId: filters.bankId || undefined,
        category: (filters.category as CashFlowCategory) || undefined,
        type: (filters.type as CashFlowType) || undefined,
      }),
    [
      filters.from,
      filters.to,
      filters.bankId,
      filters.category,
      filters.type,
      filters.status,
      refreshKey,
    ],
  );

  const categories = Object.entries(CASHFLOW_CATEGORY_LABEL).map(
    ([value, label]) => ({
      value,
      label,
    }),
  );

  const statuses = Object.entries(CASHFLOW_STATUS_LABEL).map(
    ([value, label]) => ({ value, label }),
  );

  return (
    <SectionCard
      title="Movimientos"
      subtitle="Importes en su moneda original. Los movimientos ya conciliados no se vuelven a sumar al saldo."
    >
      <FilterBar>
        <FilterSelect
          value={filters.bankId}
          onChange={(v) => setFilters((f) => ({ ...f, bankId: v }))}
          options={banks}
          placeholder="Todos los bancos"
        />
        <FilterSelect
          value={filters.type}
          onChange={(v) => setFilters((f) => ({ ...f, type: v }))}
          options={[
            { value: "income", label: "Ingresos" },
            { value: "expense", label: "Egresos" },
          ]}
          placeholder="Todos los tipos"
        />
        <FilterSelect
          value={filters.category}
          onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
          options={categories}
          placeholder="Todas las categorías"
        />
        <FilterSelect
          value={filters.status}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
          options={statuses}
          placeholder="Todos los estados"
        />
      </FilterBar>

      {error ? (
        <ErrorState message={error} />
      ) : loading ? (
        <LoadingState label="Filtrando movimientos…" />
      ) : !movements || movements.length === 0 ? (
        <EmptyState
          title="Sin movimientos"
          description="No hay registros que coincidan con los filtros."
        />
      ) : (
        <DataTable<CashFlow>
          data={movements}
          rowKey={(m) => m.id}
          pageSize={10}
          defaultSort={{ key: "date", dir: "desc" }}
          columns={[
            {
              key: "description",
              header: "Descripción",
              sortValue: (m) => m.description,
              render: (m) => (
                <div className="max-w-[240px]">
                  <p className="truncate text-[13px] font-medium">
                    {m.description}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {CASHFLOW_CATEGORY_LABEL[m.category]}
                  </p>
                </div>
              ),
            },
            {
              key: "date",
              header: "Fecha",
              sortValue: (m) => m.date,
              render: (m) => (
                <span className="text-muted-foreground">
                  {formatDateMedium(m.date)}
                </span>
              ),
            },
            {
              key: "type",
              header: "Tipo",
              render: (m) => (
                <StatusBadge
                  label={m.type === "income" ? "Ingreso" : "Egreso"}
                  tone={m.type === "income" ? "success" : "warning"}
                  dot={false}
                />
              ),
            },
            {
              key: "amount",
              header: "Monto original",
              align: "right",
              sortValue: (m) => m.amount,
              render: (m) => (
                <span
                  className={cn(
                    "t-num font-semibold",
                    m.type === "income" ? "text-success" : "text-danger",
                  )}
                >
                  {m.type === "income" ? "+" : "-"}
                  {formatMoney(m.amount, m.currency)}
                </span>
              ),
            },
            { key: "currency", header: "Moneda", render: (m) => m.currency },
            {
              key: "status",
              header: "Estado",
              align: "center",
              render: (m) => (
                <StatusBadge label={CASHFLOW_STATUS_LABEL[m.status]} />
              ),
            },
          ]}
        />
      )}
    </SectionCard>
  );
}
