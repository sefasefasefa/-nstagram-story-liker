/**
 * Automatic session management — three-tier strategy:
 *
 *  Tier 1 · Token refresh  — POST /api/v1/accounts/token_refresh/
 *            Uses the existing sessionid to get a new token without a password.
 *            Tried first on every 401 and every proactive tick.
 *
 *  Tier 2 · CSRF refresh   — GET instagram.com (lightweight, updates csrftoken)
 *            Runs alongside Tier 1 to keep the CSRF cookie fresh.
 *
 *  Tier 3 · Full re-login  — POST /accounts/login/ajax/ (uses saved credentials)
 *            Only invoked when Tier 1 fails.  Password usage is minimised.
 *
 * Proactive timer: every REFRESH_INTERVAL_MS, Tier 1 runs.  Full re-login only
 * happens reactively (on 401 after Tier 1 fails) or at server start when there
 * is no active session.
 */

import { instagramLogin } from "./auth.js";
import { getSession, setSession, isSessionActive, buildInstagramHeaders } from "./session.js";
import { loadCredentials, hasCredentials } from "./credentials.js";
import { logger } from "./logger.js";

// ── Config ────────────────────────────────────────────────────────────────────

const IG_API_BASE = "https://i.instagram.com";
const IG_WEB_BASE = "https://www.instagram.com";

/** How often to proactively refresh the token (default: 25 minutes). */
const REFRESH_INTERVAL_MS = 25 * 60 * 1000;

// ── State ─────────────────────────────────────────────────────────────────────

interface AutoSessionState {
  lastRefreshAt: string | null;
  lastRefreshSuccess: boolean;
  lastRefreshMethod: "token_refresh" | "full_login" | null;
  refreshCount: number;
  tokenRefreshCount: number;
  fullLoginCount: number;
  error: string | null;
}

const state: AutoSessionState = {
  lastRefreshAt: null,
  lastRefreshSuccess: false,
  lastRefreshMethod: null,
  refreshCount: 0,
  tokenRefreshCount: 0,
  fullLoginCount: 0,
  error: null,
};

/** One-at-a-time lock: if a refresh is already in flight, callers await it. */
let refreshPromise: Promise<boolean> | null = null;

let proactiveTimer: ReturnType<typeof setInterval> | null = null;

// ── Tier 2: CSRF token refresh ────────────────────────────────────────────────

/**
 * Does a lightweight GET to instagram.com and picks up any new csrftoken from
 * Set-Cookie.  Non-throwing.
 */
