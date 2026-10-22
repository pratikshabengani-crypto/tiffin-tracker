"use client";

import { useMemo, useState } from "react";
import SubscriberCalendar from "@/components/SubscriberCalendar";
import { formatINR } from "@/lib/format";
import { summarizeAll } from "@/lib/rules/counts";
import { nextAway, type SubscriptionSummary } from "@/lib/rules/subscriptions";
import { daysBetween, formatDay, istDate } from "@/lib/rules/time";
import { nowOf, type AppState } from "@/lib/state";
import { PLANS, type PlanId } from "@/lib/types";

type Filter = "all" | "unpaid" | "ending";

const PLAN_ORDER: PlanId[] = ["lunch", "dinner", "lunch_dinner", "breakfast_dinner", "all_three"];
const ENDING_SOON_DAYS = 3;

export default function MonthlyTab({ state }: { state: AppState }) {
  const today = istDate(nowOf(state));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [planFilter, setPlanFilter] = useState<PlanId | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);

  const summaries = useMemo(() => summarizeAll(state), [state]);
  const customers = useMemo(() => new Map(state.customers.map((c) => [c.id, c])), [state.customers]);

  // One row per subscriber: their current plan (the latest one not yet ended).
  const rows = useMemo(() => {
    const latest = new Map<string, SubscriptionSummary>();
    for (const s of summaries) {
      if (s.endDate < today) continue;
      const current = latest.get(s.sub.customerId);
      if (!current || s.sub.startDate > current.sub.startDate) latest.set(s.sub.customerId, s);
    }
    return [...latest.values()]
      .map((summary) => ({ summary, customer: customers.get(summary.sub.customerId)! }))
      .filter((r) => r.customer)
      .sort((a, b) => a.customer.name.localeCompare(b.customer.name));
  }, [summaries, customers, today]);

  const endingSoon = (s: SubscriptionSummary) => daysBetween(today, s.endDate) <= ENDING_SOON_DAYS;
  const matches = (r: (typeof rows)[number]) => {
    if (query && !`${r.customer.name} ${r.customer.phone}`.toLowerCase().includes(query.toLowerCase())) return false;
    if (planFilter !== "all" && r.summary.sub.planId !== planFilter) return false;
    if (filter === "unpaid") return !r.summary.paid;
    if (filter === "ending") return endingSoon(r.summary);
    return true;
  };
  const visible = rows.filter(matches);

  const selectedRow = rows.find((r) => r.summary.sub.id === selected);
  if (selectedRow) {
    return (
      <SubscriberCalendar
        state={state}
        summary={selectedRow.summary}
        customer={selectedRow.customer}
        today={today}
        onBack={() => setSelected(null)}
      />
    );
  }

  const chips: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: rows.length },
    { id: "unpaid", label: "Unpaid", count: rows.filter((r) => !r.summary.paid).length },
    { id: "ending", label: "Ending soon", count: rows.filter((r) => endingSoon(r.summary)).length },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Monthly subscribers</h1>
        <p className="text-sm text-zinc-500">{rows.length} active plans</p>
      </div>

      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search name or phone"
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600 focus:ring-2 focus:ring-emerald-600/20"
      />

      <select
        value={planFilter}
        onChange={(e) => setPlanFilter(e.target.value as PlanId | "all")}
        aria-label="Plan"
        className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
      >
        <option value="all">All plans</option>
        {PLAN_ORDER.map((id) => (
          <option key={id} value={id}>
            {PLANS[id].label} ({rows.filter((r) => r.summary.sub.planId === id).length})
          </option>
        ))}
      </select>

      <div className="flex flex-wrap gap-1.5">
        {chips.map((chip) => (
          <button
            key={chip.id}
            type="button"
            onClick={() => setFilter(chip.id)}
            aria-pressed={filter === chip.id}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              filter === chip.id ? "bg-emerald-700 text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200"
            }`}
          >
            {chip.label} · {chip.count}
          </button>
        ))}
      </div>

      {visible.length === 0 && <p className="py-6 text-center text-sm text-zinc-500">Nobody matches.</p>}

      {PLAN_ORDER.map((planId) => {
        const group = visible.filter((r) => r.summary.sub.planId === planId);
        if (group.length === 0) return null;
        return (
          <section key={planId} className="overflow-hidden rounded-xl bg-white shadow-sm">
            <h2 className="flex justify-between bg-zinc-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <span>{PLANS[planId].label}</span>
              <span>
                {group.length} · {formatINR(PLANS[planId].price)}
              </span>
            </h2>
            <ul className="divide-y divide-zinc-100">
              {group.map((r) => (
                <li key={r.summary.sub.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(r.summary.sub.id)}
                    className="flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-zinc-50"
                  >
                    <span className="text-sm font-medium text-zinc-800">{r.customer.name}</span>
                    <RowStatus summary={r.summary} today={today} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// The one most useful thing to know about a subscriber, at a glance.
function RowStatus({ summary, today }: { summary: SubscriptionSummary; today: string }) {
  const daysLeft = daysBetween(today, summary.endDate);
  const away = nextAway(summary, today);
  const skippingToday = summary.tracks.some((t) => t.days[today] === "skipped" || t.days[today] === "skipped_not_carried");

  const tags: { text: string; className: string }[] = [];
  if (!summary.paid) {
    tags.push(
      summary.pending > 0
        ? { text: "Payment to check", className: "bg-sky-100 text-sky-800" }
        : { text: `Unpaid ${formatINR(summary.price - summary.received)}`, className: "bg-red-100 text-red-800" },
    );
  }
  if (daysLeft <= ENDING_SOON_DAYS) {
    tags.push({ text: daysLeft <= 0 ? "Ends today" : `Ends ${formatDay(summary.endDate)}`, className: "bg-amber-100 text-amber-800" });
  }
  if (away) tags.push({ text: `Away ${shortDay(away.from)}–${shortDay(away.to)}`, className: "bg-zinc-100 text-zinc-700" });
  else if (skippingToday) tags.push({ text: "Skipping today", className: "bg-zinc-100 text-zinc-700" });

  return (
    <span className="flex flex-wrap justify-end gap-1">
      {tags.map((t) => (
        <span key={t.text} className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium ${t.className}`}>
          {t.text}
        </span>
      ))}
    </span>
  );
}

function shortDay(date: string): string {
  return formatDay(date).replace(/^\w+,?\s*/, ""); // "25 Oct"
}
