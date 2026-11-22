import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React, { type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as insights from "../lib/insights.ts";

function fixture() {
  return { kind: "click_response", publication_status: "publishable", validation_status: "approved", source: "synthetic_fixture", campaigns: ["1458"],
    values: { current_impressions: 10000, current_clicks: 120, current_ctr_percent: 1.2, previous_impressions: 8000, previous_clicks: 80, previous_ctr_percent: 1 },
    explanation: "PRIVATE rejected prose", judge_reason: "PRIVATE reason",
    provenance: ["current", "previous"].map(window => ({ window_name: window, window: window === "current" ? ["2013-06-07", "2013-06-07"] : ["2013-06-06", "2013-06-06"], sql: "SELECT restricted_fixed_query WHERE event_date BETWEEN %s AND %s", parameters: ["2013-06-07", "2013-06-07", "1458", 2], columns: ["campaign_days", "impressions", "clicks"], rows: [[1, 10000, 120]], query_executed: false })) };
}

test("approved projection preserves supported values and provenance without provider prose", async () => {
  const state = await insights.loadInsights(async () => [fixture()]);
  assert.equal(state.status, "approved");
  assert.equal(state.items[0].values.current_ctr_percent, 1.2);
  assert.deepEqual(state.items[0].provenance[0].parameters, fixture().provenance[0].parameters);
  assert.deepEqual(state.items[0].provenance[0].window, ["2013-06-07", "2013-06-07"]);
  assert.ok(!JSON.stringify(state).includes("PRIVATE"));
  assert.deepEqual(state.items[0].provenance[0].rows, []);
});

test("withheld, failed and unjudged payloads never enter display", async () => {
  for (const override of [{ publication_status: "withheld" }, { publication_status: "error" }, { validation_status: "rejected" }]) {
    assert.deepEqual(await insights.loadInsights(async () => [{ ...fixture(), ...override }]), { status: "empty", items: [] });
  }
});

test("backend failure and malformed evidence fail closed", async () => {
  assert.deepEqual(await insights.loadInsights(async () => { throw new Error("PRIVATE connection string"); }), { status: "unavailable", items: [] });
  assert.equal((await insights.loadInsights(async () => [{ ...fixture(), values: {} }])).status, "unavailable");
  assert.equal((await insights.loadInsights(async () => [{ ...fixture(), provenance: [] }])).status, "unavailable");
  assert.equal((await insights.loadInsights(async () => [{ ...fixture(), source: "database" }])).status, "unavailable");
  assert.equal((await insights.loadInsights(async () => [])).status, "empty");
});

const compiled = ts.transpileModule(readFileSync(new URL("../components/InsightsPanel.tsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const mod = { exports: {} };
const require = createRequire(import.meta.url);
vm.runInNewContext(compiled, { exports: mod.exports, module: mod, require: (id: string) => id === "../lib/insights" ? insights : require(id) });
const Panel = (mod.exports as { default: ComponentType<{ state: insights.InsightsState }> }).default;
const render = (state: insights.InsightsState) => renderToStaticMarkup(React.createElement(Panel, { state }));

test("UI renders loading, unavailable and empty states without approved cards", () => {
  for (const status of ["loading", "unavailable", "empty"] as const) {
    const html = render({ status, items: [] });
    assert.ok(html.includes('role="status"'));
    assert.ok(!html.includes("Approved supporting values"));
  }
  assert.ok(render({ status: "unavailable", items: [] }).includes("not enabled"));
});

test("approved UI labels fixtures, numeric values, comparison windows and safely escapes SQL", async () => {
  const value = fixture(); value.provenance[0].sql = "<script>alert('x')</script>";
  const html = render(await insights.loadInsights(async () => [value]));
  for (const text of ["1.2%", "10,000", "2013-06-07", "SYNTHETIC TEST FIXTURE", "Bound parameters", "Advertisers: 1458"]) assert.ok(html.includes(text), text);
  assert.ok(html.includes("&lt;script&gt;") && !html.includes("<script>"));
  assert.ok(!html.includes("PRIVATE"));
});

test("production data access remains disabled with no database or provider client", () => {
  const source = readFileSync(new URL("../lib/insights-data.ts", import.meta.url), "utf8");
  assert.ok(source.includes('import "server-only"'));
  assert.ok(source.includes('status: "unavailable"'));
  assert.ok(!source.includes("process.env") && !source.includes("fetch("));
});
