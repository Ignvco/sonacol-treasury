import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";
import { baseNumber } from "./SourceBreakdown";
export function DecisionChart({
  days,
  reference,
  minimum = 0,
  currency,
}: {
  days: { date: string; balance: number }[];
  reference?: { date: string; balance: number }[];
  minimum?: number;
  currency: string;
}) {
  const data = days.map((d) => ({
    ...d,
    reference: reference?.find((r) => r.date === d.date)?.balance,
  }));
  return (
    <div className="min-w-0">
      <div
        className="h-64 w-full sm:h-80"
        role="img"
        aria-label={"Evolución de saldo proyectado en " + currency}
      >
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart
            data={data}
            margin={{ top: 20, right: 16, left: 8, bottom: 0 }}
          >
            <defs>
              <linearGradient id="cash-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0b27c9" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#0b27c9" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#e8edf4" />
            <XAxis
              dataKey="date"
              tickFormatter={(v) => String(v).slice(5)}
              tick={{ fontSize: 11 }}
              minTickGap={40}
            />
            <YAxis
              width={76}
              tickFormatter={(v) =>
                Intl.NumberFormat("es-CL", { notation: "compact" }).format(v)
              }
              tick={{ fontSize: 11 }}
            />
            <Tooltip
              formatter={(v) => baseNumber(Number(v)) + " " + currency}
            />
            <ReferenceLine
              y={minimum}
              stroke="#b45309"
              strokeDasharray="4 4"
              label={{ value: "Umbral", fontSize: 11 }}
            />
            <Area
              name="Saldo"
              dataKey="balance"
              type="monotone"
              stroke="#0b27c9"
              fill="url(#cash-area)"
              strokeWidth={2}
            />
            {reference && (
              <Line
                name="Referencia"
                dataKey="reference"
                stroke="#94a3b8"
                strokeDasharray="5 5"
                dot={false}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <details className="mt-3 text-xs">
        <summary className="cursor-pointer text-muted-foreground">
          Ver datos del gráfico
        </summary>
        <div className="max-h-60 overflow-auto">
          <table className="w-full">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Saldo {currency}</th>
                {reference && <th>Referencia</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.date}>
                  <td>{d.date}</td>
                  <td className="text-right">{baseNumber(d.balance)}</td>
                  {reference && (
                    <td className="text-right">
                      {d.reference === undefined
                        ? "—"
                        : baseNumber(d.reference)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
