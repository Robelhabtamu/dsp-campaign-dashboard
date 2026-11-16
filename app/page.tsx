import Link from "next/link";
import { Suspense } from "react";
import sql from "@/lib/db";
import HourlyChart from "@/components/HourlyChart";
import PerformanceInsights from "@/components/PerformanceInsights";

type Params = Promise<Record<string, string | string[] | undefined>>;

type MetricRow = {
  date: string;
  advertiser_id: string;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  priceFlags: number;
  unusablePrices: number;
  missingCost: boolean;
};

type Totals = {
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  priceFlags: number;
  unusablePrices: number;
  missingCost: boolean;
};

function aggregate(rows: MetricRow[]): Totals {
  return rows.reduce<Totals>(
    (total, row) => ({
      impressions: total.impressions + row.impressions,
      clicks: total.clicks + row.clicks,
      conversions: total.conversions + row.conversions,
      cost: total.cost + row.cost,
      priceFlags: total.priceFlags + row.priceFlags,
      unusablePrices: total.unusablePrices + row.unusablePrices,
      missingCost: total.missingCost || row.missingCost,
    }),
    {
      impressions: 0,
      clicks: 0,
      conversions: 0,
      cost: 0,
      priceFlags: 0,
      unusablePrices: 0,
      missingCost: false,
    },
  );
}

function ratio(numerator: number, denominator: number, scale = 1) {
  return denominator > 0 ? (scale * numerator) / denominator : null;
}

