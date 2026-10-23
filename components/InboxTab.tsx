"use client";

import { useState } from "react";
import { contactLabel } from "@/lib/contact";
import { formatDay, formatTime, istDate } from "@/lib/rules/time";
import { setSettled } from "@/lib/actions";
import { isSettled, type AppState, type Message, type Outcome, type Resolution } from "@/lib/state";
import { resetDemo, updateState } from "@/lib/store";

export type ChannelStatus = { connected: boolean; error?: string };
export type Channels = { whatsapp: ChannelStatus; telegram: ChannelStatus };

export default function InboxTab({ state, channels }: { state: AppState; channels: Channels }) {
  const [view, setView] = useState<"open" | "settled">("open");
  const sorted = [...state.messages].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
  const open = sorted.filter((m) => !isSettled(m));
  const messages = view === "open" ? open : sorted.filter(isSettled);
  const tabs = [
    { id: "open" as const, label: `Not settled · ${open.length}` },
    { id: "settled" as const, label: `Settled · ${sorted.length - open.length}` },
  ];

  return (
    <div className="space-y-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-zinc-900">Inbox</h1>
        <p className="text-sm text-zinc-500">Customer messages, and what the app did with each one.</p>
      </div>

      <ChannelProblem name="Telegram" status={channels.telegram} />
      <ChannelProblem name="WhatsApp" status={channels.whatsapp} />
      {!channels.telegram.connected && !channels.whatsapp.connected && (
        <p className="rounded-xl bg-white p-3 text-xs text-zinc-500 shadow-sm">
          No messaging app is connected yet. Add your Telegram bot token to start receiving messages.
        </p>
      )}

      <div className="flex gap-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setView(tab.id)}
            aria-pressed={view === tab.id}
            className={`rounded-full px-3 py-1.5 text-xs font-medium ${
              view === tab.id ? "bg-emerald-700 text-white" : "bg-white text-zinc-700 ring-1 ring-zinc-200"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {messages.length === 0 && (
        <p className="px-1 text-sm text-zinc-500">{view === "open" ? "Nothing waiting for you." : "No settled messages yet."}</p>
      )}
      <ul className="space-y-2 lg:grid lg:grid-cols-2 lg:items-start lg:gap-3 lg:space-y-0">
        {messages.map((m) => (
          <MessageCard key={m.id} message={m} />
        ))}
      </ul>

      <div className="pt-2 text-center">
        <button
          type="button"
          onClick={() => window.confirm("Reset the sample data? Everything you changed will be cleared.") && resetDemo()}
          className="text-xs text-zinc-500 underline hover:text-zinc-700"
        >
          Reset demo data
        </button>
      </div>
    </div>
  );
}

// Only shown when a connected messaging app has a problem (e.g. the AI couldn't read a message).
function ChannelProblem({ name, status }: { name: string; status: ChannelStatus }) {
  if (!status.connected || !status.error) return null;
  return (
    <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
      {name}: {status.error} Retrying in a minute.
    </p>
  );
}

const OUTCOME_STYLE: Record<Outcome["status"], { label: string; className: string }> = {
  applied: { label: "Done", className: "bg-emerald-100 text-emerald-800" },
  attention: { label: "Needs you", className: "bg-amber-100 text-amber-800" },
  ignored: { label: "No change", className: "bg-zinc-100 text-zinc-600" },
};

const RESOLUTION_LABEL: Record<Resolution, string> = {
  approved: "Approved",
  dismissed: "Handled",
  settled: "Settled",
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
      <select
        value={isSettled(message) ? "settled" : "open"}
        onChange={(e) => updateState((s) => setSettled(s, message.id, e.target.value === "settled"))}
        aria-label="Settled or not"
        className={`mt-2 rounded-lg border px-2 py-1 text-xs font-medium ${
          isSettled(message) ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-amber-200 bg-amber-50 text-amber-800"
        }`}
      >
        <option value="open">Not settled</option>
        <option value="settled">Settled</option>
      </select>
      <ul className="mt-1.5 space-y-1">
        {message.outcomes.map((o) => (
          <li key={o.id} className="text-xs">
            <span className={`mr-1.5 rounded-full px-1.5 py-0.5 font-medium ${OUTCOME_STYLE[o.status].className}`}>
              {o.resolution ? RESOLUTION_LABEL[o.resolution] : OUTCOME_STYLE[o.status].label}
            </span>
            <span className="text-zinc-800">{o.summary}</span>
            {o.reason && !o.resolution && <span className="block pl-1 text-amber-800">{o.reason}</span>}
          </li>
        ))}
      </ul>
    </li>
  );
}
