import { describe, expect, it } from "vitest";
import { applyMessage } from "./applyMessage";
import { choicesFor, dayWord } from "./choices";
import { TEST_DAY, demoState } from "./demo/seed";
import { addDays, istInstant } from "./rules/time";
import type { Understanding } from "./understandSchema";

const base = demoState(TEST_DAY);
const at = (hours: number, minutes = 0, date = TEST_DAY) => istInstant(date, hours, minutes).toISOString();
const singleCustomer = base.customers.find((c) => !base.subscriptions.some((s) => s.customerId === c.id))!;

// A late order for "2 extra breakfasts today", sent at 7 am.
function lateBreakfastOrder() {
  const understanding: Understanding = {
    requests: [
      {
        kind: "single_order",
        meals: ["breakfast"],
        start_date: TEST_DAY,
        end_date: null,
        quantity: 2,
        amount: null,
        payment_method: null,
        utr: null,
        screenshot_status: "no_screenshot",
        paid_to: null,
        plan: null,
        note: "2 extra breakfasts today",
      },
    ],
    unclear: [],
    confidence: "high",
    summary: "Wants 2 extra breakfasts today",
  };
  const state = applyMessage(base, { id: "m-late", phone: singleCustomer.phone, receivedAt: at(7), text: "need 2 extra breakfasts today" }, understanding);
  const message = state.messages.at(-1)!;
  return { state, message, outcome: message.outcomes[0] };
}

describe("dayWord", () => {
  it("names the day relative to now", () => {
    expect(dayWord(TEST_DAY, at(9))).toBe("today");
    expect(dayWord(addDays(TEST_DAY, 1), at(9))).toBe("tomorrow");
    expect(dayWord(TEST_DAY, at(9, 0, addDays(TEST_DAY, 1)))).toBe("yesterday");
  });
});

describe("choicesFor", () => {
  it("says which meals and which day an order adds", () => {
    const { state, message, outcome } = lateBreakfastOrder();
    const labels = choicesFor(state, message, outcome, at(7, 30)).map((c) => c.label);
    expect(labels).toEqual(["Add 2 breakfasts today – settled", "Don't add – settled"]);
  });

  it("warns when the meal has already been served", () => {
    const { state, message, outcome } = lateBreakfastOrder();
    expect(choicesFor(state, message, outcome, at(11))[0].label).toBe("Add 2 breakfasts today (already served) – settled");
  });

  it("keeps the real date when she decides on a later day", () => {
    const { state, message, outcome } = lateBreakfastOrder();
    expect(choicesFor(state, message, outcome, at(8, 0, addDays(TEST_DAY, 1)))[0].label).toBe("Add 2 breakfasts yesterday (already served) – settled");
  });

  it("offers just Settled for a message with nothing to change", () => {
    const { state, message } = lateBreakfastOrder();
    expect(choicesFor(state, message, undefined, at(9)).map((c) => c.label)).toEqual(["Settled"]);
  });
});
