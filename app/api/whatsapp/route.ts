import { addToMailbox } from "@/lib/mailbox";
import { downloadMedia, isValidSignature, parseWebhook } from "@/lib/whatsapp";

// The webhook address Meta calls: https://<your-site>/api/whatsapp
//
// Settings (Vercel → Settings → Environment Variables):
//   WHATSAPP_VERIFY_TOKEN   a password you make up; type the same one into Meta's webhook form
//   WHATSAPP_APP_SECRET     Meta app → App settings → Basic → App secret
//   WHATSAPP_ACCESS_TOKEN   Meta app → WhatsApp → API Setup → access token (to download photos)

// Meta checks the address once, when you save the webhook in its dashboard.
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const expected = process.env.WHATSAPP_VERIFY_TOKEN;
  if (expected && params.get("hub.mode") === "subscribe" && params.get("hub.verify_token") === expected) {
    return new Response(params.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Verification failed", { status: 403 });
}

// Every customer message arrives here.
export async function POST(request: Request) {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret) {
    console.error("[whatsapp] WHATSAPP_APP_SECRET is not set");
    return new Response("Not configured", { status: 500 });
  }

  const raw = await request.text();
  if (!isValidSignature(raw, request.headers.get("x-hub-signature-256"), secret)) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  for (const message of parseWebhook(body)) {
    const image = message.mediaId && token ? await downloadMedia(message.mediaId, token).catch(() => undefined) : undefined;
    const added = await addToMailbox({
      id: message.id,
      from: message.from,
      profileName: message.profileName,
      receivedAt: message.receivedAt,
      text: message.text || (message.mediaId ? "(photo)" : ""),
      image,
    });
    console.log(`[whatsapp] ${added ? "new" : "repeat"} message ${message.id}${image ? " with photo" : ""}`);
  }

  // Meta only needs a 200 to know it was received.
  return new Response("ok", { status: 200 });
}
