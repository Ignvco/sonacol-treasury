import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Projected closing balance for the selected horizon, drawn for the navy hero. */
export function ResumenCashChart({
  daily,
  formatAmount,
}: {
  daily: { date: string; final: number }[];
  formatAmount: (amount: number, compact?: boolean) => string;
}) {
  return (
    <div className="h-[228px] w-full" aria-label="Gráfico de saldo proyectado">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={daily} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
          <defs>
            <linearGradient id="bentoCashFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#A9B8FF" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#A9B8FF" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid
            strokeDasharray="3 6"
            vertical={false}
            stroke="rgba(255,255,255,0.12)"
          />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => String(d).slice(5)}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
            axisLine={false}
            tickLine={false}
            minTickGap={28}
          />
          <YAxis
            width={72}
            tickFormatter={(v) => formatAmount(Number(v), true)}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            formatter={(v) => [formatAmount(Number(v)), "Saldo"]}
            labelFormatter={(v) => String(v)}
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
          <ReferenceLine y={0} stroke="rgba(255,170,170,0.75)" strokeDasharray="4 4" />
          <Area
            type="stepAfter"
            dataKey="final"
            stroke="#B9C6FF"
            strokeWidth={2.5}
            fill="url(#bentoCashFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
