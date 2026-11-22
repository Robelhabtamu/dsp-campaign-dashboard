"use client";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ComposedChart,
  Line,
  Legend,
} from "recharts";
import { ratio } from "@/lib/metrics";
type Row = {
  date: string;
  advertiser_id: string;
  impressions: number | null;
  clicks: number | null;
  cost: number | null;
  incomplete: boolean;
};
function group(rows: Row[], key: "date" | "advertiser_id") {
  return [...new Set(rows.map((r) => r[key]))].sort().map((label) => {
    const members = rows.filter((r) => r[key] === label);
    const complete = members.every((r) => !r.incomplete);
    const impressions = complete
      ? members.reduce((n, r) => n + (r.impressions ?? 0), 0)
      : null;
    const clicks = complete
      ? members.reduce((n, r) => n + (r.clicks ?? 0), 0)
      : null;
    const cost =
      complete && members.every((r) => r.cost !== null)
        ? members.reduce((n, r) => n + (r.cost ?? 0), 0)
        : null;
    return {
      label,
      impressions,
      cost,
      rate: ratio(clicks, impressions, 100),
      cpc: ratio(cost, clicks),
    };
  });
}
export default function PerformanceInsights({ rows }: { rows: Row[] }) {
  const daily = group(rows, "date");
  const campaigns = group(rows, "advertiser_id");
  const charts = [
    {
      id: "views",
      key: "impressions" as const,
      title: "Daily ad views",
      unit: "Impression events",
      color: "#2563eb",
      data: daily,
      show: daily.length > 1,
      dateAxis: true,
    },
    {
      id: "daily-rate",
      key: "rate" as const,
      title: "Daily click rate",
      unit: "Clicks for every 100 ad views",
      color: "#059669",
      data: daily,
      show: daily.length > 1,
      dateAxis: true,
    },
    {
      id: "campaign-rate",
      key: "rate" as const,
      title: "Click rate by campaign",
      unit: "Clicks for every 100 ad views over the selected range",
      color: "#7c3aed",
      data: campaigns,
      show: campaigns.length > 1,
      dateAxis: false,
    },
  ].filter((chart) => chart.show);
  if (!charts.length) return null;
  return (
    <section className="mt-6 space-y-5">
      {daily.length > 1 && (
        <section className="panel">
          <h2 className="text-xl font-semibold">
            Daily spending &amp; cost per click
          </h2>
          <p className="mt-2 text-sm text-slate-500">
            Total spending and average spending per click, in scaled dataset
            units. Spending uses the left axis; cost per click uses the right
            axis. Unavailable values leave gaps.
          </p>
          <div className="mt-5 h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={daily}
                margin={{ top: 15, right: 0, bottom: 5, left: 0 }}
              >
                <CartesianGrid vertical={false} stroke="#e2e8f0" />
                <XAxis
                  dataKey="label"
                  tickFormatter={(v) => String(v).slice(5)}
                />
                <YAxis
                  yAxisId="spending"
                  width={75}
                  tickFormatter={(v) =>
                    Number(v).toLocaleString("en-US", { notation: "compact" })
                  }
                />
                <YAxis
                  yAxisId="cpc"
                  orientation="right"
                  width={75}
                  tickFormatter={(v) =>
                    Number(v).toLocaleString("en-US", {
                      maximumFractionDigits: 2,
                    })
                  }
                />
                <Tooltip
                  formatter={(value, name) => [
                    `${Number(value).toLocaleString("en-US", { maximumFractionDigits: 3 })} scaled units`,
                    name,
                  ]}
                />
                <Legend />
                <Bar
                  yAxisId="spending"
                  dataKey="cost"
                  name="Spending (left axis)"
                  fill="#2563eb"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="cpc"
                  dataKey="cpc"
                  name="Cost per click (right axis)"
                  stroke="#d97706"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                  connectNulls={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}
      <div className="grid gap-5 lg:grid-cols-2">
        {charts.map((chart) => (
          <section className="panel" key={chart.id}>
            <h2 className="text-xl font-semibold">{chart.title}</h2>
            <p className="mt-2 text-sm text-slate-500">
              {chart.unit} · unavailable values leave gaps.
            </p>
            <div className="mt-5 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chart.data}>
                  <CartesianGrid vertical={false} stroke="#e2e8f0" />
                  <XAxis
                    dataKey="label"
                    tickFormatter={(v) =>
                      chart.dateAxis ? String(v).slice(5) : String(v)
                    }
                  />
                  <YAxis
                    width={75}
                    tickFormatter={(v) =>
                      chart.key === "rate"
                        ? `${Number(v).toFixed(3)}%`
                        : Number(v).toLocaleString("en-US", {
                            notation: "compact",
                          })
                    }
                  />
                  <Tooltip
                    formatter={(v) => [
                      chart.key === "rate"
                        ? `${Number(v).toFixed(4)}%`
                        : Number(v).toLocaleString("en-US", {
                            maximumFractionDigits: 0,
                          }),
                      chart.title,
                    ]}
                  />
                  <Bar
                    dataKey={chart.key}
                    name={chart.title}
                    fill={chart.color}
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
