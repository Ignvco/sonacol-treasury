import { ManualCalendar } from "./projections/ManualCalendar";
import { useEffect, useMemo, useState } from "react";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";
import { toast } from "sonner";
import { useAsyncData } from "@/hooks/use-async";
import { useCanWrite } from "@/contexts/auth-context";
import { useCurrency } from "@/contexts/currency-context";
import { dataService } from "@/services/dataService";
import { baseTreasuryService } from "@/services/baseTreasuryService";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DataTable } from "@/components/treasury/DataTable";
import { KpiCard } from "@/components/treasury/KpiCard";
import { StatusBadge } from "@/components/treasury/StatusBadge";
import { LoadingState, ErrorState, NoBaseState } from "@/components/treasury/feedback";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  type Projection,
  PROJECTION_STATUS_LABEL,
} from "@/financial-engine/types";
import { amountInClp } from "@/financial-engine/currency";
import { total } from "@/financial-engine/base-treasury";
import { ManualDialog } from "./projections/ManualDialog";
export default function Projections() {
  const { data, loading, error } = useAsyncData(async () => {
    const bundle = await baseTreasuryService.load();
    return { bundle, items: await dataService.getProjections(bundle.rows) };
  });
  const [view, setView] = useState("table"),
    [duplicate, setDuplicate] = useState(false),
    [suggestedDate, setSuggestedDate] = useState<string>();
  const canWrite = useCanWrite(),
    { rates } = useCurrency();
  const [editing, setEditing] = useState<Projection | null | undefined>(
      undefined,
    ),
    [deleting, setDeleting] = useState<Projection | null>(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState("");
  useEffect(() => {
    setEditing(undefined);
    setDeleting(null);
  }, [data?.bundle.batch?.id]);
  const summary = useMemo(() => {
    try {
      const active = (data?.items ?? []).filter(
        (p) => !["cancelado", "borrador"].includes(p.status),
      );
      const income = total(
        active
          .filter((p) => p.type === "income")
          .map((p) => amountInClp(p.amount, p.currency, rates)),
      );
      const expense = total(
        active
          .filter((p) => p.type === "expense")
          .map((p) => amountInClp(p.amount, p.currency, rates)),
      );
      return { income, expense };
    } catch {
      return null;
    }
  }, [data, rates]);
  if (loading) return <LoadingState />;
  if (error) return <ErrorState message={error} />;
  if (!data) return <NoBaseState />;
  const { bundle, items } = data;
  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true);
    setFailure("");
    try {
      await dataService.deleteProjection(deleting);
      setDeleting(null);
      toast.success("Proyección eliminada");
    } catch (e) {
      setFailure(e instanceof Error ? e.message : "No se pudo eliminar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex flex-col gap-5 t-fade-in">
      <PageHeader
        title="Proyecciones"
        subtitle="Planifica ingresos y egresos. Tus cambios se conservan al cargar la siguiente BASE."
        actions={
          canWrite && bundle.batch ? (
            <button
              className="t-button-primary"
              onClick={() => {
                setDuplicate(false);
                setSuggestedDate(undefined);
                setEditing(null);
              }}
            >
              <Plus size={16} />
              Nueva proyección
            </button>
          ) : undefined
        }
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Ingresos proyectados"
          value={summary?.income ?? 0}
          valueText={!summary ? "Falta tasa de cambio" : undefined}
        />
        <KpiCard
          label="Egresos proyectados"
          value={summary?.expense ?? 0}
          valueText={!summary ? "Falta tasa de cambio" : undefined}
        />
        <KpiCard
          label="Neto proyectado"
          value={(summary?.income ?? 0) - (summary?.expense ?? 0)}
          valueText={!summary ? "Falta tasa de cambio" : undefined}
        />
      </div>
      {!bundle.batch && (
        <p className="rounded-xl border p-4 text-sm">
          Carga tu primera BASE en Importaciones para comenzar.
        </p>
      )}
      <div className="flex gap-2">
        <button
          className={
            view === "table" ? "t-button-primary" : "t-button-secondary"
          }
          onClick={() => setView("table")}
        >
          Tabla
        </button>
        <button
          className={
            view === "calendar" ? "t-button-primary" : "t-button-secondary"
          }
          onClick={() => setView("calendar")}
        >
          Agenda visual
        </button>
      </div>
      <SectionCard
        title="Movimientos"
        subtitle="Los importes de la tabla y del editor están expresados en su moneda original."
      >
        {view === "calendar" ? (
          <ManualCalendar
            items={items}
            date={bundle.cutoff}
            canWrite={canWrite}
            onEdit={(p) => {
              setDuplicate(false);
              setSuggestedDate(undefined);
              setEditing(p);
            }}
            onMove={(p, date) => {
              setDuplicate(false);
              setSuggestedDate(date);
              setEditing(p);
            }}
          />
        ) : (
          <DataTable<Projection>
            data={items}
            rowKey={(p) => p.id}
            search
            searchText={(p) =>
              p.description + " " + p.currency + " " + p.status
            }
            pageSize={10}
            defaultSort={{ key: "date", dir: "asc" }}
            columns={[
              {
                key: "date",
                header: "Fecha",
                sortValue: (p) => p.date,
                render: (p) => p.date,
              },
              {
                key: "description",
                header: "Descripción",
                className: "!whitespace-normal min-w-[160px]",
                render: (p) => (
                  <div>
                    <p>{p.description}</p>
                    <p className="text-xs text-muted-foreground">
                      {p.edited ? "Editado en plataforma" : "Desde BASE"}
                    </p>
                  </div>
                ),
              },
              {
                key: "type",
                header: "Tipo",
                render: (p) => (p.type === "income" ? "Ingreso" : "Egreso"),
              },
              {
                key: "amount",
                header: "Importe original",
                align: "right",
                render: (p) =>
                  `${p.type === "expense" ? "−" : ""}${baseNumber(p.amount)} ${p.currency}`,
              },
              {
                key: "status",
                header: "Estado",
                render: (p) => (
                  <StatusBadge label={PROJECTION_STATUS_LABEL[p.status]} />
                ),
              },
            ]}
            actions={
              canWrite
                ? (p) => (
                    <div className="flex gap-1">
                      <button
                        className="t-button-secondary !p-2"
                        aria-label={"Editar " + p.description}
                        onClick={() => {
                          setDuplicate(false);
                          setSuggestedDate(undefined);
                          setEditing(p);
                        }}
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        className="t-button-secondary !p-2"
                        aria-label={"Duplicar " + p.description}
                        onClick={() => {
                          setDuplicate(true);
                          setSuggestedDate(undefined);
                          setEditing(p);
                        }}
                      >
                        <Copy size={16} />
                      </button>
                      <button
                        className="t-button-secondary !p-2"
                        aria-label={"Eliminar " + p.description}
                        onClick={() => {
                          setDeleting(p);
                          setFailure("");
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  )
                : undefined
            }
          />
        )}
      </SectionCard>
      {editing !== undefined && bundle.batch && (
        <ManualDialog
          duplicate={duplicate}
          suggestedDate={suggestedDate}
          initial={editing}
          batchId={bundle.batch.id}
          date={bundle.cutoff}
          banks={[...new Set(bundle.rows.map((r) => r.bank))]}
          onClose={() => setEditing(undefined)}
        />
      )}
      <Dialog
        open={!!deleting}
        onOpenChange={(o) => {
          if (!o && !busy) setDeleting(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Eliminar proyección</DialogTitle>
            <DialogDescription>
              Se eliminará «{deleting?.description}» de esta fecha de trabajo.
              La siguiente carga de Excel respetará esta eliminación.
            </DialogDescription>
          </DialogHeader>
          {failure && (
            <p role="alert" className="text-danger">
              {failure}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              disabled={busy}
              className="t-button-secondary"
              onClick={() => setDeleting(null)}
            >
              Cancelar
            </button>
            <button
              disabled={busy}
              className="t-button-primary"
              onClick={() => void remove()}
            >
              Confirmar eliminación
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
