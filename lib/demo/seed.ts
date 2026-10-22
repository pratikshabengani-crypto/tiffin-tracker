import type { AppState, Message } from "../state";
import { addDays, istInstant } from "../rules/time";
import { sampleScreenshot } from "./screenshot";
import { PLANS, type Customer, type Meal, type MealChange, type Payment, type PlanId, type SingleOrder, type Subscription } from "../types";

// The demo always opens at Thursday 22 Oct 2026, 7:30 am India time.
export const DEMO_TODAY = "2026-10-22";
export const DEMO_START = istInstant(DEMO_TODAY, 7, 30).toISOString();

const at = (date: string, hours: number, minutes = 0) => istInstant(date, hours, minutes).toISOString();

// Small seeded random generator, so the demo is identical every time.
function random(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FIRST = [
  "Aarav", "Aditi", "Akash", "Ananya", "Anil", "Anjali", "Arjun", "Asha", "Bhavya", "Chetan", "Deepak", "Divya",
  "Gaurav", "Geetha", "Harish", "Isha", "Jyothi", "Karan", "Kavya", "Kiran", "Lakshmi", "Manoj", "Meena", "Mohan",
  "Nandini", "Naveen", "Neha", "Nikhil", "Pooja", "Prakash", "Pranav", "Preethi", "Rahul", "Rajesh", "Ramya",
  "Ravi", "Rohit", "Sahana", "Sandeep", "Sanjana", "Shreya", "Shruti", "Sneha", "Srinivas", "Suresh", "Swati",
  "Tanvi", "Tejas", "Uday", "Varun", "Vidya", "Vikram", "Vinay", "Yash",
];
const LAST = ["A", "B", "D", "G", "H", "J", "K", "M", "N", "P", "R", "S", "T", "V"];

const PLAN_MIX: [PlanId, number][] = [
  ["lunch", 35],
  ["dinner", 15],
  ["lunch_dinner", 30],
  ["breakfast_dinner", 12],
  ["all_three", 18],
];

export function demoState(): AppState {
  const rand = random(2026);
  const pick = <T,>(items: T[]) => items[Math.floor(rand() * items.length)];
  const used = new Set<string>();
  let n = 0;
  const nextId = (prefix: string) => `${prefix}${++n}`;

  function newCustomer(): Customer {
    let name = "";
    do name = `${pick(FIRST)} ${pick(LAST)}`;
    while (used.has(name));
    used.add(name);
    const phone = `9${Math.floor(100000000 + rand() * 899999999)}`;
    return { id: nextId("c"), name, phone };
  }

  const customers: Customer[] = [];
  const subscriptions: Subscription[] = [];
  const mealChanges: MealChange[] = [];
  const singleOrders: SingleOrder[] = [];
  const payments: Payment[] = [];
  const messages: Message[] = [];

  const skipFor = (customerId: string, date: string, meal: Meal, requestedAt: string, messageId?: string) => {
    const change: MealChange = { id: nextId("m"), customerId, date, meal, kind: "skip", requestedAt, messageId };
    mealChanges.push(change);
    return change;
  };

  // ---- ~110 subscribers -----------------------------------------------------
  const subscribers: { customer: Customer; sub: Subscription }[] = [];
  for (const [planId, count] of PLAN_MIX) {
    for (let i = 0; i < count; i++) {
      const customer = newCustomer();
      // Started between 24 Sep and 21 Oct, so everyone is active today
      // and a few renew in the next couple of days.
      const startDate = addDays("2026-09-24", Math.floor(rand() * 28));
      const sub: Subscription = { id: nextId("s"), customerId: customer.id, planId, startDate };
      customers.push(customer);
      subscriptions.push(sub);
      subscribers.push({ customer, sub });

      // Past skips, asked the evening before.
      const meals = PLANS[planId].meals;
      const skips = Math.floor(rand() * 4);
      for (let k = 0; k < skips; k++) {
        const date = addDays(startDate, 1 + Math.floor(rand() * 20));
        if (date >= DEMO_TODAY) continue;
        const meal = pick(meals);
        skipFor(customer.id, date, meal, at(addDays(date, -1), 19, Math.floor(rand() * 59)));
      }

      // Advance paid at the start, except a few recent ones.
      const recent = startDate >= "2026-10-18";
      if (!(recent && rand() < 0.5)) {
        payments.push({
          id: nextId("p"),
          customerId: customer.id,
          purpose: "subscription",
          subscriptionId: sub.id,
          amount: PLANS[planId].price,
          method: rand() < 0.85 ? "upi" : "cash",
          evidence: "screenshot",
          status: "received",
          claimedAt: at(addDays(startDate, -1), 18),
          decidedAt: at(addDays(startDate, -1), 21),
        });
      }
    }
  }

  // ---- what's different today ----------------------------------------------
  const withMeal = (meal: Meal) =>
    subscribers.filter((s) => PLANS[s.sub.planId].meals.includes(meal));
  // 6 lunch skips and 3 dinner skips today, sent in time.
  for (const s of withMeal("lunch").slice(3, 9)) skipFor(s.customer.id, DEMO_TODAY, "lunch", at("2026-10-21", 20, 10));
  for (const s of withMeal("dinner").slice(5, 8)) skipFor(s.customer.id, DEMO_TODAY, "dinner", at(DEMO_TODAY, 6, 45));
  // 2 breakfast skips sent last night in time.
  for (const s of withMeal("breakfast").slice(0, 2)) skipFor(s.customer.id, DEMO_TODAY, "breakfast", at("2026-10-21", 21, 30));

  // A breakfast skip that came in this morning: too late, needs the owner.
  const lateSkipper = withMeal("breakfast")[4];
  const lateMsgId = nextId("msg");
  const late = skipFor(lateSkipper.customer.id, DEMO_TODAY, "breakfast", at(DEMO_TODAY, 6, 55), lateMsgId);
  messages.push({
    id: lateMsgId,
    phone: lateSkipper.customer.phone,
    senderName: lateSkipper.customer.name,
    receivedAt: late.requestedAt,
    text: "Aunty aaj breakfast nahi chahiye, sorry for late msg 🙏",
    summary: "Skip breakfast today",
    outcomes: [
      {
        id: nextId("o"),
        status: "attention",
        summary: "Skip breakfast on Thu, 22 Oct",
        reason: "Sent at 6:55 am, after the 10 pm cutoff last night. It counts as eaten unless you allow it.",
        action: { type: "allow_late_skip", mealChangeIds: [late.id] },
      },
    ],
  });

  // Two subscribers away 25 to 28 Oct (pause).
  for (const s of withMeal("lunch").slice(12, 14)) {
    for (const date of ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"]) {
      for (const meal of PLANS[s.sub.planId].meals) skipFor(s.customer.id, date, meal, at("2026-10-20", 18));
    }
  }

  // Someone not in the customer list.
  messages.push({
    id: nextId("msg"),
    phone: "9845012345",
    receivedAt: at(DEMO_TODAY, 7, 5),
    text: "Hi, do you deliver tiffin to HSR Layout? Need lunch from Monday",
    summary: "New enquiry from an unknown number",
    outcomes: [
      {
        id: nextId("o"),
        status: "attention",
        summary: "Wants lunch from Monday",
        reason: "This number isn't one of your customers yet.",
      },
    ],
  });

  // A subscription advance claimed with a screenshot, waiting for the owner.
  const renewing = subscribers.find((s) => s.sub.startDate >= "2026-10-18" && !payments.some((p) => p.subscriptionId === s.sub.id));
  if (renewing) {
    payments.push({
      id: nextId("p"),
      customerId: renewing.customer.id,
      purpose: "subscription",
      subscriptionId: renewing.sub.id,
      amount: PLANS[renewing.sub.planId].price,
      method: "upi",
      evidence: "screenshot",
      screenshot: sampleScreenshot(PLANS[renewing.sub.planId].price, "6021 4471 9935", "21 Oct 2026, 9:12 pm"),
      utr: "6021 4471 9935",
      paidTo: "Annapoorna Tiffins",
      status: "pending",
      claimedAt: at("2026-10-21", 21, 12),
    });
  }

  // ---- single-meal customers -------------------------------------------------
  const singles = Array.from({ length: 12 }, newCustomer);
  customers.push(...singles);
  const order = (customer: Customer, date: string, meal: Meal, quantity = 1) =>
    singleOrders.push({
      id: nextId("o"),
      customerId: customer.id,
      date,
      meal,
      quantity,
      status: "active",
      requestedAt: at(addDays(date, -1), 20),
    });

  singles.forEach((customer, i) => {
    // A few meals over the past week.
    const meals = 1 + (i % 4);
    for (let k = 0; k < meals; k++) {
      order(customer, addDays(DEMO_TODAY, -1 - ((i + k * 2) % 7)), k % 2 === 0 ? "lunch" : "dinner", k === 0 && i % 3 === 0 ? 2 : 1);
    }
    // Some also eat today.
    if (i % 3 !== 2) order(customer, DEMO_TODAY, i % 2 === 0 ? "lunch" : "dinner");
  });

  // How they've paid so far.
  const claim = (customer: Customer, amount: number, extra: Partial<Payment>) =>
    payments.push({
      id: nextId("p"),
      customerId: customer.id,
      purpose: "single",
      amount,
      method: "upi",
      evidence: "text",
      status: "received",
      claimedAt: at("2026-10-20", 20),
      decidedAt: at("2026-10-20", 21),
      ...extra,
    });
  claim(singles[0], 390, {}); // fully paid, including today
  claim(singles[1], 260, {});
  claim(singles[4], 390, {});
  claim(singles[2], 260, { status: "pending", evidence: "screenshot", screenshot: sampleScreenshot(260, "6021 5530 1178", "21 Oct 2026, 10:04 pm"), utr: "6021 5530 1178", paidTo: "Annapoorna Tiffins", claimedAt: at("2026-10-21", 22, 4), decidedAt: undefined });
  claim(singles[6], 130, { status: "pending", evidence: "screenshot", screenshot: sampleScreenshot(130, "6021 7712 0466", "22 Oct 2026, 7:02 am"), utr: "6021 7712 0466", paidTo: "Annapoorna Tiffins", claimedAt: at(DEMO_TODAY, 7, 2), decidedAt: undefined });
  claim(singles[3], 260, { status: "pending", evidence: "text", claimedAt: at("2026-10-21", 19, 30), decidedAt: undefined });
  claim(singles[9], 130, { status: "pending", evidence: "text", claimedAt: at(DEMO_TODAY, 6, 40), decidedAt: undefined });

  return {
    version: 2,
    demoNow: DEMO_START,
    customers,
    subscriptions,
    mealChanges,
    singleOrders,
    priceOverrides: [{ date: "2026-10-19", meal: "dinner", price: 150 }],
    payments,
    messages,
    demoCursor: 0,
  };
}
