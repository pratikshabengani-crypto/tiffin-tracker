const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

export function formatINR(amount: number): string {
  return inr.format(amount);
}

export const MEAL_LABELS = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner" } as const;
