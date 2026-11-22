import { test } from "node:test";
import assert from "node:assert/strict";
import { causeStatement, claimFields, changesDates, changesFilters, changesMessage, formatChangeNumber, loadChanges, publishedChange, type ChangesState } from "../lib/changes.ts";
import { href } from "../lib/metrics.ts";

function fixture(overrides: Record<string, unknown> = {}) {
  const evidence = { advertiser_id: "1458", observation_timestamp: "2013-06-06T03:00:00", metric: "impressions",
    observed_value: 16, baseline_mean: 10, baseline_stddev: 2, baseline_sample_count: 3, z_score: 3,
    direction: "above", baseline_window: ["2013-06-06T00:00:00", "2013-06-06T03:00:00"] };
  return { job_id: "a".repeat(64), evidence,
    explanation: { claims: claimFields.map((field) => ({ field, value: evidence[field] })), causal_statement: causeStatement },
    provider_used: "gemini", attempt_count: 1, publication_status: "publishable", ...overrides };
}
const selection = changesFilters({});

test("accepts valid published evidence and projects only safe fields", () => {
  const row = fixture();
  const result = publishedChange({ ...row, raw_logs: "PRIVATE", evidence: { ...row.evidence, secret: "PRIVATE" } });
  assert.ok(result);
  assert.equal(result.evidence.z_score, 3);
  assert.equal(result.evidence.metric, "impressions");
  assert.ok(!JSON.stringify(result).includes("PRIVATE"));
});

test("publication visibility excludes drafts, withheld, unknown and null statuses", async () => {
  for (const publication_status of ["draft", "withheld", "accepted", null]) {
    assert.equal(publishedChange(fixture({ publication_status })), null);
  }
  const state = await loadChanges(async () => [fixture(), fixture({ publication_status: "withheld", explanation: "REJECTED TEXT" })], selection);
  assert.equal(state.items.length, 1);
  assert.ok(!JSON.stringify(state).includes("REJECTED"));
});

test("rejects invented numbers, duplicate claims, extra prose and causal assertions", () => {
  const row = fixture();
  for (const explanation of [
    { ...row.explanation, summary: "Revenue rose 99%" },
    { ...row.explanation, causal_statement: "Traffic caused the increase" },
    { ...row.explanation, claims: row.explanation.claims.map((c, i) => i === 0 ? { ...c, value: 99 } : c) },
    { ...row.explanation, claims: row.explanation.claims.map(() => row.explanation.claims[0]) },
    null,
  ]) assert.equal(publishedChange({ ...row, explanation }), null);
});

test("rejects unsupported metrics and malformed baseline evidence", () => {
  const row = fixture();
  for (const change of [
    { metric: "revenue" }, { observed_value: -1 }, { observed_value: "16" },
    { baseline_stddev: 0 }, { baseline_sample_count: 1 }, { baseline_sample_count: 4 },
    { baseline_mean: NaN }, { z_score: Infinity }, { z_score: 4 }, { direction: "below" },
    { observation_timestamp: "2013-02-30T03:00:00" },
    { observation_timestamp: "2013-06-06T03:00:00Z" },
    { baseline_window: ["2013-06-06T03:00:00", "2013-06-06T04:00:00"] },
  ]) assert.equal(publishedChange({ ...row, evidence: { ...row.evidence, ...change } }), null);
});

test("negative anomalies are valid and do not lose their sign", () => {
  const row = fixture();
  const evidence = { ...row.evidence, observed_value: 4, z_score: -3, direction: "below" };
  const result = publishedChange({ ...row, evidence,
    explanation: { claims: claimFields.map((field) => ({ field, value: evidence[field] })), causal_statement: causeStatement } });
  assert.equal(result?.evidence.z_score, -3);
  assert.equal(formatChangeNumber(result!.evidence.z_score), "-3");
});

