import { describe, expect, it } from "vitest";
import type { Facts, Meal, MealChange, Payment, PlanId, SingleOrder } from "../types";
import { changesOn, mealsOn } from "./counts";
import { khataFor } from "./khata";
import { canChangePrice, cancelledOnTime, isCharged, isCooked, priceFor } from "./orders";
import { isDuplicateUtr, paymentRows } from "./paymentStatus";
import { mealTrack, nextAway, servesOn, summarizeSubscription } from "./subscriptions";
import {
  addDays,
  cutoffFor,
  cutoffStatus,
  daysBetween,
  formatDay,
  formatTime,
  istDate,
  istInstant,
  isOnTime,
} from "./time";

// ---- helpers ----------------------------------------------------------------

let nextId = 0;
const id = () => `id${nextId++}`;
const at = (date: string, hours: number, minutes = 0) => istInstant(date, hours, minutes).toISOString();

function facts(overrides: Partial<Facts> = {}): Facts {
  return {
    customers: [],
    subscriptions: [],
    mealChanges: [],
    singleOrders: [],
    priceOverrides: [],
    payments: [],
    ...overrides,
  };
}

const customer = (name: string) => ({ id: name, name, phone: "9800000000" });
const sub = (customerId: string, planId: PlanId, startDate = "2026-10-01") => ({
  id: `${customerId}-sub`,
  customerId,
  planId,
  startDate,
});

function skip(customerId: string, date: string, meal: Meal, requestedAt = at(addDays(date, -1), 18)): MealChange {
  return { id: id(), customerId, date, meal, kind: "skip", requestedAt };
}

function order(customerId: string, date: string, meal: Meal, extra: Partial<SingleOrder> = {}): SingleOrder {
  return {
    id: id(),
    customerId,
    date,
    meal,
    quantity: 1,
    status: "active",
    requestedAt: at(addDays(date, -1), 18),
    ...extra,
  };
}

function payment(customerId: string, amount: number | null, extra: Partial<Payment> = {}): Payment {
  return {
    id: id(),
    customerId,
    purpose: "single",
    amount,
    method: "upi",
    evidence: "text",
    status: "received",
    claimedAt: at("2026-10-20", 20),
    ...extra,
  };
}

// ---- time -------------------------------------------------------------------

describe("time", () => {
  it("uses the India date, not the UTC date", () => {
    expect(istDate("2026-10-21T19:00:00Z")).toBe("2026-10-22"); // 00:30 IST
    expect(istDate("2026-10-21T18:00:00Z")).toBe("2026-10-21"); // 23:30 IST
  });

  it("adds days across months and counts days between", () => {
    expect(addDays("2026-10-30", 3)).toBe("2026-11-02");
    expect(daysBetween("2026-10-28", "2026-11-02")).toBe(5);
  });

  it("lunch cutoff is 10 am the same day", () => {
    expect(cutoffFor("lunch", "2026-10-22").toISOString()).toBe("2026-10-22T04:30:00.000Z");
    expect(isOnTime("lunch", "2026-10-22", at("2026-10-22", 9, 59))).toBe(true);
    expect(isOnTime("lunch", "2026-10-22", at("2026-10-22", 10, 0))).toBe(true);
    expect(isOnTime("lunch", "2026-10-22", at("2026-10-22", 10, 1))).toBe(false);
  });

  it("breakfast cutoff is 10 pm the day before", () => {
    expect(isOnTime("breakfast", "2026-10-23", at("2026-10-22", 21, 59))).toBe(true);
    expect(isOnTime("breakfast", "2026-10-23", at("2026-10-22", 22, 1))).toBe(false);
    expect(isOnTime("breakfast", "2026-10-23", at("2026-10-23", 7, 0))).toBe(false);
  });

  it("dinner cutoff is 5 pm the same day", () => {
    expect(isOnTime("dinner", "2026-10-22", at("2026-10-22", 16, 59))).toBe(true);
    expect(isOnTime("dinner", "2026-10-22", at("2026-10-22", 17, 1))).toBe(false);
  });

  it("says whether today's meal can still be changed", () => {
    const morning = at("2026-10-22", 9, 30);
    expect(cutoffStatus("lunch", "2026-10-22", morning).open).toBe(true);
    expect(cutoffStatus("lunch", "2026-10-22", at("2026-10-22", 10, 5)).open).toBe(false);
    expect(cutoffStatus("dinner", "2026-10-22", morning).open).toBe(true);
    // Today's breakfast closed last night; tomorrow's closes at 10 pm today.
    const breakfast = cutoffStatus("breakfast", "2026-10-22", morning);
    expect(breakfast.open).toBe(false);
    expect(breakfast.nextUntil.toISOString()).toBe(istInstant("2026-10-22", 22).toISOString());
  });

  it("formats days and times for India", () => {
    expect(formatDay("2026-10-22")).toMatch(/Thu.*22.*Oct/);
    expect(formatTime(at("2026-10-22", 20, 4))).toMatch(/^8:04\s?pm$/);
  });
});

