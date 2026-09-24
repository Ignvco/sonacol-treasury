import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useCurrency } from "@/contexts/currency-context";

/** Overdue portfolio by age bucket, drawn for the navy hero. */
export function ReceivablesAgingChart({
  data,
}: {
  data: { name: string; amount: number }[];
}) {
  const { money } = useCurrency();
  return (
    <div className="h-[218px] w-full" aria-label="Antigüedad de saldos vencidos">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid
            vertical={false}
            stroke="rgba(255,255,255,0.12)"
            strokeDasharray="3 6"
          />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            width={58}
            tick={{ fontSize: 10, fill: "rgba(255,255,255,0.5)" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v) => money(Number(v), undefined, { compact: true })}
          />
          <Tooltip
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
            formatter={(v) => [money(Number(v)), "Vencido"]}
          />
          <Bar dataKey="amount" fill="#B9C6FF" radius={[6, 6, 0, 0]} maxBarSize={34} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
