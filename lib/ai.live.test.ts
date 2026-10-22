// Live check against the real AI. Only runs when asked, because it costs a little:
//   1. start the app (npm run dev)
//   2. PowerShell:  $env:LIVE_AI='1'; npx vitest run lib/ai.live.test.ts
import { describe, expect, it } from "vitest";
import { applyMessage, findCustomer, senderContext } from "./applyMessage";
import { demoScript } from "./demo/script";
import { TEST_DAY, demoState } from "./demo/seed";
import { istInstant } from "./rules/time";
import type { Understanding } from "./understandSchema";

const BASE_URL = process.env.APP_URL ?? "http://localhost:3000";
const state = demoState(TEST_DAY);
const singleCustomer = state.customers.find((c) => !state.subscriptions.some((s) => s.customerId === c.id))!;

const tricky = [
  { phone: singleCustomer.phone, text: "paid", at: istInstant(TEST_DAY, 12).toISOString(), shows: "payment, no amount" },
  { phone: singleCustomer.phone, text: "Transferred 500 or 600 I forgot", at: istInstant(TEST_DAY, 12).toISOString(), shows: "unclear amount" },
  { phone: singleCustomer.phone, text: "send tomorrow's same as usual", at: istInstant(TEST_DAY, 12).toISOString(), shows: "vague order" },
];

const messages = [...demoScript(TEST_DAY).filter((m) => !m.screenshot), ...tricky];

describe.skipIf(!process.env.LIVE_AI)("live AI", () => {
  it.each(messages.map((m, i) => [i, m] as const))("message %i", async (_, m) => {
    const sender = senderContext(state, m.phone, TEST_DAY);
    const started = Date.now();
    const res = await fetch(`${BASE_URL}/api/understand`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: m.text, receivedAt: m.at, sender }),
    });
    const ms = Date.now() - started;
    const data = (await res.json()) as { understanding: Understanding; error?: string };
    expect(res.ok, data.error).toBe(true);

    const next = applyMessage(state, { id: "live", phone: m.phone, receivedAt: m.at, text: m.text }, data.understanding);
    const outcomes = next.messages.at(-1)!.outcomes;
    console.log(
      [
        `${(ms / 1000).toFixed(1)}s  "${m.text}"  (${findCustomer(state, m.phone)?.name ?? "unknown"})`,
        `   expected: ${m.shows}`,
        `   AI: ${data.understanding.requests.map((r) => `${r.kind} ${r.meals.join("+")} ${r.start_date ?? ""}${r.end_date && r.end_date !== r.start_date ? `..${r.end_date}` : ""} qty=${r.quantity} amt=${r.amount}`).join(" | ") || "(none)"}  conf=${data.understanding.confidence}  unclear=${data.understanding.unclear.map((u) => u.what).join(",")}`,
        `   app: ${outcomes.map((o) => `${o.status}: ${o.summary}`).join(" | ")}`,
      ].join("\n"),
    );

    expect(ms).toBeLessThan(10_000);
    // Safety: nothing is ever marked as received, and unknown numbers never change anything.
    expect(next.payments.filter((p) => p.status === "received")).toHaveLength(state.payments.filter((p) => p.status === "received").length);
    if (!findCustomer(state, m.phone)) expect(outcomes.every((o) => o.status !== "applied")).toBe(true);
  }, 30_000);
});
