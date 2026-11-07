
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

type HourlyMetric = {
  event_hour: number;
  impressions: number;
  clicks: number;
  ctr_percent: number;
};

export default function HourlyChart({
  data,
}: {
  data: HourlyMetric[];
}) {
  const chartData = data.map((row) => ({
    hour: `${String(row.event_hour).padStart(2, "0")}:00`,
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    ctr: Number(row.ctr_percent),
  }));

  return (
    <div className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="text-xl font-semibold">
        Hourly Campaign Performance
      </h2>

      <p className="mb-6 mt-2 text-sm text-slate-400">
        Impressions and clicks across 24 hours
      </p>

      <div className="h-80 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid stroke="#334155" strokeDasharray="3 3" />

            <XAxis
              dataKey="hour"
              stroke="#94a3b8"
              tick={{ fontSize: 11 }}
              interval={2}
            />

            <YAxis
              yAxisId="left"
              stroke="#94a3b8"
              tickFormatter={(v) => v.toLocaleString()}
            />

            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#94a3b8"
            />

            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
              }}
            />

            <Legend />

            <Line
              yAxisId="left"
              type="monotone"
              dataKey="impressions"
              stroke="#22d3ee"
              strokeWidth={2}
              dot={false}
              name="Impressions"
            />

            <Line
              yAxisId="right"
              type="monotone"
              dataKey="clicks"
              stroke="#a78bfa"
              strokeWidth={2}
              name="Clicks"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
