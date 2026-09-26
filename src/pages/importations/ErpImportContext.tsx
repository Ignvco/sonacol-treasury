import { useState } from "react";
import type { SheetOverride } from "@/import-engine/types";
import { validDate } from "@/import-engine/detect";

export function ErpImportContext({ initial, busy, firstBankDate, firstInvestmentDate, onDirty, onApply }: {
  initial?: SheetOverride; busy: boolean; firstBankDate?: string | null; firstInvestmentDate?: string | null; onDirty: () => void; onApply: (value: SheetOverride) => void;
}) {
  const [value, setValue] = useState<SheetOverride>({ company: "SONACOL", localCurrency: "CLP", ...initial });
  const update = (key: keyof SheetOverride, next: string) => { setValue(v => ({ ...v, [key]: next })); onDirty(); };
  const dates = [value.cutoffDate, value.periodStart, value.investmentPeriodStart];
  return <section className="mb-4 rounded-xl border p-4" aria-label="Cobertura de datos ERP">
    <h3 className="font-semibold">Cobertura de la exportación ERP</h3>
    <p className="mt-1 text-sm text-muted-foreground">Declara la fecha de los datos y el período de cada mayor. Las aperturas corresponden al día anterior al inicio. La última fila no acredita la fecha de extracción.</p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <label className="grid gap-1 text-sm">Empresa<input className="t-input" value={value.company} maxLength={100} disabled={busy} onChange={e => update("company", e.target.value)} /></label>
      <label className="grid gap-1 text-sm">Moneda local<select className="t-input" value={value.localCurrency} disabled={busy} onChange={e => update("localCurrency", e.target.value)}>{["CLP", "USD", "UF", "UTM"].map(c => <option key={c}>{c}</option>)}</select></label>
      {([["cutoffDate", "Fecha de corte ERP"], ["periodStart", "Inicio del mayor bancario"], ["investmentPeriodStart", "Inicio del mayor de inversiones"]] as const).map(([key, label]) => <label key={key} className="grid gap-1 text-sm">{label}<input type="date" className="t-input" min="2000-01-01" max="2100-12-31" value={value[key] ?? ""} disabled={busy} onChange={e => update(key, e.target.value)} /></label>)}
    </div>
    <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2">
      {([["periodStart", "bancos", firstBankDate], ["investmentPeriodStart", "inversiones", firstInvestmentDate]] as const).filter(([, , date]) => date).map(([key, name, date]) => <p key={key}>Primer movimiento de {name}: <strong>{date}</strong>. El inicio no puede ser posterior. <button type="button" className="text-brand underline" disabled={busy} onClick={() => update(key, date!)}>Usar {date} para {name}</button></p>)}
    </div>
    <p className="my-3 text-xs text-muted-foreground">Las monedas y cuentas no incluidas quedan fuera de esta fotografía; no se consideran saldos cero. MANUAL, ajustes y planificación se conservan.</p>
    <button className="t-button-secondary" disabled={busy || !value.company?.trim() || dates.some(d => !d || !validDate(d))} onClick={() => onApply(value)}>Aplicar cobertura y comparar</button>
  </section>;
}
