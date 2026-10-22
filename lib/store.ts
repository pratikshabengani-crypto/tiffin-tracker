import { demoState } from "./demo/seed";
import { istDate } from "./rules/time";
import type { AppState } from "./state";

// The whole app state lives in this browser's localStorage. React reads it through
// useSyncExternalStore(subscribe, getState, getState).
const STORAGE_KEY = "tiffin-tracker:state:v2";

let cachedRaw: string | null = null;
let cached: AppState | null = null;
const listeners = new Set<() => void>();

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // private mode or blocked storage: fall back to memory
  }
}

function parse(raw: string): AppState | null {
  try {
    const value = JSON.parse(raw);
    return value && value.version === 3 && Array.isArray(value.customers) ? (value as AppState) : null;
  } catch {
    return null;
  }
}

export function getState(): AppState {
  const raw = readRaw();
  if (raw !== null && raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parse(raw);
  }
  // The sample data is built around one day; on a new day, rebuild it so "today" stays current.
  if (!cached || cached.seededFor !== istDate(new Date())) save(demoState());
  return cached!;
}

// Store without telling React (safe while React is reading the state).
function save(next: AppState): void {
  cached = next;
  cachedRaw = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  } catch {
    // Still works for this visit; it just won't survive a reload.
  }
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener); // changes from other tabs
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function setState(next: AppState): void {
  save(next);
  listeners.forEach((listener) => listener());
}

export function updateState(change: (state: AppState) => AppState): void {
  setState(change(getState()));
}

export function resetDemo(): void {
  setState(demoState());
}
