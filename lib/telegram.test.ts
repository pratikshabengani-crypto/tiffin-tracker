import { describe, expect, it } from "vitest";
import { addCustomerFromMessage } from "./actions";
import { applyMessage, findCustomer } from "./applyMessage";
import { contactLabel, normalizePhone } from "./contact";
import { TEST_DAY, demoState } from "./demo/seed";
import { needsAttention } from "./state";
import { parseUpdates } from "./telegram";

const update = (id: number, message: object) => ({ update_id: id, message: { message_id: id, date: 1792646400, from: { id: 5551234, first_name: "Farhan", last_name: "K" }, ...message } });

describe("Telegram", () => {
  it("reads text and photo messages, skipping /start and bots", () => {
    const messages = parseUpdates([
      update(1, { text: "/start" }),
      update(2, { text: "aaj dinner nahi chahiye" }),
      update(3, { caption: "paid ✅", photo: [{ file_id: "small" }, { file_id: "large" }] }),
      update(4, { text: "hi", from: { id: 99, is_bot: true } }),
    ]);
    expect(messages).toEqual([
      { id: "tg-2", from: "tg:5551234", profileName: "Farhan K", receivedAt: new Date(1792646400 * 1000).toISOString(), text: "aaj dinner nahi chahiye", photoFileId: undefined },
      { id: "tg-3", from: "tg:5551234", profileName: "Farhan K", receivedAt: new Date(1792646400 * 1000).toISOString(), text: "paid ✅", photoFileId: "large" },
    ]);
  });

  it("keeps Telegram identities as they are, and labels them", () => {
    expect(normalizePhone("tg:5551234")).toBe("tg:5551234");
    expect(normalizePhone("+91 98450 12345")).toBe("9845012345");
    expect(contactLabel("tg:5551234")).toBe("Telegram user");
    expect(contactLabel("9845012345")).toBe("+91 9845012345");
  });

  it("recognises a Telegram user after they're added as a customer", () => {
    const base = demoState(TEST_DAY);
    const first = applyMessage(base, { id: "m1", phone: "tg:5551234", receivedAt: new Date().toISOString(), text: "hi" }, {
      requests: [{ kind: "other", meals: [], start_date: null, end_date: null, quantity: null, amount: null, payment_method: null, utr: null, screenshot_status: "no_screenshot", paid_to: null, plan: null, note: "hello" }],
      unclear: [],
      confidence: "high",
      summary: "hello",
    });
    const unknown = needsAttention(first).find((a) => a.message.id === "m1")!;
    const added = addCustomerFromMessage(first, "m1", unknown.outcome!.id, "Farhan K", "lunch_dinner", TEST_DAY);
    expect(findCustomer(added, "tg:5551234")?.name).toBe("Farhan K");
  });
});
