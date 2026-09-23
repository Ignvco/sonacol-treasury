import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Search, SearchX } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { decisionService } from "@/services/decisionService";
import type { TreasuryRow } from "@/financial-engine/base-treasury";
import { SourceBreakdown, baseNumber } from "./SourceBreakdown";
import { cn } from "@/lib/utils";

export function GlobalSearch() {
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [rows, setRows] = useState<TreasuryRow[]>([]),
    [selected, setSelected] = useState<TreasuryRow | null>(null),
    [active, setActive] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const activeRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  useEffect(() => {
    let alive = true;
    if (!open) return;
    setLoading(q.length >= 2);
    const timer = setTimeout(() => {
      void decisionService
        .search(q)
        .then((r) => {
          if (alive) {
            setRows(r);
            setActive(0);
            setError("");
          }
        })
        .catch((e) => {
          if (alive) setError(e.message);
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, 200);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [q, open]);

  const openRow = useCallback((row: TreasuryRow) => {
    setOpen(false);
    setSelected(row);
  }, []);

  // ↑ ↓ recorren los resultados y Enter abre el resaltado: la búsqueda se usa
  // sin soltar el teclado.
  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (!rows.length) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (i + 1) % rows.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (i - 1 + rows.length) % rows.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      openRow(rows[active]);
    }
  };

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [active, rows]);

  return (
    <>
      <button
        className="t-button-secondary !p-2"
        aria-label="Buscar en BASE"
        title="Buscar · Ctrl/⌘ K"
        onClick={() => setOpen(true)}
      >
        <Search size={18} />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-auto">
          <DialogHeader>
            <DialogTitle>Buscar en BASE</DialogTitle>
            <DialogDescription>
              Documentos, clientes, bancos y MANUAL de la fecha de trabajo.
              Hasta 60 resultados.
            </DialogDescription>
          </DialogHeader>
          <input
            autoFocus
            className="t-input"
            aria-label="Buscar movimientos"
            placeholder="Cliente, documento o descripción…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKeyDown}
          />
          {loading ? (
            <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin text-brand" />
              Buscando…
            </p>
          ) : rows.length ? (
            <div className="grid gap-2" role="listbox" aria-label="Resultados">
              {rows.map((r, i) => (
                <button
                  key={r.kind + r.id}
                  ref={i === active ? activeRef : null}
                  role="option"
                  aria-selected={i === active}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    i === active
                      ? "border-brand/40 bg-brand-soft"
                      : "hover:bg-brand-soft/60",
                  )}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => openRow(r)}
                >
                  <p className="text-sm font-medium">
                    {r.description || r.document}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {r.origin} · {r.plannedDate} · {baseNumber(r.amount)}{" "}
                    {r.currency}
                  </p>
                </button>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
                <SearchX className="h-5 w-5" strokeWidth={1.8} />
              </span>
              <p className="text-[13px] font-semibold text-foreground">
                {q.length >= 2 ? "Sin resultados" : "Escribe para buscar"}
              </p>
              <p className="max-w-[320px] text-[12px] leading-relaxed text-muted-foreground">
                {q.length >= 2
                  ? "Ningún registro de la BASE activa coincide con tu búsqueda."
                  : "Busca por cliente, documento o descripción. Usa ↑ ↓ y Enter."}
              </p>
            </div>
          )}
          {error && (
            <p role="alert" className="text-[12px] font-medium text-danger">
              {error}
            </p>
          )}
        </DialogContent>
      </Dialog>
      {selected && (
        <SourceBreakdown
          title={selected.description}
          rows={[selected]}
          onClose={() => setSelected(null)}
        />
      )}
    </>
  );
}
