import { publishedInsights } from "../lib/insights-data";
import type { Filters } from "../lib/metrics";
import InsightsPanel from "./InsightsPanel";

export default async function InsightsSection({ selection }: { selection: Filters }) {
  return <InsightsPanel state={await publishedInsights(selection)} />;
}