// ---- subscriptions ----------------------------------------------------------

describe("subscriptions", () => {
  const priya = sub("priya", "lunch");

  it("runs 30 days with no skips", () => {
    const track = mealTrack(priya, "lunch", []);
    expect(track.endDate).toBe("2026-10-30");
    expect(track.carried).toBe(0);
    expect(Object.keys(track.days)).toHaveLength(30);
  });

  it("moves the end date for skips sent in time", () => {
    const changes = ["2026-10-05", "2026-10-06", "2026-10-07"].map((d) => skip("priya", d, "lunch"));
    const track = mealTrack(priya, "lunch", changes);
    expect(track.endDate).toBe("2026-11-02");
    expect(track.carried).toBe(3);
    expect(track.days["2026-10-05"]).toBe("skipped");
    expect(servesOn(track, "2026-10-05")).toBe(false);
  });

  it("carries forward at most 5 skips per meal", () => {
    const dates = ["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"];
    const track = mealTrack(priya, "lunch", dates.map((d) => skip("priya", d, "lunch")));
    expect(track.carried).toBe(5);
    expect(track.endDate).toBe("2026-11-04");
    expect(track.days["2026-10-08"]).toBe("skipped_not_carried");
    expect(track.days["2026-10-09"]).toBe("skipped_not_carried");
  });

  it("tracks lunch and dinner carry-forward separately", () => {
    const kiran = sub("kiran", "lunch_dinner");
    const changes = ["2026-10-05", "2026-10-06", "2026-10-07"].map((d) => skip("kiran", d, "lunch"));
    const summary = summarizeSubscription(kiran, changes, []);
    const [lunch, dinner] = summary.tracks;
    expect(lunch.endDate).toBe("2026-11-02");
    expect(dinner.endDate).toBe("2026-10-30");
    expect(summary.endDate).toBe("2026-11-02");
  });

  it("counts a skip in the extended days once the plan reaches them", () => {
    const changes = [skip("priya", "2026-10-10", "lunch"), skip("priya", "2026-10-31", "lunch")];
    const track = mealTrack(priya, "lunch", changes);
    expect(track.carried).toBe(2);
    expect(track.endDate).toBe("2026-11-01");
  });

  it("ignores skips after the plan ends", () => {
    const track = mealTrack(priya, "lunch", [skip("priya", "2026-11-10", "lunch")]);
    expect(track.carried).toBe(0);
    expect(track.endDate).toBe("2026-10-30");
  });

  it("treats a late skip as eaten, unless the owner allows it", () => {
    const late = skip("priya", "2026-10-22", "lunch", at("2026-10-22", 10, 20));
    const track = mealTrack(priya, "lunch", [late]);
    expect(track.days["2026-10-22"]).toBe("late");
    expect(servesOn(track, "2026-10-22")).toBe(true);
    expect(track.carried).toBe(0);

    const allowed = mealTrack(priya, "lunch", [{ ...late, allowedLate: true }]);
    expect(allowed.days["2026-10-22"]).toBe("skipped");
    expect(allowed.carried).toBe(1);
  });

  it("lets an on-time unskip cancel a skip, but not a late one", () => {
    const skipped = skip("priya", "2026-10-22", "lunch");
    const unskip = (requestedAt: string): MealChange => ({ ...skipped, id: id(), kind: "unskip", requestedAt });
    expect(mealTrack(priya, "lunch", [skipped, unskip(at("2026-10-22", 9))]).days["2026-10-22"]).toBe("eating");
    expect(mealTrack(priya, "lunch", [skipped, unskip(at("2026-10-22", 11))]).days["2026-10-22"]).toBe("skipped");
  });

  it("finds the next stretch of days away", () => {
    const kiran = sub("kiran", "lunch_dinner");
    const changes = ["2026-10-25", "2026-10-26", "2026-10-27"].flatMap((d) => [
      skip("kiran", d, "lunch"),
      skip("kiran", d, "dinner"),
    ]);
    changes.push(skip("kiran", "2026-10-23", "lunch")); // one meal only: not "away"
    const summary = summarizeSubscription(kiran, changes, []);
    expect(nextAway(summary, "2026-10-22")).toEqual({ from: "2026-10-25", to: "2026-10-27" });
    expect(nextAway(summary, "2026-10-28")).toBeNull();
  });

  it("is paid only when the owner confirms the full advance", () => {
    const pay = (status: Payment["status"]) =>
      payment("priya", 3300, { purpose: "subscription", subscriptionId: priya.id, status });
    expect(summarizeSubscription(priya, [], [pay("pending")])).toMatchObject({ paid: false, pending: 3300 });
    expect(summarizeSubscription(priya, [], [pay("received")])).toMatchObject({ paid: true, received: 3300 });
  });
});

