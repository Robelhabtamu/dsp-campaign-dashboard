/** Transport/display shapes only. Numerical/SQL validation belongs to Python. */
export type AskStatus = "approved" | "withheld" | "unanswerable" | "error";
export type Cell = string | number | boolean | null;
export type AskEvidence = { columns: string[]; rows: Cell[][]; parameters: Cell[]; limitReached: boolean;
  sql: string | null; source: "synthetic_fixture" | "database" | "unreported"; queryExecuted: boolean | null };
export type AskProvenance = { generator: "gemini" | "groq" | null; steps: number | null; sqlCalls: number | null; answerAttempts: number | null };
export const askFailures = {
  demo_scope: "Use synthetic advertiser 1458 or 3358 (or all), June 6–8, 2013. Ask about the selected filters, or select a supported example.",
  demo_question: "Scripted mode supports totals for the selected filters only. Use a supported example; change the campaign/date filters instead of requesting another scope in the question.",
  demo_rate_limit: "The synthetic demo allows six questions per minute. Wait one minute, then click Ask again. No answer was generated.",
  demo_ai_budget: "The approved AI run budget is unavailable or exhausted. Select Scripted simulation to use the free examples. No provider call was made.",
  demo_origin: "This request origin is not allowed. Open the demo at http://127.0.0.1:3001/ask and try again.",
  demo_backend: "The Python demo service is unavailable. Restart both services with .venv/bin/python ai/run_local_demo.py, then reload this page.",
} as const;
export type AskErrorCode = keyof typeof askFailures;
export type AskResponse = { status: AskStatus; answer: string | null; executedSql: string[]; evidence: AskEvidence[]; message: string; provenance: AskProvenance; demoMode?: "synthetic_scripted" | "synthetic_ai"; errorCode?: AskErrorCode };
export const ASK_DISABLED = "Ask the Data is unavailable until secure sign-in, authorization, rate limiting and the Python service are configured.";
const messages: Record<AskStatus, string> = {
  approved: "Approved answer, validated against SQL evidence and by the judge.",
  withheld: "The answer was withheld because it could not be validated. Rejected text is not shown.",
  unanswerable: "The available approved data could not establish an answer to this question.",
  error: "The request could not be completed safely. No answer is available.",
};
const object = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown, max: number): v is string => typeof v === "string" && v.length <= max;
const cell = (v: unknown): v is Cell => v === null || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) || text(v, 256);
const boundedCount = (v: unknown, max: number) => typeof v === "number" && Number.isInteger(v) && v >= 0 && v <= max ? v : null;

export function askError(message = messages.error): AskResponse {
  return { status: "error", answer: null, executedSql: [], evidence: [], message,
    provenance: { generator: null, steps: null, sqlCalls: null, answerAttempts: null } };
}
export function askFailure(code: AskErrorCode): AskResponse { return { ...askError(askFailures[code]), errorCode: code }; }

export function projectAgentResponse(raw: unknown): AskResponse {
  if (!object(raw) || !["approved", "withheld", "unanswerable", "error"].includes(String(raw.status))) return askError();
  const status = raw.status as AskStatus;
  if (status === "approved" && (!object(raw.answer) || !text(raw.answer.text, 12000) || !raw.answer.text.trim())) return askError();
  if (!Array.isArray(raw.executed_sql) || raw.executed_sql.length > 5 || !raw.executed_sql.every((s) => text(s, 12000)) || !Array.isArray(raw.evidence) || raw.evidence.length > 5) return askError();
  const evidence: AskEvidence[] = [];
  for (const e of raw.evidence) {
    if (!object(e) || !Array.isArray(e.columns)) return askError();
    const width = e.columns.length;
    if (width > 30 || !e.columns.every((c) => text(c, 63)) ||
      !Array.isArray(e.rows) || e.rows.length > 1000 || !e.rows.every((r) => Array.isArray(r) && r.length === width && r.every(cell)) ||
      !Array.isArray(e.parameters) || e.parameters.length > 200 || !e.parameters.every(cell) || typeof e.limit_reached !== "boolean") return askError();
    evidence.push({ columns: e.columns, rows: e.rows, parameters: e.parameters, limitReached: e.limit_reached,
      sql: text(e.executed_sql, 12000) ? e.executed_sql : null,
      source: e.source === "synthetic_fixture" || e.source === "database" ? e.source : "unreported",
      queryExecuted: typeof e.query_executed === "boolean" ? e.query_executed : null });
  }
  const demoMode = raw.demo_mode === "synthetic_scripted" || raw.demo_mode === "synthetic_ai" ? raw.demo_mode : undefined;
  return { status, answer: status === "approved" ? (raw.answer as { text: string }).text : null,
    ...(demoMode ? { demoMode } : {}),
    executedSql: raw.executed_sql, evidence, message: demoMode === "synthetic_scripted" && status === "approved" ? "Scripted demo control accepted against real synthetic SQL evidence. No LLM or Cohere was called." : demoMode === "synthetic_scripted" && status === "unanswerable" ? "Scripted mode cannot answer that question. It supports only total clicks, impressions, conversions or recorded cost for the selected filters. Choose an example; CTR, comparisons, revenue and causal questions are not supported." : messages[status], provenance: {
      generator: raw.provider_used === "gemini" || raw.provider_used === "groq" ? raw.provider_used : null,
      steps: boundedCount(raw.steps, 20), sqlCalls: boundedCount(raw.sql_calls, 5), answerAttempts: boundedCount(raw.answer_attempts, 2),
    } };
}

/** Validate the public wire shape again in the browser; discard remote messages. */
export function readAskResponse(raw: unknown): AskResponse {
  if (!object(raw) || !Array.isArray(raw.evidence) || raw.evidence.length > 5) return askError();
  if (raw.status === "error" && typeof raw.errorCode === "string" && Object.hasOwn(askFailures, raw.errorCode)) return askFailure(raw.errorCode as AskErrorCode);
  const provenance = object(raw.provenance) ? raw.provenance : {};
  return projectAgentResponse({ status: raw.status, answer: { text: raw.answer }, executed_sql: raw.executedSql,
    demo_mode: raw.demoMode,
    provider_used: provenance.generator, steps: provenance.steps, sql_calls: provenance.sqlCalls, answer_attempts: provenance.answerAttempts,
    evidence: raw.evidence.map((e) => object(e) ? {
      columns: e.columns, rows: e.rows, parameters: e.parameters, limit_reached: e.limitReached,
      executed_sql: e.sql, source: e.source, query_executed: e.queryExecuted,
    } : null) });
}
