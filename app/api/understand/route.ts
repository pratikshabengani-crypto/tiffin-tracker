import { z } from "zod";
import { buildUserMessage, SYSTEM_PROMPT } from "@/lib/prompt";
import { UnderstandingSchema, type SenderContext } from "@/lib/understandSchema";

// Gemini Flash, reached through OpenRouter's chat completions API.
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const MODEL = "google/gemini-3.8-flash";
const MAX_TEXT_LENGTH = 4000;
const MAX_IMAGE_LENGTH = 3_000_000; // ~2 MB image as a data URL
const TIMEOUT_MS = 20_000;
// The AI service is usually 3-5 s, but now and then one request stalls for 15 s.
// If there's no answer after this long, send a backup request and use whichever
// answers first.
const BACKUP_AFTER_MS = 6_000;

// The form the AI must fill in, as JSON Schema (generated from the zod schema).
const RESPONSE_FORMAT = {
  type: "json_schema",
  json_schema: {
    name: "tiffin_message",
    strict: true,
    schema: z.toJSONSchema(UnderstandingSchema),
  },
};

// POST /api/understand  { text, image?, receivedAt, sender }
// Runs on the server only, so the API key never reaches the browser.
export async function POST(request: Request) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return Response.json(
      { error: "The AI key is not set up. Add OPENROUTER_API_KEY to .env.local and restart the app." },
      { status: 500 },
    );
  }

  let body: { text?: unknown; image?: unknown; receivedAt?: unknown; sender?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid request." }, { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  const image = typeof body.image === "string" ? body.image : null;
  const receivedAt = typeof body.receivedAt === "string" && !Number.isNaN(Date.parse(body.receivedAt)) ? body.receivedAt : null;
  if (!text && !image) {
    return Response.json({ error: "The message is empty." }, { status: 400 });
  }
  if (!receivedAt) {
    return Response.json({ error: "The message time is missing." }, { status: 400 });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return Response.json({ error: "That message is too long. Paste one message at a time." }, { status: 400 });
  }
  if (image && (!/^data:image\/(jpeg|png|webp);base64,/.test(image) || image.length > MAX_IMAGE_LENGTH)) {
    return Response.json({ error: "The image must be a JPEG, PNG or WebP under 2 MB." }, { status: 400 });
  }
  const sender = (body.sender ?? null) as SenderContext;

  const userText = buildUserMessage(text, receivedAt, sender, image !== null);
  const requestBody = JSON.stringify({
    model: MODEL,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      {
        role: "user",
        content: image
          ? [
              { type: "text", text: userText },
              { type: "image_url", image_url: { url: image } },
            ]
          : userText,
      },
    ],
    response_format: RESPONSE_FORMAT,
    reasoning: { effort: "minimal" }, // short reading task: keep it fast
    // Only providers that honour the JSON schema, fastest first.
    provider: { require_parameters: true, sort: "latency" },
  });

  const started = Date.now();
  let answer: AttemptResult;
  try {
    answer = await withBackup((signal) => attempt(apiKey, requestBody, signal));
  } catch (error) {
    console.error(`[understand] failed after ${Date.now() - started}ms`, error);
    const timedOut = error instanceof AggregateError && error.errors.some((e) => e instanceof DOMException && e.name === "TimeoutError");
    if (timedOut) {
      return Response.json({ error: "The AI took too long to answer. Please try again." }, { status: 504 });
    }
    return Response.json({ error: "Couldn't reach the AI service. Check your internet connection." }, { status: 502 });
  }

  const elapsedMs = Date.now() - started;
  const { status, data, backup } = answer;

  if (status < 200 || status >= 300) {
    console.error(`[understand] HTTP ${status} after ${elapsedMs}ms`, JSON.stringify(data?.error ?? data));
    return Response.json({ error: errorMessage(status) }, { status: status === 429 ? 429 : 502 });
  }

  const choice = data?.choices?.[0];
  console.log(`[understand] ${elapsedMs}ms${backup ? " (backup request)" : ""} finish_reason=${choice?.finish_reason}`);

  let parsed: unknown;
  try {
    parsed = JSON.parse(choice?.message?.content ?? "");
  } catch {
    parsed = null;
  }
  const result = UnderstandingSchema.safeParse(parsed);
  if (!result.success) {
    console.error("[understand] answer did not match the schema", choice?.message?.content);
    return Response.json({ error: "The AI's answer could not be read. Please try again." }, { status: 502 });
  }

  return Response.json({ understanding: result.data, elapsedMs });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- OpenRouter's JSON, checked with zod afterwards
type AttemptResult = { status: number; data: any; backup?: boolean };

// One request to OpenRouter, with the response body fully read.
async function attempt(apiKey: string, body: string, signal: AbortSignal): Promise<AttemptResult> {
  const res = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "Khana Khata" },
    body,
    signal,
  });
  return { status: res.status, data: await res.json().catch(() => null) };
}

// Runs the request; if it hasn't answered after BACKUP_AFTER_MS (or fails fast),
// starts one backup and returns whichever finishes first. The loser is cancelled.
async function withBackup(run: (signal: AbortSignal) => Promise<AttemptResult>): Promise<AttemptResult> {
  const controllers: AbortController[] = [];
  const launch = () => {
    const controller = new AbortController();
    controllers.push(controller);
    return run(AbortSignal.any([controller.signal, AbortSignal.timeout(TIMEOUT_MS)]));
  };

  const first = launch();
  const backup = new Promise<AttemptResult>((resolve, reject) => {
    const startBackup = () => launch().then((r) => resolve({ ...r, backup: true }), reject);
    const timer = setTimeout(startBackup, BACKUP_AFTER_MS);
    first.then(
      () => clearTimeout(timer),
      () => {
        clearTimeout(timer);
        if (controllers.length === 1) startBackup();
      },
    );
  });

  try {
    return await Promise.any([first, backup]);
  } finally {
    controllers.forEach((c) => c.abort());
  }
}

function errorMessage(status: number): string {
  switch (status) {
    case 401:
      return "The AI key was rejected. Check OPENROUTER_API_KEY in .env.local.";
    case 402:
      return "Your OpenRouter account is out of credits. Add credits at openrouter.ai and try again.";
    case 404:
      return "Your OpenRouter key isn't allowed to use this AI model. Check the key's guardrail settings.";
    case 429:
      return "Too many requests to the AI right now. Wait a few seconds and try again.";
    default:
      return `The AI service returned an error (${status}). Please try again.`;
  }
}
