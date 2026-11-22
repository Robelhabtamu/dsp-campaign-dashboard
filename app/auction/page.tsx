import { Suspense } from "react";
import { auctionRows } from "@/lib/data";
import { auctionMetrics } from "@/lib/auction";
import { filters, fmt, ids, type Params } from "@/lib/metrics";
import Filters from "@/components/Filters";
import { Cards } from "@/components/MetricsUI";

async function Auction({ searchParams }: { searchParams: Promise<Params> }) {
  const rows = await auctionRows();
  const f = filters(await searchParams, [...new Set(rows.map((r) => r.date))].sort());
  const heading = <>
    <h1 className="text-3xl font-bold">Auction Analysis</h1>
    <Filters route="/auction" value={f} dates={[...new Set(rows.map((r) => r.date))].sort()} />
  </>;
  if (!rows.length) return <>{heading}<p role="status" className="panel">No daily campaign data available.</p></>;
  if (f.error) return heading;
  const campaigns = f.campaign === "all" ? ids : [f.campaign];
  const t = auctionMetrics(rows, campaigns, f.from, f.to);
  const selected = rows.filter((r) => campaigns.includes(r.advertiser_id) && r.date >= f.from && r.date <= f.to);
  const validPrice = (v: number | null) => v !== null && Number.isFinite(v) && v >= 0 ? fmt(v, 3) : "Unavailable";
  return <>
    {heading}
    <p className="mb-5 text-sm text-slate-600">{f.campaign === "all" ? "All campaigns" : `Advertiser ${f.campaign}`} · {f.from} to {f.to} (inclusive). Historical impression records.</p>
    {!t.complete && <p role="status" className="panel mb-5 text-amber-800">Campaign-day coverage is missing or duplicated. Aggregate metrics are unavailable; missing rows do not mean zero activity.</p>}
    {t.complete && !t.costComplete && <p role="status" className="panel mb-5 text-amber-800">Pricing or quality records are missing or unusable. Complete recorded cost is unavailable. Mean paying price uses only valid nonnegative paying prices when their denominator is known.</p>}
    <Cards items={[
      { label: "Impressions", value: fmt(t.impressions), definition: "Eligible distinct impression records in the selected period." },
      { label: "Mean paying price", value: fmt(t.avgPaid, 3), definition: "Weighted by usable paying-price counts, in raw scaled price units." },
      { label: "Recorded cost", value: fmt(t.cost, 3), definition: "Sum of paying price divided by 1,000, in scaled dataset cost units; not actual currency. Already scaled." },
      { label: "Unusable paying prices", value: fmt(t.unusablePrices), definition: "Impressions with missing, nonfinite or negative paying prices." },
      { label: "Prices above bid", value: fmt(t.priceFlags), definition: "Quality flag count; recorded prices remain included in cost when otherwise usable." },
      { label: "Above-bid share", value: t.aboveBidPercent === null ? "Unavailable" : `${fmt(t.aboveBidPercent, 3)}%`, definition: "Flagged impressions divided by all selected impressions. This is not an auction win rate." },
    ]} />
    <section className="panel mt-6 overflow-x-auto">
      <h2 className="mb-3 text-xl font-semibold">Daily campaign pricing</h2>
      <p className="mb-4 text-sm text-slate-600">Bidding price is the recorded submitted price among impressions; paying price is the recorded paid price. Each mean independently excludes invalid prices. The mart lacks usable bid counts, so a pooled bidding mean, paired gap and paid-to-bid ratio are unavailable.</p>
      <table>
        <caption className="mb-3 text-left text-sm text-slate-500">Observed daily rows only. Price means use raw scaled price units; cost uses scaled dataset cost units. No missing rows are filled with zeros.</caption>
        <thead><tr>{["Date", "Campaign", "Impressions", "Mean bid (raw units)", "Mean paid (raw units)", "Cost (scaled units)", "Unusable paid", "Above bid"].map((h) => <th scope="col" key={h}>{h}</th>)}</tr></thead>
        <tbody>{selected.map((r, i) => {
          const day = auctionMetrics([r], [r.advertiser_id], r.date, r.date);
          return <tr key={`${r.date}-${r.advertiser_id}-${i}`}>
            <th scope="row">{r.date}</th><td>{r.advertiser_id}</td>
            <td>{fmt(day.impressions)}</td><td>{r.impressions !== null && r.impressions > 0 ? validPrice(r.avgBid) : "Unavailable"}</td>
            <td>{fmt(day.avgPaid, 3)}</td><td>{fmt(day.cost, 3)}</td>
            <td>{fmt(day.unusablePrices)}</td><td>{fmt(day.priceFlags)}</td>
          </tr>;
        })}</tbody>
      </table>
    </section>
    <p className="panel mt-6 text-sm text-slate-600">These are descriptive prices among recorded impressions. Bid-request denominators and complete auction outcomes are unavailable, so true win rate cannot be computed. Revenue, profit and ROI are unavailable. Bid-minus-paid differences do not establish waste, achievable savings or the effect of changing bids. Exchange and bid-level breakdowns require data beyond these campaign-day marts.</p>
  </>;
}

export default function Page({ searchParams }: { searchParams: Promise<Params> }) {
  return <main className="dashboard"><Suspense fallback={<p role="status">Loading auction analysis…</p>}><Auction searchParams={searchParams} /></Suspense></main>;
}
