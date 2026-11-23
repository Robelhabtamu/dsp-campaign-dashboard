"use client";

import { useState, type FormEvent } from "react";
import { ASK_DISABLED, askError, readAskResponse, type AskResponse } from "@/lib/ask-contract";
import { answerItems } from "@/lib/ask-presentation";
import type { Filters } from "@/lib/metrics";

export function AskResult({ result }: { result: AskResponse }) {
  const items = result.status === "approved" && result.answer ? answerItems(result.answer) : null;
  const statusLabels = { approved: "Approved", withheld: "Withheld", unanswerable: "Unanswerable", error: "Error" };
  return <section className="mt-6 space-y-4" aria-label="Question result" aria-live="polite">
    {result.demoMode && <p className="panel font-semibold">SYNTHETIC DATA — {result.demoMode === "synthetic_ai" ? "Gemini generation and Cohere judgment against the isolated fixture; not live analytics." : "Scripted planner and judge; no AI provider calls."}</p>}
    {result.status !== "approved" && <div className="panel" role={result.status === "error" ? "alert" : "status"}>
      <h2 className="text-xl font-semibold">{result.errorCode === "advertiser_required" ? "Which advertiser?" : result.errorCode === "comparison_dates_required" ? "Which dates?" : statusLabels[result.status]}</h2><p className="mt-2">{result.message}</p>
    </div>}
    {result.status === "approved" && result.answer && <article className="panel">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-xl font-semibold">Approved answer</h2><span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800">Verified against data</span></div>
      {items ? <dl className="mt-4 grid gap-4 sm:grid-cols-2">{items.map((item, i) => <div key={i} className="rounded-xl bg-slate-50 p-4"><dt className="text-sm text-slate-600">{item.label}</dt><dd className="mt-1 break-words text-2xl font-semibold">{item.value}</dd></div>)}</dl> : <p className="mt-3 whitespace-pre-wrap">{result.answer}</p>}
      {result.evidence.some(e => e.limitReached) && <p className="mt-3 text-sm text-amber-800">The row limit was reached. Results may be incomplete.</p>}
    </article>}
    {(result.executedSql.length > 0 || result.evidence.length > 0) && <details className="panel">
      <summary className="cursor-pointer font-semibold">View SQL &amp; supporting evidence</summary>
      <div className="mt-5 space-y-5">
    {result.executedSql.length > 0 && <section>
      <h2 className="text-xl font-semibold">Executed SQL</h2>
      {result.executedSql.map((query, i) => <pre key={i} className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm"><code>{query}</code></pre>)}
    </section>}
    {(result.executedSql.length > 0 || result.evidence.length > 0) && <section>
      <h2 className="text-xl font-semibold">Evidence provenance</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          ["Generator", result.provenance.generator ?? "Not reported"],
          ["Agent steps", result.provenance.steps ?? "Not reported"],
          ["SQL calls", result.provenance.sqlCalls ?? "Not reported"],
          ["Answer attempts", result.provenance.answerAttempts ?? "Not reported"],
        ].filter(([, value]) => value !== "Not reported").map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd>{value}</dd></div>)}
      </dl>

    </section>}
    {result.evidence.map((e, i) => <section className="overflow-x-auto" key={i}>
      <h2 className="text-xl font-semibold">Supporting evidence {i + 1}</h2>
      <p className="mt-3 text-sm text-slate-600">Source: {e.source === "synthetic_fixture" ? "SYNTHETIC FIXTURE — not live observations" : e.source === "database" ? "Database (reported by backend)" : "Not reported"}.
        {" "}SQL execution: {e.queryExecuted === true ? "Reported executed" : e.queryExecuted === false ? "Not executed" : "Not reported"}. Returned rows: {e.rows.length}.</p>
      {e.sql && <details className="mt-3"><summary className="cursor-pointer font-semibold">SQL for this evidence</summary><pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-sm"><code>{e.sql}</code></pre></details>}
      <p className="my-3 text-sm text-slate-600">Bound parameters: {JSON.stringify(e.parameters)}. {e.limitReached ? "The row limit was reached; more rows may exist." : "Returned rows shown below."}</p>
      {e.rows.length === 0 ? <p>No evidence rows returned.</p> : <table>
        <caption className="sr-only">SQL evidence {i + 1}; no interpretation beyond the returned values</caption>
        <thead><tr>{e.columns.map((column, c) => <th scope="col" key={c}>{column}</th>)}</tr></thead>
        <tbody>{e.rows.map((row, r) => <tr key={r}>{row.map((value, c) => <td key={c}>{value === null ? "Unavailable (NULL)" : String(value)}</td>)}</tr>)}</tbody>
      </table>}
    </section>)}
      </div>
    </details>}
  </section>;
}

