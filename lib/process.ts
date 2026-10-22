import { applyMessage, normalizePhone, senderContext } from "./applyMessage";
import { toSmallJpeg } from "./image";
import type { MailboxMessage } from "./mailbox";
import { istDate } from "./rules/time";
import { getState, updateState } from "./store";
import type { Understanding } from "./understandSchema";

export type IncomingDraft = {
  phone: string;
  receivedAt: string;
  text: string;
  image?: string;
  source?: "whatsapp" | "telegram";
  profileName?: string;
};

// Sends one WhatsApp message to the AI, then applies its answer with the rules.
// Runs in the browser; the AI call itself happens on the server.
export async function processMessage(draft: IncomingDraft): Promise<{ ok: true; ms: number } | { ok: false; error: string }> {
  let image: string | undefined;
  try {
    image = draft.image ? await toSmallJpeg(draft.image) : undefined;
  } catch {
    return { ok: false, error: "Couldn't read that image. Try a JPEG or PNG screenshot." };
  }

  const phone = normalizePhone(draft.phone);
  const sender = senderContext(getState(), phone, istDate(draft.receivedAt));

  let data: { understanding?: Understanding; elapsedMs?: number; error?: string };
  try {
    const res = await fetch("/api/understand", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: draft.text, image, receivedAt: draft.receivedAt, sender }),
    });
    data = await res.json();
    if (!res.ok || !data.understanding) return { ok: false, error: data.error ?? "Something went wrong. Please try again." };
  } catch {
    return { ok: false, error: "Couldn't reach the app's server. Check your internet connection." };
  }

  const id = `msg-${Date.now().toString(36)}`;
  const ms = data.elapsedMs ?? 0;
  updateState((s) => {
    const next = applyMessage(s, { id, phone, receivedAt: draft.receivedAt, text: draft.text, image }, data.understanding!);
    return {
      ...next,
      messages: next.messages.map((m) => (m.id === id ? { ...m, aiMs: ms, source: draft.source, profileName: draft.profileName } : m)),
    };
  });
  return { ok: true, ms };
}

let telegramPausedUntil = 0;

// Picks up messages sent to the Telegram bot and processes them in order.
// Telegram is only told a message is handled once it has been processed here.
export async function pullTelegram(): Promise<{ connected: boolean; processed: number; error?: string }> {
  if (Date.now() < telegramPausedUntil) return { connected: true, processed: 0 };

  const offset = getState().tgOffset ?? 0;
  let data: { connected?: boolean; messages?: MailboxMessage[]; next?: number; error?: string };
  try {
    const res = await fetch(`/api/telegram?offset=${offset}`);
    data = await res.json();
    if (!res.ok) throw new Error(data.error);
  } catch {
    telegramPausedUntil = Date.now() + 60_000;
    return { connected: true, processed: 0, error: "Couldn't check Telegram for messages." };
  }
  if (!data.connected) return { connected: false, processed: 0 };

  let processed = 0;
  for (const m of data.messages ?? []) {
    const result = await processMessage({ phone: m.from, receivedAt: m.receivedAt, text: m.text, image: m.image, source: "telegram", profileName: m.profileName });
    if (!result.ok) {
      // Ask again from this message next time.
      const updateId = Number(m.id.replace("tg-", ""));
      updateState((s) => ({ ...s, tgOffset: Math.max(s.tgOffset ?? 0, updateId) }));
      telegramPausedUntil = Date.now() + 60_000;
      return { connected: true, processed, error: result.error };
    }
    processed++;
  }
  // Everything handled (including skipped /start commands): move past them.
  if (data.next !== undefined && data.next > offset) updateState((s) => ({ ...s, tgOffset: data.next }));
  return { connected: true, processed };
}

let pausedUntil = 0;

// Picks up real WhatsApp messages waiting in the mailbox and processes them in order.
// Called every few seconds. If something fails (e.g. the AI key isn't set), it waits a
// minute before trying again, and the message stays in the mailbox until it works.
export async function pullWhatsApp(): Promise<{ connected: boolean; processed: number; error?: string }> {
  if (Date.now() < pausedUntil) return { connected: true, processed: 0 };

  let data: { connected?: boolean; messages?: MailboxMessage[]; error?: string };
  try {
    const res = await fetch(`/api/inbox?after=${getState().waCursor ?? 0}`);
    data = await res.json();
    if (!res.ok) throw new Error(data.error);
  } catch {
    pausedUntil = Date.now() + 60_000;
    return { connected: true, processed: 0, error: "Couldn't check for WhatsApp messages." };
  }
  if (!data.connected) return { connected: false, processed: 0 };

  let processed = 0;
  for (const m of data.messages ?? []) {
    const result = await processMessage({ phone: m.from, receivedAt: m.receivedAt, text: m.text, image: m.image, source: "whatsapp", profileName: m.profileName });
    if (!result.ok) {
      pausedUntil = Date.now() + 60_000;
      return { connected: true, processed, error: result.error };
    }
    updateState((s) => ({ ...s, waCursor: (s.waCursor ?? 0) + 1 }));
    processed++;
  }
  return { connected: true, processed };
}
