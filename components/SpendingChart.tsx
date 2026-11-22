"use client";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
export default function SpendingChart({
  data,
}: {
  data: { date: string; actual: number | null; planned: number }[];
}) {
  return (
    <section className="panel mt-6">
      <h2 className="text-xl font-semibold">
        Cumulative spending from campaign start
      </h2>
      <p className="mt-2 text-sm text-slate-500">
        Scaled dataset units · through selected end date. Gaps mean actual cost
        is unavailable.
      </p>
      <div className="mt-5 h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="date" tickFormatter={(v) => String(v).slice(5)} />
            <YAxis
              width={85}
              tickFormatter={(v) =>
                Number(v).toLocaleString("en-US", { notation: "compact" })
              }
            />
            <Tooltip
              formatter={(v, name) => [
                Number(v).toLocaleString("en-US", {
                  maximumFractionDigits: 3,
                }) + " scaled units",
                name,
              ]}
            />
            <Legend />
            <Line
              dataKey="actual"
              name="Actual cumulative cost"
              stroke="#2563eb"
              strokeWidth={2}
              connectNulls={false}
            />
            <Line
              dataKey="planned"
              name="DEMO even spending plan"
              stroke="#d97706"
              strokeDasharray="5 5"
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}
