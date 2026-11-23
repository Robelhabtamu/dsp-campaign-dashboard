/** Pure local-preview contract; no database, provider or filesystem access. */
import { changesFilters, type Change, type ChangeEvidence, type ChangesState } from "./changes.ts";
import type { Filters, Params } from "./metrics.ts";
export type StatisticalChange = Omit<Change, "provider" | "attempts"> & { provider: "deterministic"; attempts: 0 };
export type DisplayChangesState = Omit<ChangesState, "items" | "status"> & {
  status: ChangesState["status"] | "insufficient_history";
  items: (Change | StatisticalChange)[];
  preview?: { diagnostics: Record<string, number>; samples: number };
};
export function previewEnabled(env: Record<string, string | undefined>): boolean {
  return env.NODE_ENV === "development" && env.CHANGES_LOCAL_PREVIEW === "1";
}
export function changeFilters(params: Params): Filters & { metric: string; direction: string } {
  const result = { ...changesFilters(params), metric: typeof params.metric === "string" ? params.metric : "all", direction: typeof params.direction === "string" ? params.direction : "all" };
  if (params.metric !== undefined && (typeof params.metric !== "string" || !["all", "impressions", "clicks", "conversions"].includes(params.metric))) result.error = "Choose a supported count metric.";
  if (params.direction !== undefined && (typeof params.direction !== "string" || !["all", "above", "below"].includes(params.direction))) result.error = "Choose above, below or all directions.";
  return result;
}
export function filterChanges(state: DisplayChangesState, selection: ReturnType<typeof changeFilters>): DisplayChangesState {
  if (selection.error) return { status: "error", items: [], omitted: 0, limited: false };
  const items = state.items.filter(({ evidence: e }) =>
    (selection.campaign === "all" || e.advertiser_id === selection.campaign) &&
    e.observation_timestamp.slice(0, 10) >= selection.from && e.observation_timestamp.slice(0, 10) <= selection.to &&
    (selection.metric === "all" || selection.metric === e.metric) && (selection.direction === "all" || selection.direction === e.direction));
  items.sort((a, b) => b.evidence.observation_timestamp.localeCompare(a.evidence.observation_timestamp) || a.id.localeCompare(b.id));
  return { ...state, items, status: state.status === "ready" || state.status === "empty" ? (items.length ? "ready" : "empty") : state.status };
}
export function percentageChange(observed: number, baseline: number): string {
  if (!Number.isFinite(observed) || !Number.isFinite(baseline) || baseline < 0) return "Unavailable";
  if (baseline === 0) return "Not defined (zero baseline)";
  const value = (observed - baseline) / baseline * 100;
  if (!Number.isFinite(value)) return "Unavailable";
  return `${value > 0 ? "+" : ""}${value.toLocaleString("en-US", { maximumFractionDigits: 1 })}%`;
}
const statuses = new Set(["anomaly", "normal", "insufficient_history", "missing_observation", "missing_coverage", "invalid_value", "invalid_baseline", "zero_variance"]);
export function previewState(raw: unknown, selection: ReturnType<typeof changeFilters>): DisplayChangesState {
  const error: DisplayChangesState = { status: "error", items: [], omitted: 0, limited: false };
  if (!raw || typeof raw !== "object") return error;
  const payload = raw as Record<string, unknown>;
  if (payload.source !== "synthetic_changes_preview_v1" || !Array.isArray(payload.results) || payload.results.length > 10000 || !Array.isArray(payload.records)) return error;
  const diagnostics: Record<string, number> = {};
  const items: StatisticalChange[] = [];
  let samples = 0;
  for (const row of payload.results) {
    if (!row || typeof row !== "object") return error;
    const r = row as Record<string, unknown>;
    if (typeof r.status !== "string" || !statuses.has(r.status) || typeof r.advertiser_id !== "string" || !["1458", "3358"].includes(r.advertiser_id) || typeof r.observation_timestamp !== "string" || !/^2013-06-0[67]T\d{2}:00:00$/.test(r.observation_timestamp) || !["impressions", "clicks", "conversions"].includes(String(r.metric))) return error;
    if ((selection.campaign !== "all" && selection.campaign !== r.advertiser_id) || r.observation_timestamp.slice(0, 10) < selection.from || r.observation_timestamp.slice(0, 10) > selection.to || (selection.metric !== "all" && selection.metric !== r.metric)) continue;
    samples++;
    if (r.status !== "anomaly") { diagnostics[r.status] = (diagnostics[r.status] ?? 0) + 1; continue; }
    const keys = ["observed_value", "baseline_mean", "baseline_stddev", "baseline_sample_count", "z_score"];
    if (keys.some(k => typeof r[k] !== "number" || !Number.isFinite(r[k])) || (r.observed_value as number) < 0 || !Number.isSafeInteger(r.observed_value) || (r.baseline_mean as number) < 0 || (r.baseline_stddev as number) <= 0 || r.baseline_sample_count !== 24 || Math.abs(r.z_score as number) < 3 || !["above", "below"].includes(String(r.direction)) || !Array.isArray(r.baseline_window) || r.baseline_window.length !== 2 || r.baseline_window[1] !== r.observation_timestamp) return error;
    if (!r.baseline_window.every((v: unknown) => typeof v === "string" && /^2013-06-0[67]T\d{2}:00:00$/.test(v)) ||
      Date.parse(r.baseline_window[1] + "Z") - Date.parse(r.baseline_window[0] + "Z") !== 86400000) return error;
    const z = ((r.observed_value as number) - (r.baseline_mean as number)) / (r.baseline_stddev as number);
    if (Math.abs(z - (r.z_score as number)) > 1e-9 || r.direction !== (z > 0 ? "above" : "below")) return error;
    const e: ChangeEvidence = { advertiser_id: r.advertiser_id, observation_timestamp: r.observation_timestamp, metric: r.metric as ChangeEvidence["metric"], observed_value: r.observed_value as number, baseline_mean: r.baseline_mean as number, baseline_stddev: r.baseline_stddev as number, baseline_sample_count: 24, z_score: r.z_score as number, direction: r.direction as "above" | "below", baseline_window: r.baseline_window as [string, string] };
    items.push({ id: `synthetic-${e.advertiser_id}-${e.observation_timestamp}-${e.metric}`, provider: "deterministic", attempts: 0, evidence: e });
  }
  const inadequate = samples > 0 && !items.length && !diagnostics.normal && Object.keys(diagnostics).length > 0;
  return filterChanges({ status: items.length ? "ready" : inadequate ? "insufficient_history" : "empty", items, omitted: 0, limited: false, preview: { diagnostics, samples } }, selection);
}