export default function AskPanel({ selection, enabled = false, demo }: { selection: Filters; enabled?: boolean; demo?: { aiAvailable: boolean } }) {
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AskResponse | null>(null);
  const [mode, setMode] = useState("synthetic_scripted");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled || pending) { setResult(askError(ASK_DISABLED)); return; }
    setPending(true); setResult(null);
    try {
      const response = await fetch("/api/ask", { method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, campaign: selection.campaign, from: selection.from, to: selection.to, ...(demo ? { mode } : {}) }) });
      const raw: unknown = await response.json();
      // The server projects the transport shape and Python validates
      // claims. Never render unexpected network objects or driver error strings.
      setResult(readAskResponse(raw));
    } catch { setResult(askError()); }
    finally { setPending(false); }
  }
  return <>
    {!enabled && <p className="panel mb-5" role="status">{demo ? "Synthetic submission needs a healthy backend and supported fixture filters." : ASK_DISABLED} You can draft a question, but submitting it is disabled.</p>}
    <form onSubmit={submit} className="panel">
      {demo && <>
        <p className="mb-3 font-semibold">Synthetic scripted demo — selected-scope totals only, not a general AI chat.</p>
        <p className="mb-3 text-sm">{demo.aiAvailable ? "AI mode requires an approved metered run; examples below use free scripted mode." : "Gemini/Cohere mode has no available approved run budget. The free scripted examples work without AI calls."}</p>
        <fieldset className="mb-4"><legend className="font-semibold">Supported synthetic examples</legend>
          <p className="my-2 text-sm">Choose one to fill the question, then click Ask the Data. Answers use the current campaign and inclusive date filters.</p>
          <div className="flex flex-wrap gap-2">{[
            "How many click events are in the selected scope?",
            "How many impression events are in the selected scope?",
            "What is the recorded cost in scaled units for the selected scope?",
          ].map(example => <button key={example} type="button" className="rounded border border-blue-300 px-3 py-2 text-left text-blue-700" disabled={!enabled || pending} onClick={() => { setMode("synthetic_scripted"); setQuestion(example); setResult(null); }}>{example}</button>)}</div>
        </fieldset>
      </>}
      {demo && <label className="mb-4 block">Synthetic demo provider mode<select aria-label="Synthetic demo provider mode" className="ml-3 rounded border p-2" value={mode} onChange={event => setMode(event.target.value)}><option value="synthetic_scripted">Scripted simulation (free, no AI calls)</option><option value="synthetic_ai" disabled={!demo.aiAvailable}>Gemini + Cohere (approved run budget only)</option></select></label>}
      <label htmlFor="ask-question" className="font-semibold">Your campaign data question</label>
      <textarea id="ask-question" className="mt-3 block min-h-32 w-full rounded-lg border border-slate-300 p-3" maxLength={1000}
        value={question} onChange={(event) => setQuestion(event.target.value)} required
        placeholder="For example: How many click events did advertiser 1458 record?" aria-describedby="ask-help" />
      <p id="ask-help" className="my-3 text-sm text-slate-600">Up to 1,000 characters. Approved campaign metrics only; revenue, profit, ROI and causal explanations are unavailable. {demo ? "Synthetic fixture only. Scripted mode supports selected-scope event totals; ‘demo withhold’ exercises rejection. Gemini/Cohere mode has a separate bounded paid-run allowance." : "Include an advertiser ID or say all advertisers. For comparisons, include two dates (YYYY-MM-DD)."}</p>
      <button className="action disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!enabled || pending || !question.trim()}>{pending ? "Checking evidence…" : "Ask the Data"}</button>
    </form>
    {result && <AskResult result={result} />}
  </>;
}
