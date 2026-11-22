import { fmt, ratio, summarize, type Row } from "@/lib/metrics";
export function Cards({
  items,
}: {
  items: { label: string; value: string; definition: string }[];
}) {
  return (
    <section
      aria-label="Key metrics"
      className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
    >
      {items.map((item) => (
        <article className="panel" key={item.label}>
          <h2 className="text-sm text-slate-600">{item.label}</h2>
          <p className="my-3 text-2xl font-semibold">{item.value}</p>
          <p className="text-xs leading-5 text-slate-500">{item.definition}</p>
        </article>
      ))}
    </section>
  );
}
export function ResultsTable({
  title,
  groups,
  rows,
}: {
  title: string;
  groups: { label: string; campaigns: string[]; from: string; to: string }[];
  rows: Row[];
}) {
  return (
    <section className="panel mt-6 overflow-x-auto">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      <table>
        <caption className="sr-only">
          {title}; costs in scaled dataset units
        </caption>
        <thead>
          <tr>
            {[
              "Period / campaign",
              "Ad views",
              "Clicks",
              "CTR (%)",
              "Conversions",
              "Cost (scaled units)",
              "Cost / click",
              "Cost / 1,000 views",
            ].map((h) => (
              <th scope="col" key={h}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const t = summarize(rows, g.campaigns, g.from, g.to);
            return (
              <tr key={g.label}>
                <th scope="row">{g.label}</th>
                <td>{fmt(t.impressions)}</td>
                <td>{fmt(t.clicks)}</td>
                <td>{fmt(ratio(t.clicks, t.impressions, 100), 4)}</td>
                <td>{fmt(t.conversions)}</td>
                <td>{fmt(t.cost, 3)}</td>
                <td>{fmt(ratio(t.cost, t.clicks), 3)}</td>
                <td>{fmt(ratio(t.cost, t.impressions, 1000), 3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
