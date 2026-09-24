import { useEffect, useSyncExternalStore } from "react";
import { CalendarDays, Check, ChevronDown } from "lucide-react";
import { useAsyncData } from "@/hooks/use-async";
import { useAuth } from "@/contexts/auth-context";
import { baseTreasuryService } from "@/services/baseTreasuryService";
import { workingDate } from "@/services/workingDate";
import { formatDateMedium, formatDateShort } from "@/financial-engine/format";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

const DISCLAIMER =
  "BANCO, CLIENTES y COLOCACIONES: solo lectura. Edita tus ingresos y egresos en Proyecciones MANUAL.";
const HISTORICAL_NOTE =
  "Fecha histórica: los cambios en MANUAL afectan solo esta fecha. La caja actual se conserva.";

/** Shared state of the working date: which BASE version the user is reading. */
function useWorkingDate(initialize: boolean) {
  const { user } = useAuth();
  useEffect(() => {
    if (initialize && user?.id) workingDate.initialize(user.id);
  }, [user?.id, initialize]);
  useSyncExternalStore(workingDate.subscribe, workingDate.version);
  const { data, error, loading } = useAsyncData(() =>
    baseTreasuryService.batches(),
  );
  const selected = workingDate.batch(),
    historical = !!selected && selected !== data?.[0]?.id;
  useEffect(() => {
    if (
      !initialize ||
      loading ||
      error ||
      !data ||
      !selected ||
      data.some((b) => b.id === selected)
    )
      return;
    workingDate.select(null);
  }, [data, error, loading, selected, initialize]);
  useEffect(() => {
    if (!initialize) return;
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
  }, [initialize]);
  const active = selected ? data?.find((b) => b.id === selected) : data?.[0];
  const received = active?.created_at
    ? new Intl.DateTimeFormat("es-CL", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "America/Santiago",
      }).format(new Date(active.created_at))
    : "";
  return { data, error, selected, historical, active, received };
}

/** Working date in the shell header: the BASE version in use, one click away. */
export function WorkingDateChip() {
  const { data, error, selected, historical, active, received } =
    useWorkingDate(true);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="Fecha de trabajo"
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-2 rounded-xl border px-2.5 transition-colors",
            historical
              ? "border-warning/40 bg-warning-soft text-warning hover:border-warning/60"
              : "border-border bg-card text-foreground hover:border-brand/40 hover:text-brand",
          )}
        >
          <CalendarDays size={15} className="shrink-0" strokeWidth={1.9} />
          <span className="hidden text-left sm:block">
            <span className="block text-[12px] font-semibold leading-tight tabular-nums">
              {active ? formatDateShort(active.cutoff) : "Sin BASE"}
            </span>
            <span
              className={cn(
                "block text-[10px] leading-tight",
                historical ? "text-warning/85" : "text-muted-foreground",
              )}
            >
              {historical
                ? "Fecha histórica"
                : active
                  ? "Última BASE"
                  : "Sin datos"}
            </span>
          </span>
          <ChevronDown
            size={13}
            className={cn(
              "shrink-0",
              historical ? "text-warning/80" : "text-muted-foreground",
            )}
          />
        </button>
      </PopoverTrigger>

      <PopoverContent
        align="end"
        data-testid="working-date-menu"
        className="w-[min(92vw,24rem)] p-2"
      >
        <p className="px-2 pb-1 pt-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          Fecha de trabajo
        </p>

        <div className="max-h-[min(60vh,20rem)] overflow-y-auto">
          <button
            onClick={() => workingDate.select(null)}
            className={cn(
              "flex w-full items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-muted",
              !selected
                ? "bg-brand-soft font-semibold text-brand-dark"
                : "text-foreground",
            )}
          >
            <span className="min-w-0 truncate">
              Última BASE disponible
              {data?.[0] ? ` · ${formatDateMedium(data[0].cutoff)}` : ""}
            </span>
            {!selected && <Check className="h-3.5 w-3.5 shrink-0" />}
          </button>

          <div className="flex flex-col gap-0.5">
            {data?.map((b, index) => (
              <button
                key={b.id}
                onClick={() => workingDate.select(b.id)}
                className={cn(
                  "flex w-full items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted",
                  selected === b.id
                    ? "bg-brand-soft text-brand-dark"
                    : "text-foreground",
                )}
              >
                <span className="min-w-0">
                  <span
                    className={cn(
                      "block text-[13px] tabular-nums",
                      selected === b.id && "font-semibold",
                    )}
                  >
                    {formatDateMedium(b.cutoff)}
                    {index === 0 && (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        última
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {b.file_name}
                  </span>
                </span>
                {selected === b.id && (
                  <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                )}
              </button>
            ))}
            {!data?.length && (
              <p className="px-2 py-3 text-[12px] text-muted-foreground">
                Todavía no hay una BASE cargada. Súbela en Importaciones.
              </p>
            )}
          </div>
        </div>

        <p
          className={cn(
            "mt-2 border-t border-border px-2 pb-1 pt-2 text-[11px] leading-snug",
            error ? "text-danger" : "text-muted-foreground",
          )}
        >
          {error ??
            (active
              ? `Datos al ${formatDateMedium(active.cutoff)} · ${active.file_name}${
                  received ? ` · Cargado el ${received} (Chile)` : ""
                }`
              : DISCLAIMER)}
        </p>
        {!error && active && (
          <p className="px-2 pb-1 text-[11px] leading-snug text-muted-foreground">
            {historical ? HISTORICAL_NOTE : DISCLAIMER}
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}

/** Full working-date card: the explanatory version used in Configuración. */
export function WorkingDate({ settings = false }: { settings?: boolean }) {
  const { data, error, selected, historical, active, received } = useWorkingDate(
    !settings,
  );
  return (
    <section
      className={cn(
        "mb-5 flex min-w-0 flex-wrap items-center gap-3 rounded-xl border p-3",
        historical ? "border-warning/30 bg-warning-soft" : "bg-card",
      )}
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
        {error ?? (historical ? HISTORICAL_NOTE : DISCLAIMER)}
      </p>
    </section>
  );
}
