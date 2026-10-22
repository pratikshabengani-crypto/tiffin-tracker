// The "mailbox" where WhatsApp messages wait until the owner's app picks them up.
// Uses Upstash Redis (added from Vercel → Storage). Without it, falls back to memory,
// which is fine on your computer but not on Vercel.

export type MailboxMessage = {
  id: string;
  from: string;
  profileName?: string;
  receivedAt: string;
  text: string;
  image?: string;
};

const LIST = "tiffin:whatsapp:messages";
const SEEN = "tiffin:whatsapp:seen";

const memory = { list: [] as string[], seen: new Set<string>() };

function redisConfig() {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function hasStorage(): boolean {
  return redisConfig() !== null;
}

async function redis(command: (string | number)[]): Promise<unknown> {
  const config = redisConfig()!;
  const res = await fetch(config.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.token}` },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`Redis error ${res.status}`);
  return ((await res.json()) as { result: unknown }).result;
}

// Adds a message unless it's already there (Meta sometimes sends the same webhook twice).
export async function addToMailbox(message: MailboxMessage): Promise<boolean> {
  if (!redisConfig()) {
    if (memory.seen.has(message.id)) return false;
    memory.seen.add(message.id);
    memory.list.push(JSON.stringify(message));
    return true;
  }
  const isNew = (await redis(["SADD", SEEN, message.id])) === 1;
  if (isNew) await redis(["RPUSH", LIST, JSON.stringify(message)]);
  return isNew;
}

// Messages from position `after` onwards, plus the position to ask for next time.
export async function readMailbox(after: number): Promise<{ messages: MailboxMessage[]; next: number }> {
  const start = Math.max(0, Math.floor(after));
  const raw = redisConfig() ? ((await redis(["LRANGE", LIST, start, -1])) as string[]) : memory.list.slice(start);
  return { messages: raw.map((r) => JSON.parse(r) as MailboxMessage), next: start + raw.length };
}

// For tests only.
export function clearMemoryMailbox(): void {
  memory.list = [];
  memory.seen.clear();
}
