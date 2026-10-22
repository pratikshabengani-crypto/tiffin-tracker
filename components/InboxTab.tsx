"use client";

import { useState } from "react";
import { findCustomer } from "@/lib/applyMessage";
import { contactLabel } from "@/lib/contact";
import { demoScript, scriptImage } from "@/lib/demo/script";
import { readFile } from "@/lib/image";
import { processMessage } from "@/lib/process";
import { formatDay, formatTime, istDate } from "@/lib/rules/time";
import { nowOf, type AppState, type Message, type Outcome } from "@/lib/state";
import { resetDemo, updateState } from "@/lib/store";



export type ChannelStatus = { connected: boolean; error?: string };
export type Channels = { whatsapp: ChannelStatus; telegram: ChannelStatus };

export default function InboxTab({ state, channels }: { state: AppState; channels: Channels }) {
  const now = nowOf();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastMs, setLastMs] = useState<number | null>(null);

  async function run(draft: Parameters<typeof processMessage>[0], afterSuccess?: () => void) {
    setBusy(true);
    setError(null);
    const result = await processMessage(draft);
    setBusy(false);
    if (!result.ok) return setError(result.error);
    setLastMs(result.ms);
    afterSuccess?.();
  }

  const messages = [...state.messages].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Inbox</h1>
        <p className="text-sm text-zinc-500">Customer messages, and what the app did with each one.</p>
      </div>

      <ChannelBanner name="Telegram" status={channels.telegram} hint="Message your bot in Telegram." />
      <ChannelBanner name="WhatsApp" status={channels.whatsapp} hint="Message the business WhatsApp number." />
      {!channels.telegram.connected && !channels.whatsapp.connected && (
        <p className="rounded-xl bg-white p-3 text-xs text-zinc-500 shadow-sm">
          No messaging app is connected yet, so use the simulated messages or paste one below.
        </p>
      )}

      <DemoPanel state={state} busy={busy} onPlay={run} />

      <PasteBox state={state} now={now} busy={busy} onSend={run} />

      {busy && <p className="rounded-lg bg-white p-3 text-sm text-zinc-600 shadow-sm">Reading the message…</p>}
      {error && (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      )}
      {lastMs !== null && !busy && !error && <p className="px-1 text-xs text-zinc-500">Last message read in {(lastMs / 1000).toFixed(1)} s.</p>}

      <ul className="space-y-2">
        {messages.map((m) => (
          <MessageCard key={m.id} message={m} />
        ))}
      </ul>
    </div>
  );
}

function ChannelBanner({ name, status, hint }: { name: string; status: ChannelStatus; hint: string }) {
  if (!status.connected) return null;
  return (
    <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900 ring-1 ring-emerald-200">
      <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-600" aria-hidden="true" />
      <span>
        <strong>{name} connected.</strong> {hint} New messages arrive here by themselves within a few seconds.
        {status.error && <span className="block text-red-700">Waiting to retry: {status.error}</span>}
      </span>
    </p>
  );
}

function DemoPanel({
  state,
  busy,
  onPlay,
}: {
  state: AppState;
  busy: boolean;
  onPlay: (draft: Parameters<typeof processMessage>[0], afterSuccess?: () => void) => void;
}) {
  const script = demoScript(state.seededFor);
  const next = script[state.demoCursor];
  const now = nowOf();
  const nextName = next ? findCustomer(state, next.phone)?.name ?? `Unknown number` : null;

  function play() {
    if (!next) return;
    // The message arrives right now, so the real cutoffs apply (a lunch skip after 10 am is late).
    const receivedAt = new Date().toISOString();
    onPlay({ phone: next.phone, receivedAt, text: next.text, image: scriptImage(next, receivedAt) }, () =>
      updateState((s) => ({ ...s, demoCursor: s.demoCursor + 1 })),
    );
  }

  return (
    <section className="rounded-xl bg-amber-50 p-4 shadow-sm ring-1 ring-amber-200">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-amber-900">Simulated WhatsApp</h2>
        <span className="text-xs text-amber-900">
          {formatDay(istDate(now))}, {formatTime(now)}
        </span>
      </div>
      <p className="mt-1 text-xs text-amber-900">Sample customer messages. Each one arrives at the real current time.</p>
      {next ? (
        <>
          <p className="mt-2 text-xs text-amber-900">
            Next ({state.demoCursor + 1} of {script.length}) · {nextName}
          </p>
          <p className="text-sm italic text-zinc-800">“{next.text}”{next.screenshot && " + screenshot"}</p>
          <p className="mt-0.5 text-xs text-amber-800">Shows: {next.shows}</p>
          <button
            type="button"
            onClick={play}
            disabled={busy}
            className="mt-2 w-full rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:bg-zinc-300"
          >
            ▶ Play next message
          </button>
        </>
      ) : (
        <p className="mt-2 text-sm text-amber-900">All {script.length} sample messages played.</p>
      )}
      <div className="mt-2 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => window.confirm("Reset the sample data? Everything you changed will be cleared.") && resetDemo()}
          className="ml-auto rounded-md border border-amber-300 bg-white px-2 py-1 text-amber-900"
        >
          Reset demo
        </button>
      </div>
    </section>
  );
}

