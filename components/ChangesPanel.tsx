import { causeStatement, formatChangeNumber } from "@/lib/changes";

import { percentageChange, type DisplayChangesState } from "@/lib/changes-preview";

const emptyStates = {
  insufficient_history: { title: "Not enough usable history to score this selection", detail: "The detector withheld scoring for incomplete history, missing hours or a constant baseline. These are diagnostics, not evidence of no anomalies." },
  unconfigured: { title: "What Changed is not connected yet", detail: "Published anomaly results are not connected to this dashboard. No live alerts are being shown." },
  error: { title: "Changes couldn’t be loaded", detail: "The reporting service is unavailable. Try reloading this page." },
  empty: { title: "No published changes for this selection", detail: "Try another campaign or a wider date range. An empty result does not mean there were no anomalies; analysis may not have run or history may be incomplete." },
};
export default function ChangesPanel({ state }: { state: DisplayChangesState }) {
  const preview = !!state.preview;
  const diagnostics = state.preview && <details className="panel mt-5"><summary className="cursor-pointer font-semibold">Coverage &amp; baseline diagnostics</summary><p className="mt-3 text-sm">Selected hourly metric observations: {state.preview.samples}. Diagnostic counts do not have a direction because no anomaly score was established.</p><dl className="mt-3 grid gap-3 sm:grid-cols-2">{Object.entries(state.preview.diagnostics).map(([name, count]) => <div key={name}><dt>{name.replaceAll("_", " ")}</dt><dd>{count}</dd></div>)}</dl></details>;
  if (state.status !== "ready") {
    const message = preview && state.status === "empty" ? { title: "No synthetic alerts for this selection", detail: "No fixture anomaly matches these filters. This is a synthetic preview and says nothing about live campaigns." } : emptyStates[state.status];
    return <><section className="panel" role={state.status === "error" ? "alert" : "status"}>
      <h2 className="text-xl font-semibold">{message.title}</h2>
      <p className="mt-3 max-w-2xl text-slate-600">{message.detail}</p>
    </section>{diagnostics}</>;
  }
  return <>
    <section className="mb-6 grid gap-4 sm:grid-cols-3" aria-label="Published changes summary">
      {[
        [preview ? "Synthetic alerts" : "Published alerts", state.items.length],
        ["Above baseline", state.items.filter(item => item.evidence.direction === "above").length],
        ["Below baseline", state.items.filter(item => item.evidence.direction === "below").length],
      ].map(([label, value]) => <div key={label} className="panel"><p className="text-sm text-slate-600">{label}</p><p className="mt-2 text-3xl font-semibold">{value}</p></div>)}
    </section>
    {state.omitted > 0 && <p role="status" className="mb-4 text-sm text-amber-800">Some records could not be validated and were omitted.</p>}
    {state.limited && <p role="status" className="mb-4 text-sm text-slate-600">Showing the latest 100 published alerts. Narrow the filters to see a smaller selection.</p>}
    <section aria-label="Published anomaly explanations" className="space-y-5">
      {state.items.map(item => {
        const e = item.evidence;
        const metric = e.metric.charAt(0).toUpperCase() + e.metric.slice(1);
        return <article key={item.id} className="panel">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><p className="text-sm text-slate-500">Advertiser {e.advertiser_id} · <time dateTime={e.observation_timestamp}>{e.observation_timestamp.slice(0, 10)} at {e.observation_timestamp.slice(11, 16)}</time></p>
              <h2 className="mt-1 text-xl font-semibold">{metric} {e.direction} baseline</h2></div>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${e.direction === "above" ? "bg-amber-50 text-amber-800" : "bg-blue-50 text-blue-800"}`}>{preview ? "Synthetic statistical alert" : "Validated change"}</span>
          </div>
          {preview && <p className="mt-3 text-xs font-semibold text-amber-800">Deterministic statistical description · not AI-generated</p>}
          <p className="mt-4 text-slate-700">Recorded {formatChangeNumber(e.observed_value)} {e.metric}, compared with a prior-hour baseline mean of {formatChangeNumber(e.baseline_mean)}.</p>
          <dl className="mt-4 grid gap-4 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
            {[["Observed", e.observed_value], ["Baseline mean", e.baseline_mean], ["Z-score", e.z_score]].map(([label, value]) => <div key={String(label)}><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 text-xl font-semibold">{formatChangeNumber(value as number)}</dd></div>)}
          </dl>
          <p className="mt-3 text-sm text-slate-600">Change from baseline: {percentageChange(e.observed_value, e.baseline_mean)}</p>
          <details className="mt-4 border-t border-slate-100 pt-4">
            <summary className="cursor-pointer text-sm font-semibold text-blue-700">View baseline &amp; validation details</summary>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              {[["Baseline starts", e.baseline_window[0].replace("T", " ")], ["Baseline ends (exclusive)", e.baseline_window[1].replace("T", " ")],
                ["Prior hourly observations", formatChangeNumber(e.baseline_sample_count)], ["Sample standard deviation", formatChangeNumber(e.baseline_stddev)],
                ["Method", item.provider === "deterministic" ? "Deterministic statistics (no AI calls)" : item.provider], ["Generation rounds", item.attempts]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd>{value}</dd></div>)}
            </dl>
            <p className="mt-4 text-sm text-slate-600">{causeStatement} This score describes deviation, not statistical significance. Only prior observations from the same advertiser are compared. Missing hours are never filled with zero.</p>
          </details>
        </article>;
      })}
    </section>
    {diagnostics}
    <p className="mt-5 text-xs text-slate-500">{preview ? "Source: deterministic synthetic hourly observations; not live campaign data." : "Source: hourly campaign metrics. Only validated, published explanations are shown. Batch execution, withheld counts and insufficient history are not reported by this view."} Recorded-hour timezone is unconfirmed.</p>
  </>;
}
