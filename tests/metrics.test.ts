import { test } from "node:test";
import assert from "node:assert/strict";
import {
  days,
  filters,
  href,
  ids,
  pacing,
  ratio,
  summarize,
  type Row,
} from "../lib/metrics.ts";
const dates = days("2013-06-06", "2013-06-12");
const rows: Row[] = dates.flatMap((date, i) =>
  ids.map((advertiser_id) => ({
    date,
    advertiser_id,
    impressions: (i + 1) * 100,
    clicks: 1,
    conversions: 2,
    cost: (i + 1) * 1000,
    unusablePrices: 0,
    priceFlags: 1,
  })),
);
test("inclusive full week, campaign June 6–8, two days and one day use ratio of sums", () => {
  for (const [campaigns, from, to, expected] of [
    [ids, dates[0], dates[6], 14000],
    [[ids[0]], dates[0], dates[2], 600],
    [ids, dates[1], dates[2], 2500],
    [[ids[0]], dates[1], dates[1], 200],
  ] as [string[], string, string, number][]) {
    const total = summarize(rows, campaigns, from, to);
    assert.equal(total.impressions, expected);
    assert.equal(
      ratio(total.clicks, total.impressions, 100),
      (total.clicks! / expected) * 100,
    );
    const parts = campaigns.map((id) => summarize(rows, [id], from, to));
    assert.equal(
      parts.reduce((n, p) => n + p.cost!, 0),
      total.cost,
    );
    assert.equal(
      days(from, to).reduce(
        (n, day) => n + summarize(rows, campaigns, day, day).impressions!,
        0,
      ),
      total.impressions,
    );
  }
  assert.equal(ratio(2, 300, 100), (2 / 300) * 100);
});
test("reject malformed, unavailable, reversed and repeated filters; defaults to full period", () => {
  assert.deepEqual(filters({}, dates), {
    campaign: "all",
    from: dates[0],
    to: dates[6],
    error: undefined,
  });
  for (const params of [
    { from: dates[2], to: dates[0] },
    { from: "garbage" },
    { to: "2013-06-13" },
    { campaign: "unknown" },
    { from: [dates[0], dates[1]] },
  ])
    assert.ok(filters(params, dates).error);
});
test("filters survive both route directions", () => {
  const f = filters({ campaign: "1458", from: dates[0], to: dates[2] }, dates);
  for (const route of ["/", "/pacing"]) {
    const query = new URL(href(route, f), "http://localhost").searchParams;
    assert.deepEqual(filters(Object.fromEntries(query), dates), f);
  }
});
test("budget and cumulative do not change when From changes; final is actual at campaign end", () => {
  const a = pacing(rows, [ids[0]], dates[0], dates[2]);
  const b = pacing(rows, [ids[0]], dates[2], dates[2]);
  assert.equal(a.budget, 250000);
  assert.equal(a.cumulative, 6000);
  assert.equal(a.cumulative, b.cumulative);
  assert.equal(b.range, 3000);
  assert.equal(a.planned, (250000 * 3) / 7);
  assert.equal(a.final, 14000);
  const end = pacing(rows, ids, dates[0], dates[6]);
  assert.equal(end.budget, 1250000);
  assert.equal(end.final, end.cumulative);
  assert.ok(end.atEnd);
});
test("missing coverage, null cost and unusable prices withhold affected totals and forecast", () => {
  for (const damaged of [
    rows.slice(1),
    rows.map((r, i) => (i === 0 ? { ...r, cost: null } : r)),
    rows.map((r, i) => (i === 0 ? { ...r, unusablePrices: 1 } : r)),
  ]) {
    assert.equal(summarize(damaged, ids, dates[0], dates[6]).cost, null);
    const p = pacing(damaged, ids, dates[2], dates[6]);
    assert.equal(p.cumulative, null);
    assert.equal(p.final, null);
    assert.equal(p.difference, null);
  }
  assert.equal(
    summarize(rows.slice(1), ids, dates[0], dates[6]).impressions,
    null,
  );
});
test("explicit zero activity stays zero; undefined ratios are unavailable", () => {
  const zero = rows.map((r) => ({
    ...r,
    impressions: 0,
    clicks: 0,
    conversions: 0,
    cost: 0,
  }));
  const t = summarize(zero, ids, dates[0], dates[6]);
  assert.equal(t.cost, 0);
  assert.equal(t.impressions, 0);
  assert.equal(ratio(0, 0), null);
  assert.equal(ratio(null, 10), null);
  assert.equal(ratio(0, 10), 0);
  assert.equal(pacing(zero, ids, dates[0], dates[2]).final, 0);
});
