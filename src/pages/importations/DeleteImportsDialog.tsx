import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
} from "@/components/ui/alert-dialog";
import {
  importService,
  type ExcelDeletionPlan,
  type ExcelDeletionResult,
} from "@/services/importService";

export function DeleteImportsDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: { id: string; fileName: string } | null;
  onClose: () => void;
  onDeleted: (result: ExcelDeletionResult) => void;
}) {
  const [plan, setPlan] = useState<ExcelDeletionPlan | null>(null);
  const [error, setError] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [retry, setRetry] = useState(0);
  const phrase = target ? "ELIMINAR" : "VACIAR EXCEL";
  useEffect(() => {
    let active = true;
    setLoading(true);
    setPlan(null);
    setError("");
    setConfirmation("");
    importService
      .previewDeletion(target?.id ?? null)
      .then((value) => {
        if (active) setPlan(value);
      })
      .catch((err) => {
        if (active)
          setError(
            err instanceof Error
              ? err.message
              : "No se pudo revisar el alcance.",
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [target?.id, retry]);
  const remove = async () => {
    if (!plan || saving || confirmation !== phrase) return;
    setSaving(true);
    setError("");
    try {
      onDeleted(
        await importService.deleteExcel(
          target?.id ?? null,
          plan.revision,
          confirmation,
        ),
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se recibió confirmación.",
      );
      setPlan(null);
      setConfirmation("");
    } finally {
      setSaving(false);
    }
  };
  return (
    <AlertDialog
      open
      onOpenChange={(open) => {
        if (!open && !saving) onClose();
      }}
    >
      <AlertDialogContent className="flex max-h-[90dvh] w-[calc(100%_-_2rem)] flex-col gap-0 overflow-hidden rounded-[24px] bg-card p-0">
        <AlertDialogHeader className="shrink-0 border-b px-6 py-4">
          <AlertDialogTitle>
            {target
              ? "Eliminar Excel importado"
              : "Vaciar importaciones de Excel"}
          </AlertDialogTitle>
          <AlertDialogDescription className="break-words">
            {target
              ? target.fileName
              : "Elimina todos los Excel importados, incluidos los de fechas anteriores y versiones antiguas."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
          {loading && (
            <p role="status" className="flex items-center gap-2 text-sm">
              <Loader2 size={16} className="animate-spin" /> Revisando los datos
              que se eliminarán…
            </p>
          )}
          {error && (
            <div
              role="alert"
              className="rounded-xl bg-danger-soft p-3 text-sm text-danger"
            >
              {error}
            </div>
          )}
          {!loading && !plan && (
            <button
              className="t-button-secondary"
              disabled={saving}
              onClick={() => setRetry((n) => n + 1)}
            >
              Volver a revisar
            </button>
          )}
          {plan && (
            <>
              <dl className="grid grid-cols-2 gap-3 rounded-xl border p-4 text-sm">
                <dt>Archivos</dt>
                <dd className="text-right font-semibold">{plan.files}</dd>
                <dt>Filas de BASE</dt>
                <dd className="text-right font-semibold">
                  {plan.rows.toLocaleString("es-CL")}
                </dd>
                <dt>Proyecciones MANUAL</dt>
                <dd className="text-right font-semibold">{plan.manual}</dd>
                {plan.legacyRows > 0 && (
                  <>
                    <dt>Filas del importador anterior</dt>
                    <dd className="text-right font-semibold">
                      {plan.legacyRows.toLocaleString("es-CL")}
                    </dd>
                  </>
                )}
                {plan.legacyOrphans > 0 && (
                  <>
                    <dt>Movimientos Excel sin lote</dt>
                    <dd className="text-right font-semibold">
                      {plan.legacyOrphans}
                    </dd>
                  </>
                )}
              </dl>
              {plan.files === 0 && !plan.legacyOrphans ? (
                <p className="text-sm">
                  No quedan archivos Excel por eliminar.
                </p>
              ) : (
                <>
                  {plan.dependentWork && (
                    <p className="rounded-xl border border-warning/25 bg-warning-soft p-3 text-sm text-warning">
                      Trabajo vinculado que también se eliminará:{" "}
                      {Object.entries(plan.dependentWork)
                        .map(
                          ([k, n]) =>
                            `${({ scenarios: "escenarios", forecasts: "previsiones", tasks: "tareas", comments: "comentarios", attachments: "adjuntos", matches: "conciliaciones" } as Record<string, string>)[k] ?? k}: ${n}`,
                        )
                        .join(" · ")}
                      . Las cartolas independientes se conservan.
                    </p>
                  )}
                  <p className="text-sm leading-relaxed">
                    Se borrarán definitivamente las filas importadas y el
                    trabajo MANUAL de las fechas eliminadas, incluidas{" "}
                    {plan.editedManual} proyecciones editadas en la plataforma.
                    El archivo original de tu computador permanece intacto.
                  </p>
                  <p className="text-sm leading-relaxed">
                    {plan.latestAfter
                      ? `La última BASE restante será ${plan.latestAfter.cutoff} · ${plan.latestAfter.fileName}. Los datos de otros archivos se conservan.`
                      : "No quedará ninguna BASE: caja y proyecciones mostrarán cero, y las tablas quedarán vacías hasta la próxima importación."}
                  </p>
                  {plan.carriedManual > 0 && (
                    <p className="text-sm">
                      Se conservan {plan.carriedManual} copias de MANUAL que ya
                      pertenecen a otras fechas. Su origen quedará identificado
                      como eliminado.
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Se conservan usuarios, permisos, catálogos, tasas de cambio,
                    entregas SAP y auditoría. Si necesitas recuperar los datos
                    eliminados, deberás reimportar el Excel; eso no recupera las
                    ediciones MANUAL borradas.
                  </p>
                  <label className="grid gap-2 text-sm font-medium">
                    Escribe {phrase} para confirmar
                    <input
                      className="t-input"
                      autoComplete="off"
                      value={confirmation}
                      disabled={saving}
                      onChange={(e) => setConfirmation(e.target.value)}
                    />
                  </label>
                </>
              )}
            </>
          )}
        </div>
        <AlertDialogFooter className="shrink-0 border-t bg-card px-6 py-4">
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <button
            className="t-button-primary bg-danger-vivid hover:bg-danger-vivid/90"
            disabled={
              (!plan?.files && !plan?.legacyOrphans) ||
              confirmation !== phrase ||
              saving ||
              loading
            }
            onClick={() => void remove()}
          >
            {saving ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Trash2 size={16} />
            )}{" "}
            {saving ? "Eliminando…" : "Confirmar eliminación"}
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
