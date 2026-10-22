import { demoState } from "./demo/seed";
import type { AppState } from "./state";

// The whole app state lives in this browser's localStorage. React reads it through
// useSyncExternalStore(subscribe, getState, getServerState).
const STORAGE_KEY = "tiffin-tracker:state:v2";

let cachedRaw: string | null = null;
let cached: AppState | null = null;
let serverState: AppState | null = null;
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
    return value && value.version === 2 && Array.isArray(value.customers) ? (value as AppState) : null;
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
  if (!cached) cached = demoState();
  return cached;
}

// The first render (on the server and while the page loads) uses the demo data.
export function getServerState(): AppState {
  if (!serverState) serverState = demoState();
  return serverState;
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
  cached = next;
  cachedRaw = JSON.stringify(next);
  try {
    window.localStorage.setItem(STORAGE_KEY, cachedRaw);
  } catch {
    // Still works for this visit; it just won't survive a reload.
  }
  listeners.forEach((listener) => listener());
}

export function updateState(change: (state: AppState) => AppState): void {
  setState(change(getState()));
}

export function resetDemo(): void {
  setState(demoState());
}
