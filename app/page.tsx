import { Suspense } from "react";
import sql from "@/lib/db";
import { hourlyMetrics } from "@/lib/hourly";
import { dailyRows } from "@/lib/data";
import {
  days,
  filters,
  fmt,
  ids,
  ratio,
  summarize,
  type Params,
} from "@/lib/metrics";
import Filters from "@/components/Filters";
import { Cards, ResultsTable } from "@/components/MetricsUI";
import PerformanceInsights from "@/components/PerformanceInsights";
import HourlyChart from "@/components/HourlyChart";
import InsightsPanel from "@/components/InsightsPanel";
import InsightsSection from "@/components/InsightsSection";

async function Performance({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  const rows = await dailyRows();
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const f = filters(params, dates);
  const campaigns = f.campaign === "all" ? ids : [f.campaign];
  if (!rows.length)
    return (
      <div className="panel" role="status">
        No campaign data available. Daily metrics have not been loaded.
      </div>
    );
  const heading = (
    <>
      <h1 className="text-3xl font-bold">Campaign performance</h1>
      <Filters route="/" value={f} dates={dates} />
    </>
  );
  if (f.error) return heading;
  const t = summarize(rows, campaigns, f.from, f.to);
  const selectedDays = days(f.from, f.to);
  // Build every expected campaign/day, retaining missing coverage as null in charts.
  const chartRows = selectedDays.flatMap((date) =>
    campaigns.map((id) => {
      const total = summarize(rows, [id], date, date);
      return {
        date,
        advertiser_id: id,
        impressions: total.impressions,
        clicks: total.clicks,
        cost: total.cost,
        incomplete: !total.complete,
      };
    }),
  );
  const hourly = await sql`
    SELECT event_date::text AS date, advertiser_id, event_hour, impressions, clicks
    FROM public.hourly_campaign_metrics
    WHERE (${f.campaign}::text = 'all' OR advertiser_id = ${f.campaign})
      AND event_date >= ${f.from}::date AND event_date <= ${f.to}::date
    ORDER BY event_date, advertiser_id, event_hour
  `;
  const hourlyData = hourlyMetrics(
    hourly.map((row) => ({
      date: String(row.date),
      advertiser_id: String(row.advertiser_id),
      event_hour: Number(row.event_hour),
      impressions: row.impressions === null ? null : Number(row.impressions),
      clicks: row.clicks === null ? null : Number(row.clicks),
    })),
    rows,
    campaigns,
    f.from,
    f.to,
  );
  return (
    <>
      {heading}
      <p className="mb-5 text-sm text-slate-600">
        {f.campaign === "all" ? "All campaigns" : `Advertiser ${f.campaign}`} ·{" "}
        {f.from} to {f.to} (inclusive)
      </p>
      {!t.complete && (
        <p role="status" className="panel mb-5 text-amber-800">
          Campaign-day coverage is incomplete. Aggregate metrics are
          unavailable; missing records do not mean zero activity.
        </p>
      )}
      {t.complete && !t.costComplete && (
        <p role="status" className="panel mb-5 text-amber-800">
          Some cost records are missing or unusable. Cost totals and ratios are
          unavailable.
        </p>
      )}
      <Cards
        items={[
          {
            label: "Spending",
            value: fmt(t.cost, 3),
            definition:
              "Total recorded spending in scaled dataset units, not a known currency.",
          },
          {
            label: "Cost per click",
            value: fmt(ratio(t.cost, t.clicks), 3),
            definition:
              "Average spending for each click, in scaled dataset units.",
          },
          {
            label: "Ad views",
            value: fmt(t.impressions),
            definition: "Number of times ads were displayed.",
          },
          {
            label: "Clicks",
            value: fmt(t.clicks),
            definition: "Recorded click events, including repeat clicks.",
          },
          {
            label: "Click rate",
            value: t.impressions
              ? `${fmt(ratio(t.clicks, t.impressions, 100), 4)}%`
              : "Unavailable",
            definition:
              "Clicks for every 100 ad views, including repeat clicks.",
          },
          {
            label: "Conversions",
            value: fmt(t.conversions),
            definition:
              "Number of tracked conversion events; these are not confirmed sales.",
          },
          {
            label: "Cost per 1,000 views",
            value: fmt(ratio(t.cost, t.impressions, 1000), 3),
            definition:
              "Average spending for 1,000 ad views, in scaled dataset units.",
          },
          {
            label: "Prices above bid",
            value: fmt(t.priceFlags),
            definition:
              "Ad views where the paid price exceeded the bid; still included in spending.",
          },
        ]}
      />
      <Suspense fallback={<InsightsPanel state={{ status: "loading", items: [] }} />}>
        <InsightsSection selection={f} />
      </Suspense>
      <PerformanceInsights rows={chartRows} />
      {campaigns.length > 1 && (
        <ResultsTable
          title="Campaign comparison"
          rows={rows}
          groups={campaigns.map((id) => ({
            label: id,
            campaigns: [id],
            from: f.from,
            to: f.to,
          }))}
        />
      )}
      {selectedDays.length > 1 && (
        <ResultsTable
          title="Daily results"
          rows={rows}
          groups={selectedDays.map((day) => ({
            label: day,
            campaigns,
            from: day,
            to: day,
          }))}
        />
      )}
      <div className="mt-6">
        <HourlyChart
          key={`${f.campaign}-${f.from}-${f.to}`}
          data={hourlyData}
        />
      </div>
      <details className="panel mt-6 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold">
          About this data
        </summary>
        <p className="mt-3">
          Historical records, June 6–12, 2013. Events use their recorded date.
          Repeat clicks and conversion events are included. Exact duplicate
          records count once. Cost is already scaled; prices above bid remain
          included and flagged. Missing records are not assumed to be zero.
        </p>
      </details>
    </>
  );
}
export default function Home({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  return (
    <main className="dashboard">
      <Suspense fallback={<p role="status">Loading campaign performance…</p>}>
        <Performance searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
