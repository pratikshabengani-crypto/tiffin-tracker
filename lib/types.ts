// The facts the app stores. Everything shown on screen is calculated from these.

export const MEALS = ["breakfast", "lunch", "dinner"] as const;
export type Meal = (typeof MEALS)[number];

export type PlanId = "lunch" | "dinner" | "lunch_dinner" | "breakfast_dinner" | "all_three";

export const PLANS: Record<PlanId, { label: string; meals: Meal[]; price: number }> = {
  lunch: { label: "Lunch only", meals: ["lunch"], price: 3300 },
  dinner: { label: "Dinner only", meals: ["dinner"], price: 3300 },
  lunch_dinner: { label: "Lunch and dinner", meals: ["lunch", "dinner"], price: 6600 },
  breakfast_dinner: { label: "Breakfast and dinner", meals: ["breakfast", "dinner"], price: 6600 },
  all_three: { label: "All three meals", meals: ["breakfast", "lunch", "dinner"], price: 8000 },
};

export const STANDARD_PRICES: Record<Meal, number> = { breakfast: 100, lunch: 130, dinner: 130 };
export const CYCLE_DAYS = 30;
export const CARRY_FORWARD_LIMIT = 5; // per meal type

export type Customer = {
  id: string;
  name: string;
  phone: string; // 10 digits
};

export type Subscription = {
  id: string;
  customerId: string;
  planId: PlanId;
  startDate: string; // YYYY-MM-DD
};

// A skip, or undoing a skip, for one meal on one day.
export type MealChange = {
  id: string;
  customerId: string;
  date: string;
  meal: Meal;
  kind: "skip" | "unskip";
  requestedAt: string; // ISO time the customer asked
  allowedLate?: boolean; // owner tapped "Allow anyway"
  messageId?: string;
};

export type SingleOrder = {
  id: string;
  customerId: string;
  date: string;
  meal: Meal;
  quantity: number;
  status: "active" | "cancelled";
  requestedAt: string;
  cancelledAt?: string;
  cancelAllowedLate?: boolean; // owner waived a late cancellation
  notDelivered?: boolean;
  messageId?: string;
};

export type PriceOverride = { date: string; meal: Meal; price: number };

export type PaymentMethod = "upi" | "cash" | "bank_transfer" | "other";

export type Payment = {
  id: string;
  customerId: string;
  purpose: "subscription" | "single";
  subscriptionId?: string;
  amount: number | null;
  method: PaymentMethod | null;
  evidence: "screenshot" | "text" | "manual";
  screenshot?: string; // small image (data URL) or a /demo path
  utr?: string | null; // UPI transaction ID read from the screenshot
  paidTo?: string | null;
  status: "pending" | "received" | "rejected";
  note?: string;
  claimedAt: string;
  decidedAt?: string;
  messageId?: string;
};

// All the business facts the rules calculate from.
export type Facts = {
  customers: Customer[];
  subscriptions: Subscription[];
  mealChanges: MealChange[];
  singleOrders: SingleOrder[];
  priceOverrides: PriceOverride[];
  payments: Payment[];
};
