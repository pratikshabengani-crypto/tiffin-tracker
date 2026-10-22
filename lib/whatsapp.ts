import { createHmac, timingSafeEqual } from "node:crypto";

// Reading Meta's WhatsApp Cloud API webhooks (server side only).

export type IncomingWhatsApp = {
  id: string; // WhatsApp message ID (used to ignore repeats)
  from: string; // sender's number with country code, e.g. 919876543210
  profileName?: string; // the sender's WhatsApp display name
  receivedAt: string; // ISO time
  text: string;
  mediaId?: string; // an attached image, downloaded separately
};

type WebhookMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; caption?: string };
};

type WebhookBody = {
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: WebhookMessage[];
      };
    }[];
  }[];
};

// Pulls the customer messages out of a webhook. Status updates and other events are ignored.
export function parseWebhook(body: unknown): IncomingWhatsApp[] {
  const result: IncomingWhatsApp[] = [];
  for (const entry of (body as WebhookBody)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const names = new Map((value?.contacts ?? []).map((c) => [c.wa_id, c.profile?.name]));
      for (const m of value?.messages ?? []) {
        if (!m.id || !m.from) continue;
        const seconds = Number(m.timestamp);
        const receivedAt = Number.isFinite(seconds) && seconds > 0 ? new Date(seconds * 1000).toISOString() : new Date().toISOString();
        const base = { id: m.id, from: m.from, profileName: names.get(m.from) ?? undefined, receivedAt };

        if (m.type === "text") result.push({ ...base, text: m.text?.body ?? "" });
        else if (m.type === "image") result.push({ ...base, text: m.image?.caption ?? "", mediaId: m.image?.id });
        // Voice notes, stickers etc.: keep a note so the owner knows to check WhatsApp.
        else result.push({ ...base, text: `(${m.type ?? "unknown"} message: open WhatsApp to see it)` });
      }
    }
  }
  return result;
}

// Meta signs every webhook with the app secret; reject anything that doesn't match.
export function isValidSignature(rawBody: string, header: string | null, appSecret: string): boolean {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const given = header.slice("sha256=".length);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given, "utf8"), Buffer.from(expected, "utf8"));
}

const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION ?? "v24.0";

// Downloads an image the customer sent, as a data URL the AI can read.
export async function downloadMedia(mediaId: string, accessToken: string): Promise<string | undefined> {
  const auth = { Authorization: `Bearer ${accessToken}` };
  const info = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}`, { headers: auth, signal: AbortSignal.timeout(8000) });
  if (!info.ok) return undefined;
  const { url, mime_type } = (await info.json()) as { url?: string; mime_type?: string };
  if (!url) return undefined;
  const file = await fetch(url, { headers: auth, signal: AbortSignal.timeout(8000) });
  if (!file.ok) return undefined;
  const type = mime_type ?? file.headers.get("content-type") ?? "image/jpeg";
  if (!/^image\/(jpeg|png|webp)$/.test(type)) return undefined;
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length > 2_000_000) return undefined; // too big to store; owner can check WhatsApp
  return `data:${type};base64,${bytes.toString("base64")}`;
}
