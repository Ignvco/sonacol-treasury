import { useState } from "react";
import { toast } from "sonner";
import { useAsyncData } from "@/hooks/use-async";
import { treasuryRpc } from "@/services/decisionService";
import { workingDate } from "@/services/workingDate";
import { useCanWrite } from "@/contexts/auth-context";
import { SectionCard } from "./SectionCard";
import { DataTable } from "./DataTable";
interface Rate {
  id: string;
  currency: string;
  rate_to_clp: number;
  effective_date: string;
  source: string;
}
export function FxHistory({ cutoff }: { cutoff: string }) {
  const state = useAsyncData(
    () => treasuryRpc<Rate[]>("treasury_fx_rates", { p_cutoff: cutoff }),
    [cutoff],
  );
  const canWrite = useCanWrite();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <SectionCard
      title="Tasas con fecha y fuente"
      subtitle={
        "Última tasa vigente al " +
        cutoff +
        ". CLP conserva valor 1. Las tasas futuras no cambian cortes anteriores."
      }
    >
      <DataTable
        data={state.data ?? []}
        rowKey={(r) => r.id}
        columns={[
          { key: "currency", header: "Moneda" },
          { key: "rate_to_clp", header: "Valor en CLP" },
          { key: "effective_date", header: "Vigencia" },
          { key: "source", header: "Fuente", className: "!whitespace-normal" },
        ]}
      />
      <form
        className="mt-5 grid gap-3 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget,
            values = new FormData(form);
          setBusy(true);
          setError("");
          void treasuryRpc("treasury_set_fx", {
            p_currency: values.get("currency"),
            p_rate: Number(values.get("rate")),
            p_date: values.get("date"),
            p_source: values.get("source"),
          })
            .then(() => {
              workingDate.refresh();
              toast.success("Tasa registrada con su vigencia");
              form.reset();
            })
            .catch((e) =>
              setError(
                e instanceof Error
                  ? e.message
                  : "No se pudo registrar la tasa.",
              ),
            )
            .finally(() => setBusy(false));
        }}
      >
        <label className="grid gap-1 text-sm">
          Moneda de la tasa
          <select className="t-input" name="currency">
            {["USD", "UF", "UTM"].map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-sm">
          Valor de una unidad en CLP
          <input
            className="t-input"
            name="rate"
            type="number"
            min="0.000001"
            max="999999999999"
            step="any"
            required
          />
        </label>
        <label className="grid gap-1 text-sm">
          Fecha de vigencia
          <input
            className="t-input"
            name="date"
            type="date"
            required
            defaultValue={cutoff}
          />
        </label>
        <label className="grid gap-1 text-sm">
          Fuente verificable
          <input
            className="t-input"
            name="source"
            required
            minLength={3}
            maxLength={200}
            placeholder="Publicación o referencia del dato"
          />
        </label>
        <button
          className="t-button-primary justify-self-start"
          disabled={!canWrite || busy}
        >
          Registrar tasa
        </button>
      </form>
      {(error || state.error) && (
        <p role="alert" className="mt-3 text-danger">
          {error || state.error}
        </p>
      )}
    </SectionCard>
  );
}
