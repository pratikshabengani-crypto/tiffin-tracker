import { describe, expect, it } from "vitest";
import { resolveOutcome, setSettled } from "./actions";
import { applyMessage, senderContext, type IncomingMessage } from "./applyMessage";
import { TEST_DAY, demoState } from "./demo/seed";
import { mealsOn, summarizeAll } from "./rules/counts";
import { khataFor } from "./rules/khata";
import { addDays, istInstant } from "./rules/time";
import { isSettled, needsAttention, type AppState } from "./state";
import { PLANS, type PlanId } from "./types";
import type { AiRequest, Understanding } from "./understandSchema";

const base = demoState(TEST_DAY);
const today = TEST_DAY;
const tomorrow = addDays(today, 1);
const at = (hours: number, minutes = 0, date = today) => istInstant(date, hours, minutes).toISOString();

function req(partial: Partial<AiRequest> & Pick<AiRequest, "kind">): AiRequest {
  return {
    meals: [],
    start_date: null,
    end_date: null,
    quantity: null,
    amount: null,
    payment_method: null,
    utr: null,
    screenshot_status: "no_screenshot",
    paid_to: null,
    plan: null,
    note: partial.kind,
    ...partial,
  };
}

function understood(requests: AiRequest[], extra: Partial<Understanding> = {}): Understanding {
  return { requests, unclear: [], confidence: "high", summary: "test", ...extra };
}

let n = 0;
function send(state: AppState, phone: string, receivedAt: string, u: Understanding, image?: string) {
  const incoming: IncomingMessage = { id: `msg-test-${n++}`, phone, receivedAt, text: "test", image };
  const next = applyMessage(state, incoming, u);
  return { state: next, message: next.messages.at(-1)! };
}

// Subscribers with a plan that's running today, not already skipping today.
function subscriber(planId: PlanId) {
  const summary = summarizeAll(base).find(
    (s) => s.sub.planId === planId && s.tracks.every((t) => t.days[today] === "eating" && t.days[addDays(today, 4)] === "eating"),
  )!;
  return base.customers.find((c) => c.id === summary.sub.customerId)!;
}
const singleCustomer = base.customers.find((c) => !base.subscriptions.some((s) => s.customerId === c.id) && base.singleOrders.some((o) => o.customerId === c.id && o.date === today))!;

