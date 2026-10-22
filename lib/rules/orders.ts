import { STANDARD_PRICES, type Meal, type PriceOverride, type SingleOrder } from "../types";
import { isOnTime, servedAt } from "./time";

// The price of one single meal on a day: that day's override, or the standard price.
export function priceFor(overrides: PriceOverride[], date: string, meal: Meal): number {
  return overrides.find((o) => o.date === date && o.meal === meal)?.price ?? STANDARD_PRICES[meal];
}

// Prices can change until the meal is served; after that they're locked.
export function canChangePrice(date: string, meal: Meal, now: Date | string): boolean {
  return new Date(now).getTime() < servedAt(meal, date).getTime();
}

export function cancelledOnTime(order: SingleOrder): boolean {
  if (order.status !== "cancelled") return false;
  if (order.cancelAllowedLate) return true;
  return order.cancelledAt !== undefined && isOnTime(order.meal, order.date, order.cancelledAt);
}

// A late cancellation is still cooked and still charged.
export function isCooked(order: SingleOrder): boolean {
  return !cancelledOnTime(order);
}

export function isCharged(order: SingleOrder): boolean {
  return isCooked(order) && !order.notDelivered;
}

export function orderAmount(order: SingleOrder, overrides: PriceOverride[]): number {
  return order.quantity * priceFor(overrides, order.date, order.meal);
}
