// Simple in-memory session store (no localStorage — blocked in sandbox)
// Survives page navigation but not page refresh

const store: Record<string, string> = {};

export function setSessionValue(key: string, value: string) {
  store[key] = value;
}

export function getSessionValue(key: string): string {
  return store[key] || "";
}
