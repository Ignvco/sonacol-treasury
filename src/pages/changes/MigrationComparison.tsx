import { useState } from "react";
import { useAsyncData } from "@/hooks/use-async";
import { baseTreasuryService } from "@/services/baseTreasuryService";
import { decisionService } from "@/services/decisionService";
import { compareMigration } from "@/financial-engine/migration-comparison";
import type { RawSnapshot } from "@/financial-engine/snapshot";
import { SectionCard } from "@/components/treasury/SectionCard";
import { DataTable } from "@/components/treasury/DataTable";
import { baseNumber } from "@/components/treasury/SourceBreakdown";

export function MigrationComparison({ snapshot }: { snapshot: RawSnapshot }) {
  const batches = useAsyncData(() => baseTreasuryService.batches());
  const [reference, setReference] = useState(""), [horizon, setHorizon] = useState(30);
  const currency = snapshot.coverage?.currency ?? "CLP";
  const state = useAsyncData(() => reference ? decisionService.snapshot(reference) : Promise.resolve(null), [reference]);
  const result = reference && !state.loading && state.data ? compareMigration(state.data, snapshot, currency, horizon) : null;
  return <SectionCard title="Comparación diaria con CAJA" subtitle={`Moneda ${currency} · mismo corte · diferencias = plataforma menos CAJA. No modifica datos ni adelanta fechas de extracción.`}>
    <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto]"><label className="grid gap-1 text-sm">Carga CAJA de referencia<select className="t-input min-w-0" value={reference} onChange={e => setReference(e.target.value)}><option value="">Selecciona una carga histórica</option>{batches.data?.filter(b => b.id !== snapshot.batch?.id).map(b => <option key={b.id} value={b.id}>{b.cutoff} · {b.file_name}</option>)}</select></label><label className="grid gap-1 text-sm">Horizonte<select className="t-input" value={horizon} onChange={e => setHorizon(Number(e.target.value))}>{[30, 60, 90].map(d => <option key={d} value={d}>{d} días</option>)}</select></label></div>
    {(batches.error || state.error) && <p role="alert" className="text-sm text-danger">{batches.error || state.error}</p>}
    {reference && state.loading && <p className="text-sm">Cargando referencia…</p>}
    {result && <>
      {!!result.blocks.length && <ul className="list-disc pl-5 text-sm text-warning">{result.blocks.map(b => <li key={b}>{b}</li>)}</ul>}
      {!!result.warnings.length && <details className="mb-3 text-sm"><summary>Revisiones pendientes ({result.warnings.length})</summary><ul className="list-disc pl-5">{result.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></details>}
      {!result.blocks.length && <>
        <p className="mb-3 text-sm">Diferencia de caja inicial: <strong>{baseNumber(result.openingDelta!)} {currency}</strong> · Máxima diferencia de saldo: <strong>{baseNumber(result.maxDifference!)} {currency}</strong>{result.numericallyEqual ? " · Coincidencia numérica en este corte y moneda." : " · Requiere revisión."}</p>
        <DataTable data={result.days} rowKey={d => d.date} pageSize={7} columns={[
          { key: "date", header: "Día", render: d => d.date },
          { key: "reference", header: "Saldo CAJA", render: d => baseNumber(d.reference) },
          { key: "current", header: "Saldo plataforma", render: d => baseNumber(d.current) },
          { key: "delta", header: "Δ saldo", render: d => baseNumber(d.delta) },
          { key: "collections", header: "Δ cobros del día", render: d => baseNumber(d.collections) },
          { key: "redemptions", header: "Δ rescates del día", render: d => baseNumber(d.redemptions) },
          { key: "manual", header: "Δ manual del día", render: d => baseNumber(d.manual) },
        ]} />
        <details className="mt-4"><summary className="cursor-pointer text-sm font-medium">Movimientos que explican diferencias ({result.changes.length})</summary><DataTable data={result.changes} rowKey={d => d.id} pageSize={6} columns={[
          { key: "label", header: "Documento / movimiento", className: "!whitespace-normal", render: d => `${d.label} · ${d.before?.document || d.after?.document || ""}` },
          { key: "reason", header: "Diferencia", className: "!whitespace-normal", render: d => d.reason },
          { key: "before", header: "CAJA: fecha / importe", render: d => d.before ? `${d.before.effectiveDate} · ${baseNumber(d.before.signed)}` : "—" },
          { key: "after", header: "Plataforma: fecha / importe", render: d => d.after ? `${d.after.effectiveDate} · ${baseNumber(d.after.signed)}` : "—" },
        ]} /></details>
      </>}
    </>}
  </SectionCard>;
}
