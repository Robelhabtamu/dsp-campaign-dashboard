"use client";

import { useState, type FormEvent } from "react";
import { ASK_DISABLED, askError, readAskResponse, type AskResponse } from "@/lib/ask-contract";
import type { Filters } from "@/lib/metrics";

export function AskResult({ result }: { result: AskResponse }) {
  const statusLabels = { approved: "Approved", withheld: "Withheld", unanswerable: "Unanswerable", error: "Error" };
  return <section className="mt-6 space-y-4" aria-label="Question result" aria-live="polite">
    {result.demoMode && <p className="panel font-semibold">SYNTHETIC DATA — {result.demoMode === "synthetic_ai" ? "Gemini generation and Cohere judgment against the isolated fixture; not live analytics." : "Scripted planner and judge; no AI provider calls."}</p>}
    <div className="panel" role={result.status === "error" ? "alert" : "status"}>
      <h2 className="text-xl font-semibold">{statusLabels[result.status]}</h2><p className="mt-2">{result.message}</p>
    </div>
    {result.status === "approved" && result.answer && <article className="panel">
      <h2 className="text-xl font-semibold">Approved answer</h2><p className="mt-3 whitespace-pre-wrap">{result.answer}</p>
    </article>}
    {result.executedSql.length > 0 && <section className="panel">
      <h2 className="text-xl font-semibold">Executed SQL</h2>
      {result.executedSql.map((query, i) => <pre key={i} className="mt-3 overflow-x-auto whitespace-pre-wrap text-sm"><code>{query}</code></pre>)}
    </section>}
    {(result.executedSql.length > 0 || result.evidence.length > 0) && <section className="panel">
      <h2 className="text-xl font-semibold">Evidence provenance</h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {[
          ["Generator", result.provenance.generator ?? "Not reported"],
          ["Agent steps", result.provenance.steps ?? "Not reported"],
          ["SQL calls", result.provenance.sqlCalls ?? "Not reported"],
          ["Answer attempts", result.provenance.answerAttempts ?? "Not reported"],
        ].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd>{value}</dd></div>)}
      </dl>
      <p className="mt-3 text-sm text-slate-600">Execution metadata is supplied by the Python agent. Publication timestamps, source freshness, model IDs and durable audit records are not included in this response. SQL evidence is distinct from an approved model interpretation.</p>
    </section>}
    {result.evidence.map((e, i) => <section className="panel overflow-x-auto" key={i}>
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
      // The authenticated server projects the transport shape and Python validates
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
      <p id="ask-help" className="my-3 text-sm text-slate-600">Up to 1,000 characters. Approved campaign metrics only; revenue, profit, ROI and causal explanations are unavailable. {demo ? "Synthetic fixture only. Scripted mode supports selected-scope event totals; ‘demo withhold’ exercises rejection. Gemini/Cohere mode has a separate bounded paid-run allowance." : "No demo answer will be generated."}</p>
      <button className="action disabled:cursor-not-allowed disabled:opacity-50" type="submit" disabled={!enabled || pending || !question.trim()}>{pending ? "Checking evidence…" : "Ask the Data"}</button>
    </form>
    {result && <AskResult result={result} />}
  </>;
}
