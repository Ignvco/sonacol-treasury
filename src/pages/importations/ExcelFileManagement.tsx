import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/auth-context";
import { SectionCard } from "@/components/treasury/SectionCard";
import type { ImportBatch } from "@/financial-engine/types";

export function ExcelFileManagement({
  batches,
  loading,
  error,
  busy,
  canDelete,
  onDelete,
}: {
  batches: ImportBatch[];
  loading: boolean;
  error: string | null;
  busy: boolean;
  canDelete: boolean;
  onDelete: (target: { id: string; fileName: string } | null) => void;
}) {
  const { refreshProfile } = useAuth();
  const [selectedId, setSelectedId] = useState("");
  const [checking, setChecking] = useState(false);
  const [accessError, setAccessError] = useState("");
  const files = batches.filter((batch) => batch.source === "excel");
  const selected = files.find((file) => file.id === selectedId);
  const unavailable = !canDelete || busy || loading || !!error || checking;
  const refreshAccess = async () => {
    setChecking(true);
    setAccessError("");
    try {
      await refreshProfile();
    } catch (e) {
      setAccessError(
        e instanceof Error ? e.message : "No se pudieron actualizar tus permisos.",
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <section id="excel-file-management" aria-label="Administrar archivos Excel">
      <SectionCard
        title="Administrar archivos Excel"
        subtitle="Elimina un archivo o vacía las importaciones. Las cifras se actualizarán con la BASE restante."
      >
        {!canDelete && (
          <p className="mb-4 rounded-xl border border-warning/25 bg-warning-soft p-3 text-sm text-warning">
            Tu cuenta no tiene habilitado el permiso «Eliminar Excel».
            Administración puede habilitarlo en Seguridad y control → Usuarios y
            permisos. Después, pulsa Actualizar permisos.
          </p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-0 flex-1 basis-64 gap-2 text-sm font-medium">
            Excel a eliminar
            <select
              className="t-input w-full min-w-0"
              value={selected?.id ?? ""}
              disabled={loading || !!error || busy || checking || !files.length}
              onChange={(event) => setSelectedId(event.target.value)}
            >
              <option value="">
                {loading
                  ? "Cargando archivos…"
                  : files.length
                    ? "Selecciona un archivo"
                    : "Sin archivos Excel disponibles"}
              </option>
              {files.map((file) => (
                <option key={file.id} value={file.id}>
                  {file.fileName} · Cargado el{" "}
                  {new Date(file.createdAt).toLocaleString("es-CL", {
                    timeZone: "America/Santiago",
                  })}
                </option>
              ))}
            </select>
          </label>
          <button
            className="t-button-secondary text-danger"
            disabled={unavailable || !selected}
            onClick={() => {
              if (selected && !unavailable)
                onDelete({ id: selected.id, fileName: selected.fileName });
            }}
          >
            <Trash2 size={16} /> Eliminar archivo
          </button>
          <button
            className="t-button-secondary text-danger"
            disabled={unavailable}
            onClick={() => {
              if (!unavailable) onDelete(null);
            }}
          >
            <Trash2 size={16} /> Vaciar Excel
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-3 text-sm text-danger">
            No se pudieron cargar los archivos. Actualiza el historial antes de
            eliminar.
          </p>
        )}
        <div className="mt-4 flex flex-wrap items-center gap-3 text-xs">
          <Link to="/security" className="text-brand underline">
            Ver permisos de eliminación
          </Link>
          <button
            className="t-button-secondary"
            disabled={checking || busy}
            onClick={() => void refreshAccess()}
          >
            {checking ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <RefreshCw size={14} />
            )}
            {checking ? "Revisando permisos…" : "Actualizar permisos"}
          </button>
        </div>
        {accessError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {accessError}
          </p>
        )}
      </SectionCard>
    </section>
  );
}
