import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";
import React, { type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as metrics from "../lib/metrics.ts";
const require = createRequire(import.meta.url);
const source = readFileSync(new URL("../components/DashboardNavigation.tsx", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;
const exports: Record<string, unknown> = {};
vm.runInNewContext(code, { exports, require: (name: string) => {
  if (name === "@/lib/metrics") return metrics;
  if (name === "next/link") return { __esModule: true, default: (props: Record<string, unknown>) => React.createElement("a", props) };
  return require(name);
}});
const Navigation = exports.default as ComponentType<{ route: string; value?: metrics.Filters }>;
test("Ask navigation provides all five routes without filters or a backend", () => {
  const html = renderToStaticMarkup(React.createElement(Navigation, { route: "/ask" }));
  for (const path of ["/", "/pacing", "/auction", "/changes", "/ask"]) assert.ok(html.includes(`href="${path}"`));
  assert.ok(html.includes('aria-current="page" href="/ask"'));
  assert.ok(html.includes("Performance"));
});
test("shared navigation preserves reporting selection when supplied", () => {
  const html = renderToStaticMarkup(React.createElement(Navigation, { route: "/auction", value: { campaign: "1458", from: "2013-06-06", to: "2013-06-08" } }));
  assert.ok(html.includes('/?campaign=1458&amp;from=2013-06-06&amp;to=2013-06-08'));
});
