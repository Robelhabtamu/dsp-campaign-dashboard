import { publicConfig, publicReady } from "@/lib/ask-public";
import { Suspense } from "react";
import { connection } from "next/server";
import DashboardNavigation from "@/components/DashboardNavigation";
import Filters from "@/components/Filters";
import AskPanel from "@/components/AskPanel";
import { changesFilters } from "@/lib/changes";
import type { Params } from "@/lib/metrics";
import { localDemoConfig } from "@/lib/ask-demo-runtime";
import { demoReadiness, demoFilters, demoDates, demoCampaigns } from "@/lib/ask-demo";

async function Ask({ searchParams }: { searchParams: Promise<Params> }) {
  // Readiness has request-time timers/network I/O; never prerender it.
  await connection();
  const demo = localDemoConfig();
  const config = demo ? null : publicConfig(process.env);
  const liveReady = await publicReady(config);
  const params = await searchParams;
  const selection = demo ? demoFilters(params) : { ...changesFilters({}), campaign: "all", from: "", to: "", error: undefined };
  const readiness = await demoReadiness(demo);
  const demoScope = ["all", "1458", "3358"].includes(selection.campaign) && selection.from >= "2013-06-06" && selection.to <= "2013-06-08";
  return <>
    {demo && <Filters showNavigation={false} route="/ask" value={selection} dates={demoDates} campaignIds={demoCampaigns} />}
    {!selection.error && <>
      <p className="mb-5 text-sm text-slate-600">{demo ? <>Selected context: {selection.campaign === "all" ? "All campaigns" : `Advertiser ${selection.campaign}`} · {selection.from} to {selection.to} (inclusive).</> : <>Public access — no sign-in. Ask about any approved campaign or date in your question. {liveReady ? "Campaign-data backend ready." : "Python campaign-data backend is not ready. Submission is unavailable."}</>}</p>
      {demo && <p className="panel mb-5" role="status">SYNTHETIC DEMO ONLY — not live campaign observations. Anonymous fixture access is not user authentication. Use advertisers 1458/3358 (or all) and June 6–8, 2013. Other campaigns and dates are unavailable. {readiness.ready ? "Synthetic backend ready." : "Synthetic backend unavailable."} <a className="text-blue-700 underline" href="/ask?campaign=1458&from=2013-06-06&to=2013-06-08">Select example scope</a></p>}
      <AskPanel key={`${selection.campaign}-${selection.from}-${selection.to}`} selection={selection} enabled={demo ? readiness.ready && demoScope : liveReady} demo={demo ? { aiAvailable: readiness.aiAvailable } : undefined} />
    </>}
  </>;
}

export default function Page({ searchParams }: { searchParams: Promise<Params> }) {
  return <main className="dashboard"><h1 className="text-3xl font-bold">Ask the Data</h1><DashboardNavigation route="/ask" /><Suspense fallback={<p role="status">Loading Ask the Data…</p>}><Ask searchParams={searchParams} /></Suspense></main>;
}
