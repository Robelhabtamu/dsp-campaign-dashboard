import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React, { type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { handleAsk, type AskIntegration } from "../lib/ask-api.ts";
import * as presentation from "../lib/ask-presentation.ts";
import * as contract from "../lib/ask-contract.ts";
import { handlePublicAsk } from "../lib/ask-public.ts";
import { changesFilters } from "../lib/changes.ts";
import { href } from "../lib/metrics.ts";

const input = { question: "How many clicks?", campaign: "1458", from: "2013-06-06", to: "2013-06-07" };
const approved = () => ({ status: "approved", answer: { text: "sum_clicks = 12" }, executed_sql: ["SELECT pg_catalog.sum(clicks) FROM approved_mart"],
  evidence: [{ columns: ["sum_clicks"], rows: [[12]], parameters: ["1458"], limit_reached: false }],
  judge_reason: "PRIVATE REASON", raw_provider_logs: "PRIVATE LOGS" });
function request(body: unknown = input, headers: Record<string, string> = {}, method = "POST") {
  return new Request("https://app.test/api/ask", { method,
    headers: { Origin: "https://app.test", "Content-Type": "application/json", ...headers },
    body: method === "POST" ? JSON.stringify(body) : undefined });
}
function integration(overrides: Partial<AskIntegration> = {}) {
  const calls: string[] = [];
  const value: AskIntegration = {
    trustedOrigin: "https://app.test",
    authenticate: async () => { calls.push("authenticate"); return { id: "server-user" }; },
    authorize: async (principal, scope) => { calls.push("authorize"); assert.equal(principal.id, "server-user"); assert.equal(scope.campaign, "1458"); return true; },
    takeRateLimit: async (id) => { calls.push("rate"); assert.equal(id, "server-user"); return { allowed: true, retryAfterSeconds: 0 }; },
    invoke: async (_principal, body) => { calls.push("invoke"); assert.equal(body.question, input.question); return approved(); },
    ...overrides,
  };
  return { value, calls };
}

test("production-disabled boundary fails closed before reading input", async () => {
  const response = await handleAsk(request(), null);
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await response.json()).answer, null);
});

test("unauthenticated requests cannot invoke service or use body-supplied identity", async () => {
  const { value, calls } = integration({ authenticate: async () => null });
  const response = await handleAsk(request({ ...input, userId: "admin" }), value);
  assert.equal(response.status, 401);
  assert.deepEqual(calls, []);
});

test("authorization runs server-side before invocation", async () => {
  const { value, calls } = integration({ authorize: async () => false });
  assert.equal((await handleAsk(request(), value)).status, 403);
  assert.ok(!calls.includes("invoke"));
});

test("rate limiting uses authenticated user and blocks execution", async () => {
  const { value, calls } = integration({ takeRateLimit: async (id) => {
    assert.equal(id, "server-user"); return { allowed: false, retryAfterSeconds: 40 };
  } });
  const response = await handleAsk(request(), value);
  assert.equal(response.status, 429);
  assert.equal(response.headers.get("retry-after"), "40");
  assert.ok(!calls.includes("invoke"));
});

test("authenticated authorized mock invocation projects only public fields", async () => {
  const { value, calls } = integration();
  const response = await handleAsk(request(), value);
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.answer, "sum_clicks = 12");
  assert.deepEqual(calls, ["authenticate", "rate", "authorize", "invoke"]);
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});

test("origin, content type and method checks reject before service", async () => {
  for (const [req, status] of [
    [request(input, { Origin: "https://evil.test" }), 403],
    [request(input, { "Content-Type": "text/plain" }), 415],
    [request(input, {}, "GET"), 405],
  ] as [Request, number][]) {
    const { value, calls } = integration();
    assert.equal((await handleAsk(req, value)).status, status);
    assert.deepEqual(calls, []);
  }
});

test("request byte cap works without trusting Content-Length", async () => {
  const { value, calls } = integration();
  assert.equal((await handleAsk(request({ ...input, question: "x".repeat(5000) }), value)).status, 413);
  assert.equal((await handleAsk(request(input, { "Content-Length": "5000" }), value)).status, 413);
  assert.ok(!calls.includes("invoke"));
});

test("question/filter validation rejects malformed and extra fields", async () => {
  for (const body of [null, {}, { ...input, question: " " }, { ...input, question: "x".repeat(1001) },
    { ...input, campaign: "unknown" }, { ...input, from: "2013-06-08", to: "2013-06-06" },
    { ...input, userId: "admin" }]) {
    const { value, calls } = integration();
    assert.equal((await handleAsk(request(body), value)).status, 400);
    assert.ok(!calls.includes("invoke"));
  }
});

test("malformed JSON and oversized upstream responses fail safely", async () => {
  const { value, calls } = integration();
  const malformed = new Request("https://app.test/api/ask", { method: "POST", headers: { Origin: "https://app.test", "Content-Type": "application/json" }, body: "{invalid" });
  assert.equal((await handleAsk(malformed, value)).status, 400);
  assert.ok(!calls.includes("invoke"));
  const oversized = integration({ invoke: async () => ({ ...approved(), unused: "x".repeat(262145) }) });
  assert.equal((await handleAsk(request(), oversized.value)).status, 503);
});

