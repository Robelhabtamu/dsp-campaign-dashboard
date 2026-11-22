/** Pure display boundary for ai_store.published_outputs. No credentials or I/O. */
import { campaignBudgets } from "../config/budgets.ts";
import { days, filters, ids, type Filters, type Params } from "./metrics.ts";

export const causeStatement = "Cause is not established by this evidence.";
export const claimFields = ["observed_value", "baseline_mean", "baseline_stddev", "baseline_sample_count", "z_score"] as const;
type ClaimField = typeof claimFields[number];
export type ChangeEvidence = Record<ClaimField, number> & {
  advertiser_id: string;
  observation_timestamp: string;
  metric: "impressions" | "clicks" | "conversions";
  direction: "above" | "below";
  baseline_window: [string, string];
};
export type Change = {
  id: string;
  evidence: ChangeEvidence;
  provider: "gemini" | "groq";
  attempts: number;
};
export type ChangesState = {
  status: "ready" | "empty" | "error" | "unconfigured";
  items: Change[];
  omitted: number;
  limited: boolean;
};

// Reuse the existing configured reporting dates, not the DEMO budget amounts.
// These are filter bounds, not evidence of observed coverage or new activity.
export const changesDates = [...new Set(ids.flatMap((id) =>
  days(campaignBudgets[id].start, campaignBudgets[id].end)))].sort();
export function changesFilters(params: Params) { return filters(params, changesDates); }

function object(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown> : null;
}
function number(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}
function count(value: unknown): value is number {
  return number(value) && Number.isSafeInteger(value) && value >= 0;
}
function hour(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:00:00$/.test(value)) return false;
  const date = new Date(value + "Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 19) === value;
}

export function publishedChange(value: unknown): Change | null {
  const row = object(value);
  if (!row || row.publication_status !== "publishable" || typeof row.job_id !== "string" || !/^[a-f0-9]{64}$/.test(row.job_id)) return null;
  if (row.provider_used !== "gemini" && row.provider_used !== "groq") return null;
  if (row.attempt_count !== 1 && row.attempt_count !== 2) return null;
  const e = object(row.evidence), explanation = object(row.explanation);
  if (!e || !explanation || typeof e.advertiser_id !== "string" || !ids.includes(e.advertiser_id)) return null;
  if (e.metric !== "impressions" && e.metric !== "clicks" && e.metric !== "conversions") return null;
  if (!hour(e.observation_timestamp) || !Array.isArray(e.baseline_window) || e.baseline_window.length !== 2 || !e.baseline_window.every(hour)) return null;
  if (!count(e.observed_value) || !count(e.baseline_sample_count) || e.baseline_sample_count < 2 ||
      !number(e.baseline_mean) || e.baseline_mean < 0 || !number(e.baseline_stddev) || e.baseline_stddev <= 0 || !number(e.z_score)) return null;
  const [start, end] = e.baseline_window as string[];
  const hours = (Date.parse(end + "Z") - Date.parse(start + "Z")) / 3600000;
  if (end !== e.observation_timestamp || hours <= 0 || e.baseline_sample_count > hours) return null;
  const z = (e.observed_value - e.baseline_mean) / e.baseline_stddev;
  if (!Number.isFinite(z) || z === 0 || Math.abs(z - e.z_score) > Math.max(1e-9, Math.abs(z) * 1e-9) || e.direction !== (z > 0 ? "above" : "below")) return null;
  if (Object.keys(explanation).sort().join(",") !== "causal_statement,claims" || explanation.causal_statement !== causeStatement || !Array.isArray(explanation.claims) || explanation.claims.length !== claimFields.length) return null;
  const seen = new Set<string>();
  for (const raw of explanation.claims) {
    const claim = object(raw);
    if (!claim || Object.keys(claim).sort().join(",") !== "field,value" || typeof claim.field !== "string" || !claimFields.includes(claim.field as ClaimField) || seen.has(claim.field) || !number(claim.value) || claim.value !== e[claim.field]) return null;
    seen.add(claim.field);
  }
  // Project validated fields only; never forward raw JSON/provider prose to UI.
  return { id: row.job_id, provider: row.provider_used, attempts: row.attempt_count,
    evidence: { advertiser_id: e.advertiser_id, observation_timestamp: e.observation_timestamp,
      metric: e.metric, observed_value: e.observed_value, baseline_mean: e.baseline_mean,
      baseline_stddev: e.baseline_stddev, baseline_sample_count: e.baseline_sample_count,
      z_score: e.z_score, direction: e.direction as "above" | "below", baseline_window: [start, end] } };
}

export function formatChangeNumber(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  if (value !== 0 && Math.abs(value) < 0.000001) return value.toExponential(3);
  return value.toLocaleString("en-US", { maximumFractionDigits: 6 });
}

export function changesMessage(state: ChangesState): string {
  if (state.status === "unconfigured") return "Published insights are not configured. A restricted dashboard reader connection is required.";
  if (state.status === "error") return "Published insights could not be loaded. Database availability, permissions or migration setup may need attention.";
  if (state.status === "empty") return "No validated published explanations are available for this selection. This does not establish that no anomalies occurred.";
  return "Showing validated published explanations for the selected observation dates.";
}

export async function loadChanges(fetchRows: () => Promise<unknown[]>, selection: Filters): Promise<ChangesState> {
  try {
    if (selection.error) throw new Error("Invalid selection");
    const rows = await fetchRows();
    const valid = rows.map(publishedChange);
    const selected = valid.filter((r): r is Change => r !== null).filter((r) =>
      (selection.campaign === "all" || r.evidence.advertiser_id === selection.campaign) &&
      r.evidence.observation_timestamp.slice(0, 10) >= selection.from &&
      r.evidence.observation_timestamp.slice(0, 10) <= selection.to);
    const unique = [...new Map(selected.map((r) => [r.id, r])).values()];
    unique.sort((a, b) => b.evidence.observation_timestamp.localeCompare(a.evidence.observation_timestamp) || a.id.localeCompare(b.id));
    return { status: unique.length ? "ready" : "empty", items: unique.slice(0, 100),
      omitted: valid.filter((r) => r === null).length, limited: rows.length > 100 };
  } catch {
    return { status: "error", items: [], omitted: 0, limited: false };
  }
}
