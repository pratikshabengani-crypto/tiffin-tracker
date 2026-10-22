import { describe, expect, it } from "vitest";
import { addCustomer, addOrder, cancelOrder, decidePayment, recordPayment, setNotDelivered, setPrice } from "./actions";
import { DEMO_START, DEMO_TODAY, demoState } from "./demo/seed";
import { khataFor } from "./rules/khata";
import { paymentRows } from "./rules/paymentStatus";
import { istInstant } from "./rules/time";

const now = DEMO_START;
const later = istInstant(DEMO_TODAY, 13).toISOString();

function freshCustomer() {
  return addCustomer(demoState(), "Test Person", "+91 98450 11111");
}

describe("owner actions", () => {
  it("adds a customer with a clean 10-digit phone", () => {
    const { state, customer } = freshCustomer();
    expect(customer.phone).toBe("9845011111");
    expect(state.customers.at(-1)).toEqual(customer);
  });

  it("adds an order that shows up as owed right away", () => {
    const { state, customer } = freshCustomer();
    const next = addOrder(state, { customerId: customer.id, date: DEMO_TODAY, meal: "lunch", quantity: 2 }, now);
    expect(khataFor(customer.id, next).owed).toBe(260);
    const row = paymentRows(next, DEMO_TODAY).find((r) => r.customer.id === customer.id);
    expect(row?.status).toBe("unpaid");
  });

  it("cancelling by the owner is never charged, even after the cutoff", () => {
    const { state, customer } = freshCustomer();
    const withOrder = addOrder(state, { customerId: customer.id, date: DEMO_TODAY, meal: "lunch", quantity: 1 }, now);
    const order = withOrder.singleOrders.at(-1)!;
    expect(khataFor(customer.id, cancelOrder(withOrder, order.id, later)).owed).toBe(0);
  });

  it("not delivered removes the charge", () => {
    const { state, customer } = freshCustomer();
    const withOrder = addOrder(state, { customerId: customer.id, date: DEMO_TODAY, meal: "dinner", quantity: 1 }, now);
    const order = withOrder.singleOrders.at(-1)!;
    expect(khataFor(customer.id, setNotDelivered(withOrder, order.id, true)).owed).toBe(0);
  });

  it("a payment only counts once the owner marks it received", () => {
    const state = demoState();
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
    const withOrder = addOrder(state, { customerId: customer.id, date: DEMO_TODAY, meal: "lunch", quantity: 1 }, now);
    const paid = recordPayment(withOrder, { customerId: customer.id, purpose: "single", amount: 130, method: "cash" }, now);
    const row = paymentRows(paid, DEMO_TODAY).find((r) => r.customer.id === customer.id);
    expect(row).toMatchObject({ status: "paid", totalDue: 0 });
  });

  it("a special price applies to that day's orders", () => {
    const { state, customer } = freshCustomer();
    const priced = setPrice(state, DEMO_TODAY, "dinner", 150);
    const withOrder = addOrder(priced, { customerId: customer.id, date: DEMO_TODAY, meal: "dinner", quantity: 1 }, now);
    expect(khataFor(customer.id, withOrder).owed).toBe(150);
    expect(setPrice(priced, DEMO_TODAY, "dinner", 130).priceOverrides).toEqual(state.priceOverrides);
  });
});
