import { isTelegram, normalizePhone } from "./contact";
import { formatINR, MEAL_LABELS } from "./format";
import { BUSINESS_NAME } from "./reminders";
import { summarizeAll } from "./rules/counts";
import { khataFor } from "./rules/khata";
import { isDuplicateUtr } from "./rules/paymentStatus";
import { skipStateFor, type SubscriptionSummary } from "./rules/subscriptions";
import { addDays, dateRange, formatDay, formatTime, istDate, isOnTime } from "./rules/time";
import type { AppState, Message, Outcome } from "./state";
import { PLANS, type Customer, type Meal, type MealChange, type Payment, type SingleOrder } from "./types";
import type { AiRequest, SenderContext, Understanding } from "./understandSchema";

export type IncomingMessage = {
  id: string;
  phone: string;
  receivedAt: string;
  text: string;
  image?: string;
};

const MAX_RANGE_DAYS = 31;

let counter = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(counter++).toString(36)}`;

export { normalizePhone };

export function findCustomer(state: AppState, phone: string): Customer | undefined {
  const wanted = normalizePhone(phone);
  return state.customers.find((c) => c.phone === wanted);
}

// The customer's plan that covers a date (or their latest one).
function planFor(summaries: SubscriptionSummary[], customerId: string, date?: string): SubscriptionSummary | undefined {
  const mine = summaries.filter((s) => s.sub.customerId === customerId).sort((a, b) => b.sub.startDate.localeCompare(a.sub.startDate));
  if (!date) return mine[0];
  return mine.find((s) => s.sub.startDate <= date && date <= s.endDate) ?? mine[0];
}

// What the AI is told about the sender, so "no food tomorrow" means their plan's meals.
export function senderContext(state: AppState, phone: string, today: string): SenderContext {
  const customer = findCustomer(state, phone);
  if (!customer) return null;
  const summaries = summarizeAll(state).filter((s) => s.sub.customerId === customer.id && s.endDate >= today);
  const plan = summaries.sort((a, b) => b.sub.startDate.localeCompare(a.sub.startDate))[0];
  const planDue = summaries.reduce((total, s) => total + Math.max(0, s.price - s.received), 0);
  return {
    name: customer.name,
    plan: plan ? { label: PLANS[plan.sub.planId].label, meals: PLANS[plan.sub.planId].meals, endDate: plan.endDate } : null,
    upcomingOrders: state.singleOrders
      .filter((o) => o.customerId === customer.id && o.date >= today && o.status === "active")
      .map((o) => ({ date: o.date, meal: o.meal, quantity: o.quantity })),
    amountDue: khataFor(customer.id, state).owed + planDue,
  };
}

const mealList = (meals: Meal[]) => meals.map((m) => MEAL_LABELS[m].toLowerCase()).join(" and ");
const dayRange = (from: string, to: string) => (from === to ? formatDay(from) : `${formatDay(from)} to ${formatDay(to)}`);

// Turn the AI's understanding of one message into facts and outcomes.
// The AI only says what the person wants; the rules here decide what's allowed.
export function applyMessage(state: AppState, incoming: IncomingMessage, understanding: Understanding): AppState {
  const customer = findCustomer(state, incoming.phone);
  const summaries = summarizeAll(state);
  const at = incoming.receivedAt;
  const today = istDate(at);
  const unsure = understanding.confidence === "low" || understanding.unclear.length > 0;
  const unclearReason = understanding.unclear.map((u) => `${u.what}: ${u.reason}`).join(" ");

  let next = state;
  const outcomes: Outcome[] = [];
  const outcome = (o: Omit<Outcome, "id">) => outcomes.push({ id: newId("out"), ...o });

  const requests = understanding.requests.length > 0 ? understanding.requests : [];

  if (!customer) {
    const wants = requests.filter((r) => r.kind !== "other").map((r) => r.note);
    outcome({
      status: "attention",
      summary: wants.length > 0 ? wants.join("; ") : understanding.summary,
      reason: isTelegram(incoming.phone) ? "This person isn't one of your customers yet." : "This number isn't one of your customers yet.",
    });
  } else {
    for (const request of requests) {
      next = applyRequest(next, request);
    }
    if (requests.length === 0 && unsure) {
      outcome({ status: "attention", summary: understanding.summary, reason: unclearReason });
    }
  }

  const message: Message = {
    id: incoming.id,
    phone: normalizePhone(incoming.phone),
    senderName: customer?.name,
    receivedAt: at,
    text: incoming.text,
    image: incoming.image,
    summary: understanding.summary,
    outcomes,
  };
  return { ...next, messages: [...next.messages, message] };

  // ---- one request ---------------------------------------------------------

  function applyRequest(s: AppState, r: AiRequest): AppState {
    const c = customer!;
    const from = r.start_date;
    const to = r.end_date && from && r.end_date >= from ? r.end_date : from;
    const tooLong = from && to && dateRange(from, to).length > MAX_RANGE_DAYS;

    switch (r.kind) {
      case "other":
        outcome({ status: unsure ? "attention" : "ignored", summary: r.note, reason: unsure ? unclearReason : undefined });
        return s;

      case "payment":
        return applyPayment(s, r, c);

      case "new_subscription":
      case "renewal": {
        const current = planFor(summaries, c.id);
        const planId = r.plan ?? current?.sub.planId ?? null;
        const startDate = r.start_date ?? (r.kind === "renewal" && current ? addDays(current.endDate, 1) : null);
        outcome({
          status: "attention",
          summary: `${r.kind === "renewal" ? "Renew" : "Start"} ${planId ? PLANS[planId].label : "a plan"}${startDate ? ` from ${formatDay(startDate)}` : ""}`,
          reason: planId && startDate ? "Check the plan and start date before starting it." : "The plan or start date isn't clear. Reply to confirm.",
          action: planId && startDate ? { type: "add_subscription", subscription: { id: newId("s"), customerId: c.id, planId, startDate } } : undefined,
        });
        return s;
      }
    }

    // Everything below needs dates.
    if (!from || !to || tooLong) {
      outcome({
        status: "attention",
        summary: r.note,
        reason: tooLong ? "That date range is longer than a month. Check what they meant." : "Which day isn't clear from the message.",
      });
      return s;
    }

    switch (r.kind) {
      case "skip":
      case "resume":
        return applySkip(s, r, c, from, to);
      case "single_order":
        return applyOrder(s, r, c, from, to);
      case "change_order":
      case "cancel_order":
        return applyOrderChange(s, r, c, from, to);
    }
    return s;
  }

  function applySkip(s: AppState, r: AiRequest, c: Customer, from: string, to: string): AppState {
    const plan = planFor(summaries, c.id, from);
    if (!plan) {
      // Not a subscriber: "no lunch tomorrow" is about their single order.
      return r.kind === "skip" ? applyOrderChange(s, { ...r, kind: "cancel_order" }, c, from, to) : s;
    }
    const planMeals = PLANS[plan.sub.planId].meals;
    const meals = (r.meals.length > 0 ? r.meals : planMeals.length === 1 ? planMeals : []).filter((m) => planMeals.includes(m));
    if (meals.length === 0) {
      outcome({
        status: "attention",
        summary: r.note,
        reason: r.meals.length > 0 ? `Their plan (${PLANS[plan.sub.planId].label}) doesn't include ${mealList(r.meals)}.` : "Which meal isn't clear.",
      });
      return s;
    }

    const kind = r.kind === "skip" ? "skip" : "unskip";
    const existing = s.mealChanges.filter((m) => m.customerId === c.id);
    const changes: MealChange[] = [];
    for (const date of dateRange(from, to)) {
      for (const meal of meals) {
        // Only undo days that are actually skipped.
        if (kind === "unskip" && skipStateFor(existing, date, meal).state === "none") continue;
        changes.push({ id: newId("m"), customerId: c.id, date, meal, kind, requestedAt: at, messageId: incoming.id });
      }
    }
    const verb = kind === "skip" ? "Skip" : "Resume";
    const summary = `${verb} ${mealList(meals)} · ${dayRange(from, to)}`;
    if (changes.length === 0) {
      outcome({ status: "ignored", summary, reason: "Nothing to change: those meals weren't skipped." });
      return s;
    }

    if (unsure) {
      outcome({ status: "attention", summary, reason: unclearReason || "The AI wasn't sure about this.", action: { type: "add_facts", mealChanges: changes } });
      return s;
    }

    const onTime = changes.filter((m) => isOnTime(m.meal, m.date, at));
    const late = changes.filter((m) => !isOnTime(m.meal, m.date, at));
    if (onTime.length > 0) outcome({ status: "applied", summary: late.length > 0 ? `${summary} (on-time part)` : summary });

    if (late.length === 0) return { ...s, mealChanges: [...s.mealChanges, ...changes] };

    if (kind === "skip") {
      // Late skips are recorded (shown orange, still cooked) until the owner allows them.
      outcome({
        status: "attention",
        summary: `${verb} ${late.map((m) => `${MEAL_LABELS[m.meal].toLowerCase()} ${formatDay(m.date)}`).join(", ")}`,
        reason: `Sent at ${formatTime(at)}, after the cutoff. It counts as eaten unless you allow it.`,
        action: { type: "allow_late_skip", mealChangeIds: late.map((m) => m.id) },
      });
      return { ...s, mealChanges: [...s.mealChanges, ...changes] };
    }
    // A late "resume" means cooking a meal that may not be planned: ask first.
    outcome({
      status: "attention",
      summary: `Resume ${late.map((m) => `${MEAL_LABELS[m.meal].toLowerCase()} ${formatDay(m.date)}`).join(", ")}`,
      reason: `Sent at ${formatTime(at)}, after the cutoff. Resume it only if you can still cook it.`,
      action: { type: "add_facts", mealChanges: late.map((m) => ({ ...m, allowedLate: true })) },
    });
    return { ...s, mealChanges: [...s.mealChanges, ...onTime] };
  }

  function applyOrder(s: AppState, r: AiRequest, c: Customer, from: string, to: string): AppState {
    if (r.meals.length === 0 || r.quantity === null || r.quantity < 1) {
      const missing = r.meals.length === 0 ? "Which meal isn't clear." : "How many meals isn't clear.";
      outcome({ status: "attention", summary: r.note, reason: unclearReason ? `${unclearReason} Reply to check what they want.` : missing });
      return s;
    }
    const orders: SingleOrder[] = dateRange(from, to).flatMap((date) =>
      r.meals.map((meal) => ({
        id: newId("o"),
        customerId: c.id,
        date,
        meal,
        quantity: r.quantity!,
        status: "active" as const,
        requestedAt: at,
        messageId: incoming.id,
      })),
    );
    const summary = `Order ${r.quantity} × ${mealList(r.meals)} · ${dayRange(from, to)}`;
    if (unsure) {
      outcome({ status: "attention", summary, reason: unclearReason || "The AI wasn't sure about this.", action: { type: "add_facts", singleOrders: orders } });
      return s;
    }

    // Meals still before their cutoff are added now; only the late ones wait for the owner.
    const onTime = orders.filter((o) => isOnTime(o.meal, o.date, at));
    const late = orders.filter((o) => !isOnTime(o.meal, o.date, at));
    if (onTime.length > 0) outcome({ status: "applied", summary: late.length > 0 ? `${summary} (on-time part)` : summary });
    if (late.length > 0) {
      outcome({
        status: "attention",
        summary: `Order ${r.quantity} × ${late.map((o) => `${MEAL_LABELS[o.meal].toLowerCase()} ${formatDay(o.date)}`).join(", ")}`,
        reason: `Sent at ${formatTime(at)}, after the cutoff. Add it only if you can still cook it.`,
        action: { type: "add_facts", singleOrders: late },
      });
    }
    return { ...s, singleOrders: [...s.singleOrders, ...onTime] };
  }

  function applyOrderChange(s: AppState, r: AiRequest, c: Customer, from: string, to: string): AppState {
    const matches = s.singleOrders.filter(
      (o) =>
        o.customerId === c.id &&
        o.status === "active" &&
        o.date >= from &&
        o.date <= to &&
        (r.meals.length === 0 || r.meals.includes(o.meal)),
    );

    if (matches.length === 0) {
      if (r.kind === "change_order") return applyOrder(s, r, c, from, to); // nothing to change: treat as a new order
      // Cancelling a meal that's really part of their plan is a skip.
      if (planFor(summaries, c.id, from)) return applySkip(s, { ...r, kind: "skip" }, c, from, to);
      outcome({ status: "attention", summary: r.note, reason: "No matching order found to cancel." });
      return s;
    }

    if (r.kind === "change_order") {
      const order = matches[0];
      if (r.quantity === null || r.quantity < 1) {
        outcome({ status: "attention", summary: r.note, reason: "The new number of meals isn't clear." });
        return s;
      }
      const summary = `Change ${MEAL_LABELS[order.meal].toLowerCase()} ${formatDay(order.date)} to ${r.quantity}`;
      if (unsure || !isOnTime(order.meal, order.date, at)) {
        outcome({
          status: "attention",
          summary,
          reason: unsure ? unclearReason || "The AI wasn't sure about this." : `Sent at ${formatTime(at)}, after the cutoff.`,
          action: { type: "update_order", orderId: order.id, quantity: r.quantity },
        });
        return s;
      }
      outcome({ status: "applied", summary });
      return { ...s, singleOrders: s.singleOrders.map((o) => (o.id === order.id ? { ...o, quantity: r.quantity! } : o)) };
    }

    // cancel_order
    const ids = matches.map((o) => o.id);
    const summary = `Cancel ${matches.map((o) => `${MEAL_LABELS[o.meal].toLowerCase()} ${formatDay(o.date)}`).join(", ")}`;
    const late = matches.filter((o) => !isOnTime(o.meal, o.date, at));
    const cancelled = { ...s, singleOrders: s.singleOrders.map((o) => (ids.includes(o.id) ? { ...o, status: "cancelled" as const, cancelledAt: at } : o)) };
    if (late.length > 0) {
      outcome({
        status: "attention",
        summary,
        reason: `Sent at ${formatTime(at)}, after the cutoff, so it's still charged unless you waive it.`,
        action: { type: "allow_late_cancel", orderIds: late.map((o) => o.id) },
      });
    } else {
      outcome({ status: "applied", summary });
    }
    return cancelled;
  }

  function applyPayment(s: AppState, r: AiRequest, c: Customer): AppState {
    const hasScreenshot = Boolean(incoming.image) && r.screenshot_status !== "no_screenshot";
    // A plan advance if they owe one and the amount fits it; otherwise single meals.
    const unpaidPlan = summaries.find((x) => x.sub.customerId === c.id && !x.paid && x.endDate >= today);
    const planDue = unpaidPlan ? unpaidPlan.price - unpaidPlan.received : 0;
    const singleOwed = khataFor(c.id, s).owed;
    const forPlan = unpaidPlan && (r.amount === planDue || (r.amount === null && singleOwed === 0));

    const payment: Payment = {
      id: newId("p"),
      customerId: c.id,
      purpose: forPlan ? "subscription" : "single",
      subscriptionId: forPlan ? unpaidPlan!.sub.id : undefined,
      amount: r.amount,
      method: r.payment_method ?? (hasScreenshot ? "upi" : null),
      evidence: hasScreenshot ? "screenshot" : "text",
      screenshot: hasScreenshot ? incoming.image : undefined,
      utr: r.utr,
      paidTo: r.paid_to,
      status: "pending",
      claimedAt: at,
      messageId: incoming.id,
    };

    const problems: string[] = [];
    if (r.amount === null) {
      problems.push(unsure && unclearReason ? `${unclearReason} Check your UPI app for the amount.` : "The amount isn't shown. Check your UPI app for it.");
    }
    if (hasScreenshot && r.screenshot_status !== "success") problems.push(`The screenshot shows the payment as ${r.screenshot_status}.`);
    if (hasScreenshot && r.paid_to && !r.paid_to.toLowerCase().includes(BUSINESS_NAME.split(" ")[0].toLowerCase())) {
      problems.push(`It says it was paid to "${r.paid_to}", not ${BUSINESS_NAME}.`);
    }
    if (isDuplicateUtr(payment, s.payments)) problems.push("This transaction ID was already used for another payment.");

    const summary = `Says paid ${r.amount !== null ? formatINR(r.amount) : "(amount not given)"}${hasScreenshot ? " with a screenshot" : ""}${forPlan ? " for their plan" : ""}`;
    outcome({
      status: problems.length > 0 ? "attention" : "applied",
      summary: `${summary} · waiting for your check on the Payments screen`,
      reason: problems.length > 0 ? problems.join(" ") : undefined,
    });
    return { ...s, payments: [...s.payments, payment] };
  }
}
