import { summarizeAll } from "../rules/counts";
import { addDays, istDate, istInstant } from "../rules/time";
import type { PlanId } from "../types";
import { receiptTime, sampleScreenshot } from "./screenshot";
import { demoState } from "./seed";

export type ScriptMessage = {
  at: string; // a typical time for it (messages are sent at the real current time)
  phone: string;
  text: string;
  screenshot?: { amount: number; utr: string };
  shows: string; // what this message demonstrates (shown in the Inbox)
};

const cache = new Map<string, ScriptMessage[]>();

// Simulated WhatsApp messages from the sample customers. Customers are picked
// from the sample data by what they are (a lunch subscriber, someone who owes...).
export function demoScript(today: string = istDate(new Date())): ScriptMessage[] {
  const cached = cache.get(today);
  if (cached) return cached;

  const at = (hours: number, minutes = 0) => istInstant(today, hours, minutes).toISOString();
  const state = demoState(today);
  const summaries = summarizeAll(state);
  const phoneOf = (customerId: string) => state.customers.find((c) => c.id === customerId)!.phone;
  const free = (s: (typeof summaries)[number]) =>
    s.paid && s.tracks.every((t) => [0, 1, 2, 3, 4].every((d) => t.days[addDays(today, d)] === "eating"));
  const used = new Set<string>();
  const subscriber = (planId: PlanId) => {
    const s = summaries.find((x) => x.sub.planId === planId && free(x) && !used.has(x.sub.customerId))!;
    used.add(s.sub.customerId);
    return phoneOf(s.sub.customerId);
  };

  const singles = state.customers.filter((c) => !state.subscriptions.some((s) => s.customerId === c.id));
  const singleWithDinnerToday = singles.find((c) => state.singleOrders.some((o) => o.customerId === c.id && o.date === today && o.meal === "dinner"))!;
  const singleOwing = singles.filter((c) => !state.payments.some((p) => p.customerId === c.id) && c.id !== singleWithDinnerToday.id);
  const unpaidPlan = summaries.find((s) => !s.paid && s.pending === 0)!;
  const dinnerSkippedToday = summaries.find((s) => s.tracks.some((t) => t.meal === "dinner" && t.days[today] === "skipped"))!;
  const owed = (customerId: string) =>
    state.singleOrders.filter((o) => o.customerId === customerId && o.date < today).reduce((total, o) => total + o.quantity * 130, 0);

  const lunch1 = subscriber("lunch");
  const lunch2 = subscriber("lunch");
  const lunch3 = subscriber("lunch");
  const lunchDinner = subscriber("lunch_dinner");
  const allThree = subscriber("all_three");
  const dinnerOnly = subscriber("dinner");

  const script: ScriptMessage[] = [
    { at: at(7, 40), phone: lunch1, text: "Good morning aunty 🙏 aaj lunch nahi chahiye, office party hai", shows: "Lunch skip today: applied before 10 am, paused for you after" },
    { at: at(7, 52), phone: lunchDinner, text: "Going to Mysore this weekend, no food from Saturday to Monday please", shows: "A pause: those days turn red on the calendar, end date moves" },
    { at: at(8, 5), phone: singleOwing[0].phone, text: "Aunty kal 2 lunch bhej dena", shows: "Single order for tomorrow, owed straight away" },
    {
      at: at(8, 20),
      phone: singleOwing[1].phone,
      text: "Paid for last week ✅",
      screenshot: { amount: owed(singleOwing[1].id), utr: "6021 9043 2207" },
      shows: "Payment screenshot: waits for your ✓ on the Payments screen",
    },
    { at: at(8, 31), phone: allThree, text: "tomorrow breakfast skip please", shows: "Breakfast skip for tomorrow: on time until 10 pm tonight" },
    { at: at(8, 45), phone: singleOwing[2].phone, text: "gpay kar diya 260", shows: "Says paid with no screenshot: 🟡 on the Payments screen" },
    { at: at(9, 10), phone: singleOwing[3].phone, text: "Aunty same as yesterday please", shows: "Vague message: goes to Needs attention instead of guessing" },
    { at: at(9, 20), phone: "9845077788", text: "Hi, got your number from my friend. What is the monthly price for lunch and dinner?", shows: "Unknown number: flagged for you" },
    { at: at(9, 35), phone: singleWithDinnerToday.phone, text: "Aunty aaj dinner 2 kar dena please, guest aa rahe hain", shows: "Change tonight's dinner from 1 to 2: applied before 5 pm, paused after" },
    { at: at(9, 58), phone: lunch2, text: "Sorry aunty aaj lunch cancel karna hai", shows: "Lunch cancel today: applied before 10 am, paused for you after" },
    { at: at(10, 12), phone: lunch3, text: "aaj lunch mat bhejna", shows: "Another lunch skip: shows how the cutoff decides" },
    {
      at: at(10, 40),
      phone: phoneOf(unpaidPlan.sub.customerId),
      text: "Sorry for the delay, this month's advance 🙏",
      screenshot: { amount: unpaidPlan.price, utr: "6021 9150 7764" },
      shows: "Plan advance paid by screenshot: tagged as plan payment",
    },
    {
      at: at(11, 15),
      phone: singleOwing[4].phone,
      text: "Payment done",
      screenshot: { amount: 260, utr: "6021 9043 2207" },
      shows: "Same transaction ID as an earlier screenshot: flagged as a possible fake",
    },
    { at: at(15, 40), phone: phoneOf(dinnerSkippedToday.sub.customerId), text: "Plans cancelled, please send dinner today after all", shows: "Undo tonight's dinner skip: applied before 5 pm, paused after" },
    { at: at(17, 20), phone: dinnerOnly, text: "no dinner tonight", shows: "Dinner skip tonight: applied before 5 pm, paused for you after" },
  ];
  cache.set(today, script);
  return script;
}

// The sample receipt for a message, stamped with when it's actually sent.
export function scriptImage(message: ScriptMessage, sentAt: string = message.at): string | undefined {
  if (!message.screenshot) return undefined;
  return sampleScreenshot(message.screenshot.amount, message.screenshot.utr, receiptTime(sentAt));
}
