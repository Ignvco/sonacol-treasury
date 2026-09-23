import { useEffect, useSyncExternalStore } from "react";
import { CalendarDays } from "lucide-react";
import { useAsyncData } from "@/hooks/use-async";
import { useAuth } from "@/contexts/auth-context";
import { baseTreasuryService } from "@/services/baseTreasuryService";
import { workingDate } from "@/services/workingDate";
import { formatDateMedium } from "@/financial-engine/format";
export function WorkingDate({ settings = false }: { settings?: boolean }) {
  const { user } = useAuth();
  useEffect(() => {
    if (!settings && user?.id) workingDate.initialize(user.id);
  }, [user?.id, settings]);
  useSyncExternalStore(workingDate.subscribe, workingDate.version);
  const { data, error, loading } = useAsyncData(() =>
    baseTreasuryService.batches(),
  );
  const selected = workingDate.batch(),
    historical = !!selected && selected !== data?.[0]?.id;
  useEffect(() => {
    if (settings) return;
    if (
      !loading &&
      !error &&
      data &&
      selected &&
      !data.some((b) => b.id === selected)
    )
      workingDate.select(null);
  }, [data, error, loading, selected, settings]);
  useEffect(() => {
    if (settings) return;
    const refresh = () => workingDate.refresh();
    const storage = (event: StorageEvent) => {
      if (event.key === "sonacol.imports-changed") refresh();
    };
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", storage);
    };
  }, [settings]);
  const active = selected ? data?.find((b) => b.id === selected) : data?.[0];
  const received = active?.created_at
    ? new Intl.DateTimeFormat("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Santiago",
      }).format(new Date(active.created_at))
    : "";
  return (
    <section
      className={`mb-5 flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-3 ${historical ? "border-amber-300 bg-amber-50" : "bg-white"}`}
      aria-label={settings ? "BASE en Configuración" : "Selección de fecha"}
    >
      <CalendarDays size={18} className="shrink-0 text-brand" />
      <label className="flex min-w-0 flex-1 flex-wrap items-center gap-2 text-sm font-medium">
        {settings ? "BASE de consulta" : "Fecha de trabajo"}
        <select
          className="t-input min-w-0 max-w-full flex-1 sm:max-w-xl"
          value={selected ?? ""}
          onChange={(e) => workingDate.select(e.target.value || null)}
        >
          <option value="">
            Última BASE disponible{data?.[0] ? " · " + data[0].cutoff : ""}
          </option>
          {data?.map((b) => (
            <option key={b.id} value={b.id}>
              {b.cutoff} · {b.file_name}
            </option>
          ))}
        </select>
      </label>
      {active && (
        <p className="w-full break-words text-xs text-muted-foreground">
          Datos al {formatDateMedium(active.cutoff)} · {active.file_name}
          {received ? " · Cargado el " + received + " (Chile)" : ""}
        </p>
      )}
      {settings && (
        <p className="w-full text-sm">
          La selección se aplica a toda la plataforma para tu usuario en este
          navegador. Última BASE disponible sigue la versión más reciente. Una
          versión histórica muestra solo sus datos, sin sumarlos a otras cargas.
        </p>
      )}
      <p className="w-full text-xs text-muted-foreground">
        {error ??
          (historical
            ? "Fecha histórica: los cambios en MANUAL afectan solo esta fecha. La caja actual se conserva."
            : "BANCO, CLIENTES y COLOCACIONES: solo lectura. Edita tus ingresos y egresos en Proyecciones MANUAL.")}
      </p>
    </section>
  );
}