function fmt(value: number | null, digits = 0) {
  return value === null
    ? "—"
    : value.toLocaleString("en-US", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
}

function percent(numerator: number, denominator: number, digits = 4) {
  const value = ratio(numerator, denominator, 100);
  return value === null ? "—" : `${fmt(value, digits)}%`;
}

function costReady(total: Totals) {
  return !total.missingCost && total.unusablePrices === 0;
}

async function Performance({
  searchParams,
}: {
  searchParams: Params;
}) {
  const params = await searchParams;

  const source = await sql`
    SELECT
      event_date::text AS date,
      advertiser_id,
      impressions,
      clicks,
      conversions,
      recorded_cost,
      paying_above_bid_rows,
      unusable_paying_price_rows
    FROM public.daily_campaign_metrics
    ORDER BY event_date, advertiser_id
  `;

  if (!source.length) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-8">
        <h1 className="text-2xl font-bold">No campaign data available</h1>
        <p className="mt-3 text-slate-600">
          Run the pipeline and load the prepared metrics into Neon.
        </p>
      </div>
    );
  }

  const allRows: MetricRow[] = source.map((row) => ({
    date: String(row.date),
    advertiser_id: String(row.advertiser_id),
    impressions: Number(row.impressions),
    clicks: Number(row.clicks),
    conversions: Number(row.conversions),
    cost: Number(row.recorded_cost ?? 0),
    priceFlags: Number(row.paying_above_bid_rows),
    unusablePrices: Number(row.unusable_paying_price_rows),
    missingCost: row.recorded_cost === null,
  }));

  const dates = [...new Set(allRows.map((row) => row.date))].sort();
  const campaigns = [
    ...new Set(allRows.map((row) => row.advertiser_id)),
  ].sort();

  const requestedCampaign =
    typeof params.campaign === "string" ? params.campaign : "all";

  const requestedDate =
    typeof params.date === "string" ? params.date : "all";

  const campaign = campaigns.includes(requestedCampaign)
    ? requestedCampaign
    : "all";

  const date = dates.includes(requestedDate) ? requestedDate : "all";

  const selected = allRows.filter(
    (row) =>
      (campaign === "all" || row.advertiser_id === campaign) &&
      (date === "all" || row.date === date),
  );

  const totals = aggregate(selected);
  const completeCost = costReady(totals);

  const hourly = await sql`
    SELECT
      event_hour,
      SUM(impressions)::text AS impressions,
      SUM(clicks)::text AS clicks
    FROM public.hourly_campaign_metrics
    WHERE (${campaign}::text = 'all' OR advertiser_id = ${campaign})
      AND (${date}::text = 'all' OR event_date::text = ${date})
    GROUP BY event_hour
    ORDER BY event_hour
  `;

  const hourlyData = Array.from({ length: 24 }, (_, hour) => {
    const row = hourly.find(
      (item) => Number(item.event_hour) === hour,
    );

    const impressions = Number(row?.impressions ?? 0);
    const clicks = Number(row?.clicks ?? 0);

    return {
      event_hour: hour,
      impressions,
      clicks,
      ctr_percent: ratio(clicks, impressions, 100) ?? 0,
    };
  });

  const cards = [
    {
      label: "Ad views",
      value: fmt(totals.impressions),
      help: "Number of times ads were displayed.",
      accent: "border-t-blue-500",
    },
    {
      label: "Clicks",
      value: fmt(totals.clicks),
      help: "Total recorded clicks, including repeat clicks.",
      accent: "border-t-violet-500",
    },
    {
      label: "Click rate",
      value: percent(totals.clicks, totals.impressions),
      help: "Clicks for every 100 ad views.",
      accent: "border-t-emerald-500",
    },
    {
      label: "Conversions",
      value: fmt(totals.conversions),
      help: "Tracked actions; the same ad may have more than one.",
      accent: "border-t-orange-500",
    },
    {
      label: "Recorded cost",
      value: fmt(totals.cost, 3),
      help: completeCost
        ? "Total paid, in dataset cost units."
        : "Partial total: some prices are missing or unusable.",
      accent: "border-t-cyan-500",
    },
    {
      label: "Cost per click",
      value: completeCost
        ? fmt(ratio(totals.cost, totals.clicks), 3)
        : "—",
      help: "Recorded cost divided by clicks.",
      accent: "border-t-amber-500",
    },
    {
      label: "Cost per 1,000 views",
      value: completeCost
        ? fmt(ratio(totals.cost, totals.impressions, 1000), 3)
        : "—",
      help: "Average recorded cost for 1,000 ad views.",
      accent: "border-t-indigo-500",
    },
    {
      label: "Prices flagged for review",
      value: percent(totals.priceFlags, totals.impressions, 2),
      help: `${fmt(totals.priceFlags)} ad views had a paid price above the bid.`,
      accent: "border-t-rose-500",
    },
  ];

  const comparison = campaigns
    .map((id) => ({
      id,
      rows: selected.filter((row) => row.advertiser_id === id),
    }))
    .filter((group) => group.rows.length)
    .map((group) => ({
      id: group.id,
      ...aggregate(group.rows),
    }));

  const trend = dates
    .map((day) => ({
      day,
      rows: selected.filter((row) => row.date === day),
    }))
    .filter((group) => group.rows.length)
    .map((group) => ({
      day: group.day,
      ...aggregate(group.rows),
    }));

  const sectionClass =
    "mt-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6";

  const selectClass =
    "mt-2 w-full rounded-xl border border-slate-300 bg-white px-3 py-3 text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-100";

  return (
    <div className="mx-auto max-w-7xl">
      <header className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-blue-700">
            Overview
          </p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-900">
            Campaign performance
          </h1>
          <p className="mt-3 max-w-2xl text-slate-600">
            Ad views, clicks and cost for the selected period.
          </p>
        </div>

        <Link
          href="/pacing"
          className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-semibold text-white hover:bg-blue-700"
        >
          Budget & pacing
        </Link>
      </header>

      <form
        method="get"
        action="/"
        className="mt-8 grid items-end gap-5 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-3"
      >
        <label className="text-sm font-medium text-slate-700">
          Campaign
          <select
            name="campaign"
            defaultValue={campaign}
            className={selectClass}
          >
            <option value="all">All campaigns</option>
            {campaigns.map((id) => (
              <option key={id} value={id}>
                Advertiser {id}
              </option>
            ))}
          </select>
        </label>

        <label className="text-sm font-medium text-slate-700">
          Reporting period
          <select
            name="date"
            defaultValue={date}
            className={selectClass}
          >
            <option value="all">
              Full period: {dates[0]} to {dates[dates.length - 1]}
            </option>
            {dates.map((day) => (
              <option key={day} value={day}>
                {day}
              </option>
            ))}
          </select>
        </label>

        <button
          type="submit"
          className="rounded-xl bg-blue-600 px-5 py-3 font-semibold text-white hover:bg-blue-700"
        >
          Apply filters
        </button>
      </form>

      <div className="my-6 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-blue-100 px-3 py-1 text-blue-800">
          {campaign === "all"
            ? "All campaigns"
            : `Advertiser ${campaign}`}
        </span>
        <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
          {date === "all"
            ? `${dates[0]} to ${dates[dates.length - 1]}`
            : date}
        </span>
        <span className="rounded-full bg-slate-200 px-3 py-1 text-slate-700">
          {comparison.length} campaigns · {trend.length} days
        </span>
      </div>

      {!selected.length && (
        <p
          role="status"
          className="mb-5 rounded-xl bg-amber-50 p-4 text-amber-900"
        >
          No records are available for this selection.
        </p>
      )}

      <section
        aria-label="Key performance indicators"
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {cards.map((card) => (
          <article
            key={card.label}
            className={`rounded-2xl border border-slate-200 border-t-4 bg-white p-5 shadow-sm ${card.accent}`}
          >
            <h2 className="text-sm font-medium text-slate-600">
              {card.label}
            </h2>
            <p className="mt-3 break-words text-2xl font-bold text-slate-900">
              {card.value}
            </p>
            <p className="mt-3 text-xs leading-5 text-slate-500">
              {card.help}
            </p>
          </article>
        ))}
      </section>

      <PerformanceInsights
        key={`${campaign}-${date}`}
        rows={selected}
      />

      {comparison.length > 1 && (
<section className={sectionClass}>
        <h2 className="text-xl font-bold text-slate-900">
          Campaign comparison
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          Results for each campaign in the selected period.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">
              Campaign metrics for the selected reporting period
            </caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                {[
                  "Campaign",
                  "Ad views",
                  "Clicks",
                  "Click rate",
                  "Conversions",
                  "Recorded cost",
                  "Cost per click",
                  "Cost / 1,000 views",
                ].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="whitespace-nowrap px-3 py-4 font-semibold"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {comparison.map((row) => (
                <tr
                  key={row.id}
                  className="border-b border-slate-100 hover:bg-blue-50"
                >
                  <th
                    scope="row"
                    className="px-3 py-4 font-semibold text-blue-700"
                  >
                    {row.id}
                  </th>
                  <td className="px-3 py-4">
                    {fmt(row.impressions)}
                  </td>
                  <td className="px-3 py-4">{fmt(row.clicks)}</td>
                  <td className="px-3 py-4">
                    {percent(row.clicks, row.impressions)}
                  </td>
                  <td className="px-3 py-4">
                    {fmt(row.conversions)}
                  </td>
                  <td className="px-3 py-4">
                    {fmt(row.cost, 3)}
                    {costReady(row) ? "" : "*"}
                  </td>
                  <td className="px-3 py-4">
                    {costReady(row)
                      ? fmt(ratio(row.cost, row.clicks), 3)
                      : "—"}
                  </td>
                  <td className="px-3 py-4">
                    {costReady(row)
                      ? fmt(
                          ratio(row.cost, row.impressions, 1000),
                          3,
                        )
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
)}

      {trend.length > 1 && (
<section className={sectionClass}>
        <h2 className="text-xl font-bold text-slate-900">
          Daily results
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          A day-by-day breakdown of the selected campaigns.
        </p>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-slate-600">
              <tr>
                {[
                  "Date",
                  "Ad views",
                  "Clicks",
                  "Click rate",
                  "Conversions",
                  "Recorded cost",
                ].map((label) => (
                  <th
                    key={label}
                    scope="col"
                    className="whitespace-nowrap px-3 py-4 font-semibold"
                  >
                    {label}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {trend.map((row) => (
                <tr
                  key={row.day}
                  className="border-b border-slate-100 hover:bg-blue-50"
                >
                  <th scope="row" className="px-3 py-4 font-medium">
                    {row.day}
                  </th>
                  <td className="px-3 py-4">
                    {fmt(row.impressions)}
                  </td>
                  <td className="px-3 py-4">{fmt(row.clicks)}</td>
                  <td className="px-3 py-4">
                    {percent(row.clicks, row.impressions)}
                  </td>
                  <td className="px-3 py-4">
                    {fmt(row.conversions)}
                  </td>
                  <td className="px-3 py-4">
                    {fmt(row.cost, 3)}
                    {costReady(row) ? "" : "*"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
)}

      <div className="mt-8">
        <p className="mb-3 text-sm text-slate-600">
          {campaign === "all" ? "All campaigns" : `Campaign ${campaign}`}
          {" · "}
          {date === "all"
            ? `${dates[0]} to ${dates[dates.length - 1]}`
            : date}
        </p>
        {selected.length > 0 && hourly.length > 0 ? (
          <HourlyChart
            key={`${campaign}-${date}`}
            data={hourlyData}
          />
        ) : (
          <p className="text-sm text-slate-500">
            No hourly data for this selection.
          </p>
        )}
      </div>


      <details className="mt-8 rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-600">
        <summary className="cursor-pointer font-semibold text-slate-800">
          About this data
        </summary>
        <div className="mt-4 space-y-3 leading-6">
          <p>
            Historical advertising records from June 6–12, 2013.
            Each event is counted on its recorded date.
          </p>
          <p>
            Click rate uses click events divided by ad views. Repeat
            clicks are included, so it is not the percentage of unique
            people or ads that received a click.
          </p>
          <p>
            Conversions are tracked actions, not confirmed sales or
            unique customers. Some events could not be linked to an ad view.
          </p>
          <p>
            Costs use dataset units, not birr or dollars. Exact duplicate
            records count once. Prices above bid remain included and flagged.
            An asterisk marks partial cost; related cost ratios are withheld.
          </p>
        </div>
      </details>

    </div>
  );
}

export default function Home({
  searchParams,
}: {
  searchParams: Params;
}) {
  return (
    <main className="min-h-screen bg-slate-50 px-5 py-8 text-slate-900 sm:px-8">
      <Suspense
        fallback={
          <div className="mx-auto max-w-7xl rounded-2xl bg-white p-8 text-slate-600">
            Loading campaign performance…
          </div>
        }
      >
        <Performance searchParams={searchParams} />
      </Suspense>
    </main>
  );
}