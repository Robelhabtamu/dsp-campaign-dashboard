import { test } from "node:test";
import assert from "node:assert/strict";
import { publicConfig, publicReady, handlePublicAsk } from "../lib/ask-public.ts";
const config = { url: "https://worker.test", origin: "https://app.test", token: "x".repeat(32) };
const body = { question: "How many clicks?", campaign: "all", from: "", to: "" };
const req = (data = body, origin = config.origin) => new Request(config.origin + "/api/ask", { method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(data) });
test("public configuration requires HTTPS and explicit opt-in", () => {
  assert.equal(publicConfig({}), null);
  assert.deepEqual(publicConfig({ ASK_PUBLIC_ACCESS: "1", ASK_SERVICE_URL: config.url, ASK_SERVICE_TOKEN: config.token, ASK_PUBLIC_ORIGIN: config.origin }), config);
});
test("public requests do not require visitor sign-in; upstream token stays server-side", async () => {
  const response = await handlePublicAsk(req(), config, async (_url, init) => {
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer " + config.token);
    return Response.json({ status: "unanswerable", evidence: [], executed_sql: [] });
  });
  assert.equal(response.status, 200);
  assert.equal((await response.json()).status, "unanswerable");
});
test("wrong origin and unsupported filter fields never invoke backend", async () => {
  const transport = async () => { throw new Error("must not call"); };
  assert.equal((await handlePublicAsk(req(body, "https://other.test"), config, transport)).status, 403);
  assert.equal((await handlePublicAsk(req({ ...body, campaign: "1458" }), config, transport)).status, 400);
});
test("backend rate limits, failures and missing backend remain explicit", async () => {
  assert.equal((await handlePublicAsk(req(), null)).status, 503);
  assert.equal((await handlePublicAsk(req(), config, async () => new Response(null, { status: 429 }))).status, 429);
  assert.equal((await handlePublicAsk(req(), config, async () => { throw new Error("private"); })).status, 503);
});
test("withheld backend answer and judge reason are never exposed", async () => {
  const r = await handlePublicAsk(req(), config, async () => Response.json({ status: "withheld", answer: { text: "SECRET REJECTED" }, judge_reason: "PRIVATE", evidence: [], executed_sql: [] }));
  const text = await r.text(); assert.ok(!text.includes("SECRET")); assert.ok(!text.includes("PRIVATE"));
});
test("readiness requires actual public backend health", async () => {
  assert.equal(await publicReady(config, async () => Response.json({ mode: "public_campaign_data", ready: true })), true);
  assert.equal(await publicReady(config, async () => Response.json({ mode: "synthetic_demo", ready: true })), false);
});
test("approved answer preserves SQL and evidence", async () => {
  const sql = 'SELECT SUM(clicks) AS total FROM public.daily_campaign_metrics';
  const r = await handlePublicAsk(req(), config, async () => Response.json({ status: "approved", answer: { text: "total = 12" }, executed_sql: [sql], evidence: [{ executed_sql: sql, columns: ["total"], rows: [[12]], parameters: [], limit_reached: false, source: "database", query_executed: true }] }));
  const result = await r.json();
  assert.equal(result.status, "approved"); assert.equal(result.answer, "total = 12"); assert.deepEqual(result.evidence[0].rows, [[12]]); assert.deepEqual(result.executedSql, [sql]);
});
