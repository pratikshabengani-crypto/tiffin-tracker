import { TELEGRAM_PREFIX } from "./contact";
import type { MailboxMessage } from "./mailbox";

// Reading messages sent to the Telegram bot (server side only). The app asks
// Telegram for new messages ("getUpdates"), so no webhook or database is needed.

const API = "https://api.telegram.org";

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id: number;
    date: number;
    from?: { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string };
    text?: string;
    caption?: string;
    photo?: { file_id: string; file_size?: number }[];
  };
};

export type TelegramMessage = MailboxMessage & { photoFileId?: string };

// Turns Telegram updates into messages. Commands like /start and messages from bots are skipped.
export function parseUpdates(updates: TelegramUpdate[]): TelegramMessage[] {
  const messages: TelegramMessage[] = [];
  for (const update of updates) {
    const m = update.message;
    if (!m?.from || m.from.is_bot) continue;
    const text = m.text ?? m.caption ?? "";
    if (text.startsWith("/")) continue;
    const photo = m.photo?.at(-1); // Telegram lists sizes smallest first
    if (!text && !photo) continue;
    messages.push({
      id: `tg-${update.update_id}`,
      from: `${TELEGRAM_PREFIX}${m.from.id}`,
      profileName: [m.from.first_name, m.from.last_name].filter(Boolean).join(" ") || m.from.username,
      receivedAt: new Date(m.date * 1000).toISOString(),
      text: text || (photo ? "(photo)" : ""),
      photoFileId: photo?.file_id,
    });
  }
  return messages;
}

// New messages since `offset`. Asking with a higher offset tells Telegram the earlier ones were handled.
export async function getUpdates(token: string, offset: number): Promise<{ messages: TelegramMessage[]; next: number }> {
  const url = `${API}/bot${token}/getUpdates?offset=${offset}&timeout=0&allowed_updates=${encodeURIComponent('["message"]')}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  const data = (await res.json()) as { ok: boolean; result?: TelegramUpdate[]; description?: string };
  if (!data.ok) throw new Error(data.description ?? `Telegram error ${res.status}`);
  const updates = data.result ?? [];
  const next = updates.length > 0 ? updates[updates.length - 1].update_id + 1 : offset;
  return { messages: parseUpdates(updates), next };
}

// Downloads a photo the customer sent, as a data URL the AI can read.
export async function downloadPhoto(token: string, fileId: string): Promise<string | undefined> {
  const info = await fetch(`${API}/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`, { signal: AbortSignal.timeout(8000) });
  const data = (await info.json()) as { ok: boolean; result?: { file_path?: string; file_size?: number } };
  if (!data.ok || !data.result?.file_path) return undefined;
  if ((data.result.file_size ?? 0) > 2_000_000) return undefined;
  const file = await fetch(`${API}/file/bot${token}/${data.result.file_path}`, { signal: AbortSignal.timeout(8000) });
  if (!file.ok) return undefined;
  const bytes = Buffer.from(await file.arrayBuffer());
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}
