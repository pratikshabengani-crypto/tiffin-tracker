import { formatINR } from "./format";
import type { PaymentRow } from "./rules/paymentStatus";
import { formatDay } from "./rules/time";
import { PLANS } from "./types";

// Demo business name; a real owner would set their own.
export const BUSINESS_NAME = "Annapoorna Tiffins";

const shortDay = (date: string) => formatDay(date).replace(/^\w+,?\s*/, ""); // "20 Oct"

// A polite reminder the owner can send from her own WhatsApp.
export function reminderText(row: PaymentRow): string {
  const first = row.customer.name.split(" ")[0];
  const parts: string[] = [];

  const unpaid = row.khata.charges.filter((c) => c.status !== "paid");
  if (row.singleOwed > 0 && unpaid.length > 0) {
    const meals = unpaid.reduce((total, c) => total + c.order.quantity, 0);
    const from = shortDay(unpaid[0].order.date);
    const to = shortDay(unpaid.at(-1)!.order.date);
    parts.push(`${formatINR(row.singleOwed)} for ${meals} meal${meals === 1 ? "" : "s"} (${from === to ? from : `${from} to ${to}`})`);
  }
  for (const s of row.subscriptionsDue) {
    parts.push(`${formatINR(s.price - s.received)} advance for your ${PLANS[s.sub.planId].label.toLowerCase()} plan from ${shortDay(s.sub.startDate)}`);
  }

  return `Hi ${first}, gentle reminder from ${BUSINESS_NAME}: ${parts.join(" and ")} is pending. Please share the payment screenshot once done. Thank you!`;
}

export function screenshotRequestText(name: string): string {
  return `Hi ${name.split(" ")[0]}, thank you! Could you please share the payment screenshot so I can update my records?`;
}

// Opens WhatsApp with the message typed in; the owner presses send herself.
export function whatsappLink(phone: string, text: string): string {
  return `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
}
