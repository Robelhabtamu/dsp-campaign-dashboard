import "server-only";
import type { Filters } from "./metrics";
import type { InsightsState } from "./insights";

export async function publishedInsights(selection: Filters): Promise<InsightsState> {
  // Deliberately disabled: the existing view and storage validate anomalies,
  // not general KPI evidence. No DATABASE_URL fallback or mock observations.
  void selection;
  return { status: "unavailable", items: [] };
}
