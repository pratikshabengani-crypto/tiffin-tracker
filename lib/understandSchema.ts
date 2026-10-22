import { z } from "zod";

// The form the AI fills in for every WhatsApp message.
// Anything the message doesn't say must come back as null, never a guess.
export const RequestSchema = z.object({
  kind: z.enum([
    "skip", // skip or pause meals (one day or a date range)
    "resume", // undo a skip / come back early
    "single_order", // order meals outside a plan, or extra meals
    "change_order", // change the quantity of an existing single order
    "cancel_order", // cancel a single order
    "payment", // says they paid, or sent a payment screenshot
    "new_subscription", // wants to start a monthly plan
    "renewal", // wants to continue their plan
    "other", // questions, greetings, complaints
  ]),
  meals: z.array(z.enum(["breakfast", "lunch", "dinner"])),
  start_date: z.string().nullable(), // YYYY-MM-DD
  end_date: z.string().nullable(), // YYYY-MM-DD, same as start for one day
  quantity: z.number().nullable(),
  amount: z.number().nullable(), // rupees
  payment_method: z.enum(["upi", "cash", "bank_transfer", "other"]).nullable(),
  utr: z.string().nullable(), // UPI transaction ID read from a screenshot
  screenshot_status: z.enum(["success", "pending", "failed", "no_screenshot"]),
  paid_to: z.string().nullable(),
  plan: z.enum(["lunch", "dinner", "lunch_dinner", "breakfast_dinner", "all_three"]).nullable(),
  note: z.string(), // one short plain-English line about this request
});

export const UnderstandingSchema = z.object({
  requests: z.array(RequestSchema),
  unclear: z.array(z.object({ what: z.string(), reason: z.string() })),
  confidence: z.enum(["high", "medium", "low"]),
  summary: z.string(),
});

export type AiRequest = z.infer<typeof RequestSchema>;
export type Understanding = z.infer<typeof UnderstandingSchema>;

// What the server tells the AI about the sender.
export type SenderContext = {
  name: string;
  plan: { label: string; meals: string[]; endDate: string } | null;
  upcomingOrders: { date: string; meal: string; quantity: number }[];
  amountDue: number;
} | null;
