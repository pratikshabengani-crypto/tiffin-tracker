# Khana Khata

A phone dashboard for a small home tiffin (meal) business in Bengaluru. Customers send WhatsApp messages like *"kal lunch nahi chahiye"* or a payment screenshot; an AI reads each one and the dashboard updates itself: meals to cook today, monthly subscribers' calendars, single-meal orders and who still owes money. The owner only handles the few things that need a human.

## What's in it

- **Today**: breakfast / lunch / dinner counts, changes today, "Needs your attention", money to collect, tomorrow's single-meal prices.
- **Monthly**: ~110 subscribers grouped by plan, with a calendar per person (🟢 eating, 🔴 skipped in time, 🟠 skipped late) and up to 5 carry-forwards per meal.
- **Single**: single-meal orders by day, with a running account (khata) per customer.
- **Payments**: 🔵 screenshots to check, 🟡 "says paid", 🔴 no payment yet, 🟢 paid. Nothing counts as received until the owner taps ✓. One-tap WhatsApp reminders she sends herself.
- **Inbox**: every message, what the AI understood and what changed. A demo feed plays 15 messages through a day.

## How the "brain" works

1. **AI understands** (`app/api/understand/route.ts`): Gemini Flash (via OpenRouter) fills in a fixed form for each message: skip, pause, order, payment, renewal… It never invents details and flags anything vague.
2. **Rules decide** (`lib/applyMessage.ts`, `lib/rules/`): plain code applies the owner's rules (cutoffs: breakfast 10 pm the day before, lunch 10 am, dinner 5 pm; 30-day plans; 5 carry-forwards per meal; payments only on her confirmation).
3. **Screens calculate** everything from stored facts, so the numbers can't disagree with each other.

## Run it locally

```bash
npm install
npm run dev
```

Create `.env.local` (never committed) with an OpenRouter key:

```
OPENROUTER_API_KEY=your-key-here
```

Then open http://localhost:3000 and use **Inbox → Play next message**.

## Telegram connection (easiest live demo)

1. In Telegram, chat with **@BotFather**, send `/newbot`, and copy the token it gives you.
2. Add `TELEGRAM_BOT_TOKEN=<token>` to `.env.local` (and to Vercel → Settings → Environment Variables).
3. Restart the app. Anyone who messages the bot shows up in the Inbox within a few seconds.

The app asks Telegram for new messages every few seconds (`/api/telegram`), so no webhook or database is needed. Telegram doesn't share phone numbers, so the first message from a person shows as unknown; tap **Add as customer** once and they're recognised after that.

## WhatsApp connection (optional)

Real WhatsApp messages come in through Meta's WhatsApp Cloud API:

1. Meta sends each message to `/api/whatsapp` (the webhook). It checks Meta's signature, downloads any photo, and puts the message in a small mailbox (Upstash Redis).
2. The dashboard checks `/api/inbox` every few seconds and runs new messages through the same AI and rules as the simulated ones.

Settings (Vercel → Settings → Environment Variables):

| Name | Where it comes from |
|---|---|
| `WHATSAPP_VERIFY_TOKEN` | A password you make up; type the same one into Meta's webhook form |
| `WHATSAPP_APP_SECRET` | Meta app → App settings → Basic → App secret |
| `WHATSAPP_ACCESS_TOKEN` | Meta app → WhatsApp → API Setup → access token (needed for photos) |
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Added automatically when you connect Upstash Redis from Vercel → Storage |

Webhook URL for Meta: `https://<your-site>/api/whatsapp`, subscribed to the `messages` field.

## Tests

```bash
npm test
```

The live AI check (costs a little, needs the app running) is skipped unless you ask for it:

```powershell
$env:LIVE_AI='1'; npx vitest run lib/ai.live.test.ts
```

## Demo notes

- All customers, names, phone numbers and payment screenshots are made up. Screenshots are labelled "SAMPLE".
- Data is stored in the browser. A real version would use an online database and the official WhatsApp Business connection.
