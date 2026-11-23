/** Presentation only: accepts the approved canonical answer; never judges claims. */
export type AnswerItem = { label: string; value: string };
export function metricLabel(column: string): string {
  const metrics: Record<string, string> = {
    clicks: "Clicks", impressions: "Impressions", conversions: "Conversions",
    recorded_cost: "Recorded cost (scaled units)", ctr_percent: "CTR (%)",
    avg_bid: "Average bid (scaled units)", avg_paid: "Average paid price (scaled units)",
    advertiser_id: "Advertiser", event_date: "Date", event_hour: "Recorded hour",
    paying_above_bid_rows: "Prices above bid", unusable_paying_price_rows: "Unusable paying prices",
  };
  if (metrics[column]) return metrics[column];
  for (const metric of ["clicks", "impressions", "conversions", "recorded_cost"]) {
    const label = metrics[metric];
    if ([`sum_${metric}`, `total_${metric}`, `${metric}_total`].includes(column)) return `Total ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
    if (column === `avg_${metric}`) return `Average ${label.charAt(0).toLowerCase()}${label.slice(1)}`;
  }
  return column.replaceAll("_", " ").replace(/^./, c => c.toUpperCase());
}
export function formatExactValue(value: string): string {
  // Group digits as strings; never coerce BIGINT/Decimal through floating point.
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(value)) return value;
  const [integer, decimal] = value.split(".");
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + (decimal === undefined ? "" : `.${decimal}`);
}
export function answerItems(answer: string): AnswerItem[] | null {
  const text = answer.replace(/; Results may be incomplete at the row limit\.$/, "");
  const parts = text.split("; ");
  if (!parts.length || parts.length > 10) return null;
  const items: AnswerItem[] = [];
  for (const part of parts) {
    const match = /^([a-z_][a-z0-9_]{0,62}) = ([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\d{4}-\d{2}-\d{2}) \(evidence [1-5], row [1-9]\d{0,3}\)$/.exec(part);
    if (!match) return null;
    items.push({ label: metricLabel(match[1]), value: formatExactValue(match[2]) });
  }
  return items;
}
