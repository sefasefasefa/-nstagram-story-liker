/**
 * Automatic session management.
 * - On server startup: load saved credentials and login.
 * - On 401 from Instagram: silently re-login and signal caller to retry.
 * - Prevents concurrent refreshes (one-at-a-time lock).
 */
import { instagramLogin } from "./auth.js";
import { isSessionActive } from "./session.js";
import { loadCredentials, hasCredentials } from "./credentials.js";
import { logger } from "./logger.js";

interface AutoSessionState {
  lastRefreshAt: string | null;
  lastRefreshSuccess: boolean;
  refreshCount: number;
  error: string | null;
}

const state: AutoSessionState = {
  lastRefreshAt: null,
  lastRefreshSuccess: false,
  refreshCount: 0,
  error: null,
};

// Prevents multiple simultaneous refresh calls
let refreshPromise: Promise<boolean> | null = null;

export async function attemptAutoRefresh(): Promise<boolean> {
  if (!hasCredentials()) return false;

  // If already refreshing, wait for that one
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const creds = loadCredentials();
      if (!creds) return false;

      logger.info("Auto-session: refreshing expired session…");
      const result = await instagramLogin(creds.username, creds.password);

      state.lastRefreshAt = new Date().toISOString();
      state.lastRefreshSuccess = result.success;
      state.refreshCount++;

      if (result.success) {
        logger.info({ username: creds.username }, "Auto-session: session refreshed successfully");
        state.error = null;
        return true;
      } else {
        logger.warn({ error: result.error }, "Auto-session: refresh failed");
        state.error = result.error ?? "Unknown error";
        return false;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      state.error = msg;
      logger.error({ err }, "Auto-session: refresh threw an exception");
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

export async function initAutoSession(): Promise<void> {
  if (!hasCredentials()) {
    logger.info("Auto-session: no saved credentials — manual login required");
    return;
  }
  if (isSessionActive()) return;

  logger.info("Auto-session: logging in with saved credentials…");
  await attemptAutoRefresh();
}

export function getAutoSessionStatus() {
  return {
    hasCredentials: hasCredentials(),
    isSessionActive: isSessionActive(),
    lastRefreshAt: state.lastRefreshAt,
    lastRefreshSuccess: state.lastRefreshSuccess,
    refreshCount: state.refreshCount,
    error: state.error,
  };
}