function PasteBox({
  state,
  now,
  busy,
  onSend,
}: {
  state: AppState;
  now: string;
  busy: boolean;
  onSend: (draft: Parameters<typeof processMessage>[0], afterSuccess?: () => void) => void;
}) {
  const [from, setFrom] = useState("");
  const [text, setText] = useState("");
  const [image, setImage] = useState<string | undefined>();
  const [fileKey, setFileKey] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);

  // "From" accepts a customer's name or any phone number.
  const byName = state.customers.find((c) => c.name.toLowerCase() === from.trim().toLowerCase());
  const phone = byName?.phone ?? from.replace(/\D/g, "").slice(-10);

  function send() {
    if (phone.length !== 10) return setProblem("Choose a customer, or type a 10-digit phone number.");
    if (!text.trim() && !image) return setProblem("Paste the message text or add a screenshot.");
    setProblem(null);
    onSend({ phone, receivedAt: now, text: text.trim(), image }, () => {
      setText("");
      setImage(undefined);
      setFileKey((k) => k + 1);
    });
  }

  const input = "w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-emerald-600";
  return (
    <section className="space-y-2 rounded-xl bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-800">Paste a WhatsApp message</h2>
      <input value={from} onChange={(e) => setFrom(e.target.value)} list="inbox-customers" placeholder="From: customer name or phone" className={input} />
      <datalist id="inbox-customers">
        {state.customers.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} placeholder="kal lunch nahi chahiye" className={input} />
      <label className="block text-xs text-zinc-600">
        Payment screenshot (optional)
        <input
          key={fileKey}
          type="file"
          accept="image/*"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            setImage(file ? await readFile(file) : undefined);
          }}
          className="mt-1 block w-full text-xs"
        />
      </label>
      {problem && <p className="text-xs text-red-700">{problem}</p>}
      <button
        type="button"
        onClick={send}
        disabled={busy}
        className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:bg-zinc-300"
      >
        Read message
      </button>
      <p className="text-[11px] text-zinc-500">Arrives at the current time ({formatTime(now)}).</p>
    </section>
  );
}

const OUTCOME_STYLE: Record<Outcome["status"], { label: string; className: string }> = {
  applied: { label: "Done", className: "bg-emerald-100 text-emerald-800" },
  attention: { label: "Needs you", className: "bg-amber-100 text-amber-800" },
  ignored: { label: "No change", className: "bg-zinc-100 text-zinc-600" },
};

function MessageCard({ message }: { message: Message }) {
  const [big, setBig] = useState(false);
  return (
    <li className="rounded-xl bg-white p-3 shadow-sm">
      <div className="flex justify-between gap-2 text-sm">
        <span className="font-semibold text-zinc-900">
          {message.senderName ?? `Unknown ${contactLabel(message.phone)}`}
          {!message.senderName && message.profileName && <span className="font-normal text-zinc-500"> ({message.profileName})</span>}
          {message.source === "whatsapp" && (
            <span className="ml-1.5 rounded bg-emerald-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-emerald-800">WhatsApp</span>
          )}
          {message.source === "telegram" && (
            <span className="ml-1.5 rounded bg-sky-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold text-sky-800">Telegram</span>
          )}
        </span>
        <span className="shrink-0 text-xs text-zinc-500">
          {formatDay(istDate(message.receivedAt))}, {formatTime(message.receivedAt)}
        </span>
      </div>
      <div className="mt-1 flex gap-2">
        {message.image && (
          <button type="button" onClick={() => setBig(!big)} aria-label={big ? "Show smaller" : "Show screenshot larger"} className="shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element -- data URLs, not optimisable */}
            <img src={message.image} alt="Screenshot sent with the message" className={`rounded border border-zinc-200 ${big ? "w-48" : "h-16 w-10 object-cover"}`} />
          </button>
        )}
        {message.text && (
          <p className="rounded-2xl rounded-tl-sm bg-[#e3f6d8] px-3 py-2 text-sm text-zinc-900 shadow-[0_1px_0_rgb(0_0_0/0.06)]">{message.text}</p>
        )}
      </div>
      {message.summary && (
        <p className="mt-1.5 text-xs text-zinc-500">
          AI: {message.summary}
          {message.aiMs !== undefined && ` · ${(message.aiMs / 1000).toFixed(1)} s`}
        </p>
      )}
      <ul className="mt-1.5 space-y-1">
        {message.outcomes.map((o) => (
          <li key={o.id} className="text-xs">
            <span className={`mr-1.5 rounded-full px-1.5 py-0.5 font-medium ${OUTCOME_STYLE[o.status].className}`}>
              {o.resolution === "approved" ? "Approved" : o.resolution === "dismissed" ? "Handled" : OUTCOME_STYLE[o.status].label}
            </span>
            <span className="text-zinc-800">{o.summary}</span>
            {o.reason && !o.resolution && <span className="block pl-1 text-amber-800">{o.reason}</span>}
          </li>
        ))}
      </ul>
    </li>
  );
}
