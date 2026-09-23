import { decisionModel, cashBridge, type DecisionContext } from "./decisions";
import type { TreasuryRow, ForecastLink } from "./base-treasury";
export const ASSISTANT_TOOLS = [
  "cash",
  "risk",
  "collections",
  "payments",
  "changes",
  "overdue",
  "help",
] as const;
export type AssistantTool = (typeof ASSISTANT_TOOLS)[number];
export const ASSISTANT_PROMPTS: Record<AssistantTool, string> = {
  cash: "¿Cómo se compone mi caja?",
  risk: "¿Cuándo baja la caja del umbral?",
  collections: "¿Qué cobros están previstos?",
  payments: "¿Qué egresos están previstos?",
  changes: "¿Por qué cambió la caja?",
  overdue: "¿Qué movimientos siguen vencidos?",
  help: "¿Qué puedes explicar?",
};
export function classifyQuestion(question: string): AssistantTool {
  const q = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
  if (/cambi|variacion|diferencia/.test(q)) return "changes";
  if (/vencid|atras|mora/.test(q)) return "overdue";
  if (/umbral|riesgo|baja|deficit|minim/.test(q)) return "risk";
  if (/cobr|recibir|cliente/.test(q)) return "collections";
  if (/pago|egreso|salida/.test(q)) return "payments";
  if (/caja|saldo|banco|liquidez/.test(q)) return "cash";
  return "help";
}
export interface AssistantAnswer {
  tool: AssistantTool;
  title: string;
  text: string;
  rows: TreasuryRow[];
  context: DecisionContext;
  limitations: string[];
}
export function answerTreasury(
  tool: AssistantTool,
  rows: TreasuryRow[],
  links: ForecastLink[],
  context: DecisionContext,
  previous?: { rows: TreasuryRow[]; cutoff: string },
): AssistantAnswer {
  const m = decisionModel(rows, links, context),
    money = (v: number) =>
      Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(v) +
      " " +
      context.currency,
    base = {
      tool,
      title: ASSISTANT_PROMPTS[tool],
      context,
      limitations: [...m.issues],
      rows: [] as TreasuryRow[],
      text: "",
    };
  switch (tool) {
    case "cash":
      return {
        ...base,
        text: `La caja disponible al ${context.cutoff} suma ${money(m.available)} en ${m.cashRows.length} movimientos BANCO. Se calcula con el signo de cada movimiento de BASE.`,
        rows: m.cashRows,
      };
    case "risk":
      return {
        ...base,
        text: m.firstRisk
          ? `El primer saldo bajo el umbral de ${money(context.minimum)} aparece el ${m.firstRisk}. El menor saldo previsto es ${money(m.minimum)}.`
          : `No se cruza el umbral de ${money(context.minimum)} en los ${context.horizon} días analizados. El menor saldo previsto es ${money(m.minimum)}.`,
        rows: m.events,
        limitations: [
          ...m.issues,
          "Es una proyección de los movimientos registrados, no una garantía de cobro ni un pago automático.",
        ],
      };
    case "collections":
      return {
        ...base,
        text: `Hay ${m.collectionRows.length} ingresos previstos por ${money(m.collections)} en ${context.horizon} días.`,
        rows: m.collectionRows,
      };
    case "payments":
      return {
        ...base,
        text: `Hay ${m.paymentRows.length} egresos previstos por ${money(m.payments)} en ${context.horizon} días.`,
        rows: m.paymentRows,
      };
    case "overdue":
      return {
        ...base,
        text: `Hay ${m.overdue.length} movimientos cuya fecha prevista es igual o anterior al corte y siguen pendientes. Se proyectan al primer día del horizonte.`,
        rows: m.overdue,
      };
    case "changes": {
      if (!previous)
        return {
          ...base,
          text: "Necesitas una BASE anterior para explicar la variación.",
        };
      const bridge = cashBridge(
        previous.rows,
        rows,
        context.currency,
        previous.cutoff,
        context.cutoff,
      );
      return {
        ...base,
        text: `La caja varió ${money(bridge.difference)} entre ${previous.cutoff} y ${context.cutoff}. ${bridge.changes.length} partidas explican la diferencia. Una fila ausente no demuestra un pago.`,
        rows: bridge.changes.map((c) => c.row),
      };
    }
    default:
      return {
        ...base,
        text: "Puedo explicar caja, riesgos, cobros, egresos, vencidos y cambios entre BASE. Selecciona una consulta y revisa sus fuentes. No ejecuto pagos ni modifico tus datos.",
      };
  }
}
