import { test } from "node:test";
import assert from "node:assert/strict";
import { hourlyMetrics, type HourlyRow } from "../lib/hourly.ts";
import type { Row } from "../lib/metrics.ts";
const day = "2013-06-06";
const daily: Row[] = [
  {
    date: day,
    advertiser_id: "3358",
    impressions: 100,
    clicks: 2,
    conversions: 0,
    cost: 10,
    unusablePrices: 0,
    priceFlags: 0,
  },
];
const hourly: HourlyRow[] = [
  {
    date: day,
    advertiser_id: "3358",
    event_hour: 8,
    impressions: 60,
    clicks: 0,
  },
  {
    date: day,
    advertiser_id: "3358",
    event_hour: 9,
    impressions: 40,
    clicks: 2,
  },
];
const calculate = (h = hourly, d = daily, ids = ["3358"], end = day) =>
  hourlyMetrics(h, d, ids, day, end);
test("sparse hours become confirmed zeros only after daily reconciliation", () => {
  const result = calculate();
  assert.equal(result.length, 24);
  assert.equal(result[0].impressions, 0);
  assert.equal(result[8].impressions, 60);
  assert.equal(
    result.reduce((n, r) => n + r.impressions!, 0),
    100,
  );
  assert.equal(
    result.reduce((n, r) => n + r.clicks!, 0),
    2,
  );
  assert.equal(result[0].ctr_percent, null);
});
test("dropped hour or entirely missing nonzero day stays unavailable", () => {
  for (const rows of [hourly.slice(0, 1), []]) {
    assert.ok(
      calculate(rows).every((r) => r.impressions === null && r.clicks === null),
    );
  }
  assert.ok(calculate(hourly, []).every((r) => r.impressions === null));
  assert.ok(
    calculate(hourly, daily, ["3358", "1458"]).every(
      (r) => r.impressions === null,
    ),
  );
  assert.ok(
    calculate(hourly, daily, ["3358"], "2013-06-07").every(
      (r) => r.impressions === null,
    ),
  );
});
test("reconcile each metric independently without hiding complete impression data", () => {
  const result = calculate(hourly.map((r) => ({ ...r, clicks: 0 })));
  assert.equal(result[8].impressions, 60);
  assert.ok(result.every((r) => r.clicks === null));
});
test("explicit daily zero confirms zero hours even without hourly rows", () => {
  const zero = daily.map((r) => ({ ...r, impressions: 0, clicks: 0 }));
  assert.ok(
    calculate([], zero).every((r) => r.impressions === 0 && r.clicks === 0),
  );
});
test("multiple campaign-days aggregate after individual reconciliation", () => {
  const otherDaily = daily.map((r) => ({ ...r, advertiser_id: "1458" }));
  const otherHourly = hourly.map((r) => ({ ...r, advertiser_id: "1458" }));
  const result = calculate(
    [...hourly, ...otherHourly],
    [...daily, ...otherDaily],
    ["3358", "1458"],
  );
  assert.equal(result[8].impressions, 120);
  assert.equal(
    result.reduce((n, r) => n + r.clicks!, 0),
    4,
  );
  // Offsetting campaign-level discrepancies must not look complete in aggregate.
  const shifted = [
    ...hourly.map((r) => ({ ...r, impressions: r.impressions! + 1 })),
    ...otherHourly.map((r) => ({ ...r, impressions: r.impressions! - 1 })),
  ];
  assert.ok(
    calculate(shifted, [...daily, ...otherDaily], ["3358", "1458"]).every(
      (r) => r.impressions === null,
    ),
  );
});
test("duplicate, null, negative and invalid-hour records cannot confirm zeros", () => {
  for (const invalid of [
    [...hourly, hourly[0]],
    hourly.map((r) => ({ ...r, impressions: null })),
    hourly.map((r) => ({ ...r, impressions: -1 })),
    hourly.map((r) => ({ ...r, event_hour: 24 })),
  ]) {
    assert.ok(calculate(invalid).every((r) => r.impressions === null));
  }
});
