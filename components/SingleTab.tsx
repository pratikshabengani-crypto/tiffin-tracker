"use client";

import { useMemo, useState } from "react";
import { addCustomer, addOrder, cancelOrder, setNotDelivered } from "@/lib/actions";
import { formatINR, MEAL_LABELS } from "@/lib/format";
import { khataFor, type Charge } from "@/lib/rules/khata";
import { cancelledOnTime, priceFor } from "@/lib/rules/orders";
import { paymentRows } from "@/lib/rules/paymentStatus";
import { addDays, formatDay, istDate, servedAt } from "@/lib/rules/time";
import { nowOf, type AppState } from "@/lib/state";
import { updateState } from "@/lib/store";
import { MEALS, STANDARD_PRICES, type Meal, type SingleOrder } from "@/lib/types";

type Props = { state: AppState; onOpenPayments: () => void };

export default function SingleTab({ state, onOpenPayments }: Props) {
  const now = nowOf(state);
  const today = istDate(now);
  const [date, setDate] = useState(today);
  const [adding, setAdding] = useState(false);

  const orders = state.singleOrders.filter((o) => o.date === date);
  const customers = useMemo(() => new Map(state.customers.map((c) => [c.id, c])), [state.customers]);

  // Paid / part / unpaid for each order, from each customer's khata.
  const chargeFor = useMemo(() => {
    const map = new Map<string, Charge>();
    for (const customerId of new Set(orders.map((o) => o.customerId))) {
      for (const charge of khataFor(customerId, state).charges) map.set(charge.order.id, charge);
    }
    return map;
  }, [orders, state]);

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-xl font-bold text-zinc-900">Single meals</h1>
        <p className="text-sm text-zinc-500">Orders from people without a monthly plan, and extra meals.</p>
      </div>

      <PaymentsShortcut state={state} today={today} onOpen={onOpenPayments} />

      <div className="flex items-center justify-between rounded-xl bg-white px-2 py-1.5 shadow-sm">
        <DayButton label="Previous day" onClick={() => setDate(addDays(date, -1))}>‹</DayButton>
        <div className="text-center">
          <div className="text-sm font-semibold text-zinc-900">{formatDay(date)}</div>
          <div className="text-xs text-zinc-500">
            {date === today ? "Today" : date === addDays(today, 1) ? "Tomorrow" : date === addDays(today, -1) ? "Yesterday" : ""}
          </div>
        </div>
        <DayButton label="Next day" onClick={() => setDate(addDays(date, 1))}>›</DayButton>
      </div>

      <p className="text-xs text-zinc-500">
        Prices this day:{" "}
        {MEALS.map((meal) => {
          const price = priceFor(state.priceOverrides, date, meal);
          return (
            <span key={meal} className={price !== STANDARD_PRICES[meal] ? "font-semibold text-amber-800" : ""}>
              {MEAL_LABELS[meal]} {formatINR(price)}
              {meal !== "dinner" && " · "}
            </span>
          );
        })}
      </p>

      {adding ? (
        <AddOrderForm state={state} date={date} now={now} onDone={() => setAdding(false)} />
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full rounded-xl border-2 border-dashed border-zinc-300 py-2.5 text-sm font-medium text-zinc-700 hover:bg-white"
        >
          + Add order for {formatDay(date)}
        </button>
      )}

      {MEALS.map((meal) => {
        const list = orders.filter((o) => o.meal === meal);
        const count = list.filter((o) => o.status === "active").reduce((total, o) => total + o.quantity, 0);
        return (
          <section key={meal} className="rounded-xl bg-white shadow-sm">
            <h2 className="flex justify-between border-b border-zinc-100 px-4 py-2 text-sm font-semibold text-zinc-800">
              <span>{MEAL_LABELS[meal]}</span>
              <span className="text-zinc-500">{count} meal{count === 1 ? "" : "s"}</span>
            </h2>
            {list.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-400">No single orders.</p>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {list.map((order) => (
                  <OrderRow
                    key={order.id}
                    order={order}
                    name={customers.get(order.customerId)?.name ?? "Unknown"}
                    charge={chargeFor.get(order.id)}
                    price={priceFor(state.priceOverrides, order.date, order.meal)}
                    now={now}
                    served={new Date(now).getTime() >= servedAt(order.meal, order.date).getTime()}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function DayButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className="h-10 w-10 rounded-lg text-2xl text-zinc-600 hover:bg-zinc-100">
      {children}
    </button>
  );
}

function PaymentsShortcut({ state, today, onOpen }: { state: AppState; today: string; onOpen: () => void }) {
  const rows = paymentRows(state, today);
  const due = rows.reduce((total, r) => total + r.totalDue, 0);
  const toCheck = rows.filter((r) => r.status === "screenshot" || r.status === "claimed").length;
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-center justify-between rounded-xl bg-emerald-800 px-4 py-3 text-left text-white shadow-sm">
      <span>
        <span className="block text-sm font-semibold">Payments</span>
        <span className="text-xs text-emerald-100">
          {formatINR(due)} due · {toCheck} to check
        </span>
      </span>
      <span className="text-sm font-medium">Open →</span>
    </button>
  );
}

const CHARGE_PILL: Record<Charge["status"], { text: string; className: string }> = {
  paid: { text: "Paid", className: "bg-emerald-100 text-emerald-800" },
  part: { text: "Part paid", className: "bg-amber-100 text-amber-800" },
  unpaid: { text: "Unpaid", className: "bg-red-100 text-red-800" },
};

function OrderRow({
  order,
  name,
  charge,
  price,
  now,
  served,
}: {
  order: SingleOrder;
  name: string;
  charge?: Charge;
  price: number;
  now: string;
  served: boolean;
}) {
  const cancelled = order.status === "cancelled" && cancelledOnTime(order);
  const pill = cancelled
    ? { text: "Cancelled", className: "bg-zinc-100 text-zinc-600" }
    : order.notDelivered
      ? { text: "Not delivered", className: "bg-zinc-100 text-zinc-600" }
      : charge
        ? CHARGE_PILL[charge.status]
        : null;

  return (
    <li className="px-4 py-2.5 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className={`font-medium ${cancelled ? "text-zinc-400 line-through" : "text-zinc-800"}`}>
          {name} <span className="font-normal text-zinc-500">× {order.quantity}</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="tabular-nums text-zinc-700">{formatINR(order.quantity * price)}</span>
          {pill && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pill.className}`}>{pill.text}</span>}
        </span>
      </div>
      {order.status === "cancelled" && !cancelled && (
        <p className="mt-0.5 text-xs text-orange-700">Cancelled after the cutoff, so it&apos;s still charged</p>
      )}
      {!cancelled && (
        <div className="mt-1 flex gap-3 text-xs">
          {order.status === "active" && !order.notDelivered && (
            <button
              type="button"
              onClick={() => window.confirm(`Cancel ${name}'s order? They won't be charged.`) && updateState((s) => cancelOrder(s, order.id, now))}
              className="text-zinc-500 hover:text-red-700"
            >
              Cancel order
            </button>
          )}
          {served && (
            <button
              type="button"
              onClick={() => updateState((s) => setNotDelivered(s, order.id, !order.notDelivered))}
              className="text-zinc-500 hover:text-zinc-800"
            >
              {order.notDelivered ? "Mark as delivered" : "Not delivered"}
            </button>
          )}
        </div>
      )}
    </li>
  );
}

function AddOrderForm({ state, date, now, onDone }: { state: AppState; date: string; now: string; onDone: () => void }) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [meal, setMeal] = useState<Meal>("lunch");
  const [quantity, setQuantity] = useState("1");
  const [error, setError] = useState<string | null>(null);

  const existing = state.customers.find((c) => c.name.toLowerCase() === name.trim().toLowerCase());
  const isNew = name.trim() !== "" && !existing;

  function save() {
    const qty = Number(quantity);
    if (!name.trim()) return setError("Enter the customer's name.");
    if (isNew && phone.replace(/\D/g, "").length < 10) return setError("Enter a 10-digit phone number for the new customer.");
    if (!(qty >= 1 && Number.isInteger(qty))) return setError("Quantity must be 1 or more.");

    updateState((s) => {
      let next = s;
      let customerId = existing?.id;
      if (!customerId) {
        const added = addCustomer(next, name, phone);
        next = added.state;
        customerId = added.customer.id;
      }
      return addOrder(next, { customerId, date, meal, quantity: qty }, now);
    });
    onDone();
  }

  const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-600";

  return (
    <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm ring-2 ring-emerald-700/30">
      <h2 className="text-sm font-semibold text-zinc-800">New order for {formatDay(date)}</h2>
      <label className="block text-xs text-zinc-600">
        Customer
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setError(null);
          }}
          list="single-customers"
          placeholder="Start typing a name"
          className={input}
        />
        <datalist id="single-customers">
          {state.customers.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>
      </label>
      {isNew && (
        <label className="block text-xs text-zinc-600">
          New customer: phone number
          <input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" placeholder="98450 12345" className={input} />
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-zinc-600">
          Meal
          <select value={meal} onChange={(e) => setMeal(e.target.value as Meal)} className={input}>
            {MEALS.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABELS[m]}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs text-zinc-600">
          How many
          <input value={quantity} onChange={(e) => setQuantity(e.target.value.replace(/\D/g, ""))} inputMode="numeric" className={input} />
        </label>
      </div>
      {error && <p className="text-xs text-red-700">{error}</p>}
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={save} className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800">
          Add order
        </button>
        <button type="button" onClick={onDone} className="rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-700">
          Cancel
        </button>
      </div>
    </section>
  );
}
