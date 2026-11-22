import "server-only";
import sql from "./db";
import type { Row } from "./metrics";
import type { AuctionRow } from "./auction";

export async function auctionRows(): Promise<AuctionRow[]> {
  const rows = await sql`SELECT event_date::text AS date, advertiser_id, impressions, avg_bid, avg_paid, recorded_cost, unusable_paying_price_rows, paying_above_bid_rows FROM public.daily_campaign_metrics ORDER BY event_date, advertiser_id`;
  const number = (value: unknown) => value == null ? null : Number(value);
  return rows.map((r) => ({
    date: String(r.date), advertiser_id: String(r.advertiser_id),
    impressions: number(r.impressions), avgBid: number(r.avg_bid),
    avgPaid: number(r.avg_paid), cost: number(r.recorded_cost),
    unusablePrices: number(r.unusable_paying_price_rows),
    priceFlags: number(r.paying_above_bid_rows),
  }));
}
export async function dailyRows(): Promise<Row[]> {
  const rows =
    await sql`SELECT event_date::text AS date, advertiser_id, impressions, clicks, conversions, recorded_cost, unusable_paying_price_rows, paying_above_bid_rows FROM public.daily_campaign_metrics ORDER BY event_date, advertiser_id`;
  return rows.map((r) => ({
    date: String(r.date),
    advertiser_id: String(r.advertiser_id),
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    conversions: Number(r.conversions),
    cost: r.recorded_cost === null ? null : Number(r.recorded_cost),
    unusablePrices: Number(r.unusable_paying_price_rows),
    priceFlags: Number(r.paying_above_bid_rows),
  }));
}
