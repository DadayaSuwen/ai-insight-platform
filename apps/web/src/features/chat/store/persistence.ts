import type { ChatSession } from "../../../types/chat";

const KEY_SESSIONS = "aiip.chat.sessions.v1";
const KEY_CURRENT = "aiip.chat.currentSessionId.v1";
const KEY_SIDEBAR = "aiip.chat.sidebarOpen.v1";
const KEY_SIDEBAR_COLLAPSED = "aiip.chat.sidebarCollapsed.v1";

const isBrowser = () => typeof window !== "undefined";

/** Read cached sessions from localStorage; returns [] on miss / parse error. */
export function loadSessions(): ChatSession[] {
  if (!isBrowser()) return [];
  try {
    const raw = localStorage.getItem(KEY_SESSIONS);
    return raw ? (JSON.parse(raw) as ChatSession[]) : [];
  } catch {
    return [];
  }
}

export function saveSessions(s: ChatSession[]): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(KEY_SESSIONS, JSON.stringify(s));
  } catch {
    // ignore quota / serialization errors
  }
}

export function loadCurrentSessionId(): string | null {
  if (!isBrowser()) return null;
  return localStorage.getItem(KEY_CURRENT);
}

export function saveCurrentSessionId(id: string | null): void {
  if (!isBrowser()) return;
  if (id) localStorage.setItem(KEY_CURRENT, id);
  else localStorage.removeItem(KEY_CURRENT);
}

export function loadSidebarOpen(): boolean {
  if (!isBrowser()) return false;
  const raw = localStorage.getItem(KEY_SIDEBAR);
  return raw === "1";
}

export function saveSidebarOpen(b: boolean): void {
  if (!isBrowser()) return;
  localStorage.setItem(KEY_SIDEBAR, b ? "1" : "0");
}

export function loadSidebarCollapsed(): boolean {
  if (!isBrowser()) return false;
  return localStorage.getItem(KEY_SIDEBAR_COLLAPSED) === "1";
}

export function saveSidebarCollapsed(b: boolean): void {
  if (!isBrowser()) return;
  localStorage.setItem(KEY_SIDEBAR_COLLAPSED, b ? "1" : "0");
}

/** Drop a stale currentSessionId that is no longer in the known session list. */
export function pruneMissingSessionId(
  id: string | null,
  sessions: ChatSession[],
): string | null {
  if (!id) return null;
  return sessions.some((s) => s.id === id) ? id : null;
}
