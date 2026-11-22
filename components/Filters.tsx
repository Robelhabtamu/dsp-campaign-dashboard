import Link from "next/link";
import { href, ids, type Filters as Selection } from "@/lib/metrics";
export default function Filters({
  value,
  dates,
  route,
  campaignIds = ids,
}: {
  value: Selection;
  dates: string[];
  route: "/" | "/pacing" | "/auction" | "/changes" | "/ask";
  campaignIds?: string[];
}) {
  return (
    <>
      <nav
        aria-label="Dashboard navigation"
        className="my-5 flex flex-wrap gap-5 text-blue-700"
      >
        <Link
          aria-current={route === "/" ? "page" : undefined}
          href={href("/", value)}
        >
          Performance
        </Link>
        <Link
          aria-current={route === "/pacing" ? "page" : undefined}
          href={href("/pacing", value)}
        >
          Budget &amp; pacing
        </Link>
        <Link
          aria-current={route === "/auction" ? "page" : undefined}
          href={href("/auction", value)}
        >
          Auction Analysis
        </Link>
        <Link
          aria-current={route === "/changes" ? "page" : undefined}
          href={href("/changes", value)}
        >
          What Changed
        </Link>
        <Link
          aria-current={route === "/ask" ? "page" : undefined}
          href={href("/ask", value)}
        >
          Ask the Data
        </Link>
      </nav>
      <form
        key={`${value.campaign}-${value.from}-${value.to}`}
        action={route}
        method="get"
        className="panel mb-6 grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-5"
      >
        <label>
          Campaign
          <select name="campaign" defaultValue={value.campaign}>
            <option value="all">All campaigns</option>
            {campaignIds.map((id) => (
              <option key={id} value={id}>
                Advertiser {id}
              </option>
            ))}
          </select>
        </label>
        <label>
          From date
          <input
            name="from"
            type="date"
            required
            min={dates[0]}
            max={dates.at(-1)}
            defaultValue={value.from}
          />
        </label>
        <label>
          To date
          <input
            name="to"
            type="date"
            required
            min={dates[0]}
            max={dates.at(-1)}
            defaultValue={value.to}
          />
        </label>
        <button className="action" type="submit">
          Apply filters
        </button>
        <a
          className="rounded-lg border border-slate-300 px-4 py-3 text-center text-blue-700"
          href={route}
        >
          Reset filters
        </a>
      </form>
      {value.error && (
        <p role="alert" className="panel mb-6 text-red-700">
          {value.error}
        </p>
      )}
    </>
  );
}
