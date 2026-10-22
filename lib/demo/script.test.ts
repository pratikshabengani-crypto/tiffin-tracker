import { describe, expect, it } from "vitest";
import { findCustomer } from "../applyMessage";
import { demoScript, scriptImage } from "./script";
import { TEST_DAY, demoState } from "./seed";

describe("demo script", () => {
  const script = demoScript(TEST_DAY);
  const state = demoState(TEST_DAY);

  it("has 15 messages in time order", () => {
    expect(script).toHaveLength(15);
    expect([...script].sort((a, b) => a.at.localeCompare(b.at))).toEqual(script);
  });

  it("comes from real customers, except the one unknown number", () => {
    const unknown = script.filter((m) => !findCustomer(state, m.phone));
    expect(unknown).toHaveLength(1);
    expect(script.every((m) => /^\d{10}$/.test(m.phone))).toBe(true);
  });

  it("draws sample screenshots for the payment messages", () => {
    const images = script.map((m) => scriptImage(m)).filter(Boolean);
    expect(images).toHaveLength(3);
    expect(decodeURIComponent(images[0]!)).toContain("SAMPLE");
  });
});
