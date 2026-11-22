import { insightDefinitions, type InsightsState } from "../lib/insights";

export default function InsightsPanel({ state }: { state: InsightsState }) {
  return <section className="panel my-6" aria-label="Validated AI insights">
    <h2 className="text-xl font-semibold">Insights</h2>
    {state.status !== "approved" ? <p role="status" className="mt-3 text-sm text-slate-600">{
      state.status === "loading" ? "Loading approved insights…" : state.status === "empty" ?
        "No approved insights for this selection. Missing history or withheld explanations do not mean no activity." :
        "Live insights unavailable. The authorized published-insight backend is not enabled; no AI calls or demo results are used."}</p> :
      <div className="grid gap-4 mt-4 md:grid-cols-2">{state.items.map(item => <article key={item.kind} className="rounded-lg border border-slate-200 p-4">
        <h3 className="font-semibold">{insightDefinitions[item.kind].title}</h3>
        <p className="text-sm my-2">{insightDefinitions[item.kind].meaning} Cause is not established by this evidence.</p>
        <p className="text-xs">{item.source === "database" ? "Source: approved campaign marts" : "SYNTHETIC TEST FIXTURE — not live observations"}</p>
        <p className="text-xs">Advertisers: {item.campaigns.join(", ")}</p>
        <table className="w-full text-sm my-3"><caption className="text-left">Approved supporting values</caption><thead><tr><th scope="col">Metric</th><th scope="col">Current</th><th scope="col">Previous</th></tr></thead>
          <tbody>{insightDefinitions[item.kind].metrics.map(metric => <tr key={metric}><th scope="row" className="text-left">{metric.replaceAll("_", " ")}</th>{["current", "previous"].map(window => <td key={window}>{new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(item.values[`${window}_${metric}`])}{metric.endsWith("percent") ? "%" : ""}</td>)}</tr>)}</tbody></table>
        <details><summary className="cursor-pointer text-sm">Comparison windows and SQL evidence</summary>{item.provenance.map(p => <div key={p.window_name} className="mt-3 text-xs"><p>{p.window_name}: {p.window.join(" to ")} (inclusive)</p><p>{p.query_executed ? "Executed restricted query" : "Fixture query — not executed"}</p><pre className="overflow-auto whitespace-pre-wrap">{p.sql}</pre><p>Bound parameters: {JSON.stringify(p.parameters)}</p></div>)}</details>
      </article>)}</div>}
  </section>;
}