// ---- single orders and prices ----------------------------------------------

describe("orders and prices", () => {
  it("uses the standard price unless the day has an override", () => {
    const overrides = [{ date: "2026-10-23", meal: "dinner" as const, price: 150 }];
    expect(priceFor(overrides, "2026-10-22", "breakfast")).toBe(100);
    expect(priceFor(overrides, "2026-10-22", "dinner")).toBe(130);
    expect(priceFor(overrides, "2026-10-23", "dinner")).toBe(150);
  });

  it("locks the price once the meal is served", () => {
    expect(canChangePrice("2026-10-22", "lunch", at("2026-10-22", 11))).toBe(true);
    expect(canChangePrice("2026-10-22", "lunch", at("2026-10-22", 16))).toBe(false);
  });

  it("charges late cancellations but not on-time ones", () => {
    const onTime = order("anand", "2026-10-22", "lunch", { status: "cancelled", cancelledAt: at("2026-10-22", 9) });
    const late = { ...onTime, cancelledAt: at("2026-10-22", 11) };
    expect(cancelledOnTime(onTime)).toBe(true);
    expect(isCharged(onTime)).toBe(false);
    expect(isCooked(late)).toBe(true);
    expect(isCharged(late)).toBe(true);
    expect(isCharged({ ...late, cancelAllowedLate: true })).toBe(false);
  });

  it("doesn't charge meals marked not delivered", () => {
    const o = order("anand", "2026-10-22", "lunch", { notDelivered: true });
    expect(isCooked(o)).toBe(true);
    expect(isCharged(o)).toBe(false);
  });
});

// ---- daily counts ----------------------------------------------------------

