import Link from "next/link";
import { Suspense } from "react";
import sql from "@/lib/db";

type Params = Promise<Record<string, string | string[] | undefined>>;

function number(value: unknown, digits = 2) {
  if (value === null || value === undefined) return "—";
  return Number(value).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });
}

function dayNumber(value: string) {
  return Date.parse(`${value}T00:00:00Z`) / 86_400_000;
}

async function Pacing({ searchParams }: { searchParams: Params }) {
  const params = await searchParams;

  const rows = await sql`
    SELECT event_date::text AS date, advertiser_id, recorded_cost,
           unusable_paying_price_rows
    FROM public.daily_campaign_metrics
    ORDER BY event_date, advertiser_id
  `;

  if (!rows.length) return <p>No daily metrics available.</p>;

  const dates = [...new Set(rows.map((row) => String(row.date)))].sort();
  const campaigns = [
    ...new Set(rows.map((row) => String(row.advertiser_id))),
  ].sort();

  function text(key: string, fallback: string) {
    return typeof params[key] === "string" ? params[key] : fallback;
  }

  const requestedCampaign = text("campaign", "all");
  const campaign = campaigns.includes(requestedCampaign)
    ? requestedCampaign
    : "all";

  const requestedStart = text("start", dates[0]);
  const requestedEnd = text("end", dates[dates.length - 1]);
  const requestedAsOf = text("asof", dates[dates.length - 1]);

  const start = dates.includes(requestedStart) ? requestedStart : dates[0];
  const end = dates.includes(requestedEnd)
    ? requestedEnd
    : dates[dates.length - 1];
  const asof = dates.includes(requestedAsOf)
    ? requestedAsOf
    : dates[dates.length - 1];

  const budgetText = text("budget", "");
  const budget = Number(budgetText);
  const validBudget = budgetText.trim() !== "" && Number.isFinite(budget) && budget > 0;
  const validDates = start <= end && asof >= start && asof <= end;

  const periodRows = rows.filter(
    (row) =>
      (campaign === "all" || row.advertiser_id === campaign) &&
      row.date >= start &&
      row.date <= end,
  );

  const observed = periodRows.filter((row) => row.date <= asof);

  const actual = observed.reduce(
    (sum, row) => sum + Number(row.recorded_cost ?? 0),
    0,
  );

  const unusable = observed.reduce(
    (sum, row) => sum + Number(row.unusable_paying_price_rows),
    0,
  );

  const missingCost = observed.some((row) => row.recorded_cost === null);

  const totalDays = dayNumber(end) - dayNumber(start) + 1;
  const elapsedDays = dayNumber(asof) - dayNumber(start) + 1;

  const expected = validBudget && validDates
    ? budget * elapsedDays / totalDays
    : null;

  const projection = validDates && elapsedDays > 0
    ? actual / elapsedDays * totalDays
    : null;

  // Check complete campaign/date coverage within the observed scenario.
  const selectedCampaigns = campaign === "all" ? campaigns : [campaign];
  const observedKeys = new Set(
    observed.map((row) => `${row.advertiser_id}|${row.date}`),
  );
  const expectedRows = validDates ? elapsedDays * selectedCampaigns.length : 0;
  const complete = validDates && observedKeys.size === expectedRows;

  const usable = complete && !missingCost && unusable === 0;
  const showScenario = usable && validBudget && expected !== null;

  const inputClass =
    "mt-2 w-full rounded-lg border border-slate-700 bg-slate-950 p-3";

  return (
    <div className="mx-auto max-w-6xl">
      <nav className="mb-8 flex gap-6 text-cyan-300">
        <Link href="/">Performance</Link>
        <Link href="/pacing" aria-current="page">Pacing</Link>
      </nav>

      <h1 className="text-3xl font-bold">Budget Scenario Pacing</h1>
      <p className="mt-3 text-slate-400">
        Historical recorded cost against a hypothetical, evenly distributed
        budget. Values use scaled dataset units. This is not a live budget.
      </p>

      <form method="get" action="/pacing"
        className="mt-8 grid gap-4 rounded-xl bg-slate-900 p-6 sm:grid-cols-3">
        <label>
          Campaign
          <select name="campaign" defaultValue={campaign} className={inputClass}>
            <option value="all">All campaigns — combined budget</option>
            {campaigns.map((id) => <option key={id}>{id}</option>)}
          </select>
        </label>

        <label>
          Start date
          <select name="start" defaultValue={start} className={inputClass}>
            {dates.map((date) => <option key={date}>{date}</option>)}
          </select>
        </label>

        <label>
          End date
          <select name="end" defaultValue={end} className={inputClass}>
            {dates.map((date) => <option key={date}>{date}</option>)}
          </select>
        </label>

        <label>
          As of end of day
          <select name="asof" defaultValue={asof} className={inputClass}>
            {dates.map((date) => <option key={date}>{date}</option>)}
          </select>
        </label>

        <label>
          Scenario budget — scaled units
          <input name="budget" type="number" min="0.001" step="any"
            defaultValue={budgetText} required className={inputClass} />
        </label>

        <button className="self-end rounded-lg bg-cyan-400 p-3 font-semibold text-slate-950">
          Calculate scenario
        </button>
      </form>

      {!validDates && (
        <p role="alert" className="mt-5 text-amber-300">
          Select a start date no later than the end date, with the as-of date
          inside that period.
        </p>
      )}

      {validDates && !usable && (
        <p role="alert" className="mt-5 text-amber-300">
          The selected period has missing coverage or unusable cost records.
          Pacing calculations are withheld.
        </p>
      )}

      {!validBudget && (
        <p className="mt-5 text-slate-400">
          Enter a positive scenario budget to calculate pacing.
        </p>
      )}

      {showScenario && (
        <>
          <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ["Recorded cost to date", number(actual, 3)],
              ["Expected cost to date", number(expected, 3)],
              ["Actual / expected", `${number(100 * actual / expected)}%`],
              ["Projected period cost", number(projection, 3)],
            ].map(([label, value]) => (
              <div key={label} className="rounded-xl bg-slate-900 p-6">
                <p className="text-sm text-slate-400">{label}</p>
                <p className="mt-3 text-2xl font-bold">{value}</p>
              </div>
            ))}
          </section>

          <p className="mt-5 text-slate-300">
            {elapsedDays} of {totalDays} days included. Recorded cost is{" "}
            {actual > expected ? "above" : actual < expected ? "below" : "equal to"}{" "}
            the scenario’s uniform spending target.
          </p>
        </>
      )}

      <p className="mt-6 text-sm text-slate-400">
        Projection assumes the observed average daily cost continues.
        It is a simple scenario, not a forecast model. As-of dates include
        the complete recorded day; intraday replay is not implemented here.
      </p>
    </div>
  );
}

export default function Page({ searchParams }: { searchParams: Params }) {
  return (
    <main className="min-h-screen bg-slate-950 p-8 text-white">
      <Suspense fallback={<p>Loading pacing scenario...</p>}>
        <Pacing searchParams={searchParams} />
      </Suspense>
    </main>
  );
}