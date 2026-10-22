import { MEALS, type Facts, type Payment, type SingleOrder } from "../types";
import { isCharged, orderAmount } from "./orders";
import { sum } from "./subscriptions";

export type Charge = {
  order: SingleOrder;
  amount: number;
  paid: number;
  status: "paid" | "part" | "unpaid";
};

export type Khata = {
  charges: Charge[]; // oldest first
  payments: Payment[]; // received single-meal payments, oldest first
  totalCharged: number;
  totalPaid: number;
  owed: number;
  credit: number; // paid more than charged
  oldestUnpaid: string | null; // date of the oldest meal not fully paid
};

// A customer's single-meal account. Confirmed payments clear the oldest meals first.
export function khataFor(customerId: string, facts: Facts): Khata {
  const charges: Charge[] = facts.singleOrders
    .filter((o) => o.customerId === customerId && isCharged(o))
    .sort((a, b) => a.date.localeCompare(b.date) || MEALS.indexOf(a.meal) - MEALS.indexOf(b.meal))
    .map((order) => ({ order, amount: orderAmount(order, facts.priceOverrides), paid: 0, status: "unpaid" }));

  const payments = facts.payments
    .filter((p) => p.customerId === customerId && p.purpose === "single" && p.status === "received")
    .sort((a, b) => (a.decidedAt ?? a.claimedAt).localeCompare(b.decidedAt ?? b.claimedAt));

  const totalPaid = sum(payments.map((p) => p.amount ?? 0));
  let left = totalPaid;
  for (const charge of charges) {
    charge.paid = Math.min(charge.amount, left);
    left -= charge.paid;
    charge.status = charge.paid >= charge.amount ? "paid" : charge.paid > 0 ? "part" : "unpaid";
  }

  const totalCharged = sum(charges.map((c) => c.amount));
  return {
    charges,
    payments,
    totalCharged,
    totalPaid,
    owed: Math.max(0, totalCharged - totalPaid),
    credit: Math.max(0, totalPaid - totalCharged),
    oldestUnpaid: charges.find((c) => c.status !== "paid")?.order.date ?? null,
  };
}
