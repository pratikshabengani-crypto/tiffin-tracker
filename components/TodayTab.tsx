"use client";

import { useMemo, useState } from "react";
import { resolveOutcome, setPrice } from "@/lib/actions";
import { formatINR, MEAL_LABELS } from "@/lib/format";
import { changesOn, mealsOn, summarizeAll, type DayChange } from "@/lib/rules/counts";
import { canChangePrice, priceFor } from "@/lib/rules/orders";
import { paymentRows } from "@/lib/rules/paymentStatus";
import { addDays, formatDay, formatTime, istDate, istHour } from "@/lib/rules/time";
import { needsAttention, nowOf, type AppState, type Message, type Outcome } from "@/lib/state";
import { updateState } from "@/lib/store";
import { MEALS, STANDARD_PRICES, type Meal } from "@/lib/types";

type Props = { state: AppState; onOpenPayments: () => void };

export default function TodayTab({ state, onOpenPayments }: Props) {
  const now = nowOf(state);
  const today = istDate(now);
  const summaries = useMemo(() => summarizeAll(state), [state]);
  const counts = mealsOn(state, today, summaries);
  const changes = changesOn(state, today, summaries);
  const attention = needsAttention(state);
  const rows = paymentRows(state, today, summaries);

  const hour = istHour(now);
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">{greeting}</h1>
        <p className="text-sm text-zinc-500">
          {formatDay(today)} · {formatTime(now)}
          {state.demoNow && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs text-amber-800">demo clock</span>}
        </p>
      </div>

      <section aria-label="Meals to cook today" className="grid grid-cols-3 gap-2">
        {MEALS.map((meal) => (
          <div key={meal} className="rounded-xl bg-white p-3 shadow-sm">
            <div className="text-xs text-zinc-500">{MEAL_LABELS[meal]}</div>
            <div className="text-3xl font-bold tabular-nums text-zinc-900">{counts[meal].total}</div>
            <div className="text-[11px] leading-tight text-zinc-500">
              {counts[meal].subscribers} plan{counts[meal].single > 0 && ` + ${counts[meal].single} single`}
            </div>
          </div>
        ))}
      </section>

      {attention.length > 0 && (
        <Card title={`Needs your attention (${attention.length})`} tone="amber">
          <ul className="divide-y divide-amber-100">
            {attention.map(({ message, outcome }) => (
              <AttentionItem key={outcome.id} message={message} outcome={outcome} />
            ))}
          </ul>
        </Card>
      )}

      <MoneyCard rows={rows} onOpen={onOpenPayments} />

      <ChangesCard changes={changes} />

      <PricesCard state={state} date={addDays(today, 1)} now={now} />
    </div>
  );
}

function Card({ title, tone, children }: { title: string; tone?: "amber"; children: React.ReactNode }) {
  return (
    <section className={`rounded-xl p-4 shadow-sm ${tone === "amber" ? "bg-amber-50 ring-1 ring-amber-200" : "bg-white"}`}>
      <h2 className="text-sm font-semibold text-zinc-800">{title}</h2>
      <div className="mt-2">{children}</div>
    </section>
  );
}

function AttentionItem({ message, outcome }: { message: Message; outcome: Outcome }) {
  const resolve = (resolution: "approved" | "dismissed") =>
    updateState((s) => resolveOutcome(s, message.id, outcome.id, resolution));

  return (
    <li className="py-3 first:pt-0 last:pb-0 text-sm">
      <div className="flex justify-between gap-2">
        <span className="font-medium text-zinc-900">{message.senderName ?? `Unknown number ${message.phone}`}</span>
        <span className="shrink-0 text-xs text-zinc-500">{formatTime(message.receivedAt)}</span>
      </div>
      <p className="mt-0.5 italic text-zinc-600">“{message.text}”</p>
      <p className="mt-1 text-zinc-800">{outcome.summary}</p>
      {outcome.reason && <p className="text-xs text-amber-800">{outcome.reason}</p>}
      <div className="mt-2 flex flex-wrap gap-2">
        {outcome.action?.type === "allow_late_skip" ? (
          <>
            <Button primary onClick={() => resolve("approved")}>Allow skip</Button>
            <Button onClick={() => resolve("dismissed")}>Keep the meal</Button>
          </>
        ) : outcome.action?.type === "allow_late_cancel" ? (
          <>
            <Button primary onClick={() => resolve("approved")}>Don&apos;t charge</Button>
            <Button onClick={() => resolve("dismissed")}>Charge anyway</Button>
          </>
        ) : outcome.action ? (
          <>
            <Button primary onClick={() => resolve("approved")}>Accept</Button>
            <Button onClick={() => resolve("dismissed")}>Decline</Button>
          </>
        ) : (
          <Button onClick={() => resolve("dismissed")}>Mark as handled</Button>
        )}
      </div>
    </li>
  );
}

