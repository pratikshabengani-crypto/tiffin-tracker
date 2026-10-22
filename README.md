# Tiffin Tracker

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
