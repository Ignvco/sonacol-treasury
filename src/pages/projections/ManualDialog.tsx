import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  CURRENCIES,
  CASHFLOW_CATEGORY_LABEL,
  INCOME_CATEGORIES,
  EXPENSE_CATEGORIES,
  PROJECTION_STATUS_LABEL,
  type Projection,
} from "@/financial-engine/types";
import { useAsyncData } from "@/hooks/use-async";
import {
  decisionService,
  treasuryRpc,
  type ManualDetails,
} from "@/services/decisionService";
import { workingDate } from "@/services/workingDate";
import { decisionModel, recurrenceDates } from "@/financial-engine/decisions";
import { baseNumber } from "@/components/treasury/SourceBreakdown";
import { useAuth } from "@/contexts/auth-context";
export function ManualDialog({
  initial,
  batchId,
  date,
  banks,
  onClose,
  duplicate = false,
  suggestedDate,
}: {
  initial: Projection | null;
  batchId: string;
  date: string;
  banks: string[];
  onClose: () => void;
  duplicate?: boolean;
  suggestedDate?: string;
}) {
  const existing = !!initial && !duplicate;
  const { user } = useAuth();
  const [refresh, setRefresh] = useState(0);
  const state = useAsyncData(() => decisionService.load(), [refresh]);
  const [form, setForm] = useState<Omit<Projection, "id"> & { id?: string }>(
    initial
      ? {
          ...initial,
          id: duplicate ? undefined : initial.id,
          date: suggestedDate ?? initial.date,
          description: duplicate
            ? initial.description + " (copia)"
            : initial.description,
        }
      : {
          batchId,
          date,
          type: "income",
          category: "collection",
          amount: 0,
          currency: "CLP",
          description: "",
          status: "proyectado",
          bankId: "",
        },
  );
  const [amount, setAmount] = useState(initial ? String(initial.amount) : ""),
    [details, setDetails] = useState<Partial<ManualDetails>>({}),
    [frequency, setFrequency] = useState(""),
    [count, setCount] = useState(1),
    [comment, setComment] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current || !state.data) return;
    initialized.current = true;
    if (existing) {
      const d = state.data.workspace.details.find(
        (d) => d.manual_id === initial?.id,
      );
      if (d && !suggestedDate && d.estimated_date)
        setForm((f) => ({ ...f, date: d.estimated_date! }));
      if (d)
        setDetails({
          ...d,
          confirmed_date: suggestedDate ? null : d.confirmed_date,
        });
    }
  }, [state.data, existing, initial?.id, suggestedDate]);
  const update = (value: Partial<Projection>) =>
    setForm((f) => ({ ...f, ...value }));
  const categories =
    form.type === "income" ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo completar.");
    } finally {
      setBusy(false);
    }
  };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    await run(async () => {
      await treasuryRpc("treasury_save_manual", {
        p_batch: batchId,
        p_id: existing ? initial!.id : null,
        p_revision: existing ? initial!.revision : null,
        p_values: {
          date: form.date,
          type: form.type,
          amount: Number(amount),
          currency: form.currency,
          description: form.description,
          category: form.category,
          status: form.status,
          bank: form.bankId || "Sin banco",
        },
        p_details: details,
        p_frequency: frequency || null,
        p_count: existing || !frequency ? 1 : count,
      });
      onClose();
      workingDate.refresh();
    });
  };
  const effectiveDate = details.confirmed_date || form.date;
  let occurrenceDates: string[] = [];
  try {
    if (frequency && !existing)
      occurrenceDates = recurrenceDates(
        effectiveDate,
        frequency as "weekly" | "monthly",
        count,
      );
  } catch {
    /* Form validation displays invalid dates. */
  }
  let impact: { before: number; after: number } | null = null;
  try {
    if (state.data && Number(amount) > 0) {
      const bundle = state.data.bundle,
        ctx = {
          cutoff: bundle.cutoff,
          currency: form.currency,
          horizon: 30,
          minimum: 0,
        };
      const before = decisionModel(bundle.rows, bundle.links, ctx);
      const template = bundle.rows.find(
        (r) => r.id === initial?.id && r.kind === "projection",
      );
      const dates = occurrenceDates.length ? occurrenceDates : [effectiveDate];
      const next = bundle.rows.filter(
        (r) => !(existing && r.id === initial?.id && r.kind === "projection"),
      );
      for (const [i, d] of dates.entries())
        next.push({
          ...template,
          id: existing ? initial!.id : "preview-" + i,
          kind: "projection",
          origin: "MANUAL",
          inLatest: true,
          type: form.type,
          amount: Number(amount),
          currency: form.currency,
          date: d,
          plannedDate: d,
          status: form.status,
          bank: form.bankId || "Sin banco",
          description: form.description,
          ledger: "",
          document: "",
          customer: "",
          interest: 0,
          cutoff: bundle.cutoff,
          fileName: "Vista previa",
          row: null,
          recordId: null,
        });
      impact = {
        before: before.minimum,
        after: decisionModel(next, bundle.links, ctx).minimum,
      };
    }
  } catch {
    /* Incomplete form: do not show a fabricated preview. */
  }
  const upload = async (file: File) =>
    run(async () => {
      if (
        file.size > 2 * 1024 * 1024 ||
        !["application/pdf", "image/png", "image/jpeg", "text/plain"].includes(
          file.type,
        )
      )
        throw new Error("Adjunta PDF, PNG, JPG o TXT de hasta 2 MB.");
      const bytes = new Uint8Array(await file.arrayBuffer());
      let binary = "";
      for (let i = 0; i < bytes.length; i += 8192)
        binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      await treasuryRpc("treasury_attach", {
        p_batch: batchId,
        p_manual: initial!.id,
        p_name: file.name,
        p_mime: file.type,
        p_content: btoa(binary),
      });
      setRefresh((n) => n + 1);
    });
  const download = async (id: string) =>
    run(async () => {
      const a = await treasuryRpc<{ name: string; content: string }>(
        "treasury_attachment",
        { p_id: id },
      );
      if (!a) throw new Error("Adjunto no disponible.");
      const bytes = Uint8Array.from(atob(a.content.replace(/\s/g, "")), (c) =>
        c.charCodeAt(0),
      );
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/octet-stream" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = a.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {existing
              ? "Editar proyección MANUAL"
              : duplicate
                ? "Duplicar proyección MANUAL"
                : "Nueva proyección MANUAL"}
          </DialogTitle>
          <DialogDescription>
            Fecha de trabajo: {date}. Cada ocurrencia recurrente puede
            modificarse de forma independiente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              Tipo
              <select
                className="t-input"
                value={form.type}
                onChange={(e) =>
                  update({
                    type: e.target.value as Projection["type"],
                    category:
                      e.target.value === "income" ? "collection" : "supplier",
                  })
                }
              >
                <option value="income">Ingreso</option>
                <option value="expense">Egreso</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Fecha estimada
              <input
                className="t-input min-w-0"
                type="date"
                required
                value={form.date}
                onChange={(e) => update({ date: e.target.value })}
              />
            </label>
          </div>
          <label className="grid gap-1 text-sm">
            Descripción
            <input
              className="t-input"
              required
              maxLength={500}
              value={form.description}
              onChange={(e) => update({ description: e.target.value })}
            />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">
              Importe
              <input
                className="t-input min-w-0"
                type="number"
                min="0.01"
                step="0.01"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Moneda
              <select
                className="t-input"
                value={form.currency}
                onChange={(e) =>
                  update({ currency: e.target.value as Projection["currency"] })
                }
              >
                {CURRENCIES.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Vencimiento
              <input
                className="t-input min-w-0"
                type="date"
                value={details.due_date ?? ""}
                onChange={(e) =>
                  setDetails({ ...details, due_date: e.target.value || null })
                }
              />
            </label>
            <label className="grid gap-1 text-sm">
              Fecha confirmada
              <input
                className="t-input min-w-0"
                type="date"
                value={details.confirmed_date ?? ""}
                onChange={(e) =>
                  setDetails({
                    ...details,
                    confirmed_date: e.target.value || null,
                  })
                }
              />
            </label>
          </div>
          <p className="text-xs text-muted-foreground">
            La fecha confirmada tiene prioridad en el flujo. El vencimiento se
            conserva como referencia.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm">
              Categoría
              <select
                className="t-input"
                value={form.category}
                onChange={(e) =>
                  update({ category: e.target.value as Projection["category"] })
                }
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {CASHFLOW_CATEGORY_LABEL[c]}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Banco
              <select
                className="t-input"
                value={form.bankId ?? ""}
                onChange={(e) => update({ bankId: e.target.value })}
              >
                <option value="">Sin banco</option>
                {[
                  ...new Set([...banks, ...(form.bankId ? [form.bankId] : [])]),
                ].map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Estado
              <select
                className="t-input"
                value={form.status}
                onChange={(e) =>
                  update({ status: e.target.value as Projection["status"] })
                }
              >
                {Object.entries(PROJECTION_STATUS_LABEL).map(([s, label]) => (
                  <option key={s} value={s}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm">
              Responsable
              <select
                className="t-input"
                value={details.assignee ?? ""}
                onChange={(e) =>
                  setDetails({ ...details, assignee: e.target.value || null })
                }
              >
                <option value="">Sin asignar</option>
                {state.data?.members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {!existing && (
            <div className="grid grid-cols-2 gap-3">
              <label className="grid gap-1 text-sm">
                Repetición
                <select
                  className="t-input"
                  value={frequency}
                  onChange={(e) => setFrequency(e.target.value)}
                >
                  <option value="">Una vez</option>
                  <option value="weekly">Semanal</option>
                  <option value="monthly">Mensual</option>
                </select>
              </label>
              {frequency && (
                <label className="grid gap-1 text-sm">
                  Ocurrencias
                  <input
                    className="t-input"
                    type="number"
                    min="1"
                    max="60"
                    required
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                  />
                </label>
              )}
            </div>
          )}
          {!!occurrenceDates.length && (
            <p className="text-xs text-muted-foreground">
              {occurrenceDates.length} movimientos: {occurrenceDates[0]} a{" "}
              {occurrenceDates[occurrenceDates.length - 1]}. Los meses cortos
              usan su último día.
            </p>
          )}
          {impact && (
            <div className="rounded-xl bg-brand-soft p-3 text-sm">
              <p className="font-medium">
                Vista previa · menor caja en 30 días
              </p>
              <p>
                {baseNumber(impact.before)} → {baseNumber(impact.after)}{" "}
                {form.currency}
              </p>
              <p className="text-xs">
                El cambio se aplica al confirmar Guardar proyección.
              </p>
            </div>
          )}
          {state.error && (
            <p role="alert" className="text-danger">
              {state.error}
            </p>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-xl bg-danger-soft p-3 text-sm text-danger"
            >
              {error}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              className="t-button-secondary"
              disabled={busy}
              onClick={onClose}
            >
              Cancelar
            </button>
            <button
              className="t-button-primary"
              disabled={busy || state.loading || !!state.error}
            >
              {busy ? "Guardando…" : "Guardar proyección"}
            </button>
          </div>
        </form>
        {existing && (
          <section className="mt-2 grid gap-3 border-t pt-4">
            <h3 className="text-sm font-semibold">Comentarios y respaldos</h3>
            {state.data?.workspace.comments
              .filter((c) => c.manual_id === initial!.id)
              .map((c) => (
                <div className="rounded-xl bg-sunken p-3 text-sm" key={c.id}>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {state.data?.members.find((m) => m.id === c.author)?.name ??
                      "Usuario"}{" "}
                    · {new Date(c.created_at).toLocaleString("es-CL")}
                  </p>
                </div>
              ))}
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void run(async () => {
                  await treasuryRpc("treasury_comment", {
                    p_batch: batchId,
                    p_manual: initial!.id,
                    p_body: comment,
                  });
                  setComment("");
                  setRefresh((n) => n + 1);
                });
              }}
            >
              <input
                className="t-input min-w-0 flex-1"
                aria-label="Comentario"
                required
                maxLength={2000}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Añade contexto para tu equipo"
              />
              <button className="t-button-secondary" disabled={busy}>
                Comentar
              </button>
            </form>
            {state.data?.workspace.attachments
              .filter((a) => a.manual_id === initial!.id)
              .map((a) => (
                <button
                  className="text-left text-sm text-brand disabled:text-muted-foreground"
                  key={a.id}
                  disabled={!user?.canExport || busy}
                  onClick={() => void download(a.id)}
                >
                  {a.name} · {Math.ceil(a.size / 1024)} KB
                </button>
              ))}
            <label className="grid gap-1 text-xs">
              Adjuntar PDF, PNG, JPG o TXT · 2 MB máximo
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.txt"
                disabled={busy}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void upload(file);
                  e.target.value = "";
                }}
              />
            </label>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
