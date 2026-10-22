import { connection } from "next/server";
import { downloadPhoto, getUpdates } from "@/lib/telegram";

// GET /api/telegram?offset=123 → new messages sent to the Telegram bot.
// Setting: TELEGRAM_BOT_TOKEN (from @BotFather), in .env.local and in Vercel.
export async function GET(request: Request) {
  await connection(); // always answer fresh, never a copy made at build time
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return Response.json({ connected: false, messages: [], next: 0 });

  const offset = Number(new URL(request.url).searchParams.get("offset") ?? 0);
  try {
    const { messages, next } = await getUpdates(token, Number.isFinite(offset) ? offset : 0);
    const withPhotos = await Promise.all(
      messages.map(async ({ photoFileId, ...m }) => ({
        ...m,
        image: photoFileId ? await downloadPhoto(token, photoFileId).catch(() => undefined) : undefined,
      })),
    );
    return Response.json({ connected: true, messages: withPhotos, next });
  } catch (error) {
    console.error("[telegram] couldn't get messages", error);
    return Response.json({ error: "Couldn't check Telegram for messages." }, { status: 502 });
  }
}
