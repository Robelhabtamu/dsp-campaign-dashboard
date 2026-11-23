import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React, { type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as preview from "../lib/changes-preview.ts";
import * as changes from "../lib/changes.ts";
const require = createRequire(import.meta.url);
const code = ts.transpileModule(readFileSync(new URL("../components/ChangesPanel.tsx", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const exports: Record<string, unknown> = {};
vm.runInNewContext(code, { exports, require: (name: string) => name === "@/lib/changes" ? changes : name === "@/lib/changes-preview" ? preview : require(name) });
const Panel = exports.default as ComponentType<{ state: changes.ChangesState }>;
const render = (state: changes.ChangesState) => renderToStaticMarkup(React.createElement(Panel, { state }));
test("unconnected, error and empty states are honest and show no fake counters", () => {
  for (const status of ["unconfigured", "error", "empty"] as const) {
    const html = render({ status, items: [], omitted: 0, limited: false });
    assert.ok(!html.includes("Published changes summary"));
    assert.ok(!html.includes("Validated change"));
    if (status === "unconfigured") assert.ok(html.includes("not connected yet") && html.includes("No live alerts"));
    if (status === "error") assert.ok(html.includes('role="alert"'));
    if (status === "empty") assert.ok(html.includes("does not mean there were no anomalies"));
  }
});
test("validated card emphasizes observation and baseline with collapsed method details", () => {
  const state: changes.ChangesState = { status: "ready", omitted: 0, limited: false, items: [{ id: "a".repeat(64), provider: "gemini", attempts: 1, evidence: { advertiser_id: "1458", observation_timestamp: "2013-06-07T03:00:00", metric: "clicks", observed_value: 16, baseline_mean: 10, baseline_stddev: 2, baseline_sample_count: 3, z_score: 3, direction: "above", baseline_window: ["2013-06-07T00:00:00", "2013-06-07T03:00:00"] } }] };
  const html = render(state);
  assert.ok(html.includes("Clicks above baseline"));
  assert.ok(html.includes("Recorded 16 clicks") && html.includes("mean of 10"));
  assert.ok(html.includes("View baseline &amp; validation details"));
  assert.ok(!html.includes("<details open"));
  assert.ok(html.includes("cause") || html.includes("Cause"));
});
