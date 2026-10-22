"use client";

import { useMemo, useState } from "react";
import { contactLabel } from "@/lib/contact";
import { addCustomerFromMessage, resolveOutcome, setPrice } from "@/lib/actions";
import { formatINR, MEAL_LABELS } from "@/lib/format";
import { changesOn, mealsOn, summarizeAll, type DayChange } from "@/lib/rules/counts";
import { canChangePrice, priceFor } from "@/lib/rules/orders";
import { paymentRows } from "@/lib/rules/paymentStatus";
import { addDays, cutoffStatus, formatDay, formatTime, istDate, istHour } from "@/lib/rules/time";
import { needsAttention, nowOf, type AppState, type Message, type Outcome } from "@/lib/state";
import { updateState } from "@/lib/store";
import { MEALS, PLANS, STANDARD_PRICES, type Meal, type PlanId } from "@/lib/types";

type Props = { state: AppState; onOpenPayments: () => void };

// Look only: a colour and icon for each meal tile.
const MEAL_STYLE: Record<Meal, { border: string; badge: string; icon: string }> = {
  breakfast: {
    border: "border-amber-400",
    badge: "bg-amber-100 text-amber-700",
    icon: "M4 18h16M7 18a5 5 0 0110 0M12 5v3M5.6 9.6l1.4 1.4M18.4 9.6L17 11", // sunrise
  },
  lunch: {
    border: "border-emerald-500",
    badge: "bg-emerald-100 text-emerald-700",
    icon: "M12 4v2M12 18v2M4 12h2M18 12h2M6.3 6.3l1.4 1.4M16.3 16.3l1.4 1.4M6.3 17.7l1.4-1.4M16.3 7.7l1.4-1.4M12 8.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z", // sun
  },
  dinner: {
    border: "border-indigo-400",
    badge: "bg-indigo-100 text-indigo-700",
    icon: "M19 14.5A7.5 7.5 0 019.5 5a7.5 7.5 0 109.5 9.5z", // moon
  },
};

export default function TodayTab({ state, onOpenPayments }: Props) {
  const now = nowOf();
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
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">{greeting}</h1>
        <p className="text-sm text-zinc-500">
          {formatDay(today)} · {formatTime(now)}
          <span className="ml-2 inline-flex items-center gap-1 rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-semibold text-emerald-800">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600" aria-hidden="true" />
            live
          </span>
        </p>
      </div>

      <section aria-label="Meals to cook today" className="grid grid-cols-3 gap-2 lg:gap-4">
        {MEALS.map((meal) => (
          <div key={meal} className={`rounded-xl border-t-4 bg-white p-3 shadow-sm lg:p-5 ${MEAL_STYLE[meal].border}`}>
            <div className="flex items-center justify-between text-xs font-medium text-zinc-600">
              {MEAL_LABELS[meal]}
              <span className={`flex h-6 w-6 items-center justify-center rounded-full ${MEAL_STYLE[meal].badge}`} aria-hidden="true">
                <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <path d={MEAL_STYLE[meal].icon} />
                </svg>
              </span>
            </div>
            <div className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums text-zinc-900 lg:text-5xl">{counts[meal].total}</div>
            <div className="text-[11px] leading-tight text-zinc-500">
              {counts[meal].subscribers} plan{counts[meal].single > 0 && ` + ${counts[meal].single} single`}
            </div>
            <CutoffLine meal={meal} today={today} now={now} />
          </div>
        ))}
      </section>

      {/* Phones: one column (attention, money, changes, prices).
          Laptops: attention + changes on the left, money + prices on the right. */}
      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-2 lg:items-start lg:gap-5">
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          {attention.length > 0 && (
            <div className="order-1 lg:order-none">
              <Card title={`Needs your attention (${attention.length})`} tone="amber">
                <ul className="divide-y divide-amber-100">
                  {attention.map(({ message, outcome }) => (
                    <AttentionItem key={outcome.id} message={message} outcome={outcome} />
                  ))}
                </ul>
              </Card>
            </div>
          )}
          <div className="order-3 lg:order-none">
            <ChangesCard changes={changes} />
          </div>
        </div>
        <div className="contents lg:flex lg:flex-col lg:gap-5">
          <div className="order-2 lg:order-none">
            <MoneyCard rows={rows} onOpen={onOpenPayments} />
          </div>
          <div className="order-4 lg:order-none">
            <PricesCard state={state} date={addDays(today, 1)} now={now} />
          </div>
        </div>
      </div>
    </div>
  );
}

