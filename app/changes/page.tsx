import { Suspense } from "react";
import Filters from "@/components/Filters";
import DashboardNavigation from "@/components/DashboardNavigation";
import ChangesPanel from "@/components/ChangesPanel";
import { publishedChanges } from "@/lib/changes-data";
import { changesDates } from "@/lib/changes";
import { changeFilters, filterChanges, previewEnabled } from "@/lib/changes-preview";
import { localChangesPreview } from "@/lib/changes-preview-data";
import type { Params } from "@/lib/metrics";

async function Changes({ searchParams }: { searchParams: Promise<Params> }) {
  const selection = changeFilters(await searchParams);
  const preview = previewEnabled(process.env);
  const state = selection.error ? null : preview ? await localChangesPreview(selection) : filterChanges(await publishedChanges(selection), selection);
  return <>
    {preview && <div role="status" className="panel mb-5 border-amber-300 bg-amber-50"><strong>SYNTHETIC DEMO — not real campaign observations</strong><p className="mt-2 text-sm">The real anomaly detector processes deterministic fixture hours for advertisers 1458 and 3358, June 6–7, 2013. Descriptions are deterministic statistics, not AI-generated causes. No database or AI service is used.</p></div>}
    <Filters showNavigation={false} route="/changes" value={selection} dates={changesDates} extra={<>
      <label>Metric<select name="metric" defaultValue={selection.metric}><option value="all">All count metrics</option><option value="impressions">Impressions</option><option value="clicks">Clicks</option><option value="conversions">Conversions</option></select></label>
      <label>Direction<select name="direction" defaultValue={selection.direction}><option value="all">All directions</option><option value="above">Above baseline</option><option value="below">Below baseline</option></select></label>
    </>} />
    {!selection.error && <>
      <p className="mb-5 text-sm text-slate-500">{selection.campaign === "all" ? "All campaigns" : `Advertiser ${selection.campaign}`} · {selection.from} to {selection.to} (inclusive).</p>
      {state && <ChangesPanel state={state} />}
    </>}
  </>;
}

export default function Page({ searchParams }: { searchParams: Promise<Params> }) {
  return <main className="dashboard">
    <h1 className="text-3xl font-bold">What Changed</h1>
    <p className="mt-2 text-slate-600">Unusual changes in campaign activity, compared with each campaign’s own recent history.</p>
    <DashboardNavigation route="/changes" />
    <Suspense fallback={<p className="panel" role="status">Loading changes…</p>}><Changes searchParams={searchParams} /></Suspense>
  </main>;
}
