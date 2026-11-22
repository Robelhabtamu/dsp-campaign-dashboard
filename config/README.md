# Demo campaign budgets

`budgets.ts` contains assumptions only: **DEMO 250,000 scaled dataset units per campaign**, June 6–12, 2013, allocated evenly by day. These are not actual advertiser budgets or observed metrics. Replace entries with approved budgets and flight dates before using them for operational decisions; update the DEMO labels in the interface at that time.

Observed `recorded_cost` is already scaled. It is never divided by 1,000 again. Cumulative spending and estimates require complete, usable cost coverage from campaign start through the selected end date. Changing From only changes selected-range spending. Revenue is unavailable, so neither conversions nor remaining budgets imply profit.

## Local checks

- `npm test`: fixtures for inclusive ranges, weighted CTR, missing coverage/cost, explicit zero activity, cumulative budgets, and filter links (Node 22.18+).
- `npm run lint` and `npm run build`.
- Start the production server with `npm run start -- --port 3100`, then run `node --experimental-strip-types tests/live-check.mjs`. This read-only integration check uses `.env.local` and compares rendered cards, table totals, chart inputs, and route links with Neon for the requested historical ranges. It does not modify the database. Set `TEST_BASE_URL` for a different local port.
