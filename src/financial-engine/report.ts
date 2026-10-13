import { decisionModel, type DecisionContext } from "./decisions";
import { total, type TreasuryRow, type ForecastLink } from "./base-treasury";
import { bankControls } from "./bank-control";
import type { InvestmentMaturity } from "./types";
export function executiveReport(
  rows: TreasuryRow[],
  links: ForecastLink[],
  context: DecisionContext,
  source: { id: string; fileName: string; revision: string; warnings?: string[] },
) {
  const model = decisionModel(rows, links, context);
  const controls = bankControls(model.cashRows.map(r => ({ normalized: r.normalized ?? {}, row: r.row })));
  const summary = [
    {
      Métrica: "Saldo bancario real al corte",
      Valor: model.available,
      Moneda: context.currency,
    },
    ...(model.cutoffPosition ? [
      { Métrica: "Ingresos pendientes del corte", Valor: model.cutoffPosition.income, Moneda: context.currency },
      { Métrica: "Egresos pendientes del corte", Valor: model.cutoffPosition.expense, Moneda: context.currency },
      { Métrica: "Cierre previsto del corte", Valor: model.cutoffPosition.closing, Moneda: context.currency },
      { Métrica: "Caja prevista antes de colocar", Valor: model.cutoffPosition.beforePlacements, Moneda: context.currency },
      { Métrica: "Colocaciones pendientes del corte", Valor: model.cutoffPosition.placements, Moneda: context.currency },
      { Métrica: "Liquidez prevista tras colocaciones", Valor: model.cutoffPosition.closing, Moneda: context.currency },
    ] : []),
    ...(controls.length ? [
      { Métrica: "Ingresos bancarios registrados · Cargo", Valor: total(controls.map(c => c.income)), Moneda: context.currency },
      { Métrica: "Egresos bancarios registrados · Abono", Valor: total(controls.map(c => c.expense)), Moneda: context.currency },
    ] : []),
    {
      Métrica: "Saldo final previsto",
      Valor: model.projected,
      Moneda: context.currency,
    },
    {
      Métrica: "Saldo mínimo desde el corte",
      Valor: model.minimum,
      Moneda: context.currency,
    },
    {
      Métrica: "Cobros previstos",
      Valor: model.collections,
      Moneda: context.currency,
    },
    {
      Métrica: "Egresos previstos",
      Valor: model.payments,
      Moneda: context.currency,
    },
  ];
  const daily = model.days.map((d, i) => ({
    Fecha: d.date,
    "Saldo inicial": i === 0 ? model.available : model.days[i - 1].balance,
    Ingresos: d.income,
    Egresos: d.expense,
    "De los egresos: colocaciones": d.placements,
    "Antes de colocar": d.beforePlacements,
    Saldo: d.balance,
    Moneda: context.currency,
  }));
  const provenance = [...model.cashRows, ...model.events].map((r) => ({
    Origen: r.origin,
    Descripción: r.description,
    Documento: r.document,
    "Fecha de origen": r.date,
    "Fecha prevista": "effectiveDate" in r ? r.plannedDate : "",
    "Fecha del cálculo": "effectiveDate" in r ? String(r.effectiveDate) : r.date,
    "Corte de la carga": context.cutoff,
    Banco: r.bank,
    "Cuenta de origen": r.ledger,
    "Cuenta bancaria": r.kind === "cash_flow" ? r.ledger : r.settlementLedger ?? "",
    "Inicio de período ERP": String(r.normalized?.periodStart ?? ""),
    Tipo: r.normalized?.recordRole === "bank_opening" ? "Saldo de apertura; no es ingreso" : "effectiveDate" in r ? "Pendiente" : "Registrado",
    Cargo: r.normalized?.recordRole === "bank_movement" ? Number(r.normalized.debe) : "",
    Abono: r.normalized?.recordRole === "bank_movement" ? Number(r.normalized.haber) : "",
    Capital: r.type === "expense" ? -r.amount : r.amount,
    Interés: r.interest,
    Flujo:
      r.normalized?.recordRole === "bank_opening" ? "No es movimiento" : "signed" in r ? Number(r.signed) : (r.type === "expense" ? -r.amount : r.amount),
    Moneda: r.currency,
    Archivo: r.fileName,
    Hoja: String(r.normalized?.sourceSheet ?? "BASE"),
    Fila: r.row ?? "",
    Identificador: r.recordId ?? r.id,
  }));
  const warnings = [...new Set([...(source.warnings ?? []), ...model.issues, ...controls.flatMap(c => c.issues)])];
  const maturities = model.investedRows.flatMap(r => ((r.normalized?.maturityEntries ?? []) as InvestmentMaturity[]).map(e => ({
    Cuenta: e.ledger, Moneda: e.currency, Contabilización: e.operationDate || "No informada", Vencimiento: e.endDate || "No informado",
    "Importe original con signo": e.signedAmount, Origen: `${e.sourceSheet}!${e.sourceRow}`, Detalle: e.description,
    Alcance: "Mayor original; no capital remanente por vencimiento ni ingreso automático",
  })));
  return {
    title: "Informe ejecutivo de tesorería",
    subtitle: `Corte ${context.cutoff} · ${context.horizon} días · ${context.currency}`,
    context,
    source,
    model,
    summary,
    sections: [
      { title: "Resumen", rows: summary },
      { title: "Flujo diario", rows: daily },
      ...(model.cutoffPosition ? [{ title: "Posición al corte", rows: model.cutoffPosition.accounts.map(p => ({
        Banco: p.bank, Cuenta: p.ledger, Moneda: p.currency, "Saldo real": p.amount,
        "Ingresos pendientes": p.income, "Egresos pendientes": p.expense, "Cierre previsto": p.closing,
        "Antes de colocar": p.beforePlacements, "Colocaciones pendientes": p.placements,
      })) }] : []),
      ...(controls.length ? [{ title: "Control bancario", rows: controls.map(c => ({ Banco: c.bank, Cuenta: c.ledger, Moneda: c.currency, Desde: c.periodStart, Corte: c.cutoff, SaldoInicial: c.opening, Cargos: c.income, Abonos: c.expense, SaldoCalculado: c.calculated, SaldoInformado: c.reported ?? "No informado", Diferencia: c.difference ?? "No comprobable", Observaciones: c.issues.join(" · ") || (c.reported === null ? "Saldo calculado; referencia final no informada" : "Coincide") })) }] : []),
      { title: "Trazabilidad", rows: provenance },
      ...(maturities.length ? [{ title: "Vencimientos ERP", rows: maturities }] : []),
      ...(warnings.length ? [{ title: "Observaciones", rows: warnings.map(w => ({ Observación: w })) }] : []),
    ],
    warnings,
  };
}
