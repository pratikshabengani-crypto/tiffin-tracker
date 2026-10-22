"use client";

import { useState } from "react";
import { decidePayment, recordPayment } from "@/lib/actions";
import { isTelegram } from "@/lib/contact";
import { formatINR, MEAL_LABELS } from "@/lib/format";
import { reminderText, screenshotRequestText, whatsappLink } from "@/lib/reminders";
import { isDuplicateUtr, paymentRows, type PaymentRow, type PayStatus } from "@/lib/rules/paymentStatus";
import { formatDay, formatTime, istDate } from "@/lib/rules/time";
import { nowOf, type AppState } from "@/lib/state";
import { updateState } from "@/lib/store";
import { PLANS, type Payment, type PaymentMethod } from "@/lib/types";

type Props = { state: AppState; onBack: () => void };

const SECTIONS: { status: PayStatus; title: string; hint: string; dot: string }[] = [
  { status: "screenshot", title: "Screenshots to check", hint: "Check each one in your UPI app, then tick it.", dot: "bg-sky-500" },
  { status: "claimed", title: "Say they paid, no screenshot", hint: "Check your UPI app, or ask them for a screenshot.", dot: "bg-amber-400" },
  { status: "unpaid", title: "No payment yet", hint: "Longest unpaid first.", dot: "bg-red-500" },
  { status: "paid", title: "Paid", hint: "", dot: "bg-emerald-500" },
];

