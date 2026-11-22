import { days, ratio } from "./metrics.ts";

export type AuctionRow = {
  date: string;
  advertiser_id: string;
  impressions: number | null;
  avgBid: number | null;
  avgPaid: number | null;
  cost: number | null;
  unusablePrices: number | null;
  priceFlags: number | null;
};

const count = (n: number | null): n is number =>
  n !== null && Number.isSafeInteger(n) && n >= 0;
const price = (n: number | null): n is number =>
  n !== null && Number.isFinite(n) && n >= 0;

export function auctionMetrics(
  rows: AuctionRow[], campaigns: string[], from: string, to: string,
) {
  const selected = rows.filter((r) => campaigns.includes(r.advertiser_id) && r.date >= from && r.date <= to);
  const keys = new Set(selected.map((r) => `${r.advertiser_id}|${r.date}`));
  const complete = campaigns.length > 0 && days(from, to).length > 0 &&
    keys.size === selected.length && days(from, to).every((day) =>
      campaigns.every((id) => keys.has(`${id}|${day}`)));
  const impressionsValid = complete && selected.every((r) => count(r.impressions));
  const qualityValid = impressionsValid && selected.every((r) =>
    count(r.unusablePrices) && count(r.priceFlags) &&
    r.unusablePrices <= r.impressions! && r.priceFlags <= r.impressions!);
  const impressions = impressionsValid ? selected.reduce((n, r) => n + r.impressions!, 0) : null;
  const unusablePrices = qualityValid ? selected.reduce((n, r) => n + r.unusablePrices!, 0) : null;
  const priceFlags = qualityValid ? selected.reduce((n, r) => n + r.priceFlags!, 0) : null;
  const usablePrices = impressions !== null && unusablePrices !== null ? impressions - unusablePrices : null;
  // avg_paid's exact denominator is recoverable from the mart quality count.
  const paidValid = qualityValid && selected.every((r) =>
    r.impressions! === r.unusablePrices || price(r.avgPaid));
  const avgPaid = paidValid && usablePrices !== null && usablePrices > 0
    ? selected.reduce((n, r) => {
      const usable = r.impressions! - r.unusablePrices!;
      return usable > 0 ? n + r.avgPaid! * usable : n;
    }, 0) / usablePrices
    : null;
  const costComplete = qualityValid && unusablePrices === 0 && selected.every((r) => price(r.cost));
  const cost = costComplete ? selected.reduce((n, r) => n + r.cost!, 0) : null;
  return { complete, impressions, unusablePrices, usablePrices, priceFlags,
    aboveBidPercent: ratio(priceFlags, impressions, 100), avgPaid, cost, costComplete };
}
