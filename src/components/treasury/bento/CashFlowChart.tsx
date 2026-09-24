import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatDateMedium, formatDateShort } from "@/financial-engine/format";
import type { DailyProjection } from "@/financial-engine/calculations";

/** Income/expense bars with the running balance, drawn for the navy hero. */
export function CashFlowChart({
  projection,
  formatAmount,
}: {
  projection: DailyProjection[];
  formatAmount: (amount: number, compact?: boolean) => string;
}) {
  return (
    <div className="h-[232px] w-full" aria-label="Gráfico de proyección de liquidez">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
          data={projection}
          barGap={2}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <CartesianGrid
            vertical={false}
            stroke="rgba(255,255,255,0.12)"
            strokeDasharray="3 6"
          />
          <XAxis
            dataKey="date"
            tickFormatter={formatDateShort}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
            axisLine={false}
            tickLine={false}
            minTickGap={25}
          />
          <YAxis
            yAxisId="flow"
            width={64}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatAmount(Number(v), true)}
          />
          <YAxis
            yAxisId="balance"
            orientation="right"
            width={64}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => formatAmount(Number(v), true)}
          />
          <Tooltip
            formatter={(v, name) => [
              formatAmount(Number(v)),
              name === "income"
                ? "Ingresos"
                : name === "expense"
                  ? "Egresos"
                  : "Saldo",
            ]}
            labelFormatter={(v) => formatDateMedium(String(v))}
            cursor={{ fill: "rgba(255,255,255,0.06)" }}
            contentStyle={{
              borderRadius: 14,
              border: "1px solid hsl(var(--border))",
              background: "hsl(var(--card))",
              fontSize: 12,
              boxShadow: "var(--shadow-bento)",
            }}
            labelStyle={{
              color: "hsl(var(--muted-foreground))",
              fontSize: 11,
              fontWeight: 600,
            }}
          />
          <Bar
            yAxisId="flow"
            dataKey="income"
            fill="#8FA3FF"
            radius={[5, 5, 0, 0]}
            maxBarSize={22}
          />
          <Bar
            yAxisId="flow"
            dataKey="expense"
            fill="#FFA940"
            fillOpacity={0.9}
            radius={[5, 5, 0, 0]}
            maxBarSize={22}
          />
          <Line
            yAxisId="balance"
            type="stepAfter"
            dataKey="final"
            stroke="#E8ECFF"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
