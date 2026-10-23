import { BUSINESS_NAME } from "../reminders";
import type { Customer, Facts, Payment } from "../types";
import { summarizeAll } from "./counts";
import { khataFor, type Khata } from "./khata";
import { sum, type SubscriptionSummary } from "./subscriptions";
import { daysBetween } from "./time";

// screenshot: sent a screenshot, waiting for the owner's check   🔵
// claimed: said they paid, no screenshot                          🟡
// unpaid: owes money and sent nothing                             🔴
// paid: nothing owed                                              🟢
export type PayStatus = "screenshot" | "claimed" | "unpaid" | "paid";

export type PaymentRow = {
  customer: Customer;
  status: PayStatus;
  singleOwed: number;
  subscriptionsDue: SubscriptionSummary[]; // started or starting, not fully paid
  totalDue: number;
  pending: Payment[]; // claims waiting for the owner, oldest first
  oldestUnpaid: string | null;
  daysUnpaid: number;
  khata: Khata;
};

const STATUS_ORDER: PayStatus[] = ["screenshot", "claimed", "unpaid", "paid"];

export function paymentRows(
  facts: Facts,
  today: string,
  summaries: SubscriptionSummary[] = summarizeAll(facts),
): PaymentRow[] {
  const rows: PaymentRow[] = [];

  for (const customer of facts.customers) {
    const khata = khataFor(customer.id, facts);
    const subscriptionsDue = summaries.filter(
      (s) => s.sub.customerId === customer.id && !s.paid && s.endDate >= today,
    );
    const pending = facts.payments
      .filter((p) => p.customerId === customer.id && p.status === "pending")
      .sort((a, b) => a.claimedAt.localeCompare(b.claimedAt));
    const hasHistory =
      khata.charges.length > 0 || facts.payments.some((p) => p.customerId === customer.id);
    if (!hasHistory && subscriptionsDue.length === 0) continue;

    const subDue = sum(subscriptionsDue.map((s) => s.price - s.received));
    const totalDue = khata.owed + subDue;
    // Owed from the moment the meal is ordered / the plan starts.
    const oldestUnpaid =
      [khata.oldestUnpaid, ...subscriptionsDue.map((s) => s.sub.startDate)]
        .filter((d): d is string => d !== null)
        .sort()[0] ?? null;

    let status: PayStatus = "paid";
    if (pending.some((p) => p.evidence === "screenshot")) status = "screenshot";
    else if (pending.length > 0) status = "claimed";
    else if (totalDue > 0) status = "unpaid";

    rows.push({
      customer,
      status,
      singleOwed: khata.owed,
      subscriptionsDue,
      totalDue,
      pending,
      oldestUnpaid,
      daysUnpaid: oldestUnpaid ? Math.max(0, daysBetween(oldestUnpaid, today)) : 0,
      khata,
    });
  }

  return rows.sort(
    (a, b) =>
      STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) ||
      b.daysUnpaid - a.daysUnpaid ||
      a.customer.name.localeCompare(b.customer.name),
  );
}

// Another (not rejected) payment already used this UPI transaction ID.
export function isDuplicateUtr(payment: Payment, payments: Payment[]): boolean {
  const utr = normalizeUtr(payment.utr);
  if (!utr) return false;
  return payments.some((p) => p.id !== payment.id && p.status !== "rejected" && normalizeUtr(p.utr) === utr);
}

// The screenshot names someone other than the business as who was paid.
export function isWrongRecipient(paidTo: string | null | undefined): boolean {
  return !!paidTo && !paidTo.toLowerCase().includes(BUSINESS_NAME.split(" ")[0].toLowerCase());
}

function normalizeUtr(utr: string | null | undefined): string {
  return (utr ?? "").replace(/\s+/g, "");
}
