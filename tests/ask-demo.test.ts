import { test } from "node:test";
import assert from "node:assert/strict";
import { demoConfig, demoReadiness, handleDemoAsk, demoFilters } from "../lib/ask-demo.ts";
import { askFailure, readAskResponse, projectAgentResponse } from "../lib/ask-contract.ts";

const config = { url: "http://127.0.0.1:8765", origin: "http://127.0.0.1:3000", token: "test-token-".repeat(5) };
const input = { question: "How many clicks?", campaign: "1458", from: "2013-06-06", to: "2013-06-08", mode: "synthetic_scripted" };
function req(body: unknown = input, origin = config.origin) { return new Request(config.origin + "/api/ask", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) }); }
const ready = { ready: true, live_enabled: false, mode: "synthetic_demo", ai_available: false };
test("demo requires development opt-in, loopback service and bridge token", () => {
  const env = { NODE_ENV: "development", ASK_LOCAL_DEMO: "1", ASK_DEMO_BRIDGE_TOKEN: config.token };
  assert.ok(demoConfig(env));
  assert.equal(demoConfig({ ...env, NODE_ENV: "production" }), null);
  assert.equal(demoConfig({ ...env, ASK_DEMO_SERVICE_URL: "https://untrusted.test" }), null);
  assert.equal(demoConfig({ ...env, ASK_DEMO_BRIDGE_TOKEN: "short" }), null);
  assert.equal(demoConfig({}), null);
});
test("readiness fails closed for dead backend or any live-mode claim", async () => {
  assert.equal((await demoReadiness(config, async () => Response.json(ready))).ready, true);
  assert.equal((await demoReadiness(config, async () => Response.json({ ...ready, live_enabled: true }))).ready, false);
  assert.equal((await demoReadiness(config, async () => { throw Error("PRIVATE"); })).ready, false);
});
test("wrong origin, identity injection, unauthorized scope and oversized request never reach Python", async () => {
  let called = false; const transport = async () => { called = true; return Response.json({}); };
  assert.equal((await handleDemoAsk(req(input, "https://evil.test"), config, transport)).status, 403);
  for (const body of [{ ...input, userId: "admin" }, { ...input, campaign: "3386" }, { ...input, to: "2013-06-09" }, { ...input, mode: "live" }]) assert.equal((await handleDemoAsk(req(body), config, transport)).status, 400);
  assert.equal((await handleDemoAsk(req({ ...input, question: "a".repeat(5000) }), config, transport)).status, 413);
  assert.equal(called, false);
});
test("backend rate and failure status never expose raw errors", async () => {
  const unavailable = await handleDemoAsk(req(), config, async () => { throw Error("PRIVATE transport failure"); });
  assert.equal(unavailable.status, 503);
  assert.ok(!JSON.stringify(await unavailable.json()).includes("PRIVATE"));
  for (const status of [429, 401, 500]) {
    const response = await handleDemoAsk(req(), config, async () => Response.json({ error: "PRIVATE" }, { status }));
    assert.equal(response.status, status === 429 ? 429 : 503);
    assert.ok(!JSON.stringify(await response.json()).includes("PRIVATE"));
  }
});
test("server sends bridge credentials only upstream, projects approved-only response", async () => {
  for (const status of ["approved", "withheld", "unanswerable"] as const) {
    const response = await handleDemoAsk(req(), config, async (url, options) => {
      assert.equal(url, config.url + "/ask");
      assert.equal((options?.headers as Record<string,string>).Authorization, "Bearer " + config.token);
      return Response.json({ demo_mode: "synthetic_scripted", status, answer: { text: "total = 55" }, executed_sql: ["SELECT total"], evidence: [{source:"synthetic_fixture",query_executed:true,columns:["total"],rows:[[55]],parameters:[],limit_reached:false}], raw_provider_logs: "PRIVATE" });
    });
    const output = await response.json();
    assert.equal(output.status, status);
    assert.equal(output.answer, status === "approved" ? "total = 55" : null);
    assert.equal(output.demoMode, "synthetic_scripted");
    assert.ok(!JSON.stringify(output).includes(config.token) && !JSON.stringify(output).includes("PRIVATE"));
  }
});
test("demo rejects missing or live database evidence rather than mixing sources", async () => {
  for (const evidence of [[], [{ source: "database", query_executed: true }], [{ source: "synthetic_fixture", query_executed: false }]]) {
    const response = await handleDemoAsk(req(), config, async () => Response.json({ demo_mode: "synthetic_scripted", status: "approved", answer: { text: "UNAPPROVED" }, evidence }));
    assert.equal(response.status, 503);
    assert.ok(!JSON.stringify(await response.json()).includes("UNAPPROVED"));
  }
});
test("bare /ask and reset use a supported default fixture scope", () => {
  assert.deepEqual(demoFilters({}), { campaign: "1458", from: "2013-06-06", to: "2013-06-08", error: undefined });
  assert.ok(demoFilters({ to: "2013-06-12" }).error);
  assert.ok(demoFilters({ campaign: "3386" }).error);
});
test("safe scope, rate, budget and backend error explanations survive browser parsing", async () => {
  for (const code of ["demo_scope", "demo_rate_limit", "demo_ai_budget", "demo_backend", "demo_question"] as const) {
    const original = askFailure(code);
    assert.deepEqual(readAskResponse({ ...original, message: "PRIVATE backend text" }), original);
  }
  const response = await handleDemoAsk(req(), config, async () => Response.json({ error_code: "demo_question", error: "PRIVATE" }, { status: 400 }));
  assert.equal(response.status, 400);
  const wire = readAskResponse(await response.json());
  assert.equal(wire.errorCode, "demo_question");
  assert.match(wire.message, /selected filters/);
  const budget = await handleDemoAsk(req(), config, async () => Response.json({ error_code: "demo_ai_budget" }, { status: 503 }));
  assert.equal(readAskResponse(await budget.json()).errorCode, "demo_ai_budget");
});
test("unsupported scripted questions explain the actual supported subset", () => {
  const response = readAskResponse(projectAgentResponse({ status: "unanswerable", demo_mode: "synthetic_scripted", answer: null, executed_sql: [], evidence: [] }));
  assert.match(response.message, /total clicks, impressions, conversions or recorded cost/);
  assert.equal(response.answer, null);
});
