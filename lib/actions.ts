import { normalizePhone } from "./contact";
import type { AppState, Resolution } from "./state";
import { STANDARD_PRICES, type Customer, type Meal, type Payment, type PaymentMethod, type PlanId } from "./types";

function newId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

// ---- customers and single orders ----------------------------------------------

export function addCustomer(state: AppState, name: string, phone: string): { state: AppState; customer: Customer } {
  const customer: Customer = { id: newId("c"), name: name.trim(), phone: normalizePhone(phone) };
  return { state: { ...state, customers: [...state.customers, customer] }, customer };
}

// Add a monthly subscriber by hand. Someone already saved with this phone number gets the plan.
export function addSubscriber(
  state: AppState,
  input: { name: string; phone: string; planId: PlanId; startDate: string },
): { state: AppState; customer: Customer; subscriptionId: string } {
  const phone = normalizePhone(input.phone);
  let next = state;
  let customer = state.customers.find((c) => c.phone === phone);
  if (!customer) {
    const added = addCustomer(state, input.name, phone);
    next = added.state;
    customer = added.customer;
  }
  const subscription = { id: newId("s"), customerId: customer.id, planId: input.planId, startDate: input.startDate };
  return { state: { ...next, subscriptions: [...next.subscriptions, subscription] }, customer, subscriptionId: subscription.id };
}

// "Add as customer" for a message from an unknown number, optionally with a monthly plan.
export function addCustomerFromMessage(
  state: AppState,
  messageId: string,
  outcomeId: string,
  name: string,
  planId: PlanId | null,
  startDate: string,
): AppState {
  const message = state.messages.find((m) => m.id === messageId);
  if (!message || !name.trim()) return state;
  const added = addCustomer(state, name, message.phone);
  let next = added.state;
  if (planId) {
    next = { ...next, subscriptions: [...next.subscriptions, { id: newId("s"), customerId: added.customer.id, planId, startDate }] };
  }
  next = resolveOutcome(next, messageId, outcomeId, "dismissed");
  return { ...next, messages: next.messages.map((m) => (m.id === messageId ? { ...m, senderName: added.customer.name, settled: undefined } : m)) };
}

export function addOrder(
  state: AppState,
  order: { customerId: string; date: string; meal: Meal; quantity: number },
  now: string,
): AppState {
  return {
    ...state,
    singleOrders: [...state.singleOrders, { id: newId("o"), ...order, status: "active", requestedAt: now }],
  };
}

// The owner cancelling is her decision, so it's never charged as "late".
export function cancelOrder(state: AppState, orderId: string, now: string): AppState {
  return {
    ...state,
    singleOrders: state.singleOrders.map((o) =>
      o.id === orderId ? { ...o, status: "cancelled", cancelledAt: now, cancelAllowedLate: true } : o,
    ),
  };
}

export function setNotDelivered(state: AppState, orderId: string, notDelivered: boolean): AppState {
  return {
    ...state,
    singleOrders: state.singleOrders.map((o) => (o.id === orderId ? { ...o, notDelivered } : o)),
  };
}

// ---- payments ---------------------------------------------------------------

// The owner checked her UPI app / bank: the money arrived, or it didn't.
export function decidePayment(
  state: AppState,
  paymentId: string,
  decision: "received" | "rejected",
  now: string,
  note?: string,
): AppState {
  return {
    ...state,
    payments: state.payments.map((p) =>
      p.id === paymentId ? { ...p, status: decision, decidedAt: now, note: note?.trim() || p.note } : p,
    ),
  };
}

// Cash or a payment nobody messaged about. Recorded by the owner, so it's already confirmed.
export function recordPayment(
  state: AppState,
  payment: { customerId: string; purpose: Payment["purpose"]; subscriptionId?: string; amount: number; method: PaymentMethod },
  now: string,
): AppState {
  const recorded: Payment = {
    id: newId("p"),
    ...payment,
    evidence: "manual",
    status: "received",
    claimedAt: now,
    decidedAt: now,
  };
  return { ...state, payments: [...state.payments, recorded] };
}

// Every change the owner makes is a small pure function: old state in, new state out.

export function setPrice(state: AppState, date: string, meal: Meal, price: number): AppState {
  const others = state.priceOverrides.filter((o) => !(o.date === date && o.meal === meal));
  const priceOverrides = price === STANDARD_PRICES[meal] ? others : [...others, { date, meal, price }];
  return { ...state, priceOverrides };
}

// Close one "Needs attention" item. Only "approved" applies the suggested change.
export function resolveOutcome(state: AppState, messageId: string, outcomeId: string, resolution: Resolution): AppState {
  const message = state.messages.find((m) => m.id === messageId);
  const outcome = message?.outcomes.find((o) => o.id === outcomeId);
  if (!message || !outcome) return state;

  let next = state;
  const action = outcome.action;
  if (resolution === "approved" && action) {
    if (action.type === "allow_late_skip") {
      next = {
        ...next,
        mealChanges: next.mealChanges.map((c) => (action.mealChangeIds.includes(c.id) ? { ...c, allowedLate: true } : c)),
      };
    } else if (action.type === "allow_late_cancel") {
      next = {
        ...next,
        singleOrders: next.singleOrders.map((o) => (action.orderIds.includes(o.id) ? { ...o, cancelAllowedLate: true } : o)),
      };
    } else if (action.type === "update_order") {
      next = {
        ...next,
        singleOrders: next.singleOrders.map((o) => (o.id === action.orderId ? { ...o, quantity: action.quantity } : o)),
      };
    } else if (action.type === "add_subscription") {
      next = { ...next, subscriptions: [...next.subscriptions, action.subscription] };
    } else {
      next = {
        ...next,
        mealChanges: [...next.mealChanges, ...(action.mealChanges ?? [])],
        singleOrders: [...next.singleOrders, ...(action.singleOrders ?? [])],
      };
    }
  }

  return {
    ...next,
    messages: next.messages.map((m) =>
      m.id !== messageId
        ? m
        : { ...m, settled: undefined, outcomes: m.outcomes.map((o) => (o.id === outcomeId ? { ...o, resolution } : o)) },
    ),
  };
}

// Mark a whole message settled (closes anything still open, without changing orders) or not settled.
export function setSettled(state: AppState, messageId: string, settled: boolean): AppState {
  return {
    ...state,
    messages: state.messages.map((m) => {
      if (m.id !== messageId) return m;
      if (!settled) return { ...m, settled: false };
      const outcomes = m.outcomes.map((o) =>
        o.status === "attention" && !o.resolution ? { ...o, resolution: "settled" as const } : o,
      );
      return { ...m, settled: undefined, outcomes };
    }),
  };
}
