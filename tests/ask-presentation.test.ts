import { test } from "node:test";
import assert from "node:assert/strict";
import { answerItems, formatExactValue } from "../lib/ask-presentation.ts";
test("approved canonical claims become concise labeled values", () => {
  assert.deepEqual(answerItems("sum_clicks = 2610 (evidence 1, row 1)"), [{ label: "Total clicks", value: "2,610" }]);
  assert.deepEqual(answerItems("total_impressions = 1234567 (evidence 1, row 1); conversions = 0 (evidence 1, row 1)"), [{ label: "Total impressions", value: "1,234,567" }, { label: "Conversions", value: "0" }]);
});
test("formatting preserves exact BIGINT and decimal values", () => {
  assert.equal(formatExactValue("9007199254740993.123456789"), "9,007,199,254,740,993.123456789");
  assert.equal(formatExactValue("-1234"), "-1,234");
  assert.equal(formatExactValue("1e-8"), "1e-8");
});
test("unknown prose stays intact instead of being treated as canonical claims", () => {
  assert.equal(answerItems("Some unexpected answer"), null);
  assert.equal(answerItems("clicks = <script>bad</script> (evidence 1, row 1)"), null);
});
