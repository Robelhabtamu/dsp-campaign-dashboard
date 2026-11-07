
import { Suspense } from "react";
import sql from "@/lib/db";
import HourlyChart from "@/components/HourlyChart";

async function CampaignDashboard() {
  // 1. Fetch daily campaign metrics
  const rows = await sql`
    SELECT
      event_date::text,
      advertiser_id,
      impressions,
      clicks,
      conversions,
      ctr_percent,
      avg_bid,
      avg_paid
    FROM daily_campaign_metrics
    ORDER BY event_date DESC
    LIMIT 1
  `;

  const campaign = rows[0];

  if (!campaign) {
    return (
      <div className="p-10 text-white">
        No campaign data found.
      </div>
    );
  }

  // 2. Fetch hourly metrics for the same campaign
  const hourlyRows = await sql`
    SELECT
      event_hour,
      impressions,
      clicks,
      ctr_percent
    FROM hourly_campaign_metrics
    WHERE event_date = ${campaign.event_date}::date
      AND advertiser_id = ${campaign.advertiser_id}
    ORDER BY event_hour ASC
  `;

  const hourlyData = hourlyRows.map((row) => ({
    event_hour: Number(row.event_hour),
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    ctr_percent: Number(row.ctr_percent),
  }));

  // 3. Prepare KPI cards
  const metrics = [
    {
      label: "Impressions",
      value: Number(campaign.impressions).toLocaleString(),
    },
    {
      label: "Clicks",
      value: Number(campaign.clicks).toLocaleString(),
    },
    {
      label: "CTR",
      value: `${Number(campaign.ctr_percent).toFixed(4)}%`,
    },
    {
      label: "Conversions",
      value: Number(campaign.conversions).toLocaleString(),
    },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      {/* Dashboard header */}
      <header className="mb-10">
        <p className="text-sm font-semibold uppercase tracking-widest text-cyan-400">
          DSP Analytics
        </p>

        <h1 className="mt-2 text-3xl font-bold">
          Campaign Performance Dashboard
        </h1>

        <p className="mt-3 text-slate-400">
          Advertiser {campaign.advertiser_id} |{" "}
          {campaign.event_date}
        </p>
      </header>

      {/* KPI cards */}
      <section className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <div
            key={metric.label}
            className="rounded-xl border border-slate-800 bg-slate-900 p-6"
          >
            <p className="text-sm text-slate-400">
              {metric.label}
            </p>

            <h2 className="mt-3 text-3xl font-bold">
              {metric.value}
            </h2>
          </div>
        ))}
      </section>

      {/* Pricing overview */}
      <section className="mt-8 rounded-xl border border-slate-800 bg-slate-900 p-6">
        <h2 className="mb-6 text-xl font-semibold">
          Pricing Overview
        </h2>

        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <p className="text-slate-400">
              Average Bid
            </p>
            <p className="mt-2 text-2xl font-bold">
              {Number(campaign.avg_bid).toFixed(2)}
            </p>
          </div>

          <div>
            <p className="text-slate-400">
              Average Paid
            </p>
            <p className="mt-2 text-2xl font-bold">
              {Number(campaign.avg_paid).toFixed(2)}
            </p>
          </div>
        </div>

        <p className="mt-5 text-xs text-slate-500">
          Pricing values are in raw dataset units.
        </p>
      </section>

      {/* Hourly performance chart */}
      <HourlyChart data={hourlyData} />
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <Suspense
        fallback={
          <div className="text-slate-400">
            Loading campaign analytics...
          </div>
        }
      >
        <CampaignDashboard />
      </Suspense>
    </main>
  );
}
