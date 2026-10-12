import { useState } from "react";
import { Link } from "react-router-dom";
import type { RawSnapshot } from "@/financial-engine/snapshot";
import { planningService } from "@/services/planningService";

/** Operating configuration and real pending business inputs, independent of a worked workbook. */
export function OperatingRules({ snapshot, canWrite }: { snapshot: RawSnapshot; canWrite: boolean }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const rules = (snapshot.business ?? []).filter(d => d.kind === "rule");
  const clientsWithoutBank = new Set(snapshot.rows.filter(r => r.kind === "invoice" && !r.normalized.settlementBank).map(r => r.normalized.customerCode));
  const unclassified = snapshot.rows.filter(r => r.kind === "cash_flow" && r.normalized.category === "unclassified").length;
  const missingRuleType = ["collection", "classification"].some(kind => !rules.some(d => d.values_json.ruleType === kind));
  const canInitialize = canWrite && missingRuleType && snapshot.batch?.id === snapshot.latestId && snapshot.rows.some(r => r.normalized.company === "SONACOL");
  const initialize = async () => {
    if (!snapshot.batch || busy) return;
    setBusy(true); setError("");
    try { await planningService.initializeRules(snapshot.batch.id); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudieron activar las reglas."); }
    finally { setBusy(false); }
  };
  return <section className="rounded-xl border bg-card p-4 text-sm" aria-label="Operación de caja">
    <p className="font-semibold">La plataforma construye tu caja con ERP y tus decisiones</p>
    <p className="mt-2 text-muted-foreground">La actualización ERP conserva tu plan de cobros, pagos, reglas y rescates. Incorpora la planificación inicial una vez y gestiona aquí sus cambios y ejecuciones; el flujo diario, el resumen y los reportes utilizan los importes pendientes.</p>
    <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2"><span>{rules.length} reglas activas</span><span>{clientsWithoutBank.size} clientes sin cuenta receptora</span><span>{unclassified} movimientos sin clasificar</span></div>
    {canInitialize && <div className="mt-3"><p className="mb-2">Puedes iniciar con cobranza a 5 días naturales y clasificación por descripción. Se incorporan los tipos de regla todavía sin configurar; tus reglas existentes se conservan.</p><button className="t-button-secondary" disabled={busy} onClick={() => void initialize()}>{busy ? "Activando…" : "Activar reglas iniciales"}</button></div>}
    {error && <p role="alert" className="mt-2 text-danger">{error}</p>}
    <div className="mt-4 flex flex-wrap gap-2"><Link className="t-button-secondary" to="/projections">Registrar compromisos y pagos</Link><Link className="t-button-secondary" to="/cashflow">Ver proyección diaria</Link><Link className="t-button-secondary" to="/reports">Ver reportes</Link></div>
  </section>;
}
