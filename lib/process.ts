import { applyMessage, normalizePhone, senderContext } from "./applyMessage";
import { toSmallJpeg } from "./image";
import { istDate } from "./rules/time";
import { getState, updateState } from "./store";
import type { Understanding } from "./understandSchema";

export type IncomingDraft = { phone: string; receivedAt: string; text: string; image?: string };

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
    return { ...next, messages: next.messages.map((m) => (m.id === id ? { ...m, aiMs: ms } : m)) };
  });
  return { ok: true, ms };
}
