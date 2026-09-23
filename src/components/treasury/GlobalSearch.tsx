import { useEffect, useState } from "react";
import { Search } from "lucide-react";
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
export function GlobalSearch() {
  const [open, setOpen] = useState(false),
    [q, setQ] = useState(""),
    [rows, setRows] = useState<TreasuryRow[]>([]),
    [selected, setSelected] = useState<TreasuryRow | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
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
          />
          {loading ? (
            <p>Buscando…</p>
          ) : (
            <div className="grid gap-2">
              {rows.map((r) => (
                <button
                  className="rounded-xl border p-3 text-left hover:bg-brand-soft"
                  key={r.kind + r.id}
                  onClick={() => {
                    setOpen(false);
                    setSelected(r);
                  }}
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
              {q.length >= 2 && !rows.length && !error && (
                <p>Sin resultados.</p>
              )}
            </div>
          )}
          {error && <p role="alert">{error}</p>}
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
