import { days, ratio, type Row } from "./metrics.ts";

export type HourlyRow = {
  date: string;
  advertiser_id: string;
  event_hour: number;
  impressions: number | null;
  clicks: number | null;
};

// The event-based mart is sparse: absent hours may mean no events. Establish
// zero activity only when each campaign/day reconciles to its daily count.
export function hourlyMetrics(
  hourly: HourlyRow[],
  daily: Row[],
  campaigns: string[],
  from: string,
  to: string,
) {
  const scopes = days(from, to).flatMap((date) =>
    campaigns.map((id) => {
      const dailyRows = daily.filter(
        (r) => r.date === date && r.advertiser_id === id,
      );
      const hours = hourly.filter(
        (r) => r.date === date && r.advertiser_id === id,
      );
      const validKeys =
        hours.every(
          (r) =>
            Number.isInteger(r.event_hour) &&
            r.event_hour >= 0 &&
            r.event_hour < 24,
        ) && new Set(hours.map((r) => r.event_hour)).size === hours.length;
      const reconciled = (metric: "impressions" | "clicks") =>
        dailyRows.length === 1 &&
        validKeys &&
        hours.every(
          (r) =>
            r[metric] !== null &&
            Number.isSafeInteger(r[metric]) &&
            r[metric]! >= 0,
        ) &&
        hours.reduce((sum, r) => sum + (r[metric] ?? 0), 0) ===
          dailyRows[0][metric];
      return {
        hours: new Map(hours.map((r) => [r.event_hour, r])),
        impressions: reconciled("impressions"),
        clicks: reconciled("clicks"),
      };
    }),
  );
  return Array.from({ length: 24 }, (_, event_hour) => {
    const sum = (metric: "impressions" | "clicks") =>
      scopes.every((scope) => scope[metric])
        ? scopes.reduce(
            (total, scope) =>
              total + (scope.hours.get(event_hour)?.[metric] ?? 0),
            0,
          )
        : null;
    const impressions = sum("impressions");
    const clicks = sum("clicks");
    return {
      event_hour,
      impressions,
      clicks,
      ctr_percent: ratio(clicks, impressions, 100),
    };
  });
}
