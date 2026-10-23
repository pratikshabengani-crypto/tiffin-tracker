import { describe, expect, it } from "vitest";
import { addCustomer, addCustomerFromMessage, addOrder, addSubscriber, cancelOrder, decidePayment, recordPayment, resolveOutcome, setNotDelivered, setPrice } from "./actions";
import { findCustomer } from "./applyMessage";
import { needsAttention } from "./state";
import { TEST_DAY, demoState } from "./demo/seed";
import { khataFor } from "./rules/khata";
import { paymentRows } from "./rules/paymentStatus";
import { addDays, istInstant } from "./rules/time";
import { mealsOn } from "./rules/counts";
import { applyMessage } from "./applyMessage";
import type { AiRequest, Understanding } from "./understandSchema";

const emptyRequest: AiRequest = {
  kind: "other",
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
  note: "",
};

const now = istInstant(TEST_DAY, 7, 30).toISOString();
const later = istInstant(TEST_DAY, 13).toISOString();

function freshCustomer() {
  return addCustomer(demoState(TEST_DAY), "Test Person", "+91 98450 11111");
}

describe("owner actions", () => {
  it("adds a customer with a clean 10-digit phone", () => {
    const { state, customer } = freshCustomer();
    expect(customer.phone).toBe("9845011111");
    expect(state.customers.at(-1)).toEqual(customer);
  });

  it("adds an order that shows up as owed right away", () => {
    const { state, customer } = freshCustomer();
    const next = addOrder(state, { customerId: customer.id, date: TEST_DAY, meal: "lunch", quantity: 2 }, now);
    expect(khataFor(customer.id, next).owed).toBe(260);
    const row = paymentRows(next, TEST_DAY).find((r) => r.customer.id === customer.id);
    expect(row?.status).toBe("unpaid");
  });

  it("cancelling by the owner is never charged, even after the cutoff", () => {
    const { state, customer } = freshCustomer();
    const withOrder = addOrder(state, { customerId: customer.id, date: TEST_DAY, meal: "lunch", quantity: 1 }, now);
    const order = withOrder.singleOrders.at(-1)!;
    expect(khataFor(customer.id, cancelOrder(withOrder, order.id, later)).owed).toBe(0);
  });

  it("not delivered removes the charge", () => {
    const { state, customer } = freshCustomer();
    const withOrder = addOrder(state, { customerId: customer.id, date: TEST_DAY, meal: "dinner", quantity: 1 }, now);
    const order = withOrder.singleOrders.at(-1)!;
    expect(khataFor(customer.id, setNotDelivered(withOrder, order.id, true)).owed).toBe(0);
  });

  it("a payment only counts once the owner marks it received", () => {
    const state = demoState(TEST_DAY);
    const pending = state.payments.find((p) => p.purpose === "single" && p.status === "pending" && p.evidence === "screenshot")!;
    const before = khataFor(pending.customerId, state).totalPaid;

    const received = decidePayment(state, pending.id, "received", now);
    expect(khataFor(pending.customerId, received).totalPaid).toBe(before + (pending.amount ?? 0));

    const rejected = decidePayment(state, pending.id, "rejected", now, "Not in my UPI app");
    expect(khataFor(pending.customerId, rejected).totalPaid).toBe(before);
    expect(rejected.payments.find((p) => p.id === pending.id)?.note).toBe("Not in my UPI app");
  });

  it("recording a cash payment clears what's owed", () => {
    const { state, customer } = freshCustomer();
    const withOrder = addOrder(state, { customerId: customer.id, date: TEST_DAY, meal: "lunch", quantity: 1 }, now);
    const paid = recordPayment(withOrder, { customerId: customer.id, purpose: "single", amount: 130, method: "cash" }, now);
    const row = paymentRows(paid, TEST_DAY).find((r) => r.customer.id === customer.id);
    expect(row).toMatchObject({ status: "paid", totalDue: 0 });
  });

  it("adds an unknown sender as a customer with a plan", () => {
    const state = demoState(TEST_DAY);
    const unknown = needsAttention(state).find((a) => !a.message.senderName)!;
    const next = addCustomerFromMessage(state, unknown.message.id, unknown.outcome!.id, "Farhan K", "lunch", TEST_DAY);
    const customer = findCustomer(next, unknown.message.phone)!;
    expect(customer.name).toBe("Farhan K");
    expect(next.subscriptions.at(-1)).toMatchObject({ customerId: customer.id, planId: "lunch", startDate: TEST_DAY });
    expect(needsAttention(next)).toHaveLength(needsAttention(state).length - 1);
    expect(next.messages.find((m) => m.id === unknown.message.id)?.senderName).toBe("Farhan K");
  });

  it("a special price applies to that day's orders", () => {
    const { state, customer } = freshCustomer();
    const priced = setPrice(state, TEST_DAY, "dinner", 150);
    const withOrder = addOrder(priced, { customerId: customer.id, date: TEST_DAY, meal: "dinner", quantity: 1 }, now);
    expect(khataFor(customer.id, withOrder).owed).toBe(150);
    expect(setPrice(priced, TEST_DAY, "dinner", 130).priceOverrides).toEqual(state.priceOverrides);
  });
});

