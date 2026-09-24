import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, CheckCircle2, Clock3, Plus, TrendingDown, Wallet } from "lucide-react";
import { useAsyncData } from "@/hooks/use-async";
import { useCanWrite } from "@/contexts/auth-context";
import { useDecisionFilters } from "@/hooks/use-decision-filters";
import {
  decisionService,
  snapshotRows,
  type Task,
} from "@/services/decisionService";
import { workingDate } from "@/services/workingDate";
import { cashBridge, decisionModel } from "@/financial-engine/decisions";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { BentoStats } from "@/components/treasury/bento/BentoStats";
import { DecisionChart } from "@/components/treasury/DecisionChart";
import { DecisionControls } from "@/components/treasury/DecisionControls";
import { ToolbarChip } from "@/components/treasury/Toolbar";
import { LoadingState, ErrorState, NoBaseState } from "@/components/treasury/feedback";
import {
  SourceBreakdown,
  baseNumber,
} from "@/components/treasury/SourceBreakdown";
import type { TreasuryRow } from "@/financial-engine/base-treasury";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
export default function Today() {
  const { data, loading, error } = useAsyncData(() => decisionService.load());
  const canWrite = useCanWrite();
  const filters = useDecisionFilters();
  const [task, setTask] = useState<Partial<Task> | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(""),
    [detail, setDetail] = useState<TreasuryRow[] | null>(null);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <NoBaseState />;
  const { bundle, workspace, members } = data,
    { currency, horizon } = filters;
  const minimum = Number(workspace.settings.minimums[currency] ?? 0);
  const context = { cutoff: bundle.cutoff, currency, horizon, minimum };
  const model = decisionModel(bundle.rows, bundle.links, context);
  const previous = workspace.previous,
    bridge = previous?.batch
      ? cashBridge(
          snapshotRows(previous),
          bundle.rows,
          currency,
          previous.batch.cutoff,
          bundle.cutoff,
        )
      : null;
  const historical = !!bundle.batch && bundle.batch.id !== bundle.latestId;
  const age = bundle.batch
    ? (Date.now() - new Date(bundle.batch.created_at).getTime()) / 36e5
    : Infinity;
  const cutoffAge =
    (Date.now() - new Date(bundle.cutoff + "T23:59:59Z").getTime()) / 36e5;
  const stale =
    !historical &&
    (age > workspace.settings.stale_hours ||
      cutoffAge > workspace.settings.stale_hours);
  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setFailure("");
    try {
      await action();
      setTask(null);
      workingDate.refresh();
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-5 t-fade-in">
      <PageHeader
        title="Hoy"
        subtitle="Lo que exige acción hoy: caja disponible, umbral, cambios y agenda."
        actions={
          <>
            <Link className="t-button-secondary" to="/cashflow">
              Ver serie diaria
            </Link>
            <Link className="t-button-secondary" to="/scenarios">
              Explorar escenarios <ArrowUpRight size={16} />
            </Link>
          </>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <DecisionControls
          {...filters}
          cutoff={bundle.cutoff}
          onCurrency={filters.setCurrency}
          onHorizon={filters.setHorizon}
        />
        {(historical || stale) && (
          <ToolbarChip icon={Clock3} tone="warning">
            {historical ? "Consulta histórica" : "Revisar actualización de ERP"}
          </ToolbarChip>
        )}
        <p className="ml-auto flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground">
          Importes originales en {currency} · corte {bundle.cutoff}
          <Link
            className="font-semibold text-brand hover:text-brand-dark"
            to="/integrations"
          >
            Ver fuentes
          </Link>
        </p>
      </div>
      {!bundle.batch && (
        <div className="rounded-2xl border border-brand/20 bg-brand-soft p-6">
          <h2 className="font-semibold">Tu tesorería comienza con BASE</h2>
          <p className="my-2 text-sm">
            Carga tu Excel para construir la posición de caja y los próximos
            compromisos.
          </p>
          <Link className="t-button-primary" to="/importations">
            Importar BASE
          </Link>
        </div>
      )}
      <BentoStats
        items={[
          {
            key: "available",
            label: "Caja disponible",
            valueText: baseNumber(model.available) + " " + currency,
            subtext: "BANCO al corte",
            icon: Wallet,
            hint: "Ver movimientos",
            onClick: () => setDetail(model.cashRows),
          },
          {
            key: "lowest",
            label: "Menor saldo previsto",
            valueText: baseNumber(model.lowest.balance) + " " + currency,
            subtext: "Se alcanza el " + model.lowest.date,
            tone: model.lowest.balance < minimum ? "danger" : "default",
            icon: TrendingDown,
          },
          {
            key: "risk",
            label: "Primer cruce del umbral",
            valueText: model.firstRisk ?? "Sin cruce",
            subtext: "Umbral: " + baseNumber(minimum) + " " + currency,
            icon: Clock3,
          },
          {
            key: "tasks",
            label: "Pendientes de gestión",
            valueText: String(
              workspace.tasks.filter((t) => t.status === "open").length,
            ),
            subtext:
              model.overdue.length + " movimientos vencidos sin resolver",
            icon: CheckCircle2,
          },
        ]}
      />
      <SectionCard
        title="Horizonte de liquidez"
        subtitle="Los vencidos pendientes se proyectan al primer día. Los vínculos evitan contar un mismo cobro dos veces."
      >
        <DecisionChart
          days={[
            { date: bundle.cutoff, balance: model.available },
            ...model.days,
          ]}
          currency={currency}
          minimum={minimum}
        />
        {model.issues.map((s) => (
          <p className="mt-2 text-sm text-danger" key={s}>
            {s}
          </p>
        ))}
      </SectionCard>
      <div className="grid gap-5 xl:grid-cols-2">
        <SectionCard
          title="¿Qué cambió en la caja?"
          subtitle={
            previous?.batch
              ? "Respecto del corte " + previous.batch.cutoff
              : "Necesitas dos fechas para comparar."
          }
          action={
            <Link className="text-sm text-brand" to="/changes">
              Ver cambios
            </Link>
          }
        >
          {bridge ? (
            <>
              <p className="mb-4 text-2xl font-semibold">
                {bridge.difference > 0 ? "+" : ""}
                {baseNumber(bridge.difference)}{" "}
                <span className="text-sm text-muted-foreground">
                  {currency}
                </span>
              </p>
              {bridge.changes.slice(0, 5).map((c) => (
                <button
                  key={c.key}
                  className="flex w-full items-center justify-between gap-3 border-t py-3 text-left text-sm"
                  onClick={() => setDetail([c.row])}
                >
                  <span className="min-w-0 truncate">
                    {c.row.description || c.row.bank}
                  </span>
                  <span className="shrink-0 font-medium">
                    {baseNumber(c.amount)}
                  </span>
                </button>
              ))}
              <p className="mt-2 text-xs text-muted-foreground">
                La variación describe cambios entre BASE; una fila ausente no
                confirma un pago.
              </p>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">
              Con la próxima BASE podrás explicar altas, bajas y correcciones.
            </p>
          )}
        </SectionCard>
        <SectionCard
          title="Tu agenda de gestión"
          action={
            canWrite ? (
              <button
                className="t-button-secondary !p-2"
                aria-label="Nueva tarea"
                onClick={() => {
                  setFailure("");
                  setTask({
                    batch_id: bundle.batch?.id ?? null,
                    title: "",
                    note: "",
                    due_date: bundle.cutoff,
                    status: "open",
                  });
                }}
              >
                <Plus size={16} />
              </button>
            ) : undefined
          }
        >
          {workspace.tasks.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Asigna responsables y fechas a las acciones de tesorería.
            </p>
          )}
          {workspace.tasks.map((t) => (
            <div
              key={t.id}
              className="flex items-center justify-between gap-3 border-b py-3 text-sm"
            >
              <button
                className={
                  "min-w-0 text-left " +
                  (t.status === "done"
                    ? "text-muted-foreground line-through"
                    : "")
                }
                disabled={!canWrite}
                onClick={() => {
                  setFailure("");
                  setTask(t);
                }}
              >
                <p className="font-medium">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {t.due_date} ·{" "}
                  {members.find((m) => m.id === t.assignee)?.name ??
                    "Sin responsable"}
                </p>
              </button>
              {canWrite && (
                <button
                  disabled={busy}
                  className="t-button-secondary !p-2"
                  aria-label={
                    (t.status === "done" ? "Reabrir " : "Completar ") + t.title
                  }
                  onClick={() =>
                    void run(() =>
                      decisionService.saveTask({
                        ...t,
                        status: t.status === "done" ? "open" : "done",
                      }),
                    )
                  }
                >
                  <CheckCircle2 size={16} />
                </button>
              )}
            </div>
          ))}
        </SectionCard>
      </div>
      {failure && !task && (
        <p role="alert" className="text-danger">
          {failure}
        </p>
      )}
      {detail && (
        <SourceBreakdown
          title="Origen de la cifra"
          rows={detail}
          onClose={() => setDetail(null)}
        />
      )}
      <Dialog
        open={!!task}
        onOpenChange={(o) => {
          if (!o && !busy) setTask(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {task?.id ? "Editar tarea" : "Nueva tarea"}
            </DialogTitle>
            <DialogDescription>
              Queda asociada a esta fecha de trabajo.
            </DialogDescription>
          </DialogHeader>
          {task && (
            <form
              className="grid gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() => decisionService.saveTask(task));
              }}
            >
              <label className="grid gap-1 text-sm">
                Título
                <input
                  required
                  maxLength={200}
                  className="t-input"
                  value={task.title}
                  onChange={(e) => setTask({ ...task, title: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Detalle
                <textarea
                  className="t-input"
                  maxLength={2000}
                  value={task.note}
                  onChange={(e) => setTask({ ...task, note: e.target.value })}
                />
              </label>
              <label className="grid gap-1 text-sm">
                Fecha
                <input
                  type="date"
                  required
                  className="t-input"
                  value={task.due_date}
                  onChange={(e) =>
                    setTask({ ...task, due_date: e.target.value })
                  }
                />
              </label>
              <label className="grid gap-1 text-sm">
                Responsable
                <select
                  className="t-input"
                  value={task.assignee ?? ""}
                  onChange={(e) =>
                    setTask({ ...task, assignee: e.target.value || null })
                  }
                >
                  <option value="">Sin asignar</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              {failure && (
                <p role="alert" className="text-danger">
                  {failure}
                </p>
              )}
              <button disabled={busy} className="t-button-primary">
                Guardar tarea
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