test("dependency failures return safe errors without private details", async () => {
  for (const overrides of [
    { authenticate: async () => { throw new Error("PRIVATE SESSION"); } },
    { takeRateLimit: async () => { throw new Error("PRIVATE STORE"); } },
    { invoke: async () => { throw new Error("postgresql://PRIVATE SECRET"); } },
  ]) {
    const { value } = integration(overrides);
    const response = await handleAsk(request(), value);
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes("PRIVATE"));
  }
});

test("withheld, unanswerable and error responses never carry rejected answer text", async () => {
  for (const status of ["withheld", "unanswerable", "error"]) {
    const result = contract.projectAgentResponse({ ...approved(), status, answer: { text: "REJECTED PRIVATE" } });
    assert.equal(result.answer, null);
    assert.ok(!JSON.stringify(result).includes("REJECTED"));
    assert.match(result.message, status === "withheld" ? /withheld/ : status === "unanswerable" ? /could not establish/ : /safely/);
  }
});

test("malformed responses fail closed and remote messages are not trusted", () => {
  for (const raw of [null, {}, { ...approved(), answer: null }, { ...approved(), evidence: [{ columns: ["x"], rows: [[1, 2]] }] }]) {
    assert.equal(contract.projectAgentResponse(raw).status, "error");
  }
  const safe = contract.projectAgentResponse(approved());
  const wire = contract.readAskResponse({ ...safe, message: "PRIVATE JUDGE REASON" });
  assert.equal(wire.status, "approved");
  assert.ok(!wire.message.includes("PRIVATE"));
  assert.equal(contract.readAskResponse({ status: "approved", evidence: "wrong" }).status, "error");
});

// Compile TSX to memory using the EXISTING TypeScript package. No builds/files.
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/AskPanel.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const exports: Record<string, ComponentType<never>> = {};
vm.runInNewContext(compiled, { exports, require: (name: string) => name === "@/lib/ask-contract" ? contract : name === "@/lib/ask-presentation" ? presentation : require(name) });
const AskResult = exports.AskResult as unknown as ComponentType<{ result: contract.AskResponse }>;
const AskPanel = exports.default as unknown as ComponentType<{ selection: ReturnType<typeof changesFilters>; enabled: boolean }>;

test("UI renders approved answer, SQL and evidence as escaped text", () => {
  const raw = approved();
  raw.answer.text = '<script>alert("answer")</script>';
  raw.executed_sql = ["<script>SQL</script>"];
  const result = contract.projectAgentResponse(raw);
  const html = renderToStaticMarkup(React.createElement(AskResult, { result }));
  assert.ok(html.includes("Approved answer") && html.includes("Supporting evidence") && html.includes("Executed SQL"));
  assert.ok(!html.includes("<script>"));
  assert.ok(html.includes("&lt;script&gt;"));
});

test("UI renders status-only withholding and disabled question submission", () => {
  const withheld = contract.projectAgentResponse({ ...approved(), status: "withheld" });
  const html = renderToStaticMarkup(React.createElement(AskResult, { result: withheld }));
  assert.ok(html.includes("withheld") && !html.includes("Approved answer"));
  const panel = renderToStaticMarkup(React.createElement(AskPanel, { selection: changesFilters({}), enabled: false }));
  assert.ok(panel.includes("textarea") && panel.includes("disabled=\"\""));
  assert.ok(panel.includes("submitting it is disabled") && !panel.includes("sum_clicks"));
});

test("synthetic panel offers three free clickable questions and explains exhausted AI allowance", () => {
  const Component = exports.default as unknown as ComponentType<{ selection: ReturnType<typeof changesFilters>; enabled: boolean; demo: { aiAvailable: boolean } }>;
  const html = renderToStaticMarkup(React.createElement(Component, { selection: changesFilters({}), enabled: true, demo: { aiAvailable: false } }));
  for (const question of ["How many click events are in the selected scope?", "How many impression events are in the selected scope?", "What is the recorded cost in scaled units for the selected scope?"]) assert.ok(html.includes(question));
  assert.match(html, /no available approved run budget/);
  assert.match(html, /not a general AI chat/);
});

test("Ask navigation filters preserve campaign and inclusive dates", () => {
  const selection = changesFilters(input);
  const params = Object.fromEntries(new URL(href("/ask", selection), "https://app.test").searchParams);
  assert.deepEqual(changesFilters(params), selection);
});

test("provenance round-trips without exposing model logs or judge reasons", () => {
  const raw = { ...approved(), provider_used: "gemini", steps: 6, sql_calls: 1, answer_attempts: 1 };
  const projected = contract.projectAgentResponse(raw);
  assert.deepEqual(projected.provenance, { generator: "gemini", steps: 6, sqlCalls: 1, answerAttempts: 1 });
  assert.deepEqual(contract.readAskResponse(projected), projected);
  const html = renderToStaticMarkup(React.createElement(AskResult, { result: projected }));
  assert.ok(html.includes("Evidence provenance") && html.includes("gemini"));
  assert.ok(!html.includes("PRIVATE"));
});

