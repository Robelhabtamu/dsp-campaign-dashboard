import Link from "next/link";
import { href, type Filters as Selection } from "@/lib/metrics";

type Route = "/" | "/pacing" | "/auction" | "/changes" | "/ask";

export default function DashboardNavigation({ route, value }: { route: Route; value?: Selection }) {
  const destination = (path: Route) => value ? href(path, value) : path;
  return (
      <nav
        aria-label="Dashboard navigation"
        className="my-5 flex flex-wrap gap-5 text-blue-700"
      >
        <Link
          aria-current={route === "/" ? "page" : undefined}
          href={destination("/")}
        >
          Performance
        </Link>
        <Link
          aria-current={route === "/pacing" ? "page" : undefined}
          href={destination("/pacing")}
        >
          Budget &amp; pacing
        </Link>
        <Link
          aria-current={route === "/auction" ? "page" : undefined}
          href={destination("/auction")}
        >
          Auction Analysis
        </Link>
        <Link
          aria-current={route === "/changes" ? "page" : undefined}
          href={destination("/changes")}
        >
          What Changed
        </Link>
        <Link
          aria-current={route === "/ask" ? "page" : undefined}
          href={destination("/ask")}
        >
          Ask the Data
        </Link>
      </nav>
  );
}
