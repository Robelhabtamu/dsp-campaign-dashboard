export const insightDefinitions = {
  delivery: { title: "Delivery volume", meaning: "Impression events measure delivery, not unique reach.", metrics: ["impressions"] },
  click_response: { title: "Click response", meaning: "Event CTR uses summed clicks divided by summed impressions, not average daily rates.", metrics: ["impressions", "clicks", "ctr_percent"] },
  recorded_cost: { title: "Recorded spending", meaning: "Scaled dataset units, not actual currency, revenue or profit. Requires usable paying prices throughout.", metrics: ["recorded_cost", "unusable_paying_price_rows"] },
  price_quality: { title: "Above-bid price quality", meaning: "Flagged prices remain included. Their causes and achievable savings are not established.", metrics: ["impressions", "paying_above_bid_rows", "above_bid_percent"] },
} as const;
export type InsightKind = keyof typeof insightDefinitions;
export type Insight = { kind: InsightKind; source: "database" | "synthetic_fixture"; campaigns: string[]; values: Record<string, number>;
  provenance: { window_name: string; window: string[]; sql: string; parameters: unknown[]; columns: string[]; rows: unknown[][]; query_executed: boolean }[] };
export type InsightsState = { status: "loading" | "unavailable" | "empty" | "approved"; items: Insight[] };

// Transport projection only: numerical validation and judgment remain in Python.
// Call only with a trusted, authenticated published-read service, never browser input.
export async function loadInsights(fetchPublished: () => Promise<unknown>): Promise<InsightsState> {
  try {
    const payload = await fetchPublished();
    if (!Array.isArray(payload)) throw new Error("Invalid feed");
    const items: Insight[] = [];
    for (const raw of payload) {
      if (!raw || raw.publication_status !== "publishable" || raw.validation_status !== "approved") continue;
      const kind = raw.kind as InsightKind;
      if (!Object.hasOwn(insightDefinitions, kind) || items.some(i => i.kind === kind)) continue;
      if (!["database", "synthetic_fixture"].includes(raw.source)) continue;
      if (!Array.isArray(raw.campaigns) || !raw.campaigns.length || !raw.campaigns.every((c: unknown) => typeof c === "string" && ["1458", "3358", "3386", "3427", "3476"].includes(c))) throw new Error("Invalid scope");
      const values: Record<string, number> = {};
      for (const window of ["current", "previous"]) for (const metric of insightDefinitions[kind].metrics) {
        const key = `${window}_${metric}`, value = raw.values?.[key];
        if (typeof value !== "number" || !Number.isFinite(value) || value < 0) throw new Error("Invalid metrics");
        values[key] = value;
      }
      if (!Array.isArray(raw.provenance) || raw.provenance.length !== 2) throw new Error("Missing provenance");
      const provenance = raw.provenance.map((p: Insight["provenance"][number], index: number) => {
        if (p.window_name !== ["current", "previous"][index] || !Array.isArray(p.window) || p.window.length !== 2 ||
          !p.window.every(v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) || typeof p.sql !== "string" ||
          !Array.isArray(p.parameters) || !Array.isArray(p.columns) || !p.columns.every(c => typeof c === "string") ||
          !Array.isArray(p.rows) || !p.rows.every(Array.isArray) || p.query_executed !== (raw.source === "database")) throw new Error("Invalid provenance");
        if (!p.parameters.every(v => v === 2 || typeof v === "string" && /^(\d{4}-\d{2}-\d{2}|1458|3358|3386|3427|3476)$/.test(v))) throw new Error("Invalid parameters");
        // Never forward raw rows, provider text or unknown fields to the UI.
        return { window_name: p.window_name, window: p.window, sql: p.sql, parameters: p.parameters, columns: [], rows: [], query_executed: p.query_executed };
      });
      items.push({ kind, source: raw.source, campaigns: raw.campaigns, values, provenance });
    }
    if (new Set(items.map(i => i.source)).size > 1) throw new Error("Mixed sources");
    return { status: items.length ? "approved" : "empty", items };
  } catch { return { status: "unavailable", items: [] }; }
}