test("missing provenance is unknown and out-of-bounds metadata is not rendered", () => {
  const projected = contract.projectAgentResponse({ ...approved(), provider_used: "PRIVATE", steps: 99, sql_calls: -1, answer_attempts: "2" });
  assert.deepEqual(projected.provenance, { generator: null, steps: null, sqlCalls: null, answerAttempts: null });
  const html = renderToStaticMarkup(React.createElement(AskResult, { result: projected }));
  assert.ok(!html.includes("Agent steps") && !html.includes("Answer attempts"));
  assert.ok(!html.includes("PRIVATE"));
});

test("synthetic provenance is clearly labeled and evidence SQL is escaped", () => {
  const raw = approved();
  const result = contract.projectAgentResponse({ ...raw, evidence: [{ ...raw.evidence[0],
    executed_sql: "SELECT '<script>synthetic</script>'", source: "synthetic_fixture", query_executed: false }] });
  assert.deepEqual(contract.readAskResponse(result), result);
  const html = renderToStaticMarkup(React.createElement(AskResult, { result }));
  assert.ok(html.includes("SYNTHETIC FIXTURE") && html.includes("not live observations") && html.includes("Not executed"));
  assert.ok(html.includes("SQL for this evidence") && !html.includes("<script>"));
});

test("each terminal state is explicit and only approved status shows answer text", () => {
  for (const status of ["approved", "withheld", "unanswerable", "error"]) {
    const result = contract.projectAgentResponse({ ...approved(), status });
    const html = renderToStaticMarkup(React.createElement(AskResult, { result }));
    assert.ok(html.includes(status.charAt(0).toUpperCase() + status.slice(1)));
    assert.equal(html.includes("Approved answer"), status === "approved");
    assert.equal(html.includes("sum_clicks = 12"), status === "approved");
  }
});

test("actual API route stays unavailable without configured Python service", async () => {
  const routeSource = readFileSync(new URL("../app/api/ask/route.ts", import.meta.url), "utf8");
  const code = ts.transpileModule(routeSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const routeExports: { POST?: (request: Request) => Promise<Response> } = {};
  vm.runInNewContext(code, { process: { env: {} }, exports: routeExports, require: (name: string) => {
    if (name === "server-only") return {};
    if (name === "@/lib/ask-public") return { handlePublicAsk, publicConfig: () => null };
    if (name === "@/lib/ask-demo") return { handleDemoAsk: () => { throw new Error("Demo must remain disabled in this test"); } };
    if (name === "@/lib/ask-demo-runtime") return { localDemoConfig: () => null };
    throw new Error("Unexpected dependency in disabled route");
  } });
  assert.ok(routeExports.POST);
  const response = await routeExports.POST(request());
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.answer, null);
  assert.deepEqual(body.evidence, []);
  assert.match(body.message, /Python question service/);
});


test("approved answer leads with formatted values and keeps SQL collapsed", () => {
  const raw = approved(); raw.answer.text = "sum_clicks = 2610 (evidence 1, row 1)";
  const html = renderToStaticMarkup(React.createElement(AskResult, { result: contract.projectAgentResponse(raw) }));
  assert.ok(html.includes("Total clicks") && html.includes("2,610"));
  assert.ok(!html.includes("sum_clicks = 2610 (evidence"));
  assert.ok(html.indexOf("Approved answer") < html.indexOf("View SQL"));
  assert.ok(!html.includes("<details open"));
});

test("row-limit warning remains visible beside the approved answer", () => {
  const raw = approved();
  const result = contract.projectAgentResponse({ ...raw, evidence: [{ ...raw.evidence[0], limit_reached: true }] });
  const html = renderToStaticMarkup(React.createElement(AskResult, { result }));
  assert.ok(html.indexOf("Results may be incomplete") < html.indexOf("View SQL"));
});

test("ambiguous advertiser shows a safe clarification instead of generic refusal", () => {
  const result = contract.projectAgentResponse({ status: "unanswerable", answer: null, evidence: [], executed_sql: [], error: { code: "advertiser_required", message: "PRIVATE PROVIDER PROSE" } });
  assert.equal(result.status, "unanswerable");
  assert.equal(result.errorCode, "advertiser_required");
  assert.equal(contract.readAskResponse(result).message, result.message);
  const html = renderToStaticMarkup(React.createElement(AskResult, { result }));
  assert.ok(html.includes("Which advertiser?") && html.includes("all advertisers"));
  assert.ok(!html.includes("PRIVATE"));
});

test("calculated comparison answer is shown only after approved status", () => {
  const raw = { ...approved(), answer: { text: "All advertisers: impressions decreased by 15,399 (0.85%)." } };
  const html = renderToStaticMarkup(React.createElement(AskResult, { result: contract.projectAgentResponse(raw) }));
  assert.ok(html.includes("decreased by 15,399 (0.85%)"));
  const withheld = renderToStaticMarkup(React.createElement(AskResult, { result: contract.projectAgentResponse({ ...raw, status: "withheld" }) }));
  assert.ok(!withheld.includes("15,399"));
});
