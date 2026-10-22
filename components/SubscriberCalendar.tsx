"use client";

import { useState } from "react";
import { formatINR, MEAL_LABELS } from "@/lib/format";
import type { DayStatus, SubscriptionSummary } from "@/lib/rules/subscriptions";
import { dateRange, formatDay, formatTime, istDate } from "@/lib/rules/time";
import type { AppState } from "@/lib/state";
import { CARRY_FORWARD_LIMIT, PLANS, type Customer } from "@/lib/types";

type Props = {
  state: AppState;
  summary: SubscriptionSummary;
  customer: Customer;
  today: string;
  onBack: () => void;
};

const DOT: Record<DayStatus | "none", string> = {
  eating: "bg-emerald-500",
  skipped: "bg-red-500",
  skipped_not_carried: "bg-red-300",
  late: "bg-orange-400",
  none: "bg-zinc-200",
};

const STATUS_TEXT: Record<DayStatus | "none", string> = {
  eating: "Eating",
  skipped: "Skipped in time (carried forward)",
  skipped_not_carried: "Skipped in time, but all 5 carry-forwards were already used",
  late: "Skip sent after the cutoff, so it counts as eaten",
  none: "Not part of the plan",
};

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export default function SubscriberCalendar({ state, summary, customer, today, onBack }: Props) {
  const [selectedDay, setSelectedDay] = useState(today);
  const plan = PLANS[summary.sub.planId];
  const days = dateRange(summary.sub.startDate, summary.endDate);
  // Monday-first grid: blank cells before the start date.
  const lead = (new Date(`${summary.sub.startDate}T00:00:00Z`).getUTCDay() + 6) % 7;

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm font-medium text-emerald-700">
        ← All subscribers
      </button>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <h1 className="text-lg font-bold text-zinc-900">{customer.name}</h1>
        <p className="text-sm text-zinc-500">
          {plan.label} · {formatINR(plan.price)} · started {formatDay(summary.sub.startDate)}
        </p>
        <a href={`tel:+91${customer.phone}`} className="text-sm text-emerald-700">
          +91 {customer.phone}
        </a>
        <PaymentLine summary={summary} />
      </section>

      <section className="rounded-xl bg-white p-4 shadow-sm">
        <ul className="space-y-1.5 text-sm">
          {summary.tracks.map((track) => {
            const notCarried = Object.values(track.days).filter((d) => d === "skipped_not_carried").length;
            const late = Object.values(track.days).filter((d) => d === "late").length;
            return (
              <li key={track.meal}>
                <span className="font-medium text-zinc-800">{MEAL_LABELS[track.meal]}</span>
                <span className="text-zinc-600">
                  {" "}
                  · {track.carried} of {CARRY_FORWARD_LIMIT} carried forward · ends {formatDay(track.endDate)}
                </span>
                {(notCarried > 0 || late > 0) && (
                  <span className="block text-xs text-zinc-500">
                    {[notCarried > 0 && `${notCarried} skip${notCarried === 1 ? "" : "s"} not carried`, late > 0 && `${late} late skip${late === 1 ? "" : "s"}`]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </li>
            );
          })}
        </ul>

        <div className="mt-4 grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((d) => (
            <div key={d} className="text-[11px] font-medium text-zinc-400">
              {d}
            </div>
          ))}
          {Array.from({ length: lead }, (_, i) => (
            <div key={`blank${i}`} />
          ))}
          {days.map((date) => {
            const dayNumber = Number(date.slice(8));
            const isToday = date === today;
            const isSelected = date === selectedDay;
            return (
              <button
                key={date}
                type="button"
                onClick={() => setSelectedDay(date)}
                aria-label={formatDay(date)}
                aria-pressed={isSelected}
                className={`flex h-12 flex-col items-center justify-center gap-1 rounded-lg text-xs ${
                  isSelected ? "bg-zinc-100" : ""
                } ${isToday ? "ring-2 ring-emerald-600" : ""} ${date > today ? "text-zinc-400" : "text-zinc-800"}`}
              >
                <span>
                  {dayNumber}
                  {(dayNumber === 1 || date === summary.sub.startDate) && (
                    <span className="ml-0.5 text-[9px]">{formatDay(date).split(" ").at(-1)}</span>
                  )}
                </span>
                <span className="flex gap-0.5">
                  {summary.tracks.map((t) => (
                    <span key={t.meal} className={`h-2 w-2 rounded-full ${DOT[t.days[date] ?? "none"]}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>

        <p className="mt-2 text-[11px] text-zinc-500">
          Dots, left to right: {plan.meals.map((m) => MEAL_LABELS[m].toLowerCase()).join(", ")}.
        </p>
        <Legend />
      </section>

      <DayDetail state={state} summary={summary} date={selectedDay} />
    </div>
  );
}

function PaymentLine({ summary }: { summary: SubscriptionSummary }) {
  if (summary.paid) {
    return <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">✓ Advance of {formatINR(summary.received)} received</p>;
  }
  if (summary.pending > 0) {
    return (
      <p className="mt-2 rounded-lg bg-sky-50 px-3 py-2 text-sm text-sky-800">
        Says they paid {formatINR(summary.pending)}. Check it on the Payments screen.
      </p>
    );
  }
  return (
    <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
      Advance not paid: {formatINR(summary.price - summary.received)} due
    </p>
  );
}

function Legend() {
  const items: [string, string][] = [
    [DOT.eating, "eating"],
    [DOT.skipped, "skipped in time"],
    [DOT.skipped_not_carried, "skipped, not carried"],
    [DOT.late, "skipped late"],
    [DOT.none, "not in plan"],
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-zinc-600">
      {items.map(([dot, label]) => (
        <span key={label} className="flex items-center gap-1">
          <span className={`h-2 w-2 rounded-full ${dot}`} />
          {label}
        </span>
      ))}
    </div>
  );
}

function DayDetail({ state, summary, date }: { state: AppState; summary: SubscriptionSummary; date: string }) {
  return (
    <section className="rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-800">{formatDay(date)}</h2>
      <ul className="mt-2 space-y-3 text-sm">
        {summary.tracks.map((track) => {
          const status = (track.days[date] as DayStatus | undefined) ?? "none";
          const change = track.changeFor[date];
          const message = change?.messageId ? state.messages.find((m) => m.id === change.messageId) : undefined;
          return (
            <li key={track.meal} className="flex gap-2">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${DOT[status]}`} />
              <div>
                <span className="font-medium text-zinc-800">{MEAL_LABELS[track.meal]}:</span>{" "}
                <span className="text-zinc-700">{STATUS_TEXT[status]}</span>
                {status === "none" && date > track.endDate && (
                  <span className="text-zinc-500"> (this meal ended {formatDay(track.endDate)})</span>
                )}
                {change && (
                  <p className="text-xs text-zinc-500">
                    Asked {formatDay(istDate(change.requestedAt))}, {formatTime(change.requestedAt)}
                    {change.allowedLate && " · late, but you allowed it"}
                  </p>
                )}
                {message && <p className="mt-0.5 text-xs italic text-zinc-600">“{message.text}”</p>}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
