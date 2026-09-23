import { useAsyncData } from "@/hooks/use-async";
import { treasuryRpc } from "@/services/decisionService";
import { SectionCard } from "./SectionCard";
import { DataTable } from "./DataTable";
import { StatusBadge } from "./StatusBadge";
interface Run {
  id: string;
  source: string;
  status: string;
  code: string;
  started_at: string;
  finished_at: string | null;
}
export function OperationsHealth() {
  const { data, error, loading } = useAsyncData(() =>
    treasuryRpc<{ runs: Run[]; recentErrors: number }>("treasury_health"),
  );
  return (
    <SectionCard
      title="Salud de las operaciones"
      subtitle="Ejecuciones verificadas del receptor SAP, respaldo y restauración."
    >
      {loading ? (
        <p className="text-sm">Consultando…</p>
      ) : error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : (
        data && (
          <>
            <p className="mb-3 text-xs text-muted-foreground">
              {data.recentErrors} errores de aplicación reportados en 24 horas.
              Las tareas sin ejecuciones registradas están pendientes de
              configurar.
            </p>
            <DataTable<Run>
              data={data.runs}
              rowKey={(r) => r.id}
              columns={[
                { key: "source", header: "Operación" },
                {
                  key: "started_at",
                  header: "Inicio",
                  render: (r) => new Date(r.started_at).toLocaleString("es-CL"),
                },
                {
                  key: "status",
                  header: "Estado",
                  render: (r) => (
                    <StatusBadge
                      label={
                        r.status === "success"
                          ? "Verificada"
                          : r.status === "error"
                            ? "Falló"
                            : Date.now() - new Date(r.started_at).getTime() >
                                900000
                              ? "Sin confirmación"
                              : "En curso"
                      }
                      tone={
                        r.status === "success"
                          ? "success"
                          : r.status === "error"
                            ? "danger"
                            : "warning"
                      }
                    />
                  ),
                },
                {
                  key: "code",
                  header: "Detalle",
                  className: "!whitespace-normal",
                },
              ]}
            />
          </>
        )
      )}
    </SectionCard>
  );
}
