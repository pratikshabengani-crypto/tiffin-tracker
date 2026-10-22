import {
  CARRY_FORWARD_LIMIT,
  CYCLE_DAYS,
  PLANS,
  type Meal,
  type MealChange,
  type Payment,
  type Subscription,
} from "../types";
import { addDays, dateRange, isOnTime } from "./time";

// eating: meal is cooked and delivered
// skipped: skipped in time, moves the end date (up to 5 per meal)
// skipped_not_carried: skipped in time, but the 5 carry-forwards were used up
// late: skip asked after the cutoff, so it counts as eaten
export type DayStatus = "eating" | "skipped" | "skipped_not_carried" | "late";

export type MealTrack = {
  meal: Meal;
  endDate: string;
  carried: number; // carry-forwards used, max 5
  days: Record<string, DayStatus>; // every date from start to endDate
  changeFor: Record<string, MealChange>; // the change behind a non-eating day
};

export type SkipState = "none" | "on_time" | "late";

// The skip state of one meal on one day, from the customer's changes.
// Later changes win. A late "unskip" only counts if the owner allowed it,
// since the meal may not have been planned any more.
export function skipStateFor(
  changes: MealChange[],
  date: string,
  meal: Meal,
): { state: SkipState; change?: MealChange } {
  const relevant = changes
    .filter((c) => c.date === date && c.meal === meal)
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));

  let result: { state: SkipState; change?: MealChange } = { state: "none" };
  for (const change of relevant) {
    const onTime = change.allowedLate || isOnTime(meal, date, change.requestedAt);
    if (change.kind === "skip") result = { state: onTime ? "on_time" : "late", change };
    else if (onTime) result = { state: "none", change };
  }
  return result;
}

export function mealTrack(sub: Subscription, meal: Meal, allChanges: MealChange[]): MealTrack {
  const changes = allChanges.filter((c) => c.customerId === sub.customerId && c.meal === meal);
  const baseEnd = addDays(sub.startDate, CYCLE_DAYS - 1);

  // Skipping moves the end date, which can bring more skipped days into the
  // plan, so repeat until the end date stops moving (at most 5 times).
  let endDate = baseEnd;
  let states: Record<string, ReturnType<typeof skipStateFor>> = {};
  for (let round = 0; round <= CARRY_FORWARD_LIMIT; round++) {
    states = {};
    let onTimeSkips = 0;
    for (const date of dateRange(sub.startDate, endDate)) {
      states[date] = skipStateFor(changes, date, meal);
      if (states[date].state === "on_time") onTimeSkips++;
    }
    const next = addDays(baseEnd, Math.min(onTimeSkips, CARRY_FORWARD_LIMIT));
    if (next === endDate) break;
    endDate = next;
  }

  const days: Record<string, DayStatus> = {};
  const changeFor: Record<string, MealChange> = {};
  let carried = 0;
  for (const date of dateRange(sub.startDate, endDate)) {
    const { state, change } = states[date];
    if (change && state !== "none") changeFor[date] = change;
    if (state === "late") days[date] = "late";
    else if (state === "on_time") {
      if (carried < CARRY_FORWARD_LIMIT) {
        carried++;
        days[date] = "skipped";
      } else {
        days[date] = "skipped_not_carried";
      }
    } else days[date] = "eating";
  }
  return { meal, endDate, carried, days, changeFor };
}

export type SubscriptionSummary = {
  sub: Subscription;
  tracks: MealTrack[];
  endDate: string; // last day any meal is served
  price: number;
  received: number; // confirmed by the owner
  pending: number; // claimed by the customer, not yet checked
  paid: boolean;
};

export function summarizeSubscription(
  sub: Subscription,
  changes: MealChange[],
  payments: Payment[],
): SubscriptionSummary {
  const plan = PLANS[sub.planId];
  const tracks = plan.meals.map((meal) => mealTrack(sub, meal, changes));
  const forThis = payments.filter((p) => p.purpose === "subscription" && p.subscriptionId === sub.id);
  const received = sum(forThis.filter((p) => p.status === "received").map((p) => p.amount ?? 0));
  const pending = sum(forThis.filter((p) => p.status === "pending").map((p) => p.amount ?? 0));
  return {
    sub,
    tracks,
    endDate: tracks.map((t) => t.endDate).sort().at(-1) ?? sub.startDate,
    price: plan.price,
    received,
    pending,
    paid: received >= plan.price,
  };
}

// Is this subscriber's meal cooked on this date? Late skips still are.
export function servesOn(track: MealTrack, date: string): boolean {
  const status = track.days[date];
  return status === "eating" || status === "late";
}

// The next stretch of 2+ days where every meal in the plan is skipped ("away 25 to 28 Oct").
export function nextAway(summary: SubscriptionSummary, today: string): { from: string; to: string } | null {
  const allSkipped = (date: string) =>
    summary.tracks.every((t) => t.days[date] === "skipped" || t.days[date] === "skipped_not_carried");
  const dates = Object.keys(summary.tracks[0]?.days ?? {}).filter((d) => d >= today).sort();
  for (let i = 0; i < dates.length; i++) {
    if (!allSkipped(dates[i])) continue;
    let j = i;
    while (j + 1 < dates.length && allSkipped(dates[j + 1])) j++;
    if (j > i) return { from: dates[i], to: dates[j] };
  }
  return null;
}

export function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
