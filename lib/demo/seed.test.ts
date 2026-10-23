import { describe, expect, it } from "vitest";
import { resolveOutcome } from "../actions";
import { changesOn, mealsOn } from "../rules/counts";
import { paymentRows } from "../rules/paymentStatus";
import { needsAttention } from "../state";
import { TEST_DAY, demoState } from "./seed";

describe("demo data", () => {
  const state = demoState(TEST_DAY);

  it("is the same every time", () => {
    expect(JSON.stringify(demoState(TEST_DAY))).toBe(JSON.stringify(state));
  });

  it("has about 110 subscribers and 12 single-meal customers", () => {
    expect(state.subscriptions).toHaveLength(110);
    expect(state.customers).toHaveLength(122);
  });

  it("gives a believable morning", () => {
    const counts = mealsOn(state, TEST_DAY);
    const rows = paymentRows(state, TEST_DAY);
    const summary = {
      breakfast: counts.breakfast.total,
      lunch: counts.lunch.total,
      dinner: counts.dinner.total,
      changes: changesOn(state, TEST_DAY).length,
      attention: needsAttention(state).length,
      payments: Object.fromEntries(
        ["screenshot", "claimed", "unpaid", "paid"].map((s) => [s, rows.filter((r) => r.status === s).length]),
      ),
    };
    console.log(summary);
    expect(counts.lunch.total).toBeGreaterThan(50);
    expect(summary.attention).toBe(2);
    expect(summary.payments.screenshot).toBeGreaterThan(0);
    expect(summary.payments.unpaid).toBeGreaterThan(0);
  });

  it("allowing the late breakfast skip lowers today's breakfast count", () => {
    const before = mealsOn(state, TEST_DAY).breakfast.total;
    const late = needsAttention(state).find((a) => a.outcome?.action?.type === "allow_late_skip")!;
    const after = resolveOutcome(state, late.message.id, late.outcome!.id, "approved");
    expect(mealsOn(after, TEST_DAY).breakfast.total).toBe(before - 1);
    expect(needsAttention(after)).toHaveLength(1);
  });
});