function Button({ primary, onClick, children }: { primary?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-9 rounded-lg px-3 text-sm font-medium ${
        primary ? "bg-emerald-700 text-white hover:bg-emerald-800" : "border border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50"
      }`}
    >
      {children}
    </button>
  );
}

function MoneyCard({ rows, onOpen }: { rows: ReturnType<typeof paymentRows>; onOpen: () => void }) {
  const due = rows.reduce((total, r) => total + r.totalDue, 0);
  const count = (status: string) => rows.filter((r) => r.status === status).length;
  const owing = rows.filter((r) => r.totalDue > 0).length;
  const overdue = rows.filter((r) => r.status === "unpaid" && r.daysUnpaid > 3).length;

  return (
    <button type="button" onClick={onOpen} className="block w-full rounded-xl bg-white p-4 text-left shadow-sm hover:ring-1 hover:ring-zinc-300">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-zinc-800">Money to collect</h2>
        <span className="text-xs font-medium text-emerald-700">Open payments →</span>
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-zinc-900">{formatINR(due)}</div>
      <div className="text-xs text-zinc-500">
        from {owing} {owing === 1 ? "person" : "people"}
        {overdue > 0 && <span className="text-red-700"> · {overdue} overdue</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
        <Pill className="bg-sky-100 text-sky-800">{count("screenshot")} screenshots to check</Pill>
        <Pill className="bg-amber-100 text-amber-800">{count("claimed")} say paid</Pill>
        <Pill className="bg-red-100 text-red-800">{count("unpaid")} no payment yet</Pill>
      </div>
    </button>
  );
}

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-2 py-0.5 font-medium ${className}`}>{children}</span>;
}

const CHANGE_TEXT: Record<DayChange["kind"], { label: (c: DayChange) => string; dot: string }> = {
  skip: { label: () => "skipping", dot: "bg-red-500" },
  late_skip: { label: () => "skip sent late (still cooked)", dot: "bg-orange-400" },
  order: { label: (c) => `single order × ${c.quantity}`, dot: "bg-emerald-500" },
  cancelled: { label: () => "cancelled single order", dot: "bg-zinc-400" },
  late_cancel: { label: () => "cancelled late (still cooked)", dot: "bg-orange-400" },
};

function ChangesCard({ changes }: { changes: DayChange[] }) {
  const [showAll, setShowAll] = useState<Partial<Record<Meal, boolean>>>({});

  return (
    <Card title={`Changes today (${changes.length})`}>
      {changes.length === 0 && <p className="text-sm text-zinc-500">A normal day. No skips or extra orders.</p>}
      <div className="space-y-3">
        {MEALS.map((meal) => {
          const list = changes.filter((c) => c.meal === meal);
          if (list.length === 0) return null;
          const visible = showAll[meal] ? list : list.slice(0, 4);
          return (
            <div key={meal}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-zinc-500">{MEAL_LABELS[meal]}</h3>
              <ul className="mt-1 space-y-1">
                {visible.map((c, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${CHANGE_TEXT[c.kind].dot}`} aria-hidden="true" />
                    <span className="font-medium text-zinc-800">{c.customer.name}</span>
                    <span className="text-zinc-500">{CHANGE_TEXT[c.kind].label(c)}</span>
                  </li>
                ))}
              </ul>
              {list.length > visible.length && (
                <button
                  type="button"
                  onClick={() => setShowAll({ ...showAll, [meal]: true })}
                  className="mt-1 text-xs font-medium text-emerald-700"
                >
                  Show {list.length - visible.length} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PricesCard({ state, date, now }: { state: AppState; date: string; now: string }) {
  return (
    <Card title={`Single-meal prices for tomorrow (${formatDay(date)})`}>
      <p className="text-xs text-zinc-500">Standard prices apply unless you change them here.</p>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {MEALS.map((meal) => (
          <PriceInput
            key={`${date}-${meal}-${priceFor(state.priceOverrides, date, meal)}`}
            meal={meal}
            value={priceFor(state.priceOverrides, date, meal)}
            locked={!canChangePrice(date, meal, now)}
            onSave={(price) => updateState((s) => setPrice(s, date, meal, price))}
          />
        ))}
      </div>
    </Card>
  );
}

function PriceInput({ meal, value, locked, onSave }: { meal: Meal; value: number; locked: boolean; onSave: (price: number) => void }) {
  const [text, setText] = useState(String(value));
  const special = value !== STANDARD_PRICES[meal];
  const save = () => {
    const price = Number(text);
    if (price > 0 && price !== value) onSave(price);
    else setText(String(value));
  };

  return (
    <label className="block text-xs">
      <span className="text-zinc-600">{MEAL_LABELS[meal]}</span>
      <div className={`mt-1 flex items-center rounded-lg border px-2 ${special ? "border-amber-400 bg-amber-50" : "border-zinc-300"}`}>
        <span className="text-zinc-500">₹</span>
        <input
          value={text}
          disabled={locked}
          inputMode="numeric"
          onChange={(e) => setText(e.target.value.replace(/[^\d]/g, ""))}
          onBlur={save}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-full bg-transparent py-1.5 pl-1 text-sm tabular-nums outline-none"
          aria-label={`${MEAL_LABELS[meal]} price`}
        />
      </div>
      {special && (
        <button type="button" onClick={() => onSave(STANDARD_PRICES[meal])} className="mt-0.5 text-amber-800 underline">
          Back to ₹{STANDARD_PRICES[meal]}
        </button>
      )}
    </label>
  );
}
