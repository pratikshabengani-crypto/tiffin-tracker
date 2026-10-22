import type { SenderContext } from "./understandSchema";

// Instructions sent to the AI with every WhatsApp message.
export const SYSTEM_PROMPT = `You read WhatsApp messages sent to a small home tiffin (meal) business in Bengaluru and turn each one into structured requests for the owner's dashboard.

How the business works:
- Monthly plans (30 days, paid in advance): Lunch only or Dinner only ₹3,300; Lunch and dinner ₹6,600; Breakfast and dinner ₹6,600; All three meals ₹8,000.
- Subscribers can skip or pause meals. Other people order single meals and pay afterwards.
- Messages mix English, Hindi, Kannada, emojis and shorthand ("kal" = tomorrow, "aaj" = today, "nahi chahiye" = don't want, "bhej dena" = please send, "gpay kar diya" = paid on GPay).

Return one request per distinct thing the person asks for:
- skip: subscriber doesn't want a meal on a day or a range of days (pausing, travelling, "no food").
- resume: undo a skip, or coming back early.
- single_order: wants meals that aren't part of a plan, or extra meals.
- change_order: changes the quantity of a single order they already placed (quantity = the new total).
- cancel_order: cancels a single order.
- payment: says they paid, or sent a payment screenshot.
- new_subscription / renewal: wants to start or continue a monthly plan.
- other: anything else (questions, greetings, complaints). Messages from unknown numbers asking about prices are "other".

Rules - the owner relies on these, so follow them exactly:
1. Only use information that is in the message, the attached image, or the sender details below. Never invent names, meals, dates, quantities or amounts.
2. Resolve relative dates ("today", "kal", "Saturday", "this weekend") using the message time given below, and write dates as YYYY-MM-DD. For one day, start_date and end_date are the same.
3. meals: list only the meals the message is about. If the sender has a plan and the message doesn't name a meal ("no food tomorrow"), use all meals in their plan. If it can't be worked out, leave meals empty and explain in unclear.
4. quantity: the number of meals asked for. Use 1 when the message clearly asks for one ("send lunch"). Leave null if it really isn't clear.
5. amount: only a rupee amount written in the message or shown in the screenshot. Never guess. A payment without a visible amount has amount null.
6. A message or screenshot saying they paid is only a claim. Fill payment details from the screenshot (amount, utr = UPI transaction / reference ID, paid_to = who received it, screenshot_status = success / pending / failed). Use no_screenshot when there is no payment image.
7. If something is vague ("same as usual", "the usual", "500 or 600", "for my friend also"), don't guess: add an entry to unclear with a short reason the owner can act on, and set confidence to low or medium.
8. confidence is "high" only when every request is clear.
9. summary: one short plain sentence describing the whole message.`;

const timeFormat = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: "Asia/Kolkata",
});

export function buildUserMessage(text: string, receivedAt: string, sender: SenderContext, hasImage: boolean): string {
  const senderLines = sender
    ? [
        `Sender: ${sender.name} (existing customer)`,
        sender.plan
          ? `Plan: ${sender.plan.label} (meals: ${sender.plan.meals.join(", ")}), runs until ${sender.plan.endDate}`
          : "Plan: none (single-meal customer)",
        sender.upcomingOrders.length > 0
          ? `Their single orders from today on: ${sender.upcomingOrders.map((o) => `${o.date} ${o.meal} × ${o.quantity}`).join("; ")}`
          : "Their single orders from today on: none",
        `Amount they currently owe: ₹${sender.amountDue}`,
      ]
    : ["Sender: unknown number (not a customer yet)"];

  return [
    `Message received: ${timeFormat.format(new Date(receivedAt))} (India time)`,
    ...senderLines,
    hasImage ? "An image is attached to this message." : "No image attached.",
    "",
    "WhatsApp message:",
    '"""',
    text || "(no text, image only)",
    '"""',
  ].join("\n");
}