describe("meal counts", () => {
  const day = "2026-10-22";
  const f = facts({
    customers: ["a", "b", "c", "anand", "deepa"].map(customer),
    subscriptions: [sub("a", "lunch"), sub("b", "lunch_dinner"), sub("c", "all_three")],
    mealChanges: [
      skip("a", day, "lunch"), // on time
      skip("b", day, "dinner", at(day, 17, 30)), // late: still cooked
    ],
    singleOrders: [
      order("anand", day, "lunch", { quantity: 2 }),
      order("deepa", day, "dinner", { status: "cancelled", cancelledAt: at(day, 12) }),
    ],
  });

  it("counts subscribers plus single orders", () => {
    const counts = mealsOn(f, day);
    expect(counts.breakfast.total).toBe(1);
    expect(counts.lunch).toEqual({ subscribers: 2, single: 2, total: 4 });
    expect(counts.dinner).toEqual({ subscribers: 2, single: 0, total: 2 });
  });

  it("lists what's different today", () => {
    const changes = changesOn(f, day).map((c) => `${c.customer.name}:${c.meal}:${c.kind}`);
    expect(changes).toEqual(["a:lunch:skip", "anand:lunch:order", "b:dinner:late_skip", "deepa:dinner:cancelled"]);
  });
});

// ---- khata -----------------------------------------------------------------

describe("khata", () => {
  const orders = ["2026-10-18", "2026-10-19", "2026-10-20"].map((d) => order("anand", d, "lunch"));

  it("clears the oldest meals first and handles part payments", () => {
    const k = khataFor("anand", facts({ singleOrders: orders, payments: [payment("anand", 300)] }));
    expect(k.charges.map((c) => c.status)).toEqual(["paid", "paid", "part"]);
    expect(k.owed).toBe(90);
    expect(k.oldestUnpaid).toBe("2026-10-20");
  });

  it("ignores payments the owner hasn't confirmed", () => {
    const k = khataFor("anand", facts({ singleOrders: orders, payments: [payment("anand", 390, { status: "pending" })] }));
    expect(k.owed).toBe(390);
    expect(k.oldestUnpaid).toBe("2026-10-18");
  });

  it("uses each day's price", () => {
    const k = khataFor(
      "anand",
      facts({ singleOrders: orders, priceOverrides: [{ date: "2026-10-19", meal: "lunch", price: 150 }] }),
    );
    expect(k.totalCharged).toBe(410);
  });
});

// ---- payment status --------------------------------------------------------

describe("payment status", () => {
  const today = "2026-10-22";

  it("sorts screenshot, says-paid, unpaid (oldest first), then paid", () => {
    const f = facts({
      customers: ["shot", "said", "old", "new", "paid", "quiet"].map(customer),
      singleOrders: [
        order("shot", "2026-10-21", "lunch"),
        order("said", "2026-10-21", "lunch"),
        order("old", "2026-10-15", "lunch"),
        order("new", "2026-10-21", "dinner"),
        order("paid", "2026-10-20", "lunch"),
      ],
      payments: [
        payment("shot", 130, { status: "pending", evidence: "screenshot" }),
        payment("said", 130, { status: "pending", evidence: "text" }),
        payment("paid", 130),
      ],
    });
    const rows = paymentRows(f, today);
    expect(rows.map((r) => `${r.customer.name}:${r.status}`)).toEqual([
      "shot:screenshot",
      "said:claimed",
      "old:unpaid",
      "new:unpaid",
      "paid:paid",
    ]);
    expect(rows.find((r) => r.customer.name === "old")?.daysUnpaid).toBe(7);
  });

  it("includes an unpaid subscription advance from its start date", () => {
    const f = facts({ customers: [customer("priya")], subscriptions: [sub("priya", "lunch", "2026-10-20")] });
    const [row] = paymentRows(f, today);
    expect(row).toMatchObject({ status: "unpaid", totalDue: 3300, oldestUnpaid: "2026-10-20", daysUnpaid: 2 });
  });

  it("spots a reused transaction ID", () => {
    const first = payment("anand", 360, { utr: "4123 8890 1265" });
    const again = payment("anand", 360, { utr: "412388901265", status: "pending" });
    expect(isDuplicateUtr(again, [first, again])).toBe(true);
    expect(isDuplicateUtr(again, [{ ...first, status: "rejected" }, again])).toBe(false);
  });
});
