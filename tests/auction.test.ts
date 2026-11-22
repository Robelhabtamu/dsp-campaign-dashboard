import { test } from "node:test";
import assert from "node:assert/strict";
import { auctionMetrics, type AuctionRow } from "../lib/auction.ts";
import { filters, href } from "../lib/metrics.ts";

const row = (changes: Partial<AuctionRow> = {}): AuctionRow => ({
  date: "2013-06-06", advertiser_id: "1458", impressions: 100,
  avgBid: 200, avgPaid: 100, cost: 10, unusablePrices: 0, priceFlags: 2,
  ...changes,
});
const calculate = (rows: AuctionRow[], from = "2013-06-06", to = from) =>
  auctionMetrics(rows, ["1458"], from, to);

test("weighted paid price, scaled cost and above-bid share use correct denominators", () => {
  const result = calculate([row(), row({ date: "2013-06-07", impressions: 300, avgPaid: 20, cost: 6, priceFlags: 6 })], "2013-06-06", "2013-06-07");
  assert.equal(result.avgPaid, 40);
  assert.equal(result.cost, 16); // Never divide already scaled cost again.
  assert.equal(result.aboveBidPercent, 2);
  assert.equal(result.priceFlags, 8);
});

test("inclusive filtering isolates campaign and dates without mutating rows", () => {
  const rows = [row(), row({ date: "2013-06-07" }), row({ date: "2013-06-08" }), row({ advertiser_id: "3358", cost: 999 })];
  const original = structuredClone(rows);
  assert.equal(calculate(rows, "2013-06-06", "2013-06-07").cost, 20);
  assert.equal(calculate(rows, "2013-06-07").cost, 10);
  assert.deepEqual(rows, original);
});

test("unusable paying counts weight valid paid means but withhold complete cost", () => {
  const result = calculate([row({ impressions: 100, unusablePrices: 50, avgPaid: 20 }), row({ date: "2013-06-07", avgPaid: 80 })], "2013-06-06", "2013-06-07");
  assert.equal(result.avgPaid, 60);
  assert.equal(result.usablePrices, 150);
  assert.equal(result.unusablePrices, 50);
  assert.equal(result.cost, null);
});

test("missing and duplicate campaign-days withhold aggregate values", () => {
  for (const rows of [[], [row()], [row(), row()]]) {
    const result = calculate(rows, "2013-06-06", "2013-06-07");
    assert.equal(result.complete, false);
    assert.equal(result.avgPaid, null);
    assert.equal(result.cost, null);
    assert.equal(result.impressions, null);
  }
});

test("null and invalid prices are never coerced to zero", () => {
  for (const avgPaid of [null, NaN, Infinity, -1]) {
    assert.equal(calculate([row({ avgPaid })]).avgPaid, null);
  }
  for (const cost of [null, NaN, Infinity, -1]) {
    assert.equal(calculate([row({ cost })]).cost, null);
  }
  for (const changes of [{ unusablePrices: null }, { unusablePrices: 101 }, { priceFlags: -1 }, { impressions: null }]) {
    const result = calculate([row(changes)]);
    assert.equal(result.cost, null);
    assert.equal(result.avgPaid, null);
  }
});

test("zero impressions and entirely unusable prices have undefined mean prices", () => {
  const zero = calculate([row({ impressions: 0, avgBid: null, avgPaid: null, cost: 0, priceFlags: 0 })]);
  assert.equal(zero.cost, 0);
  assert.equal(zero.avgPaid, null);
  assert.equal(zero.aboveBidPercent, null);
  assert.equal(calculate([row({ unusablePrices: 100, avgPaid: null })]).avgPaid, null);
  assert.equal(calculate([row({ avgPaid: 0, avgBid: 0, cost: 0 })]).avgPaid, 0);
  const mixed = calculate([row({ unusablePrices: 100, avgPaid: NaN }), row({ date: "2013-06-07" })], "2013-06-06", "2013-06-07");
  assert.equal(mixed.avgPaid, 100);
});

test("bid mean availability does not corrupt paying price or recorded cost", () => {
  const result = calculate([row({ avgBid: null })]);
  assert.equal(result.avgPaid, 100);
  assert.equal(result.cost, 10);
});

test("filters persist across auction, performance and pacing links", () => {
  const dates = ["2013-06-06", "2013-06-07"];
  const f = filters({ campaign: "1458", from: dates[0], to: dates[1] }, dates);
  for (const route of ["/auction", "/", "/pacing"]) {
    const params = new URL(href(route, f), "https://example.test").searchParams;
    assert.deepEqual(filters(Object.fromEntries(params), dates), f);
  }
  assert.ok(filters({ from: dates[1], to: dates[0] }, dates).error);
  assert.ok(filters({ campaign: "unknown" }, dates).error);
});
