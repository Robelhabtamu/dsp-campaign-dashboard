"use client";

import { useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

type HourlyMetric = {
  event_hour: number;
  impressions: number;
  clicks: number;
  ctr_percent: number;
};

export default function HourlyChart({ data }: { data: HourlyMetric[] }) {
  const [metric, setMetric] = useState<"impressions" | "clicks">("impressions");
  const label = metric === "impressions" ? "Ad views" : "Clicks";

  const chartData = data.map((row) => ({
    ...row,
    hour: `${String(row.event_hour).padStart(2, "0")}:00`,
  }));

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            Activity by hour
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            When ad views and clicks were recorded during the day.
          </p>
        </div>

        <div className="flex gap-1 rounded-lg bg-slate-100 p-1"
          role="group" aria-label="Hourly measurement">
          {(["impressions", "clicks"] as const).map((key) => (
            <button key={key} type="button"
              aria-pressed={metric === key}
              onClick={() => setMetric(key)}
              className={`rounded-md px-3 py-2 text-sm ${
                metric === key
                  ? "bg-white font-semibold text-blue-700 shadow-sm"
                  : "text-slate-600"
              }`}>
              {key === "impressions" ? "Ad views" : "Clicks"}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid vertical={false} stroke="#e2e8f0" />
            <XAxis dataKey="hour" interval={2}
              tick={{ fill: "#64748b", fontSize: 11 }} />
            <YAxis tickFormatter={(value: number) =>
              new Intl.NumberFormat("en-US", {
                notation: "compact",
              }).format(value)}
              tick={{ fill: "#64748b", fontSize: 12 }} />
            <Tooltip contentStyle={{
              backgroundColor: "#ffffff",
              border: "1px solid #dbe3ed",
              borderRadius: 10,
              color: "#172033",
            }} />
            <Bar dataKey={metric} name={label}
              fill={metric === "impressions" ? "#2563eb" : "#7c3aed"}
              radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <p className="mt-3 text-xs text-slate-500">
        Hours follow the source records; timezone is unconfirmed.
      </p>
    </section>
  );
}
