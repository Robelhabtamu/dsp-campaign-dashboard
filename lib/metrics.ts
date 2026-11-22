import { campaignBudgets } from "../config/budgets.ts";
export type Params = Record<string, string | string[] | undefined>;
export type Filters = {
  campaign: string;
  from: string;
  to: string;
  error?: string;
};
export type Row = {
  date: string;
  advertiser_id: string;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number | null;
  unusablePrices: number;
  priceFlags: number;
};
export const ids = Object.keys(campaignBudgets);
export function days(from: string, to: string): string[] {
  const result: string[] = [];
  for (
    let time = Date.parse(from + "T00:00:00Z");
    time <= Date.parse(to + "T00:00:00Z");
    time += 86400000
  )
    result.push(new Date(time).toISOString().slice(0, 10));
  return result;
}
export function filters(params: Params, dates: string[]): Filters {
  const value = (key: string, fallback: string) =>
    params[key] === undefined
      ? fallback
      : typeof params[key] === "string"
        ? params[key]
        : "";
  const campaign = value("campaign", "all");
  const from = value("from", dates[0] ?? "2013-06-06");
  const to = value("to", dates.at(-1) ?? "2013-06-12");
  const error =
    campaign !== "all" && !ids.includes(campaign)
      ? "Choose an available campaign."
      : !dates.includes(from) || !dates.includes(to)
        ? "Choose From and To dates within the available reporting period."
        : from > to
          ? "From date must be on or before To date."
          : undefined;
  return { campaign, from, to, error };
}
export function href(route: string, f: Filters) {
  return (
    route +
    "?" +
    new URLSearchParams({ campaign: f.campaign, from: f.from, to: f.to })
  );
}
export function select(rows: Row[], f: Filters) {
  return rows.filter(
    (r) =>
      (f.campaign === "all" || r.advertiser_id === f.campaign) &&
      r.date >= f.from &&
      r.date <= f.to,
  );
}
export function summarize(
  rows: Row[],
  campaigns: string[],
  from: string,
  to: string,
) {
  const scoped = select(rows, { campaign: "all", from, to }).filter((r) =>
    campaigns.includes(r.advertiser_id),
  );
  const keys = new Set(scoped.map((r) => `${r.advertiser_id}|${r.date}`));
  const complete = days(from, to).every((day) =>
    campaigns.every((id) => keys.has(`${id}|${day}`)),
  );
  const costComplete =
    complete && scoped.every((r) => r.cost !== null && r.unusablePrices === 0);
  const sum = (key: "impressions" | "clicks" | "conversions" | "priceFlags") =>
    complete ? scoped.reduce((n, r) => n + r[key], 0) : null;
  return {
    complete,
    costComplete,
    impressions: sum("impressions"),
    clicks: sum("clicks"),
    conversions: sum("conversions"),
    priceFlags: sum("priceFlags"),
    cost: costComplete ? scoped.reduce((n, r) => n + (r.cost ?? 0), 0) : null,
  };
}
export function ratio(a: number | null, b: number | null, scale = 1) {
  return a !== null && b !== null && b > 0 ? (a / b) * scale : null;
}
export function fmt(value: number | null, digits = 0) {
  return value === null
    ? "Unavailable"
    : value.toLocaleString("en-US", { maximumFractionDigits: digits });
}
export function pacing(
  rows: Row[],
  campaigns: string[],
  from: string,
  to: string,
) {
  const budget = campaigns.reduce((n, id) => n + campaignBudgets[id].amount, 0);
  const start = campaignBudgets[campaigns[0]].start;
  const end = campaignBudgets[campaigns[0]].end;
  const elapsed = days(start, to).length;
  const total = days(start, end).length;
  const cumulative = summarize(rows, campaigns, start, to).cost;
  const range = summarize(rows, campaigns, from, to).cost;
  const planned = (budget * elapsed) / total;
  return {
    budget,
    range,
    cumulative,
    planned,
    remaining: cumulative === null ? null : budget - cumulative,
    difference: cumulative === null ? null : cumulative - planned,
    used: ratio(cumulative, budget, 100),
    final:
      cumulative === null
        ? null
        : to === end
          ? cumulative
          : (cumulative / elapsed) * total,
    atEnd: to === end,
    start,
    end,
  };
}
