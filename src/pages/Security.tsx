import { FxHistory } from "@/components/treasury/FxHistory";
import { useState } from "react";
import { useAuth, useCanWrite } from "@/contexts/auth-context";
import { useAsyncData } from "@/hooks/use-async";
import { treasuryRpc, decisionService } from "@/services/decisionService";
import { workingDate } from "@/services/workingDate";
import { PageHeader } from "@/components/treasury/PageHeader";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DataTable } from "@/components/treasury/DataTable";
import { LoadingState, ErrorState } from "@/components/treasury/feedback";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
interface Access {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  can_export: boolean;
  can_delete: boolean;
}
export default function Security() {
  const { user } = useAuth();
  const canWrite = useCanWrite();
  const admin = user?.role === "administrador";
  const state = useAsyncData(
    async () => ({
      access: admin
        ? await treasuryRpc<Access[]>("treasury_read", { p_kind: "access" })
        : [],
      workspace: await decisionService.workspace(),
      cutoff: (await decisionService.load()).bundle.cutoff,
    }),
    [admin],
  );
  const [editing, setEditing] = useState<Access | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  if (state.loading) return <LoadingState />;
  if (state.error) return <ErrorState message={state.error} />;
  if (!state.data) return null;
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      setEditing(null);
      workingDate.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-5">
      <PageHeader
        title="Seguridad y control"
        subtitle="Acceso explícito, acciones verificadas y responsabilidades claras."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          [
            "Sesión",
            user?.mfaLevel === "aal2"
              ? "Segundo factor verificado"
              : "Consulta autenticada",
          ],
          ["Exportaciones", user?.canExport ? "Autorizadas" : "Restringidas"],
          [
            "Eliminar Excel",
            user?.canDelete ? "Autorizado con revisión" : "Restringido",
          ],
        ].map(([label, value]) => (
          <SectionCard title={label} key={label}>
            <p className="text-sm font-medium">{value}</p>
          </SectionCard>
        ))}
      </div>
      <SectionCard title="Recuperación de acceso">
        <p className="text-sm text-muted-foreground">
          Si pierdes el autenticador, administración debe verificar tu identidad
          y gestionar la recuperación desde Supabase Auth. Nunca compartas
          códigos ni claves de recuperación. No se puede quitar el segundo
          factor desde una sesión sin verificar.
        </p>
      </SectionCard>
      {admin && (
        <>
          <SectionCard
            title="Usuarios y permisos"
            subtitle="Las cuentas nuevas esperan autorización. Otra persona administradora debe modificar tus propios permisos."
          >
            <DataTable
              data={state.data.access}
              rowKey={(u) => u.id}
              search
              searchText={(u) => u.name + " " + u.email}
              columns={[
                {
                  key: "name",
                  header: "Persona",
                  render: (u) => (
                    <>
                      <p>{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </>
                  ),
                  className: "!whitespace-normal",
                },
                { key: "role", header: "Rol" },
                {
                  key: "status",
                  header: "Acceso",
                  render: (u) =>
                    ({
                      approved: "Autorizado",
                      pending: "Pendiente",
                      revoked: "Revocado",
                    })[u.status],
                },
                {
                  key: "export",
                  header: "Exportar",
                  render: (u) => (u.can_export ? "Sí" : "No"),
                },
                {
                  key: "delete",
                  header: "Eliminar Excel",
                  render: (u) => (u.can_delete ? "Sí" : "No"),
                },
              ]}
              actions={(u) => (
                <button
                  className="t-button-secondary"
                  disabled={!canWrite || u.id === user?.id}
                  onClick={() => {
                    setEditing({ ...u });
                    setError("");
                  }}
                >
                  Revisar
                </button>
              )}
            />
          </SectionCard>
          <SectionCard title="Umbrales y antigüedad de fuentes">
            <form
              className="grid gap-4 sm:grid-cols-3"
              onSubmit={(e) => {
                e.preventDefault();
                const values = new FormData(e.currentTarget);
                void run(() =>
                  treasuryRpc("treasury_save_settings", {
                    p_minimums: Object.fromEntries(
                      ["CLP", "USD", "UF", "UTM"].map((c) => [
                        c,
                        Number(values.get(c)),
                      ]),
                    ),
                    p_stale_hours: Number(values.get("hours")),
                  }),
                );
              }}
            >
              {["CLP", "USD", "UF", "UTM"].map((c) => (
                <label className="grid gap-1 text-sm" key={c}>
                  Caja mínima {c}
                  <input
                    className="t-input"
                    name={c}
                    required
                    type="number"
                    min="0"
                    step="0.01"
                    defaultValue={Number(
                      state.data.workspace.settings.minimums[c] ?? 0,
                    )}
                  />
                </label>
              ))}
              <label className="grid gap-1 text-sm">
                Antigüedad máxima (horas)
                <input
                  className="t-input"
                  name="hours"
                  type="number"
                  min="1"
                  max="168"
                  required
                  defaultValue={state.data.workspace.settings.stale_hours}
                />
              </label>
              <button
                className="t-button-primary self-end"
                disabled={!canWrite || busy}
              >
                Guardar controles
              </button>
            </form>
          </SectionCard>
        </>
      )}
      {admin && <FxHistory cutoff={state.data.cutoff} />}
      {error && !editing && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      <Dialog
        open={!!editing}
        onOpenChange={(o) => {
          if (!o && !busy) setEditing(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Revisar acceso</DialogTitle>
            <DialogDescription>
              {editing?.name} · {editing?.email}. Los cambios se registran en la
              auditoría.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form
              className="grid gap-4"
              onSubmit={(e) => {
                e.preventDefault();
                void run(() =>
                  treasuryRpc("treasury_set_access", {
                    p_user: editing.id,
                    p_status: editing.status,
                    p_role: editing.role,
                    p_export: editing.can_export,
                    p_delete: editing.can_delete,
                  }),
                );
              }}
            >
              <label className="grid gap-1 text-sm">
                Acceso
                <select
                  className="t-input"
                  value={editing.status}
                  onChange={(e) =>
                    setEditing({ ...editing, status: e.target.value })
                  }
                >
                  <option value="pending">Pendiente</option>
                  <option value="approved">Autorizar</option>
                  <option value="revoked">Revocar</option>
                </select>
              </label>
              <label className="grid gap-1 text-sm">
                Rol
                <select
                  className="t-input"
                  value={editing.role}
                  onChange={(e) =>
                    setEditing({ ...editing, role: e.target.value })
                  }
                >
                  {[
                    "consulta",
                    "contabilidad",
                    "tesoreria",
                    "administrador",
                  ].map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </select>
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.can_export}
                  onChange={(e) =>
                    setEditing({ ...editing, can_export: e.target.checked })
                  }
                />
                Permitir exportaciones y descarga de adjuntos
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={editing.can_delete}
                  onChange={(e) =>
                    setEditing({ ...editing, can_delete: e.target.checked })
                  }
                />
                Permitir eliminar Excel (requiere rol de escritura)
              </label>
              {error && (
                <p role="alert" className="text-danger">
                  {error}
                </p>
              )}
              <button className="t-button-primary" disabled={busy}>
                Confirmar permisos
              </button>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
