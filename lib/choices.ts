import { MEAL_LABELS } from "./format";
import { addDays, formatDay, istDate, servedAt } from "./rules/time";
import type { AppState, Message, Outcome, Resolution } from "./state";
import { PLANS, type Meal } from "./types";

// One option in an item's "Choose what to do" menu. Every option closes the item as settled;
// its label says exactly what it changes, including the day.
export type Choice = { value: Resolution | "add_customer"; label: string };

const PLURAL: Record<Meal, string> = { breakfast: "breakfasts", lunch: "lunches", dinner: "dinners" };

// "today", "tomorrow", "yesterday", or "Sat, 24 Oct".
export function dayWord(date: string, now: string): string {
  const today = istDate(now);
  if (date === today) return "today";
  if (date === addDays(today, 1)) return "tomorrow";
  if (date === addDays(today, -1)) return "yesterday";
  return formatDay(date);
}

function served(meal: Meal, date: string, now: string): boolean {
  return new Date(now).getTime() >= servedAt(meal, date).getTime();
}

// "2 breakfasts today (already served), 2 breakfasts tomorrow"
function mealsOnDays(items: { meal: Meal; date: string; quantity?: number }[], now: string): string {
  return items
    .map((i) => {
      const q = i.quantity ?? 1;
      const meal = q === 1 ? MEAL_LABELS[i.meal].toLowerCase() : PLURAL[i.meal];
      return `${i.quantity !== undefined ? `${q} ` : ""}${meal} ${dayWord(i.date, now)}${served(i.meal, i.date, now) ? " (already served)" : ""}`;
    })
    .join(", ");
}

export function choicesFor(state: AppState, message: Message, outcome: Outcome | undefined, now: string): Choice[] {
  const choices: Choice[] = [];
  const action = outcome?.action;

  if (action?.type === "add_facts" && action.singleOrders?.length) {
    choices.push(
      { value: "approved", label: `Add ${mealsOnDays(action.singleOrders, now)} – settled` },
      { value: "dismissed", label: "Don't add – settled" },
    );
  } else if (action?.type === "add_facts" && action.mealChanges?.length) {
    const what = mealsOnDays(action.mealChanges, now);
    const skip = action.mealChanges[0].kind === "skip";
    choices.push(
      { value: "approved", label: `${skip ? "Skip" : "Resume"} ${what} – settled` },
      { value: "dismissed", label: `${skip ? "Don't skip" : "Don't resume"} – settled` },
    );
  } else if (action?.type === "allow_late_skip") {
    const changes = state.mealChanges.filter((m) => action.mealChangeIds.includes(m.id));
    choices.push(
      { value: "approved", label: `Allow skip of ${mealsOnDays(changes, now)} – settled` },
      { value: "dismissed", label: "Keep the meal (counts as eaten) – settled" },
    );
  } else if (action?.type === "allow_late_cancel") {
    const orders = state.singleOrders.filter((o) => action.orderIds.includes(o.id));
    choices.push(
      { value: "approved", label: `Cancel ${mealsOnDays(orders, now)}, don't charge – settled` },
      { value: "dismissed", label: "Charge anyway – settled" },
    );
  } else if (action?.type === "update_order") {
    const order = state.singleOrders.find((o) => o.id === action.orderId);
    const what = order ? `${MEAL_LABELS[order.meal].toLowerCase()} ${dayWord(order.date, now)}` : "the order";
    choices.push(
      { value: "approved", label: `Change ${what} to ${action.quantity} – settled` },
      { value: "dismissed", label: `Keep it${order ? ` at ${order.quantity}` : ""} – settled` },
    );
  } else if (action?.type === "add_subscription") {
    const { planId, startDate } = action.subscription;
    choices.push(
      { value: "approved", label: `Start ${PLANS[planId].label} from ${dayWord(startDate, now)} – settled` },
      { value: "dismissed", label: "Don't start it – settled" },
    );
  }

  if (!message.senderName) choices.push({ value: "add_customer", label: "Add as customer" });
  if (!action) choices.push({ value: "settled", label: "Settled" });
  return choices;
}
