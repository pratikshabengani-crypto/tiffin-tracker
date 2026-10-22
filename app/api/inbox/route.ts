import { connection } from "next/server";
import { hasStorage, readMailbox } from "@/lib/mailbox";

// GET /api/inbox?after=12 → WhatsApp messages the app hasn't picked up yet.
export async function GET(request: Request) {
  await connection(); // always answer fresh, never a copy made at build time
  const connected = Boolean(process.env.WHATSAPP_APP_SECRET);
  if (!connected) return Response.json({ connected, messages: [], next: 0 });

  const after = Number(new URL(request.url).searchParams.get("after") ?? 0);
  try {
    const { messages, next } = await readMailbox(Number.isFinite(after) ? after : 0);
    return Response.json({ connected, storage: hasStorage(), messages, next });
  } catch (error) {
    console.error("[inbox] couldn't read the mailbox", error);
    return Response.json({ error: "Couldn't read WhatsApp messages." }, { status: 502 });
  }
}
