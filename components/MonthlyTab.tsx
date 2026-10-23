"use client";

import { useMemo, useState } from "react";
import SubscriberCalendar from "@/components/SubscriberCalendar";
import { addSubscriber } from "@/lib/actions";
import { normalizePhone } from "@/lib/contact";
import { formatINR } from "@/lib/format";
import { summarizeAll } from "@/lib/rules/counts";
import { nextAway, type SubscriptionSummary } from "@/lib/rules/subscriptions";
import { daysBetween, formatDay, istDate } from "@/lib/rules/time";
import { nowOf, type AppState } from "@/lib/state";
import { updateState } from "@/lib/store";
import { PLANS, type PlanId } from "@/lib/types";

type Filter = "all" | "unpaid" | "ending";

const PLAN_ORDER: PlanId[] = ["lunch", "dinner", "lunch_dinner", "breakfast_dinner", "all_three"];
const ENDING_SOON_DAYS = 3;

export default function MonthlyTab({ state }: { state: AppState }) {
  const today = istDate(nowOf());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [planFilter, setPlanFilter] = useState<PlanId | "all">("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

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

  const chips: { id: Filter; label: string; count: number }[] = [
    { id: "all", label: "All", count: rows.length },
    { id: "unpaid", label: "Unpaid", count: rows.filter((r) => !r.summary.paid).length },
    { id: "ending", label: "Ending soon", count: rows.filter((r) => endingSoon(r.summary)).length },
  ];

  // Phones: the list, or one person's calendar. Laptops: list on the left, calendar on the right.
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start lg:gap-6">
      <div className={selectedRow ? "lg:sticky lg:top-4 lg:order-2" : "hidden lg:block lg:order-2"}>
        {selectedRow ? (
          <SubscriberCalendar
            state={state}
            summary={selectedRow.summary}
            customer={selectedRow.customer}
            today={today}
            onBack={() => setSelected(null)}
          />
        ) : (
          <div className="rounded-xl bg-white p-8 text-center text-sm text-zinc-500 shadow-sm">
            Pick a subscriber to see their calendar.
          </div>
        )}
      </div>
    <div className={`space-y-3 lg:order-1 ${selectedRow ? "hidden lg:block" : ""}`}>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Monthly subscribers</h1>
        <p className="text-sm text-zinc-500">{rows.length} active plans</p>
      </div>

      {adding ? (
        <AddSubscriberForm
          state={state}
          today={today}
          onDone={(subscriptionId) => {
            setAdding(false);
            if (subscriptionId) setSelected(subscriptionId);
          }}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border-2 border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 hover:bg-white"
        >
          + Add subscriber
        </button>
      )}

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
                    aria-current={selected === r.summary.sub.id ? "true" : undefined}
                    className={`flex w-full items-center justify-between gap-2 px-4 py-2.5 text-left hover:bg-zinc-50 ${
                      selected === r.summary.sub.id ? "lg:bg-emerald-50" : ""
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <Initials name={r.customer.name} />
                      <span className="text-sm font-medium text-zinc-800">{r.customer.name}</span>
                    </span>
                    <RowStatus summary={r.summary} today={today} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
    </div>
  );
}

// Add a monthly subscriber by hand. Their advance shows as unpaid until it's marked in Payments.
function AddSubscriberForm({ state, today, onDone }: { state: AppState; today: string; onDone: (subscriptionId?: string) => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [planId, setPlanId] = useState<PlanId>("lunch");
  const [startDate, setStartDate] = useState(today);
  const [error, setError] = useState<string | null>(null);

  const existing = state.customers.find((c) => phone.replace(/\D/g, "").length >= 10 && c.phone === normalizePhone(phone));

  function save() {
    if (!name.trim() && !existing) return setError("Enter the subscriber's name.");
    if (phone.replace(/\D/g, "").length < 10) return setError("Enter a 10-digit phone number.");
    if (!startDate) return setError("Pick a start date.");
    let subscriptionId = "";
    updateState((s) => {
      const added = addSubscriber(s, { name: name || existing!.name, phone, planId, startDate });
      subscriptionId = added.subscriptionId;
      return added.state;
    });
    onDone(subscriptionId);
  }

  const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm outline-none focus:border-emerald-600";
  return (
    <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-2 ring-emerald-700/30">
      <h2 className="text-sm font-semibold text-zinc-800">New subscriber</h2>
      <label className="block text-xs text-zinc-600">
        Name
        <input value={name} onChange={(e) => { setName(e.target.value); setError(null); }} placeholder="Customer's name" className={input} />
      </label>
      <label className="block text-xs text-zinc-600">
        Phone number
        <input value={phone} onChange={(e) => { setPhone(e.target.value); setError(null); }} inputMode="tel" placeholder="98450 12345" className={input} />
      </label>
      {existing && <p className="text-xs text-emerald-800">Already a customer: {existing.name}. The plan will be added to them.</p>}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-zinc-600">
          Plan
          <select value={planId} onChange={(e) => setPlanId(e.target.value as PlanId)} className={input}>
            {PLAN_ORDER.map((id) => (
              <option key={id} value={id}>
                {PLANS[id].label} · {formatINR(PLANS[id].price)}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-600">
          Starts on
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={input} />
        </label>
      </div>
      <p className="text-[11px] text-zinc-500">The advance shows as unpaid until you mark it paid in Payments.</p>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={save} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
          Add subscriber
        </button>
        <button type="button" onClick={() => onDone()} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700">
          Cancel
        </button>
      </div>
    </section>
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

// Look only: a round avatar with the person's initials.
function Initials({ name }: { name: string }) {
  const letters = name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-800" aria-hidden="true">
      {letters}
    </span>
  );
}

function shortDay(date: string): string {
  return formatDay(date).replace(/^\w+,?\s*/, ""); // "25 Oct"
}
