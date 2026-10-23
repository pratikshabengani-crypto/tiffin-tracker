import type { Facts, MealChange, SingleOrder, Subscription } from "./types";

// Something the owner can approve from "Needs attention".
export type PendingAction =
  | { type: "allow_late_skip"; mealChangeIds: string[] }
  | { type: "allow_late_cancel"; orderIds: string[] }
  | { type: "add_facts"; mealChanges?: MealChange[]; singleOrders?: SingleOrder[] }
  | { type: "update_order"; orderId: string; quantity: number }
  | { type: "add_subscription"; subscription: Subscription };

// What happened to one request inside a message.
export type Outcome = {
  id: string;
  status: "applied" | "attention" | "ignored";
  summary: string; // "Skip lunch on Fri, 24 Oct"
  reason?: string; // why it needs the owner
  action?: PendingAction;
  resolution?: Resolution;
};

// approved = do the suggested change; dismissed = don't; settled = the owner sorted it out herself.
export type Resolution = "approved" | "dismissed" | "settled";

export type Message = {
  id: string;
  phone: string;
  senderName?: string;
  receivedAt: string;
  text: string;
  image?: string;
  summary?: string; // what the AI understood
  aiMs?: number; // how long the AI took to read it
  source?: "whatsapp" | "telegram"; // came in through a real messaging connection
  profileName?: string; // sender's WhatsApp display name
  outcomes: Outcome[];
  settled?: boolean; // set when the owner marks the whole message settled / not settled
};

export type AppState = Facts & {
  version: 3;
  seededFor: string; // the day the sample data was built around (YYYY-MM-DD)
  messages: Message[];
  demoCursor: number; // next simulated WhatsApp message
  waCursor?: number; // how many real WhatsApp messages have been picked up
  tgOffset?: number; // next Telegram update to ask for
};

// Everything runs on the real current time.
export function nowOf(): string {
  return new Date().toISOString();
}

// A message is settled once nothing in it is waiting for the owner, unless she says otherwise.
export function isSettled(message: Message): boolean {
  return message.settled ?? !message.outcomes.some((o) => o.status === "attention" && !o.resolution);
}

// Everything waiting for the owner: each open request, plus messages she marked "not settled".
export function needsAttention(state: AppState): { message: Message; outcome?: Outcome }[] {
  return state.messages.flatMap((message) => {
    const open = message.outcomes.filter((outcome) => outcome.status === "attention" && !outcome.resolution);
    if (open.length > 0) return open.map((outcome) => ({ message, outcome }));
    return message.settled === false ? [{ message }] : [];
  });
}