test("campaign and inclusive observation dates filter independently of publication time", async () => {
  const first = fixture();
  const second = fixture({ job_id: "b".repeat(64), evidence: { ...first.evidence, advertiser_id: "3358" } });
  const late = fixture({ job_id: "c".repeat(64), created_at: "2026-11-19", evidence: {
    ...first.evidence, observation_timestamp: "2013-06-07T23:00:00", baseline_window: ["2013-06-07T20:00:00", "2013-06-07T23:00:00"] } });
  const rows = [first, second, late];
  const original = structuredClone(rows);
  const state = await loadChanges(async () => rows, changesFilters({ campaign: "1458", from: "2013-06-06", to: "2013-06-07" }));
  assert.deepEqual(state.items.map((r) => r.id), ["c".repeat(64), "a".repeat(64)]);
  assert.deepEqual(rows, original);
  const single = await loadChanges(async () => rows, changesFilters({ campaign: "1458", from: "2013-06-07", to: "2013-06-07" }));
  assert.equal(single.items.length, 1);
});

test("shared filter links persist across all four routes", () => {
  const f = changesFilters({ campaign: "1458", from: "2013-06-06", to: "2013-06-07" });
  for (const route of ["/", "/pacing", "/auction", "/changes"]) {
    assert.deepEqual(changesFilters(Object.fromEntries(new URL(href(route, f), "https://example.test").searchParams)), f);
  }
  assert.equal(changesDates.length, 7);
  for (const params of [{ campaign: "unknown" }, { from: "invalid" }, { from: "2013-06-07", to: "2013-06-06" }, { campaign: ["1458", "3358"] }]) {
    assert.ok(changesFilters(params).error);
  }
});

test("invalid filters prevent fetching", async () => {
  let calls = 0;
  const state = await loadChanges(async () => { calls++; return []; }, changesFilters({ from: "invalid" }));
  assert.equal(calls, 0);
  assert.equal(state.status, "error");
});

test("numeric formatting preserves zero, signs, counts and tiny values", () => {
  assert.equal(formatChangeNumber(0), "0");
  assert.equal(formatChangeNumber(12237081), "12,237,081");
  assert.equal(formatChangeNumber(3.1415926535), "3.141593");
  assert.equal(formatChangeNumber(1e-8), "1.000e-8");
  for (const value of [null, NaN, Infinity]) assert.equal(formatChangeNumber(value), "Unavailable");
});

test("empty results do not claim there were no anomalies", async () => {
  const state = await loadChanges(async () => [], selection);
  assert.equal(state.status, "empty");
  assert.match(changesMessage(state), /does not establish that no anomalies occurred/);
  assert.deepEqual(state.items, []);
});

test("database errors return sanitized state with no rejected text or credentials", async () => {
  const state = await loadChanges(async () => { throw new Error("postgresql://user:SECRET@private-host LOGS"); }, selection);
  assert.equal(state.status, "error");
  assert.deepEqual(state.items, []);
  assert.ok(!JSON.stringify(state).includes("SECRET"));
  assert.ok(!changesMessage(state).includes("private-host"));
  const unconfigured: ChangesState = { status: "unconfigured", items: [], omitted: 0, limited: false };
  assert.match(changesMessage(unconfigured), /restricted dashboard reader/);
});

test("all-invalid results are hidden without exposing their contents", async () => {
  const state = await loadChanges(async () => [fixture({ explanation: { text: "REJECTED PRIVATE TEXT" } })], selection);
  assert.equal(state.status, "empty");
  assert.equal(state.omitted, 1);
  assert.ok(!JSON.stringify(state).includes("PRIVATE"));
});

test("result limit and duplicate job handling are explicit", async () => {
  const rows = Array.from({ length: 101 }, (_, i) => fixture({ job_id: i.toString(16).padStart(64, "0") }));
  const state = await loadChanges(async () => rows, selection);
  assert.equal(state.items.length, 100);
  assert.equal(state.limited, true);
  const duplicates = await loadChanges(async () => [fixture(), fixture()], selection);
  assert.equal(duplicates.items.length, 1);
});
