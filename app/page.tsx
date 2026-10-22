"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import InboxTab, { type WhatsAppStatus } from "@/components/InboxTab";
import MonthlyTab from "@/components/MonthlyTab";
import PaymentsScreen from "@/components/PaymentsScreen";
import SingleTab from "@/components/SingleTab";
import TodayTab from "@/components/TodayTab";
import { BUSINESS_NAME } from "@/lib/reminders";
import { pullWhatsApp } from "@/lib/process";
import { getState, subscribe } from "@/lib/store";

type Tab = "today" | "monthly" | "single" | "inbox";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Today", icon: "M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 100 8 4 4 0 000-8z" },
  { id: "monthly", label: "Monthly", icon: "M5 5h14v15H5zM5 9h14M9 3v4M15 3v4" },
  { id: "single", label: "Single", icon: "M6 4h12v16l-3-2-3 2-3-2-3 2zM9 9h6M9 13h6" },
  { id: "inbox", label: "Inbox", icon: "M5 5h14a1 1 0 011 1v9a1 1 0 01-1 1H10l-5 4v-4a1 1 0 01-1-1V6a1 1 0 011-1zM8 9.5h8M8 12.5h5" },
];

// The dashboard depends on the real current time and data saved in this browser,
// so it's drawn in the browser; the pre-built page is only a loading shell.
const noSubscription = () => () => {};

export default function Home() {
  const inBrowser = useSyncExternalStore(noSubscription, () => true, () => false);
  if (!inBrowser) {
    return (
      <div className="min-h-full flex-1 bg-zinc-100 text-zinc-900">
        <AppHeader />
        <p className="mx-auto max-w-md px-4 pt-6 text-sm text-zinc-500">Loading today&apos;s dashboard…</p>
      </div>
    );
  }
  return <Dashboard />;
}

function AppHeader() {
  return (
    <header className="bg-emerald-800 text-white">
      <div className="mx-auto flex max-w-md items-center gap-2.5 px-4 py-3">
        <TiffinLogo />
        <div className="leading-tight">
          <div className="text-base font-bold tracking-tight">Tiffin Tracker</div>
          <div className="text-[11px] text-emerald-100">{BUSINESS_NAME}</div>
        </div>
      </div>
    </header>
  );
}

function Dashboard() {
  const state = useSyncExternalStore(subscribe, getState, getState);
  const [tab, setTab] = useState<Tab>("today");

  // Redraw every 30 s so the clock, counts and "Locked" cutoffs follow the real time.
  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(timer);
  }, []);

  // Every 8 s, pick up any real WhatsApp messages waiting in the mailbox.
  const [whatsapp, setWhatsapp] = useState<WhatsAppStatus>({ connected: false });
  useEffect(() => {
    let running = false;
    const check = async () => {
      if (running) return;
      running = true;
      try {
        const result = await pullWhatsApp();
        setWhatsapp({ connected: result.connected, error: result.error });
      } finally {
        running = false;
      }
    };
    void check();
    const timer = setInterval(check, 8_000);
    return () => clearInterval(timer);
  }, []);
  // The Payments screen opens on top of a tab; Back returns to that tab.
  const [paymentsOpen, setPaymentsOpen] = useState(false);
  const openPayments = () => {
    setPaymentsOpen(true);
    window.scrollTo(0, 0);
  };

  return (
    <div className="min-h-full flex-1 bg-zinc-100 text-zinc-900">
      <AppHeader />
      <main className="mx-auto max-w-md px-4 pb-28 pt-4">
        {paymentsOpen ? (
          <PaymentsScreen state={state} onBack={() => setPaymentsOpen(false)} />
        ) : (
          <>
            {tab === "today" && <TodayTab state={state} onOpenPayments={openPayments} />}
            {tab === "monthly" && <MonthlyTab state={state} />}
            {tab === "single" && <SingleTab state={state} onOpenPayments={openPayments} />}
            {tab === "inbox" && <InboxTab state={state} whatsapp={whatsapp} />}
          </>
        )}
      </main>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto flex max-w-md px-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPaymentsOpen(false);
              }}
              aria-current={tab === t.id && !paymentsOpen ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 pb-2 pt-1.5 text-[11px] ${
                tab === t.id && !paymentsOpen ? "font-semibold text-emerald-800" : "text-zinc-500"
              }`}
            >
              <span
                className={`flex h-8 w-14 items-center justify-center rounded-full transition-colors ${
                  tab === t.id && !paymentsOpen ? "bg-emerald-100" : ""
                }`}
              >
                <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={t.icon} />
                </svg>
              </span>
              {t.label}
            </button>
          ))}
        </div>
      </nav>
    </div>
  );
}

// A stacked tiffin carrier.
function TiffinLogo() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-200 text-emerald-900" aria-hidden="true">
      <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 6V4.5a4 4 0 018 0V6" />
        <rect x="5" y="6" width="14" height="4.5" rx="1.5" />
        <rect x="5" y="10.5" width="14" height="4.5" rx="1.5" />
        <rect x="5" y="15" width="14" height="4.5" rx="1.5" />
      </svg>
    </span>
  );
}