export default function PaymentsScreen({ state, onBack }: Props) {
  const now = nowOf();
  const today = istDate(now);
  const rows = paymentRows(state, today);
  const [showPaid, setShowPaid] = useState(false);
  const [viewing, setViewing] = useState<string | null>(null); // screenshot being viewed full size
  const due = rows.reduce((total, r) => total + r.totalDue, 0);

  return (
    <div className="space-y-3">
      <button type="button" onClick={onBack} className="text-sm font-medium text-emerald-700">
        ← Back
      </button>
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Payments</h1>
        <p className="text-sm text-zinc-500">
          {formatINR(due)} to collect · single meals and plan advances
        </p>
      </div>

      {SECTIONS.map((section) => {
        const list = rows.filter((r) => r.status === section.status);
        if (list.length === 0) return null;
        const collapsed = section.status === "paid" && !showPaid;
        return (
          <section key={section.status}>
            <h2 className="flex items-center gap-2 px-1 text-sm font-semibold text-zinc-800">
              <span className={`h-2.5 w-2.5 rounded-full ${section.dot}`} aria-hidden="true" />
              {section.title} ({list.length})
            </h2>
            {section.hint && <p className="px-1 text-xs text-zinc-500">{section.hint}</p>}
            {collapsed ? (
              <button type="button" onClick={() => setShowPaid(true)} className="mt-1 px-1 text-sm font-medium text-emerald-700">
                Show {list.length} paid
              </button>
            ) : (
              <ul className="mt-2 space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
                {list.map((row) => (
                  <PaymentCard key={row.customer.id} row={row} state={state} now={now} onView={setViewing} />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {viewing && (
        <div className="fixed inset-0 z-20 flex flex-col items-center justify-center bg-black/85 p-4" onClick={() => setViewing(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URLs and uploads, not optimisable */}
          <img src={viewing} alt="Payment screenshot" className="max-h-[80vh] max-w-full rounded-lg" />
          <button type="button" className="mt-3 rounded-lg bg-white px-4 py-2 text-sm font-medium">
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function PaymentCard({
  row,
  state,
  now,
  onView,
}: {
  row: PaymentRow;
  state: AppState;
  now: string;
  onView: (src: string) => void;
}) {
  const [recording, setRecording] = useState(false);
  const [history, setHistory] = useState(false);
  const plan = row.subscriptionsDue[0];

  return (
    <li className="rounded-xl bg-white p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <button type="button" onClick={() => setHistory(!history)} className="text-left text-sm font-semibold text-zinc-900">
            {row.customer.name}
          </button>
          <div className="mt-0.5 flex flex-wrap gap-1">
            {row.subscriptionsDue.length > 0 && <Tag className="bg-violet-100 text-violet-800">Plan advance</Tag>}
            {row.khata.charges.length > 0 && <Tag className="bg-zinc-100 text-zinc-700">Single meals</Tag>}
          </div>
        </div>
        <div className="text-right">
          {row.totalDue > 0 ? (
            <>
              <div className="text-sm font-bold tabular-nums text-zinc-900">{formatINR(row.totalDue)}</div>
              {row.status === "unpaid" && (
                <div className={`text-xs ${row.daysUnpaid > 3 ? "font-semibold text-red-700" : "text-zinc-500"}`}>
                  {row.daysUnpaid === 0 ? "since today" : `${row.daysUnpaid} day${row.daysUnpaid === 1 ? "" : "s"} unpaid`}
                </div>
              )}
            </>
          ) : (
            <div className="text-xs font-medium text-emerald-700">✓ Nothing due</div>
          )}
        </div>
      </div>

      <DueBreakdown row={row} />

      {row.pending.map((payment) => (
        <PendingPayment key={payment.id} payment={payment} row={row} state={state} now={now} onView={onView} />
      ))}

      {row.totalDue > 0 && row.pending.length === 0 && !recording && (
        <div className="mt-2 flex flex-wrap gap-2">
          {!isTelegram(row.customer.phone) && (
            <a
              href={whatsappLink(row.customer.phone, reminderText(row))}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white"
            >
              Remind on WhatsApp
            </a>
          )}
          <SmallButton onClick={() => setRecording(true)}>Mark paid</SmallButton>
        </div>
      )}
      {recording && <RecordPaymentForm row={row} now={now} onDone={() => setRecording(false)} />}

      {history && <History row={row} planLabel={plan ? PLANS[plan.sub.planId].label : undefined} />}
    </li>
  );
}

function DueBreakdown({ row }: { row: PaymentRow }) {
  const unpaid = row.khata.charges.filter((c) => c.status !== "paid");
  const lines: string[] = [];
  if (row.singleOwed > 0) {
    const meals = unpaid.reduce((total, c) => total + c.order.quantity, 0);
    lines.push(`${formatINR(row.singleOwed)} for ${meals} single meal${meals === 1 ? "" : "s"} since ${formatDay(unpaid[0].order.date)}`);
  }
  for (const s of row.subscriptionsDue) {
    lines.push(`${formatINR(s.price - s.received)} advance for ${PLANS[s.sub.planId].label} (starts ${formatDay(s.sub.startDate)})`);
  }
  if (lines.length === 0) return null;
  return (
    <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-600">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

function PendingPayment({
  payment,
  row,
  state,
  now,
  onView,
}: {
  payment: Payment;
  row: PaymentRow;
  state: AppState;
  now: string;
  onView: (src: string) => void;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const duplicate = isDuplicateUtr(payment, state.payments);
  const expected = payment.purpose === "subscription" ? row.subscriptionsDue.find((s) => s.sub.id === payment.subscriptionId) : null;
  const expectedAmount = expected ? expected.price - expected.received : row.singleOwed;
  const amountDiffers = payment.amount !== null && expectedAmount > 0 && payment.amount !== expectedAmount;
  const decide = (decision: "received" | "rejected") =>
    updateState((s) => decidePayment(s, payment.id, decision, now, decision === "rejected" ? note : undefined));

  return (
    <div className="mt-2 rounded-lg bg-zinc-50 p-2.5">
      <div className="flex gap-3">
        {payment.screenshot && (
          <button type="button" onClick={() => onView(payment.screenshot!)} className="shrink-0" aria-label="View screenshot full size">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URLs and uploads, not optimisable */}
            <img src={payment.screenshot} alt="" className="h-20 w-12 rounded border border-zinc-200 object-cover" />
          </button>
        )}
        <div className="min-w-0 flex-1 text-xs text-zinc-600">
          <div className="text-sm text-zinc-900">
            {payment.evidence === "screenshot" ? "Sent a screenshot" : "Says they paid"}
            {payment.amount !== null ? <> · <strong>{formatINR(payment.amount)}</strong></> : " · amount not given"}
          </div>
          <div>
            {formatDay(istDate(payment.claimedAt))}, {formatTime(payment.claimedAt)}
            {payment.method && ` · ${payment.method === "upi" ? "UPI" : payment.method}`}
            {payment.purpose === "subscription" && " · for plan advance"}
          </div>
          {payment.utr && <div>Transaction ID {payment.utr}</div>}
          {payment.paidTo && <div>Paid to {payment.paidTo}</div>}
          {duplicate && <div className="mt-0.5 font-semibold text-red-700">⚠ This transaction ID was already used for another payment</div>}
          {amountDiffers && <div className="mt-0.5 text-amber-800">Amount differs from what&apos;s due ({formatINR(expectedAmount)})</div>}
        </div>
      </div>

      {rejecting ? (
        <div className="mt-2 space-y-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional note, e.g. not in my UPI app"
            className="w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm"
          />
          <div className="flex gap-2">
            <button type="button" onClick={() => decide("rejected")} className="rounded-lg bg-red-700 px-3 py-1.5 text-sm font-medium text-white">
              Confirm: not received
            </button>
            <SmallButton onClick={() => setRejecting(false)}>Back</SmallButton>
          </div>
        </div>
      ) : (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => decide("received")} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white">
            ✓ Received
          </button>
          <SmallButton onClick={() => setRejecting(true)}>✗ Not received</SmallButton>
          {payment.evidence !== "screenshot" && !isTelegram(row.customer.phone) && (
            <a
              href={whatsappLink(row.customer.phone, screenshotRequestText(row.customer.name))}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700"
            >
              Ask for screenshot
            </a>
          )}
        </div>
      )}
    </div>
  );
}

function RecordPaymentForm({ row, now, onDone }: { row: PaymentRow; now: string; onDone: () => void }) {
  const options = [
    ...(row.singleOwed > 0 ? [{ id: "single", label: "Single meals", amount: row.singleOwed }] : []),
    ...row.subscriptionsDue.map((s) => ({ id: s.sub.id, label: `${PLANS[s.sub.planId].label} advance`, amount: s.price - s.received })),
  ];
  const [target, setTarget] = useState(options[0]?.id ?? "single");
  const [amount, setAmount] = useState(String(options[0]?.amount ?? ""));
  const [method, setMethod] = useState<PaymentMethod>("upi");

  function save() {
    const value = Number(amount);
    if (!(value > 0)) return;
    updateState((s) =>
      recordPayment(
        s,
        target === "single"
          ? { customerId: row.customer.id, purpose: "single", amount: value, method }
          : { customerId: row.customer.id, purpose: "subscription", subscriptionId: target, amount: value, method },
        now,
      ),
    );
    onDone();
  }

  const input = "w-full rounded-lg border border-zinc-300 px-2.5 py-1.5 text-sm";
  return (
    <div className="mt-2 space-y-2 rounded-lg bg-zinc-50 p-2.5 text-xs text-zinc-600">
      {options.length > 1 && (
        <label className="block">
          For
          <select
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setAmount(String(options.find((o) => o.id === e.target.value)?.amount ?? ""));
            }}
            className={input}
          >
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label} ({formatINR(o.amount)})
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          Amount (₹)
          <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" className={input} />
        </label>
        <label className="block">
          Paid by
          <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className={input}>
            <option value="upi">UPI</option>
            <option value="cash">Cash</option>
            <option value="bank_transfer">Bank transfer</option>
          </select>
        </label>
      </div>
      <p>Only record money you&apos;ve seen arrive.</p>
      <div className="flex gap-2">
        <button type="button" onClick={save} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-sm font-medium text-white">
          Save payment
        </button>
        <SmallButton onClick={onDone}>Cancel</SmallButton>
      </div>
    </div>
  );
}

function History({ row, planLabel }: { row: PaymentRow; planLabel?: string }) {
  const { charges, payments } = row.khata;
  return (
    <div className="mt-3 border-t border-zinc-100 pt-2 text-xs">
      <h3 className="font-semibold text-zinc-700">Single-meal khata</h3>
      {charges.length === 0 && payments.length === 0 && <p className="text-zinc-500">No single meals.{planLabel && ` On the ${planLabel} plan.`}</p>}
      <ul className="mt-1 space-y-0.5">
        {charges.map((c) => (
          <li key={c.order.id} className="flex justify-between gap-2">
            <span className="text-zinc-600">
              {formatDay(c.order.date)} · {MEAL_LABELS[c.order.meal]} × {c.order.quantity}
            </span>
            <span className={c.status === "paid" ? "text-emerald-700" : c.status === "part" ? "text-amber-700" : "text-red-700"}>
              {formatINR(c.amount)} {c.status === "paid" ? "✓" : c.status === "part" ? `(${formatINR(c.paid)} paid)` : ""}
            </span>
          </li>
        ))}
        {payments.map((p) => (
          <li key={p.id} className="flex justify-between gap-2 text-emerald-800">
            <span>
              {formatDay(istDate(p.decidedAt ?? p.claimedAt))} · paid ({p.method === "cash" ? "cash" : "UPI"})
            </span>
            <span>−{formatINR(p.amount ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tag({ className, children }: { className: string; children: React.ReactNode }) {
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${className}`}>{children}</span>;
}

function SmallButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="rounded-lg border border-zinc-300 bg-white px-3 py-1.5 text-sm text-zinc-700">
      {children}
    </button>
  );
}