async function refreshCsrf(): Promise<void> {
  const session = getSession();
  if (!session) return;
  try {
    const resp = await fetch(`${IG_WEB_BASE}/`, {
      headers: {
        ...buildInstagramHeaders(),
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
    });
    const cookies: string[] = [];
    resp.headers.forEach((val, key) => {
      if (key.toLowerCase() === "set-cookie") cookies.push(val);
    });
    for (const c of cookies) {
      const m = c.match(/csrftoken=([^;]+)/);
      if (m) {
        // Re-read the LATEST session (may have changed during the async fetch)
        const latest = getSession();
        if (latest && m[1] !== latest.csrfToken) {
          setSession({ ...latest, csrfToken: m[1] });
          logger.debug({ csrfToken: "***" + m[1].slice(-4) }, "Auto-session: CSRF token updated");
        }
        return;
      }
    }
  } catch {
    // best-effort, not critical
  }
}

// ── Tier 1: token refresh ─────────────────────────────────────────────────────

/**
 * Calls Instagram's token_refresh endpoint using the current sessionid.
 * Updates sessionid and/or csrftoken from Set-Cookie if returned.
 * Returns true on HTTP 200, false otherwise.
 */
async function tokenRefresh(): Promise<boolean> {
  const session = getSession();
  if (!session?.sessionId) return false;

  try {
    const resp = await fetch(`${IG_API_BASE}/api/v1/accounts/token_refresh/`, {
      method: "POST",
      headers: {
        ...buildInstagramHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
    });

    if (!resp.ok) {
      logger.debug({ status: resp.status }, "Auto-session: token_refresh returned non-200");
      state.error = `token_refresh HTTP ${resp.status}`;
      return false;
    }

    // Pick up any refreshed cookies
    const cookies: string[] = [];
    resp.headers.forEach((val, key) => {
      if (key.toLowerCase() === "set-cookie") cookies.push(val);
    });

    let newSession = { ...session };
    for (const c of cookies) {
      const sid = c.match(/sessionid=([^;]+)/);
      if (sid) newSession.sessionId = sid[1];
      const csrf = c.match(/csrftoken=([^;]+)/);
      if (csrf) newSession.csrfToken = csrf[1];
      const ds = c.match(/ds_user_id=([^;]+)/);
      if (ds) newSession.dsUserId = ds[1];
    }
    setSession(newSession);

    // Also refresh CSRF in the background (fire-and-forget)
    refreshCsrf().catch(() => {});

    state.lastRefreshAt = new Date().toISOString();
    state.lastRefreshSuccess = true;
    state.lastRefreshMethod = "token_refresh";
    state.refreshCount++;
    state.tokenRefreshCount++;
    state.error = null;

    logger.info({ tokenRefreshCount: state.tokenRefreshCount }, "Auto-session: token refreshed (no re-login needed)");
    return true;
  } catch (err) {
    logger.debug({ err }, "Auto-session: token_refresh threw");
    return false;
  }
}

// ── Tier 3: full re-login ─────────────────────────────────────────────────────

async function fullReLogin(): Promise<boolean> {
  if (!hasCredentials()) return false;
  const creds = loadCredentials();
  if (!creds) return false;

  logger.info("Auto-session: falling back to full re-login…");
  const result = await instagramLogin(creds.username, creds.password);

  state.lastRefreshAt = new Date().toISOString();
  state.lastRefreshSuccess = result.success;
  state.lastRefreshMethod = "full_login";
  state.refreshCount++;

  if (result.success) {
    state.fullLoginCount++;
    state.error = null;
    logger.info({ username: creds.username, fullLoginCount: state.fullLoginCount }, "Auto-session: full re-login succeeded");
    return true;
  } else {
    state.error = result.error ?? "Unknown error";
    logger.warn({ error: result.error }, "Auto-session: full re-login failed");
    return false;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Called when a 401 is received from Instagram.
 * Tries Tier 1 (token_refresh) first; falls back to Tier 3 (full re-login).
 * Thread-safe: concurrent callers share a single in-flight promise.
 */
export async function attemptAutoRefresh(): Promise<boolean> {
  if (!isSessionActive() && !hasCredentials()) return false;

  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      // Tier 1
      if (isSessionActive()) {
        const ok = await tokenRefresh();
        if (ok) return true;
      }
      // Tier 3 (Tier 2 is embedded inside tokenRefresh on success)
      return await fullReLogin();
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/**
 * Proactive tick: refresh every REFRESH_INTERVAL_MS without waiting for a 401.
 * Shares the same in-flight lock as attemptAutoRefresh() to prevent races.
 */
async function proactiveTick(): Promise<void> {
  // If a reactive refresh is already running, skip this tick
  if (refreshPromise) return;

  refreshPromise = (async () => {
    try {
      if (!isSessionActive()) {
        if (hasCredentials()) await fullReLogin();
        return false;
      }
      // Tier 1 only — avoid using the password proactively
      const ok = await tokenRefresh();
      if (!ok) {
        logger.warn("Auto-session: proactive token_refresh failed; will retry next tick");
      }
      return ok;
    } finally {
      refreshPromise = null;
    }
  })();

  await refreshPromise;
}

/**
 * Called at server startup.  Restores the session from saved credentials if
 * not already active, then starts the proactive refresh timer.
 */
export async function initAutoSession(): Promise<void> {
  if (!hasCredentials()) {
    logger.info("Auto-session: no saved credentials — manual login required");
    return;
  }

  if (!isSessionActive()) {
    logger.info("Auto-session: logging in with saved credentials…");
    await fullReLogin();
  }

  startProactiveRefresh();
}

/**
 * Starts (or restarts) the proactive refresh interval.
 * Safe to call multiple times — clears any existing timer first.
 */
export function startProactiveRefresh(): void {
  if (proactiveTimer) clearInterval(proactiveTimer);
  proactiveTimer = setInterval(() => {
    proactiveTick().catch((err) => logger.warn({ err }, "Auto-session: proactive tick threw"));
  }, REFRESH_INTERVAL_MS);
  logger.info({ intervalMin: REFRESH_INTERVAL_MS / 60000 }, "Auto-session: proactive refresh timer started");
}

export function getAutoSessionStatus() {
  return {
    hasCredentials: hasCredentials(),
    isSessionActive: isSessionActive(),
    lastRefreshAt: state.lastRefreshAt,
    lastRefreshSuccess: state.lastRefreshSuccess,
    lastRefreshMethod: state.lastRefreshMethod,
    refreshCount: state.refreshCount,
    tokenRefreshCount: state.tokenRefreshCount,
    fullLoginCount: state.fullLoginCount,
    error: state.error,
  };
}
