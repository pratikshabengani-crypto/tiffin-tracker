"use client";

import { useState } from "react";
import { contactLabel } from "@/lib/contact";
import { formatDay, formatTime, istDate } from "@/lib/rules/time";
import type { AppState, Message, Outcome } from "@/lib/state";
import { resetDemo } from "@/lib/store";

export type ChannelStatus = { connected: boolean; error?: string };
export type Channels = { whatsapp: ChannelStatus; telegram: ChannelStatus };

export default function InboxTab({ state, channels }: { state: AppState; channels: Channels }) {
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
          No messaging app is connected yet. Add your Telegram bot token to start receiving messages.
        </p>
      )}

      {messages.length === 0 && <p className="px-1 text-sm text-zinc-500">No messages yet.</p>}
      <ul className="space-y-2">
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
