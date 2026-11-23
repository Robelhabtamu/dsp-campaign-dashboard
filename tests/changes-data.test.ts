import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as changes from "../lib/changes.ts";
const code = ts.transpileModule(readFileSync(new URL("../lib/changes-data.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
function adapter(access: { allowed: boolean; raw_access: boolean }, configured = true) {
  const calls: string[] = [];
  const sql = async (parts: TemplateStringsArray) => { const text = parts.join("?"); calls.push(text); return text.includes("pg_has_role") ? [access] : []; };
  const exports: { publishedChanges?: (s: ReturnType<typeof changes.changesFilters>) => Promise<changes.ChangesState> } = {};
  vm.runInNewContext(code, { exports, process: { env: configured ? { AI_DASHBOARD_DATABASE_URL: "OFFLINE_MOCK" } : {} }, require: (name: string) => {
    if (name === "server-only") return {};
    if (name === "./changes") return changes;
    if (name === "postgres") return { __esModule: true, default: () => ({ begin: async (mode: string, callback: (q: typeof sql) => unknown) => { assert.equal(mode, "read only"); return callback(sql); } }) };
    throw new Error("Unexpected dependency");
  }});
  return { load: exports.publishedChanges!, calls };
}
test("unauthorized or overprivileged readers cannot reach published data", async () => {
  for (const access of [{ allowed: false, raw_access: false }, { allowed: true, raw_access: true }]) {
    const a = adapter(access); const state = await a.load(changes.changesFilters({}));
    assert.equal(state.status, "error"); assert.equal(a.calls.length, 2);
  }
});
test("unconfigured pathway makes no query and has no synthetic fallback", async () => {
  const a = adapter({ allowed: true, raw_access: false }, false);
  assert.equal((await a.load(changes.changesFilters({}))).status, "unconfigured"); assert.equal(a.calls.length, 0);
});
test("authorized reader uses only published view for result data", async () => {
  const a = adapter({ allowed: true, raw_access: false });
  assert.equal((await a.load(changes.changesFilters({}))).status, "empty");
  assert.ok(a.calls[2].includes("FROM ai_store.published_outputs"));
  assert.ok(a.calls[2].includes("LIMIT 101"));
});

test("production preview flags never open a fixture file; local errors are sanitized", async () => {
  const { previewEnabled, previewState } = await import("../lib/changes-preview.ts");
  const source = ts.transpileModule(readFileSync(new URL("../lib/changes-preview-data.ts", import.meta.url), "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText;
  for (const NODE_ENV of ["production", "development"]) {
    let opened = 0;
    const exports: { localChangesPreview?: (s: unknown) => Promise<unknown> } = {};
    vm.runInNewContext(source, { exports, process: { env: { NODE_ENV, CHANGES_LOCAL_PREVIEW: "1", CHANGES_PREVIEW_FILE: "/PRIVATE_NOT_REAL" } }, require: (name: string) => {
      if (name === "server-only") return {};
      if (name === "./changes-preview") return { previewEnabled, previewState };
      if (name === "node:fs/promises") return { open: async () => { opened++; throw new Error("PRIVATE FILE ERROR"); } };
      throw new Error("Unexpected dependency");
    }});
    const result = await exports.localChangesPreview!(changes.changesFilters({}));
    if (NODE_ENV === "production") { assert.equal(result, null); assert.equal(opened, 0); }
    else { assert.equal(opened, 1); assert.ok(!JSON.stringify(result).includes("PRIVATE")); }
  }
});