describe("applyMessage", () => {
  it("applies an on-time skip and lowers today's count", () => {
    const priya = subscriber("lunch");
    const { state, message } = send(base, priya.phone, at(7, 40), understood([req({ kind: "skip", meals: ["lunch"], start_date: today, end_date: today })]));
    expect(message.outcomes.map((o) => o.status)).toEqual(["applied"]);
    expect(mealsOn(state, today).lunch.total).toBe(mealsOn(base, today).lunch.total - 1);
  });

  it("uses the plan's meal when the message doesn't name one", () => {
    const priya = subscriber("lunch");
    const { state } = send(base, priya.phone, at(7, 40), understood([req({ kind: "skip", start_date: today })]));
    expect(mealsOn(state, today).lunch.total).toBe(mealsOn(base, today).lunch.total - 1);
  });

  it("records a late skip as eaten until the owner allows it", () => {
    const priya = subscriber("lunch");
    const { state, message } = send(base, priya.phone, at(10, 12), understood([req({ kind: "skip", meals: ["lunch"], start_date: today })]));
    const late = message.outcomes[0];
    expect(late).toMatchObject({ status: "attention", action: { type: "allow_late_skip" } });
    expect(mealsOn(state, today).lunch.total).toBe(mealsOn(base, today).lunch.total);

    const allowed = resolveOutcome(state, message.id, late.id, "approved");
    expect(mealsOn(allowed, today).lunch.total).toBe(mealsOn(base, today).lunch.total - 1);
  });

  it("marks a message settled or not settled without changing any orders", () => {
    const priya = subscriber("lunch");
    const { state, message } = send(base, priya.phone, at(10, 12), understood([req({ kind: "skip", meals: ["lunch"], start_date: today })]));
    const find = (s: AppState) => s.messages.find((m) => m.id === message.id)!;
    expect(isSettled(find(state))).toBe(false);

    const settled = setSettled(state, message.id, true);
    expect(isSettled(find(settled))).toBe(true);
    expect(find(settled).outcomes[0].resolution).toBe("settled");
    expect(settled.mealChanges).toEqual(state.mealChanges);
    expect(needsAttention(settled).some((a) => a.message.id === message.id)).toBe(false);

    const reopened = setSettled(settled, message.id, false);
    expect(isSettled(find(reopened))).toBe(false);
    expect(needsAttention(reopened).filter((a) => a.message.id === message.id)).toEqual([{ message: find(reopened) }]);
  });

  it("skips every meal in a date range", () => {
    const kiran = subscriber("lunch_dinner");
    const { state, message } = send(
      base,
      kiran.phone,
      at(7, 52),
      understood([req({ kind: "skip", meals: ["lunch", "dinner"], start_date: "2026-10-24", end_date: "2026-10-26" })]),
    );
    expect(message.outcomes[0].status).toBe("applied");
    expect(state.mealChanges.length - base.mealChanges.length).toBe(6);
  });

  it("flags a skip for a meal that isn't in the plan", () => {
    const priya = subscriber("lunch");
    const { state, message } = send(base, priya.phone, at(7, 40), understood([req({ kind: "skip", meals: ["dinner"], start_date: today })]));
    expect(message.outcomes[0].status).toBe("attention");
    expect(state.mealChanges).toHaveLength(base.mealChanges.length);
  });

  it("resumes a skipped dinner before 5 pm", () => {
    const skipped = summarizeAll(base).find((s) => s.tracks.some((t) => t.meal === "dinner" && t.days[today] === "skipped"))!;
    const phone = base.customers.find((c) => c.id === skipped.sub.customerId)!.phone;
    const { state, message } = send(base, phone, at(15, 40), understood([req({ kind: "resume", meals: ["dinner"], start_date: today })]));
    expect(message.outcomes[0].status).toBe("applied");
    expect(mealsOn(state, today).dinner.total).toBe(mealsOn(base, today).dinner.total + 1);
  });

  it("adds an on-time single order and makes it owed straight away", () => {
    const { state, message } = send(
      base,
      singleCustomer.phone,
      at(8, 5),
      understood([req({ kind: "single_order", meals: ["lunch"], quantity: 2, start_date: tomorrow })]),
    );
    expect(message.outcomes[0].status).toBe("applied");
    expect(khataFor(singleCustomer.id, state).owed).toBe(khataFor(singleCustomer.id, base).owed + 260);
  });

  it("asks before adding an order sent after the cutoff", () => {
    const { state, message } = send(
      base,
      singleCustomer.phone,
      at(10, 30),
      understood([req({ kind: "single_order", meals: ["lunch"], quantity: 1, start_date: today })]),
    );
    expect(message.outcomes[0]).toMatchObject({ status: "attention", action: { type: "add_facts" } });
    expect(state.singleOrders).toHaveLength(base.singleOrders.length);
    const accepted = resolveOutcome(state, message.id, message.outcomes[0].id, "approved");
    expect(accepted.singleOrders).toHaveLength(base.singleOrders.length + 1);
  });

  it("adds the on-time days of an order now and asks only about the late ones", () => {
    // 7 am: today's breakfast closed at 10 pm last night, tomorrow's is still open.
    const { state, message } = send(
      base,
      singleCustomer.phone,
      at(7, 0),
      understood([req({ kind: "single_order", meals: ["breakfast"], quantity: 2, start_date: today, end_date: tomorrow })]),
    );
    expect(message.outcomes.map((o) => o.status)).toEqual(["applied", "attention"]);
    const late = message.outcomes[1];
    expect(late.action).toMatchObject({ type: "add_facts", singleOrders: [{ date: today, meal: "breakfast", quantity: 2 }] });
    expect(mealsOn(state, tomorrow).breakfast.total).toBe(mealsOn(base, tomorrow).breakfast.total + 2);
    expect(mealsOn(state, today).breakfast.total).toBe(mealsOn(base, today).breakfast.total);

    // "Add 2 breakfasts today – settled" puts them into today's count.
    const added = resolveOutcome(state, message.id, late.id, "approved");
    expect(mealsOn(added, today).breakfast.total).toBe(mealsOn(base, today).breakfast.total + 2);
  });

  it("checks each meal against its own cutoff", () => {
    const order = (h: number, m: number, meal: "lunch" | "dinner") =>
      send(base, singleCustomer.phone, at(h, m), understood([req({ kind: "single_order", meals: [meal], quantity: 1, start_date: today })])).message.outcomes[0].status;
    expect(order(9, 59, "lunch")).toBe("applied");
    expect(order(10, 1, "lunch")).toBe("attention");
    expect(order(16, 59, "dinner")).toBe("applied");
    expect(order(17, 1, "dinner")).toBe("attention");
  });

  it("changes the quantity of an existing order", () => {
    const order = base.singleOrders.find((o) => o.customerId === singleCustomer.id && o.date === today)!;
    const { state, message } = send(
      base,
      singleCustomer.phone,
      at(7, 0),
      understood([req({ kind: "change_order", meals: [order.meal], quantity: 3, start_date: today })]),
    );
    expect(message.outcomes[0].status).toBe("applied");
    expect(state.singleOrders.find((o) => o.id === order.id)?.quantity).toBe(3);
  });

  it("still charges a late cancellation unless the owner waives it", () => {
    const order = base.singleOrders.find((o) => o.customerId === singleCustomer.id && o.date === today)!;
    const lateTime = order.meal === "lunch" ? at(11) : at(18);
    const { state, message } = send(base, singleCustomer.phone, lateTime, understood([req({ kind: "cancel_order", meals: [order.meal], start_date: today })]));
    expect(message.outcomes[0]).toMatchObject({ status: "attention", action: { type: "allow_late_cancel" } });
    const charged = khataFor(singleCustomer.id, base).totalCharged;
    expect(khataFor(singleCustomer.id, state).totalCharged).toBe(charged);
    const waived = resolveOutcome(state, message.id, message.outcomes[0].id, "approved");
    expect(khataFor(singleCustomer.id, waived).totalCharged).toBeLessThan(charged);
  });

  it("treats a subscriber's 'cancel lunch' as a skip", () => {
    const priya = subscriber("lunch");
    const { state } = send(base, priya.phone, at(8), understood([req({ kind: "cancel_order", meals: ["lunch"], start_date: tomorrow })]));
    expect(state.mealChanges.at(-1)).toMatchObject({ customerId: priya.id, kind: "skip", date: tomorrow });
  });

  it("saves a screenshot payment as pending, never received", () => {
    const { state, message } = send(
      base,
      singleCustomer.phone,
      at(8, 20),
      understood([req({ kind: "payment", amount: 260, payment_method: "upi", utr: "7001 2345 6789", screenshot_status: "success", paid_to: "Annapoorna Tiffins" })]),
      "data:image/jpeg;base64,AAAA",
    );
    expect(message.outcomes[0].status).toBe("applied");
    expect(state.payments.at(-1)).toMatchObject({ status: "pending", evidence: "screenshot", amount: 260 });
    expect(khataFor(singleCustomer.id, state).owed).toBe(khataFor(singleCustomer.id, base).owed);
  });

  it("flags a reused transaction ID", () => {
    const used = base.payments.find((p) => p.utr)!;
    const { message } = send(
      base,
      singleCustomer.phone,
      at(11, 15),
      understood([req({ kind: "payment", amount: 130, utr: used.utr!, screenshot_status: "success", paid_to: "Annapoorna Tiffins" })]),
      "data:image/jpeg;base64,AAAA",
    );
    expect(message.outcomes[0].status).toBe("attention");
    expect(message.outcomes[0].reason).toMatch(/already used/);
  });

  it("links a payment of the plan price to an unpaid plan", () => {
    const unpaid = summarizeAll(base).find((s) => !s.paid && s.pending === 0)!;
    const phone = base.customers.find((c) => c.id === unpaid.sub.customerId)!.phone;
    const { state } = send(base, phone, at(10, 30), understood([req({ kind: "payment", amount: PLANS[unpaid.sub.planId].price })]));
    expect(state.payments.at(-1)).toMatchObject({ purpose: "subscription", subscriptionId: unpaid.sub.id, evidence: "text" });
  });

  it("doesn't change anything for an unknown number", () => {
    const { state, message } = send(base, "9000000001", at(9, 20), understood([req({ kind: "single_order", meals: ["lunch"], quantity: 1, start_date: tomorrow })]));
    expect(message.outcomes).toHaveLength(1);
    expect(message.outcomes[0].status).toBe("attention");
    expect(state.singleOrders).toHaveLength(base.singleOrders.length);
  });

  it("holds back requests the AI wasn't sure about", () => {
    const priya = subscriber("lunch");
    const { state, message } = send(
      base,
      priya.phone,
      at(8),
      understood([req({ kind: "skip", meals: ["lunch"], start_date: tomorrow })], { unclear: [{ what: "date", reason: "says 'same as last week'" }], confidence: "low" }),
    );
    expect(message.outcomes[0]).toMatchObject({ status: "attention", action: { type: "add_facts" } });
    expect(state.mealChanges).toHaveLength(base.mealChanges.length);
  });

  it("offers a renewal starting the day after the plan ends", () => {
    const priya = subscriber("lunch");
    const plan = summarizeAll(base).find((s) => s.sub.customerId === priya.id)!;
    const { state, message } = send(base, priya.phone, at(10), understood([req({ kind: "renewal" })]));
    const action = message.outcomes[0].action;
    expect(action).toMatchObject({ type: "add_subscription", subscription: { planId: "lunch", startDate: addDays(plan.endDate, 1) } });
    const accepted = resolveOutcome(state, message.id, message.outcomes[0].id, "approved");
    expect(accepted.subscriptions).toHaveLength(base.subscriptions.length + 1);
  });

  it("tells the AI about the sender's plan", () => {
    const priya = subscriber("lunch");
    expect(senderContext(base, priya.phone, today)).toMatchObject({ name: priya.name, plan: { label: "Lunch only", meals: ["lunch"] } });
    expect(senderContext(base, "9000000001", today)).toBeNull();
  });
});
