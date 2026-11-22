// DEMO assumptions only. Replace with approved campaign budgets when available.
export const campaignBudgets = Object.fromEntries(
  ["1458", "3358", "3386", "3427", "3476"].map((id) => [
    id,
    {
      amount: 250_000,
      start: "2013-06-06",
      end: "2013-06-12",
      label: "DEMO",
    },
  ]),
) as Record<
  string,
  { amount: number; start: string; end: string; label: string }
>;
