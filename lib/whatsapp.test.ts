import { createHmac } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

// Outside a real Next.js server there's no request to wait for.
vi.mock("next/server", () => ({ connection: async () => {} }));
import { GET as inboxGET } from "../app/api/inbox/route";
import { GET as verifyGET, POST as webhookPOST } from "../app/api/whatsapp/route";
import { clearMemoryMailbox } from "./mailbox";
import { isValidSignature, parseWebhook } from "./whatsapp";

const SECRET = "test-app-secret";

function webhook(messages: object[], contacts: object[] = []) {
  return {
    object: "whatsapp_business_account",
    entry: [{ id: "WABA", changes: [{ field: "messages", value: { messaging_product: "whatsapp", contacts, messages } }] }],
  };
}

const textMessage = (id: string, body: string) => ({ from: "919845011111", id, timestamp: "1792646400", type: "text", text: { body } });

function signedPost(body: object, secret = SECRET) {
  const raw = JSON.stringify(body);
  const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  return new Request("http://localhost/api/whatsapp", { method: "POST", body: raw, headers: { "x-hub-signature-256": signature } });
}

describe("parseWebhook", () => {
  it("reads text messages with the sender's name and time", () => {
    const [m] = parseWebhook(webhook([textMessage("wamid.1", "kal lunch nahi chahiye")], [{ wa_id: "919845011111", profile: { name: "Priya" } }]));
    expect(m).toEqual({ id: "wamid.1", from: "919845011111", profileName: "Priya", receivedAt: new Date(1792646400 * 1000).toISOString(), text: "kal lunch nahi chahiye" });
  });

  it("reads photos with their caption and media ID", () => {
    const [m] = parseWebhook(webhook([{ from: "919845011111", id: "wamid.2", timestamp: "1792646400", type: "image", image: { id: "MEDIA1", caption: "paid ✅", mime_type: "image/jpeg" } }]));
    expect(m).toMatchObject({ text: "paid ✅", mediaId: "MEDIA1" });
  });

  it("keeps a note for voice messages and ignores status updates", () => {
    expect(parseWebhook(webhook([{ from: "91", id: "wamid.3", timestamp: "1", type: "audio" }]))[0].text).toMatch(/audio message/);
    expect(parseWebhook({ entry: [{ changes: [{ value: { statuses: [{ id: "x" }] } }] }] })).toEqual([]);
    expect(parseWebhook(null)).toEqual([]);
  });
});

describe("isValidSignature", () => {
  it("accepts Meta's signature and rejects anything else", () => {
    const raw = '{"a":1}';
    const good = `sha256=${createHmac("sha256", SECRET).update(raw).digest("hex")}`;
    expect(isValidSignature(raw, good, SECRET)).toBe(true);
    expect(isValidSignature(raw + " ", good, SECRET)).toBe(false);
    expect(isValidSignature(raw, good, "other-secret")).toBe(false);
    expect(isValidSignature(raw, null, SECRET)).toBe(false);
  });
});

describe("webhook routes", () => {
  const saved = { ...process.env };
  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = SECRET;
    process.env.WHATSAPP_VERIFY_TOKEN = "my-verify-word";
    delete process.env.WHATSAPP_ACCESS_TOKEN;
    delete process.env.KV_REST_API_URL;
    delete process.env.UPSTASH_REDIS_REST_URL;
    clearMemoryMailbox();
  });
  afterAll(() => {
    process.env = saved;
  });

  it("answers Meta's verification check only with the right word", async () => {
    const ok = await verifyGET(new Request("http://localhost/api/whatsapp?hub.mode=subscribe&hub.verify_token=my-verify-word&hub.challenge=12345"));
    expect(ok.status).toBe(200);
    expect(await ok.text()).toBe("12345");
    const bad = await verifyGET(new Request("http://localhost/api/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345"));
    expect(bad.status).toBe(403);
  });

  it("puts signed messages in the mailbox once, even if Meta repeats them", async () => {
    expect((await webhookPOST(signedPost(webhook([textMessage("wamid.10", "aaj lunch nahi chahiye")])))).status).toBe(200);
    expect((await webhookPOST(signedPost(webhook([textMessage("wamid.10", "aaj lunch nahi chahiye")])))).status).toBe(200);

    const res = await inboxGET(new Request("http://localhost/api/inbox?after=0"));
    const data = await res.json();
    expect(data.connected).toBe(true);
    expect(data.messages).toHaveLength(1);
    expect(data.messages[0]).toMatchObject({ id: "wamid.10", from: "919845011111", text: "aaj lunch nahi chahiye" });
    expect(data.next).toBe(1);

    const later = await (await inboxGET(new Request("http://localhost/api/inbox?after=1"))).json();
    expect(later.messages).toHaveLength(0);
  });

  it("rejects messages that weren't signed by Meta", async () => {
    const res = await webhookPOST(signedPost(webhook([textMessage("wamid.11", "hi")]), "attacker-secret"));
    expect(res.status).toBe(401);
    const data = await (await inboxGET(new Request("http://localhost/api/inbox?after=0"))).json();
    expect(data.messages).toHaveLength(0);
  });

  it("reports not connected when WhatsApp isn't set up", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const data = await (await inboxGET(new Request("http://localhost/api/inbox"))).json();
    expect(data).toMatchObject({ connected: false, messages: [] });
  });
});
