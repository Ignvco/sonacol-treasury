import { decisionModel, type DecisionContext } from "./decisions";
import type { TreasuryRow, ForecastLink } from "./base-treasury";
export function executiveReport(
  rows: TreasuryRow[],
  links: ForecastLink[],
  context: DecisionContext,
  source: { id: string; fileName: string; revision: string },
) {
  const model = decisionModel(rows, links, context);
  const summary = [
    {
      Métrica: "Caja disponible",
      Valor: model.available,
      Moneda: context.currency,
    },
    {
      Métrica: "Saldo final previsto",
      Valor: model.projected,
      Moneda: context.currency,
    },
    {
      Métrica: "Saldo mínimo previsto",
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
  const daily = model.days.map((d) => ({
    Fecha: d.date,
    Ingresos: d.income,
    Egresos: d.expense,
    Saldo: d.balance,
    Moneda: context.currency,
  }));
  const provenance = [...model.cashRows, ...model.events].map((r) => ({
    Origen: r.origin,
    Descripción: r.description,
    Documento: r.document,
    Fecha: r.kind === "cash_flow" ? r.date : r.plannedDate,
    Capital: r.type === "expense" ? -r.amount : r.amount,
    Interés: r.interest,
    Flujo:
      (r.type === "expense" ? -r.amount : r.amount) +
      (r.kind === "cash_flow" ? 0 : r.interest),
    Moneda: r.currency,
    Archivo: r.fileName,
    Fila: r.row ?? "",
    Identificador: r.recordId ?? r.id,
  }));
  return {
    title: "Informe ejecutivo de tesorería",
    subtitle: `Corte ${context.cutoff} · ${context.horizon} días · ${context.currency}`,
    context,
    source,
    model,
    sections: [
      { title: "Resumen", rows: summary },
      { title: "Flujo diario", rows: daily },
      { title: "Trazabilidad", rows: provenance },
    ],
    warnings: model.issues,
  };
}
