import { SESSION_RESUME_STORAGE_KEY } from '@/lib/constants';
import type { SessionSettings } from '@/types/session';

/**
 * Persist session settings to localStorage.
 * Silently ignores storage errors (private browsing, quota exceeded).
 */
export function saveSession(settings: SessionSettings): void {
  try {
    localStorage.setItem(SESSION_RESUME_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // Ignore — private browsing or quota exceeded
  }
}

/**
 * Load session settings from localStorage.
 * Returns null if nothing is saved or the data is unreadable.
 */
export function loadSession(): SessionSettings | null {
  try {
    const raw = localStorage.getItem(SESSION_RESUME_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionSettings) : null;
  } catch {
    return null;
  }
}

/**
 * Remove the saved session from localStorage.
 */
export function clearSession(): void {
  try {
    localStorage.removeItem(SESSION_RESUME_STORAGE_KEY);
  } catch {
    // Ignore
  }
}