// "Changes till 10:00 am" while skips and cancellations are allowed, then "Locked".
function CutoffLine({ meal, today, now }: { meal: Meal; today: string; now: string }) {
  const status = cutoffStatus(meal, today, now);
  if (status.open) {
    return <div className="mt-2 rounded-md bg-emerald-50 px-1.5 py-1 text-[10px] font-semibold leading-tight text-emerald-800">Changes till {formatTime(status.until)}</div>;
  }
  const nextDay = istDate(status.nextUntil) === today ? "tonight" : "tomorrow";
  return (
    <div className="mt-2 rounded-md bg-zinc-100 px-1.5 py-1 text-[10px] leading-tight text-zinc-600">
      <span className="font-semibold text-zinc-800">🔒 Locked</span>
      <span className="block">next: till {formatTime(status.nextUntil)} {nextDay}</span>
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
        <span className="font-medium text-zinc-900">{message.senderName ?? `Unknown ${contactLabel(message.phone)}`}</span>
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
        ) : !message.senderName ? (
          <AddCustomer message={message} outcome={outcome} onHandled={() => resolve("dismissed")} />
        ) : (
          <Button onClick={() => resolve("dismissed")}>Mark as handled</Button>
        )}
      </div>
    </li>
  );
}

// Turn an unknown WhatsApp number into a customer (optionally on a monthly plan from today).
function AddCustomer({ message, outcome, onHandled }: { message: Message; outcome: Outcome; onHandled: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(message.profileName ?? "");
  const [plan, setPlan] = useState<PlanId | "">("");

  if (!open) {
    return (
      <>
        <Button primary onClick={() => setOpen(true)}>Add as customer</Button>
        <Button onClick={onHandled}>Mark as handled</Button>
      </>
    );
  }

  const save = () => {
    if (!name.trim()) return;
    updateState((s) => addCustomerFromMessage(s, message.id, outcome.id, name, plan || null, istDate(nowOf())));
  };
  const input = "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm";
  return (
    <div className="w-full space-y-2 rounded-lg bg-white p-3 ring-1 ring-amber-200">
      <label className="block text-xs text-zinc-600">
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Customer's name" className={input} />
      </label>
      <label className="block text-xs text-zinc-600">
        Monthly plan
        <select value={plan} onChange={(e) => setPlan(e.target.value as PlanId | "")} className={input}>
          <option value="">No plan (single meals)</option>
          {(Object.keys(PLANS) as PlanId[]).map((id) => (
            <option key={id} value={id}>
              {PLANS[id].label} · {formatINR(PLANS[id].price)} · from today
            </option>
          ))}
        </select>
      </label>
      <p className="text-[11px] text-zinc-500">{contactLabel(message.phone)}. Their next messages will be recognised.</p>
      <div className="flex gap-2">
        <Button primary onClick={save}>Save customer</Button>
        <Button onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </div>
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
    <button type="button" onClick={onOpen} className="block w-full rounded-xl bg-emerald-800 p-4 text-left text-white shadow-sm hover:bg-emerald-900">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-emerald-50">Money to collect</h2>
        <span className="text-xs font-semibold text-amber-200">Open payments →</span>
      </div>
      <div className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums">{formatINR(due)}</div>
      <div className="text-xs text-emerald-100">
        from {owing} {owing === 1 ? "person" : "people"}
        {overdue > 0 && <span className="font-semibold text-red-200"> · {overdue} overdue</span>}
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
