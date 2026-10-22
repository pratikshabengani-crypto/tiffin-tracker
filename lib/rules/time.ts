import type { Meal } from "../types";

// India has no daylight saving, so a fixed +5:30 offset is exact.
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function parts(date: string): [number, number, number] {
  const [y, m, d] = date.split("-").map(Number);
  return [y, m - 1, d];
}

// The India calendar date (YYYY-MM-DD) of a moment in time.
export function istDate(instant: Date | string): string {
  return new Date(new Date(instant).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

// The India-time hour (0-23) of a moment.
export function istHour(instant: Date | string): number {
  return new Date(new Date(instant).getTime() + IST_OFFSET_MS).getUTCHours();
}

// The moment that is hh:mm India time on the given date.
export function istInstant(date: string, hours: number, minutes = 0): Date {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m, d, hours, minutes) - IST_OFFSET_MS);
}

export function addDays(date: string, days: number): string {
  const [y, m, d] = parts(date);
  return new Date(Date.UTC(y, m, d + days)).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  const [y1, m1, d1] = parts(from);
  const [y2, m2, d2] = parts(to);
  return Math.round((Date.UTC(y2, m2, d2) - Date.UTC(y1, m1, d1)) / DAY_MS);
}

// Every date from `from` to `to`, both included.
export function dateRange(from: string, to: string): string[] {
  const days: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) days.push(date);
  return days;
}

// Last moment to skip, order or cancel a meal.
export function cutoffFor(meal: Meal, date: string): Date {
  if (meal === "breakfast") return istInstant(addDays(date, -1), 22); // 10 pm the day before
  if (meal === "lunch") return istInstant(date, 10); // 10 am
  return istInstant(date, 17); // 5 pm
}

export function isOnTime(meal: Meal, date: string, requestedAt: string | Date): boolean {
  return new Date(requestedAt).getTime() <= cutoffFor(meal, date).getTime();
}

// After this the meal has been delivered: it's owed and its price is locked.
const SERVED_BY: Record<Meal, number> = { breakfast: 10, lunch: 15, dinner: 22 };

export function servedAt(meal: Meal, date: string): Date {
  return istInstant(date, SERVED_BY[meal]);
}

const dayFormat = new Intl.DateTimeFormat("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat("en-IN", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata" });

// "Thu, 22 Oct"
export function formatDay(date: string): string {
  const [y, m, d] = parts(date);
  return dayFormat.format(new Date(Date.UTC(y, m, d)));
}

// "8:04 pm"
export function formatTime(instant: Date | string): string {
  return timeFormat.format(new Date(instant)).toLowerCase();
}
