// Read-only integration check. Run against `npm run start -- --port 3100`.
import assert from "node:assert/strict";
import postgres from "postgres";
import { days, fmt, ids, pacing, ratio, summarize } from "../lib/metrics.ts";
process.loadEnvFile(".env.local");
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", max: 1 });
const base = process.env.TEST_BASE_URL ?? "http://127.0.0.1:3100";
const text = (html) =>
  html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&");
function cards(html) {
  return [...html.matchAll(/<article\b[^>]*>([\s\S]*?)<\/article>/g)].map((m) =>
    [...m[1].matchAll(/<(?:h2|p)\b[^>]*>([\s\S]*?)<\/(?:h2|p)>/g)].map((v) =>
      text(v[1]),
    ),
  );
}
function chartProps(html, key) {
  const payload = [...html.matchAll(/self\.__next_f\.push\((.*?)\)<\/script>/g)]
    .map((m) => JSON.parse(m[1]))
    .filter((v) => v[0] === 1)
    .map((v) => v[1])
    .join("");
  const match = payload.match(new RegExp('"' + key + '":(\\[[^\\]]*\\])'));
  return match ? JSON.parse(match[1]) : null;
}
async function page(route, params) {
  const response = await fetch(
    base + route + "?" + new URLSearchParams(params),
  );
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.ok(!html.includes("Campaign data could not be loaded"));
  return html;
}
try {
  const source =
    await sql`SELECT event_date::text AS date, advertiser_id, impressions, clicks, conversions, recorded_cost, unusable_paying_price_rows, paying_above_bid_rows FROM public.daily_campaign_metrics`;
  const rows = source.map((r) => ({
    date: r.date,
    advertiser_id: r.advertiser_id,
    impressions: Number(r.impressions),
    clicks: Number(r.clicks),
    conversions: Number(r.conversions),
    cost: r.recorded_cost === null ? null : Number(r.recorded_cost),
    unusablePrices: Number(r.unusable_paying_price_rows),
    priceFlags: Number(r.paying_above_bid_rows),
  }));
  for (const f of [
    { campaign: "all", from: "2013-06-06", to: "2013-06-12" },
    { campaign: "1458", from: "2013-06-06", to: "2013-06-08" },
    { campaign: "all", from: "2013-06-07", to: "2013-06-08" },
    { campaign: "1458", from: "2013-06-08", to: "2013-06-08" },
    { campaign: "3358", from: "2013-06-10", to: "2013-06-10" },
  ]) {
    const campaigns = f.campaign === "all" ? ids : [f.campaign];
    const expected = summarize(rows, campaigns, f.from, f.to);
    const [performance, budget] = await Promise.all([
      page("/", f),
      page("/pacing", f),
    ]);
    const metrics = cards(performance);
    assert.equal(metrics.length, 8);
    const cardValues = Object.fromEntries(
      metrics.map(([label, value]) => [label, value]),
    );
    assert.equal(metrics[0][0], "Spending");
    assert.equal(metrics[1][0], "Cost per click");
    assert.equal(cardValues["Ad views"], fmt(expected.impressions));
    assert.equal(cardValues["Clicks"], fmt(expected.clicks));
    assert.equal(
      cardValues["Click rate"],
      expected.impressions
        ? fmt(ratio(expected.clicks, expected.impressions, 100), 4) + "%"
        : "Unavailable",
    );
    assert.equal(cardValues["Spending"], fmt(expected.cost, 3));
    assert.equal(
      cardValues["Cost per click"],
      fmt(ratio(expected.cost, expected.clicks), 3),
    );
    const dailyChart = chartProps(performance, "rows");
    assert.ok(dailyChart);
    assert.equal(
      dailyChart.reduce((n, r) => n + r.impressions, 0),
      expected.impressions,
    );
    assert.ok(
      Math.abs(dailyChart.reduce((n, r) => n + r.cost, 0) - expected.cost) <
        0.001,
    );
    const hourlyChart = chartProps(performance, "data");
    assert.equal(hourlyChart.length, 24);
    assert.ok(
      hourlyChart.every((r) => r.impressions !== null && r.clicks !== null),
    );
    assert.equal(
      hourlyChart.reduce((n, r) => n + r.impressions, 0),
      expected.impressions,
    );
    assert.equal(
      hourlyChart.reduce((n, r) => n + r.clicks, 0),
      expected.clicks,
    );
    for (const table of performance.matchAll(
      /<table\b[^>]*>([\s\S]*?)<\/table>/g,
    )) {
      const body = table[1].match(/<tbody>([\s\S]*?)<\/tbody>/)[1];
      const tableRows = [...body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((m) =>
        [...m[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((v) =>
          Number(text(v[1]).replaceAll(",", "")),
        ),
      );
      assert.equal(
        tableRows.reduce((n, r) => n + r[0], 0),
        expected.impressions,
      );
      assert.equal(
        tableRows.reduce((n, r) => n + r[1], 0),
        expected.clicks,
      );
      assert.ok(
        Math.abs(tableRows.reduce((n, r) => n + r[4], 0) - expected.cost) <
          0.02,
      );
    }
    const p = pacing(rows, campaigns, f.from, f.to);
    const spendingChart = chartProps(budget, "data");
    assert.equal(spendingChart.at(-1).actual, p.cumulative);
    assert.equal(spendingChart.at(-1).planned, p.planned);
    const budgetMetrics = cards(budget);
    assert.equal(budgetMetrics[0][1], fmt(p.budget));
    assert.equal(budgetMetrics[1][1], fmt(expected.cost, 3));
    assert.equal(budgetMetrics[2][1], fmt(p.cumulative, 3));
    assert.equal(budgetMetrics[7][1], fmt(p.final, 3));
    const renderedPerformance = performance.replace(
      /<script\b[^>]*>[\s\S]*?<\/script>/g,
      "",
    );
    assert.equal(
      renderedPerformance.includes("Daily spending &amp; cost per click"),
      days(f.from, f.to).length > 1,
    );
    assert.equal(
      renderedPerformance.includes("Daily results"),
      days(f.from, f.to).length > 1,
    );
    assert.equal(
      renderedPerformance.includes("Campaign comparison"),
      campaigns.length > 1,
    );
    const query = new URLSearchParams(f).toString().replaceAll("&", "&amp;");
    assert.ok(performance.includes('href="/pacing?' + query + '"'));
    assert.ok(budget.includes('href="/?' + query + '"'));
    assert.ok(!budget.includes('name="budget"'));
    console.log(
      "PASS rendered performance + pacing:",
      f.campaign,
      f.from,
      f.to,
    );
  }
  for (const f of [
    { from: "2013-06-09", to: "2013-06-06" },
    { from: "invalid" },
    { to: "2013-06-13" },
  ]) {
    for (const route of ["/", "/pacing"]) {
      const html = await page(route, f);
      assert.equal(cards(html).length, 0);
      assert.match(
        html,
        /From date must be on or before To date|Choose From and To dates/,
      );
    }
  }
  console.log("PASS invalid/reversed date states on both routes");
} finally {
  await sql.end();
}
