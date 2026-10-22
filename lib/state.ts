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
  resolution?: "approved" | "dismissed";
};

export type Message = {
  id: string;
  phone: string;
  senderName?: string;
  receivedAt: string;
  text: string;
  image?: string;
  summary?: string; // what the AI understood
  aiMs?: number; // how long the AI took to read it
  outcomes: Outcome[];
};

export type AppState = Facts & {
  version: 2;
  demoNow: string | null; // demo clock; null = real time
  messages: Message[];
  demoCursor: number; // next scripted demo message
};

export function nowOf(state: AppState): string {
  return state.demoNow ?? new Date().toISOString();
}

export function needsAttention(state: AppState): { message: Message; outcome: Outcome }[] {
  return state.messages.flatMap((message) =>
    message.outcomes
      .filter((outcome) => outcome.status === "attention" && !outcome.resolution)
      .map((outcome) => ({ message, outcome })),
  );
}