describe("addSubscriber", () => {
  it("adds a new customer with a plan", () => {
    const state = demoState(TEST_DAY);
    const { state: next, customer, subscriptionId } = addSubscriber(state, { name: "Meera P", phone: "+91 99000 11223", planId: "lunch_dinner", startDate: TEST_DAY });
    expect(customer.phone).toBe("9900011223");
    expect(next.customers).toHaveLength(state.customers.length + 1);
    expect(next.subscriptions.find((s) => s.id === subscriptionId)).toMatchObject({ customerId: customer.id, planId: "lunch_dinner", startDate: TEST_DAY });
  });

  it("gives the plan to an existing customer with the same number", () => {
    const state = demoState(TEST_DAY);
    const existing = state.customers[0];
    const { state: next, customer } = addSubscriber(state, { name: "Someone else", phone: existing.phone, planId: "dinner", startDate: TEST_DAY });
    expect(customer.id).toBe(existing.id);
    expect(next.customers).toHaveLength(state.customers.length);
  });
});

describe("addCustomerFromMessage re-reads the message", () => {
  // A stranger on Telegram asks for 2 extra breakfasts today (late) and 1 lunch tomorrow (on time).
  function strangerOrder() {
    const understanding: Understanding = {
      requests: [
        { ...emptyRequest, kind: "single_order", meals: ["breakfast"], quantity: 2, start_date: TEST_DAY, note: "2 breakfasts today" },
        { ...emptyRequest, kind: "single_order", meals: ["lunch"], quantity: 1, start_date: addDays(TEST_DAY, 1), note: "1 lunch tomorrow" },
      ],
      unclear: [],
      confidence: "high",
      summary: "Wants 2 breakfasts today and a lunch tomorrow",
    };
    const base = demoState(TEST_DAY);
    const sent = applyMessage(base, { id: "m-stranger", phone: "tg:555", receivedAt: istInstant(TEST_DAY, 7).toISOString(), text: "2 extra breakfasts today, lunch tomorrow" }, understanding);
    const state = { ...sent, messages: sent.messages.map((m) => (m.id === "m-stranger" ? { ...m, understanding } : m)) };
    return { base, state, outcomeId: state.messages.at(-1)!.outcomes[0].id };
  }

  it("changes nothing until the stranger is added", () => {
    const { base, state } = strangerOrder();
    expect(state.singleOrders).toHaveLength(base.singleOrders.length);
  });

  it("applies their requests once added, with the cutoffs of when they wrote", () => {
    const { base, state, outcomeId } = strangerOrder();
    const added = addCustomerFromMessage(state, "m-stranger", outcomeId, "Pratiksha B", null, TEST_DAY);
    const message = added.messages.find((m) => m.id === "m-stranger")!;
    expect(message.senderName).toBe("Pratiksha B");
    expect(message.outcomes.map((o) => o.status)).toEqual(["attention", "applied"]);
    expect(mealsOn(added, addDays(TEST_DAY, 1)).lunch.total).toBe(mealsOn(base, addDays(TEST_DAY, 1)).lunch.total + 1);

    // "Add 2 breakfasts today – settled" then puts them into today's count.
    const done = resolveOutcome(added, "m-stranger", message.outcomes[0].id, "approved");
    expect(mealsOn(done, TEST_DAY).breakfast.total).toBe(mealsOn(base, TEST_DAY).breakfast.total + 2);
  });
});
