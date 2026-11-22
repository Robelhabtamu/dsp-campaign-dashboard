import { Suspense } from "react";
import Filters from "@/components/Filters";
import { publishedChanges } from "@/lib/changes-data";
import { changesDates, changesFilters, changesMessage, causeStatement, formatChangeNumber } from "@/lib/changes";
import type { Params } from "@/lib/metrics";

async function Changes({ searchParams }: { searchParams: Promise<Params> }) {
  const selection = changesFilters(await searchParams);
  const heading = <>
    <h1 className="text-3xl font-bold">What Changed</h1>
    <Filters route="/changes" value={selection} dates={changesDates} />
  </>;
  if (selection.error) return heading;
  const state = await publishedChanges(selection);
  return <>
    {heading}
    <p className="mb-5 text-sm text-slate-600">
      {selection.campaign === "all" ? "All campaigns" : `Advertiser ${selection.campaign}`} · {selection.from} to {selection.to} (inclusive observation dates).
      Historical recorded hours; source timezone is unassigned. No demo or mock observations are shown.
    </p>
    <p role={state.status === "error" ? "alert" : "status"} className="panel mb-5">{changesMessage(state)}</p>
    <p className="mb-5 text-sm text-slate-600">Only accepted, published explanations are visible. Withheld explanations, missing-history diagnostics and batch freshness are not exposed by this read-only view, so their counts and status are unknown here. An empty selection may also reflect a batch that has not run.</p>
    {state.omitted > 0 && <p role="status" className="panel mb-5 text-amber-800">Some returned records failed display validation and were omitted. Their text is not shown.</p>}
    {state.limited && <p role="status" className="panel mb-5">Results are limited to the latest 100 validated entries from up to 101 returned records. Narrow the date range or campaign to inspect more.</p>}
    <section aria-label="Published anomaly explanations" className="space-y-5">
      {state.items.map((item) => {
        const e = item.evidence;
        const number = formatChangeNumber;
        return <article className="panel" key={item.id}>
          <h2 className="text-xl font-semibold">{e.metric.charAt(0).toUpperCase() + e.metric.slice(1)} {e.direction} baseline</h2>
          <p className="mt-2 text-sm text-slate-600">Advertiser {e.advertiser_id} · <time dateTime={e.observation_timestamp}>{e.observation_timestamp.replace("T", " ")}</time> · Accepted publication · Generator: {item.provider} · Generation rounds: {item.attempts}</p>
          <h3 className="mt-4 font-semibold">Validated explanation</h3>
          <p className="mt-2">Observed {number(e.observed_value)} {e.metric}, {e.direction} the prior baseline mean of {number(e.baseline_mean)}. The sample standard deviation was {number(e.baseline_stddev)} across {number(e.baseline_sample_count)} prior hourly observations; z-score {number(e.z_score)}.</p>
          <p className="mt-2 text-sm text-slate-600">{causeStatement} This descriptive score does not establish statistical significance or a recurring weekday pattern.</p>
          <details className="mt-4">
            <summary className="cursor-pointer font-semibold">Supporting evidence</summary>
            <dl className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                ["Metric", e.metric], ["Observed count", number(e.observed_value)],
                ["Baseline mean (count)", number(e.baseline_mean)], ["Sample standard deviation", number(e.baseline_stddev)],
                ["Baseline sample count", number(e.baseline_sample_count)], ["Z-score", number(e.z_score)],
                ["Baseline start (inclusive)", e.baseline_window[0].replace("T", " ")],
                ["Baseline end (exclusive)", e.baseline_window[1].replace("T", " ")],
              ].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd>{value}</dd></div>)}
            </dl>
            <p className="mt-3 text-sm text-slate-600">Baseline uses prior hours of the same campaign and excludes the observation. Missing hours are not assumed to be zero. Values are displayed to six decimal places; very small values use scientific notation.</p>
          </details>
        </article>;
      })}
    </section>
  </>;
}

export default function Page({ searchParams }: { searchParams: Promise<Params> }) {
  return <main className="dashboard"><Suspense fallback={<p role="status">Loading published changes…</p>}><Changes searchParams={searchParams} /></Suspense></main>;
}
