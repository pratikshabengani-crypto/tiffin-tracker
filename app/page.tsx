"use client";

import { useState, useSyncExternalStore } from "react";
import InboxTab from "@/components/InboxTab";
import MonthlyTab from "@/components/MonthlyTab";
import PaymentsScreen from "@/components/PaymentsScreen";
import SingleTab from "@/components/SingleTab";
import TodayTab from "@/components/TodayTab";
import { getServerState, getState, subscribe } from "@/lib/store";

type Tab = "today" | "monthly" | "single" | "inbox";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z" },
  { id: "monthly", label: "Monthly", icon: "M5 5h14v15H5zM5 9h14M9 3v4M15 3v4" },
  { id: "single", label: "Single", icon: "M6 4h12v16l-3-2-3 2-3-2-3 2zM9 9h6M9 13h6" },
  { id: "inbox", label: "Inbox", icon: "M4 6h16v12H4zM4 7l8 6 8-6" },
];

export default function Home() {
  const state = useSyncExternalStore(subscribe, getState, getServerState);
  const [tab, setTab] = useState<Tab>("today");
  // The Payments screen opens on top of a tab; Back returns to that tab.
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const openPayments = () => {
    setPaymentsOpen(true);
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-full flex-1 bg-zinc-100 text-zinc-900">
      <main className="mx-auto max-w-md px-4 pb-24 pt-4">
        {paymentsOpen ? (
          <PaymentsScreen state={state} onBack={() => setPaymentsOpen(false)} />
        ) : (
          <>
            {tab === "today" && <TodayTab state={state} onOpenPayments={openPayments} />}
            {tab === "monthly" && <MonthlyTab state={state} />}
            {tab === "single" && <SingleTab state={state} onOpenPayments={openPayments} />}
            {tab === "inbox" && <InboxTab state={state} />}
          </>
        )}
      </main>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-md">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPaymentsOpen(false);
              }}
              aria-current={tab === t.id && !paymentsOpen ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs ${
                tab === t.id && !paymentsOpen ? "font-semibold text-emerald-700" : "text-zinc-500"
              }`}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}
