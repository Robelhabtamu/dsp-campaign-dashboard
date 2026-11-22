import { Suspense } from "react";
import { dailyRows } from "@/lib/data";
import { days, filters, fmt, ids, pacing, type Params } from "@/lib/metrics";
import Filters from "@/components/Filters";
import { Cards } from "@/components/MetricsUI";
import SpendingChart from "@/components/SpendingChart";

async function Pacing({ searchParams }: { searchParams: Promise<Params> }) {
  const params = await searchParams;
  const rows = await dailyRows();
  if (!rows.length)
    return (
      <p className="panel" role="status">
        No campaign data available. Daily metrics have not been loaded.
      </p>
    );
  const dates = [...new Set(rows.map((r) => r.date))].sort();
  const f = filters(params, dates);
  const heading = (
    <>
      <h1 className="text-3xl font-bold">Budget &amp; pacing</h1>
      <Filters route="/pacing" value={f} dates={dates} />
    </>
  );
  if (f.error) return heading;
  const campaigns = f.campaign === "all" ? ids : [f.campaign];
  const p = pacing(rows, campaigns, f.from, f.to);
  const chart = days(p.start, f.to).map((date) => {
    const point = pacing(rows, campaigns, p.start, date);
    return { date, actual: point.cumulative, planned: point.planned };
  });
  return (
    <>
      {heading}
      <p className="panel mb-6 border-amber-200 bg-amber-50 text-sm text-amber-900">
        <strong>DEMO budget assumption:</strong> 250,000 scaled dataset units
        per campaign for June 6–12, 2013. Even daily allocation. Actual budgets
        are not provided.
      </p>
      <p className="mb-5 text-sm text-slate-600">
        Selected range: {f.from} to {f.to} (inclusive). Cumulative values always
        start June 6.
      </p>
      {(p.cumulative === null || p.range === null) && (
        <p role="status" className="panel mb-5 text-amber-800">
          Required campaign-day coverage or usable cost is missing. Affected
          spending totals, pacing conclusions, and final spending estimates are
          unavailable.
        </p>
      )}
      <Cards
        items={[
          {
            label: "Full campaign DEMO budget",
            value: fmt(p.budget),
            definition: "Assumed budget of 250,000 scaled units per selected campaign for June 6–12.",
          },
          {
            label: "Spending in selected range",
            value: fmt(p.range, 3),
            definition: `Recorded spending from ${f.from} through ${f.to}, in scaled units.`,
          },
          {
            label: "Cumulative spending",
            value: fmt(p.cumulative, 3),
            definition: `Total spending from June 6 through ${f.to}, in scaled units.`,
          },
          {
            label:
              p.remaining !== null && p.remaining < 0
                ? "Amount over DEMO budget"
                : "Remaining full campaign budget",
            value: fmt(p.remaining === null ? null : Math.abs(p.remaining), 3),
            definition:
              "How much of the DEMO budget is left, or how far spending has exceeded it. Scaled units.",
          },
          {
            label: "Expected cumulative spending",
            value: fmt(p.planned, 3),
            definition:
              "Planned spending by the selected end date if the DEMO budget is spread evenly. Scaled units.",
          },
          {
            label:
              p.difference === null
                ? "Difference from spending plan"
                : p.difference > 0
                  ? "Ahead of spending plan"
                  : p.difference < 0
                    ? "Behind spending plan"
                    : "On spending plan",
            value: fmt(
              p.difference === null ? null : Math.abs(p.difference),
              3,
            ),
            definition:
              "How far spending is ahead of or behind the DEMO plan. Scaled units.",
          },
          {
            label: "DEMO budget used",
            value: p.used === null ? "Unavailable" : `${fmt(p.used, 2)}%`,
            definition:
              "Share of the full DEMO budget spent through the selected end date.",
          },
          {
            label: p.atEnd
              ? "Actual final spending"
              : "Estimated final spending",
            value: fmt(p.final, 3),
            definition: p.atEnd
              ? "Actual cumulative cost at campaign end. Scaled units."
              : "Estimated total if the spending pace since June 6 continues to campaign end. Scaled units.",
          },
        ]}
      />
      {p.difference !== null && (
        <p className="mt-5 text-sm text-slate-600">
          {p.difference > 0
            ? "Spending faster than the DEMO plan."
            : p.difference < 0
              ? "Spending slower than the DEMO plan."
              : "Spending matches the DEMO plan."}{" "}
          This describes spending pace, not campaign success.
        </p>
      )}
      <SpendingChart data={chart} />
      {campaigns.length > 1 && (
        <section className="panel mt-6 overflow-x-auto">
          <h2 className="mb-4 text-xl font-semibold">
            Campaign budget summary
          </h2>
          <table>
            <caption className="mb-3 text-left text-sm text-slate-500">
              All amounts in scaled dataset units. Cumulative values: June 6
              through {f.to}.
            </caption>
            <thead>
              <tr>
                {[
                  "Campaign",
                  "DEMO budget",
                  "Range spending",
                  "Cumulative spending",
                  "Remaining / over budget",
                  "Planned cumulative",
                  "Ahead / behind plan",
                  "Budget used (%)",
                  p.atEnd ? "Actual final" : "Estimated final",
                ].map((h) => (
                  <th scope="col" key={h}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((id) => {
                const s = pacing(rows, [id], f.from, f.to);
                return (
                  <tr key={id}>
                    <th scope="row">{id}</th>
                    <td>{fmt(s.budget)}</td>
                    <td>{fmt(s.range, 3)}</td>
                    <td>{fmt(s.cumulative, 3)}</td>
                    <td>
                      {s.remaining === null
                        ? "Unavailable"
                        : `${fmt(Math.abs(s.remaining), 3)} ${s.remaining < 0 ? "over" : "remaining"}`}
                    </td>
                    <td>{fmt(s.planned, 3)}</td>
                    <td>
                      {s.difference === null
                        ? "Unavailable"
                        : `${fmt(Math.abs(s.difference), 3)} ${s.difference >= 0 ? "ahead" : "behind"}`}
                    </td>
                    <td>{fmt(s.used, 2)}</td>
                    <td>{fmt(s.final, 3)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
      <p className="mt-6 text-sm text-slate-600">
        Profitability is unavailable because revenue is not provided.
        Conversions are events, not sales. Remaining budget is not profit.
      </p>
    </>
  );
}
export default function Page({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  return (
    <main className="dashboard">
      <Suspense fallback={<p role="status">Loading budget pacing…</p>}>
        <Pacing searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
