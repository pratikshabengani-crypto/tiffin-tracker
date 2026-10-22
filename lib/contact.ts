// How a customer is reached: a 10-digit Indian phone number (WhatsApp, paste box)
// or a Telegram account ("tg:123456789"), since Telegram doesn't share phone numbers.

export const TELEGRAM_PREFIX = "tg:";

export function isTelegram(contact: string): boolean {
  return contact.startsWith(TELEGRAM_PREFIX);
}

export function normalizePhone(contact: string): string {
  if (isTelegram(contact)) return contact;
  return contact.replace(/\D/g, "").slice(-10);
}

// "+91 98450 12345" or "Telegram user"
export function contactLabel(contact: string): string {
  return isTelegram(contact) ? "Telegram user" : `+91 ${contact}`;
}
