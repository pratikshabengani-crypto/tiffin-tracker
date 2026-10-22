import { MEALS, type Customer, type Facts, type Meal } from "../types";
import { cancelledOnTime, isCooked } from "./orders";
import { servesOn, summarizeSubscription, type SubscriptionSummary } from "./subscriptions";

export type MealCount = { subscribers: number; single: number; total: number };

export function summarizeAll(facts: Facts): SubscriptionSummary[] {
  return facts.subscriptions.map((sub) => summarizeSubscription(sub, facts.mealChanges, facts.payments));
}

// How many of each meal to cook on a date.
export function mealsOn(
  facts: Facts,
  date: string,
  summaries: SubscriptionSummary[] = summarizeAll(facts),
): Record<Meal, MealCount> {
  const counts = {} as Record<Meal, MealCount>;
  for (const meal of MEALS) {
    const subscribers = summaries.filter((s) => s.tracks.some((t) => t.meal === meal && servesOn(t, date))).length;
    const single = facts.singleOrders
      .filter((o) => o.date === date && o.meal === meal && isCooked(o))
      .reduce((total, o) => total + o.quantity, 0);
    counts[meal] = { subscribers, single, total: subscribers + single };
  }
  return counts;
}

export type DayChange = {
  customer: Customer;
  meal: Meal;
  kind: "skip" | "late_skip" | "order" | "cancelled" | "late_cancel";
  quantity: number;
};

// Everything that differs from a normal day: skips, single orders, cancellations.
export function changesOn(
  facts: Facts,
  date: string,
  summaries: SubscriptionSummary[] = summarizeAll(facts),
): DayChange[] {
  const byId = new Map(facts.customers.map((c) => [c.id, c]));
  const changes: DayChange[] = [];

  for (const summary of summaries) {
    const customer = byId.get(summary.sub.customerId);
    if (!customer) continue;
    for (const track of summary.tracks) {
      const status = track.days[date];
      if (status === "skipped" || status === "skipped_not_carried") {
        changes.push({ customer, meal: track.meal, kind: "skip", quantity: 1 });
      } else if (status === "late") {
        changes.push({ customer, meal: track.meal, kind: "late_skip", quantity: 1 });
      }
    }
  }

  for (const order of facts.singleOrders.filter((o) => o.date === date)) {
    const customer = byId.get(order.customerId);
    if (!customer) continue;
    const kind = order.status === "active" ? "order" : cancelledOnTime(order) ? "cancelled" : "late_cancel";
    changes.push({ customer, meal: order.meal, kind, quantity: order.quantity });
  }

  return changes.sort(
    (a, b) => MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal) || a.customer.name.localeCompare(b.customer.name),
  );
}
