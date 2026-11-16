"use client";

import type { ReactNode } from "react";
import {
  ResponsiveContainer, LineChart, BarChart, Line, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from "recharts";

type Row = {
  date: string;
  advertiser_id: string;
  impressions: number;
  clicks: number;
  cost: number;
  unusablePrices: number;
  missingCost: boolean;
};

type Group = {
  label: string;
  impressions: number;
  clicks: number;
  cost: number;
  incomplete: boolean;
};

function group(rows: Row[], key: "date" | "advertiser_id") {
  const groups = new Map<string, Group>();

  for (const row of rows) {
    const label = row[key];
    const item = groups.get(label) ?? {
      label, impressions: 0, clicks: 0, cost: 0, incomplete: false,
    };
    item.impressions += row.impressions;
    item.clicks += row.clicks;
    item.cost += row.cost;
    item.incomplete ||= row.missingCost || row.unusablePrices > 0;
    groups.set(label, item);
  }

  return [...groups.values()]
    .sort((a, b) => a.label.localeCompare(b.label))
    .map((row) => ({
      ...row,
      rate: row.impressions ? 100 * row.clicks / row.impressions : null,
      cpc: !row.incomplete && row.clicks ? row.cost / row.clicks : null,
    }));
}

const tooltipStyle = {
  backgroundColor: "#ffffff",
  border: "1px solid #dbe3ed",
  borderRadius: 10,
  color: "#172033",
};

function Panel({
  title, definition, children,
}: {
  title: string;
  definition: string;
  children: ReactNode;
}) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5">
      <h3 className="font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 text-sm text-slate-500">{definition}</p>
      <div className="mt-6 h-64 w-full">{children}</div>
    </section>
  );
}

const compact = (value: number) =>
  new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);

export default function PerformanceInsights({ rows }: { rows: Row[] }) {
  if (!rows.length) return null;

  const daily = group(rows, "date");
  const campaigns = group(rows, "advertiser_id");
  const showTrends = daily.length > 1;
  const showComparison = campaigns.length > 1;

  if (!showTrends && !showComparison) return null;

  return (
    <section className="mt-8">
      <h2 className="mb-4 text-xl font-semibold text-slate-900">
        {showTrends ? "Daily performance" : "Campaign comparison"}
      </h2>

      <div className="grid gap-5 lg:grid-cols-2">
        {showTrends && (
<Panel title="Ad views by day"
          definition="How often ads were displayed each day.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={daily}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tickFormatter={(v: string) => v.slice(5)}
                tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis tickFormatter={compact}
                tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="impressions" name="Ad views"
                fill="#2563eb" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
)}

        {showTrends && (
<Panel title="Click rate by day"
          definition="Recorded clicks for every 100 ad views.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tickFormatter={(v: string) => v.slice(5)}
                tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => `${v.toFixed(3)}%`}
                width={75} tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(value) => [
                  `${Number(value).toFixed(4)}%`, "Click rate",
                ]} />
              <Line dataKey="rate" name="Click rate"
                stroke="#059669" strokeWidth={2.5}
                dot={{ r: 4 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
)}

        {showTrends && (
<Panel title="Cost per click by day"
          definition="Average recorded cost per click, in dataset units.">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={daily}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tickFormatter={(v: string) => v.slice(5)}
                tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(value) => [
                  Number(value).toFixed(3), "Cost per click",
                ]} />
              <Line dataKey="cpc" name="Cost per click"
                stroke="#d97706" strokeWidth={2.5}
                dot={{ r: 4 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>
)}

        {showComparison && (
<Panel title="Click rate by campaign"
          definition="Click rate for each campaign in the selected period.">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={campaigns}>
              <CartesianGrid vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label"
                tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis tickFormatter={(v: number) => `${v.toFixed(3)}%`}
                width={75} tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip contentStyle={tooltipStyle}
                formatter={(value) => [
                  `${Number(value).toFixed(4)}%`, "Click rate",
                ]} />
              <Bar dataKey="rate" name="Click rate"
                fill="#7c3aed" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
)}
      </div>
    </section>
  );
}
