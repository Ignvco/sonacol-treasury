import { Link } from "react-router-dom";
import { useAsyncData } from "@/hooks/use-async";
import { baseTreasuryService } from "@/services/baseTreasuryService";

/** Keep omitted currencies and unresolved decisions visible across financial views. */
export function ErpCoverageNotice() {
  const { data } = useAsyncData(() => baseTreasuryService.load(), []);
  if (!data?.rows.some(r => r.normalized?.sourceProfile === "ERP-RAW-v1")) return null;
  return <aside aria-label="Cobertura y planificación ERP" className="mb-4 rounded-xl border border-brand/20 bg-brand-soft px-4 py-3 text-sm">
    <p>{data.warning}</p>
    <Link className="mt-1 inline-block text-brand underline" to="/planning">Revisar planificación y reglas</Link>
  </aside>;
}
