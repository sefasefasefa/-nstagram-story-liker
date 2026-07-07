/**
 * Instagram checkpoint / challenge handler.
 *
 * When Instagram returns a checkpoint_url on login we:
 *  1. Save the cookies + URL from that failed login attempt.
 *  2. GET the challenge page and parse what verification method is available.
 *  3. POST to request a code via SMS or email.
 *  4. POST the user-supplied code to complete verification.
 *
 * Supports both the legacy /challenge/ flow and the newer /auth_platform/ flow.
 */

import { logger } from "./logger.js";
import { finalizeSession } from "./auth-shared.js";
import type { LoginResult } from "./auth-types.js";

const IG_WEB_BASE = "https://www.instagram.com";

// ── State ─────────────────────────────────────────────────────────────────────

export interface CheckpointState {
  checkpointUrl: string;       // as returned by Instagram (may be relative)
  cookies: string[];           // Set-Cookie values from the failed login response
  csrfToken: string;
  username: string;
  // Populated after startChallenge():
  challengeUrl?: string;       // absolute URL to POST the code/choice to
  verifyMethod?: "sms" | "email" | "unknown";
  contact?: string;            // masked phone/email shown to user
}

let pending: CheckpointState | null = null;

export function setPendingCheckpoint(state: CheckpointState): void {
  pending = state;
}

export function getPendingCheckpoint(): CheckpointState | null {
  return pending;
}

export function clearPendingCheckpoint(): void {
  pending = null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function cookieStrFrom(cookies: string[]): string {
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

function getSetCookies(headers: Headers): string[] {
  if (typeof (headers as any).getSetCookie === "function") {
    return (headers as any).getSetCookie() as string[];
  }
  const out: string[] = [];
  headers.forEach((val, key) => {
    if (key.toLowerCase() === "set-cookie") {
      out.push(...val.split(/,\s*(?=[A-Za-z0-9_-]+=)/));
    }
  });
  return out;
}

function mergeCookies(base: string[], incoming: string[]): string[] {
  const map = new Map<string, string>();
  for (const c of [...base, ...incoming]) {
    const key = c.split("=")[0].trim();
    map.set(key, c);
  }
  return Array.from(map.values());
}

function absoluteUrl(path: string): string {
  return path.startsWith("http") ? path : `${IG_WEB_BASE}${path}`;
}

// Shared request headers for challenge navigation
function challengeHeaders(cookieStr: string, csrfToken: string, extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "Cache-Control": "no-cache",
    Pragma: "no-cache",
    "X-CSRFToken": csrfToken,
    "X-IG-App-ID": "936619743392459",
    "X-Requested-With": "XMLHttpRequest",
    Cookie: cookieStr,
    Origin: IG_WEB_BASE,
    Referer: IG_WEB_BASE + "/",
    ...extra,
  };
}

// ── Parse challenge page ───────────────────────────────────────────────────────

interface ChallengeInfo {
  challengeUrl: string;
  method: "sms" | "email" | "unknown";
  contact?: string;
}

/**
 * GET the checkpoint URL and extract what we need to proceed.
 * Works for both /challenge/ and /auth_platform/ pages.
 */
async function parseChallengeUrl(state: CheckpointState): Promise<ChallengeInfo> {
  const url = absoluteUrl(state.checkpointUrl);
  const cookieStr = cookieStrFrom(state.cookies);

  let html = "";
  try {
    const resp = await fetch(url, {
      headers: challengeHeaders(cookieStr, state.csrfToken, {
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Site": "none",
      }),
      redirect: "follow",
    });
    const newCookies = getSetCookies(resp.headers);
    if (newCookies.length) {
      state.cookies = mergeCookies(state.cookies, newCookies);
    }
    // Also update csrf if a new one arrives
    for (const c of newCookies) {
      const m = c.match(/csrftoken=([^;]+)/);
      if (m) state.csrfToken = m[1];
    }
    html = await resp.text();
    logger.debug({ url, status: resp.status, len: html.length }, "checkpoint: fetched challenge page");
  } catch (err) {
    logger.warn({ err }, "checkpoint: failed to fetch challenge page");
    // Fall back to /challenge/ path even without parsing
    return { challengeUrl: `${IG_WEB_BASE}/challenge/`, method: "unknown" };
  }

  // Detect the challenge action URL
  // auth_platform pages embed it in JS, challenge pages have it in a <form>
  const actionMatch =
    html.match(/["']\/challenge\/action\/[^"']*["']/) ||
    html.match(/action="(\/challenge\/[^"]+)"/) ||
    html.match(/["'](\/challenge\/[a-zA-Z0-9_\-/]+\/)["']/);

  const challengeUrl = actionMatch
    ? absoluteUrl(actionMatch[0].replace(/^["']|["']$/g, ""))
    : `${IG_WEB_BASE}/challenge/`;

  // Detect method + contact
  let method: "sms" | "email" | "unknown" = "unknown";
  let contact: string | undefined;

  const phoneMatch =
    html.match(/"phone_number"\s*:\s*"([^"]+)"/) ||
    html.match(/\+[\d*\s]+[\d]{2}/) ||
    html.match(/obfuscated[Pp]hone[^"]*"([^"]+)"/);
  const emailMatch =
    html.match(/"email"\s*:\s*"([^@"]+@[^"]+)"/) ||
    html.match(/[a-z*]+@[a-z*]+\.[a-z]+/) ||
    html.match(/obfuscated[Ee]mail[^"]*"([^"]+)"/);

  if (phoneMatch) {
    method = "sms";
    contact = phoneMatch[1] ?? phoneMatch[0];
  } else if (emailMatch) {
    method = "email";
    contact = emailMatch[1] ?? emailMatch[0];
  }

  // Also check for choice options in JSON embedded in page
  if (method === "unknown") {
    if (html.includes("phone") || html.includes("sms") || html.includes("SMS")) method = "sms";
    else if (html.includes("email") || html.includes("Email")) method = "email";
  }

  logger.info({ challengeUrl, method, contact }, "checkpoint: parsed challenge page");
  return { challengeUrl, method, contact };
}

// ── Public API ─────────────────────────────────────────────────────────────────

export interface StartChallengeResult {
  success: boolean;
  method?: "sms" | "email" | "unknown";
  contact?: string;
  error?: string;
}

/**
 * Navigate to the checkpoint URL, figure out the verification method,
 * and request that a code be sent to the user's phone/email.
 */
export async function startCheckpointChallenge(): Promise<StartChallengeResult> {
  if (!pending) return { success: false, error: "No pending checkpoint" };

  const info = await parseChallengeUrl(pending);
  pending.challengeUrl = info.challengeUrl;
  pending.verifyMethod = info.method;
  pending.contact = info.contact;

  const cookieStr = cookieStrFrom(pending.cookies);

  // POST to request the code — try choice=1 (SMS) then choice=0 (email)
  const choices = info.method === "email" ? ["0", "1"] : ["1", "0"];
  for (const choice of choices) {
    try {
      const resp = await fetch(info.challengeUrl, {
        method: "POST",
        headers: {
          ...challengeHeaders(cookieStr, pending.csrfToken, {
            "Content-Type": "application/x-www-form-urlencoded",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Site": "same-origin",
          }),
        },
        body: new URLSearchParams({ choice }).toString(),
      });
      const newCookies = getSetCookies(resp.headers);
      if (newCookies.length) {
        pending.cookies = mergeCookies(pending.cookies, newCookies);
        for (const c of newCookies) {
          const m = c.match(/csrftoken=([^;]+)/);
          if (m) pending.csrfToken = m[1];
        }
      }
      const text = await resp.text().catch(() => "");
      logger.info({ choice, status: resp.status, preview: text.slice(0, 200) }, "checkpoint: choice POST");

      if (resp.ok || text.includes("ok") || text.includes("sent") || text.includes("CHALLENGE")) {
        if (choice === "1") { pending.verifyMethod = "sms"; }
        if (choice === "0") { pending.verifyMethod = "email"; }
        return {
          success: true,
          method: pending.verifyMethod,
          contact: pending.contact,
        };
      }
    } catch (err) {
      logger.warn({ err, choice }, "checkpoint: choice POST failed");
    }
  }

  // Even if we couldn't confirm the request was sent, let the user try entering a code
  return {
    success: true,
    method: pending.verifyMethod ?? "unknown",
    contact: pending.contact,
  };
}

export interface VerifyCodeResult {
  success: boolean;
  error?: string;
  errorType?: string;
}

/**
 * Submit the user-entered 6-digit code to Instagram.
 */
export async function verifyCheckpointCode(code: string): Promise<LoginResult> {
  if (!pending) {
    return { success: false, error: "No pending checkpoint", errorType: "no_checkpoint" };
  }

  const { challengeUrl, cookies, csrfToken, username } = pending;
  const url = challengeUrl ?? `${IG_WEB_BASE}/challenge/`;
  const cookieStr = cookieStrFrom(cookies);

  let resp: Response;
  try {
    resp = await fetch(url, {
      method: "POST",
      headers: {
        ...challengeHeaders(cookieStr, csrfToken, {
          "Content-Type": "application/x-www-form-urlencoded",
          "Sec-Fetch-Mode": "cors",
          "Sec-Fetch-Dest": "empty",
          "Sec-Fetch-Site": "same-origin",
        }),
      },
      body: new URLSearchParams({ security_code: code }).toString(),
    });
  } catch (err) {
    return { success: false, error: `Network error: ${String(err)}`, errorType: "network" };
  }

  const newCookies = getSetCookies(resp.headers);
  const merged = mergeCookies(cookies, newCookies);
  const text = await resp.text().catch(() => "");
  logger.info({ status: resp.status, preview: text.slice(0, 300) }, "checkpoint: verify response");

  // Try to parse JSON result
  let data: any = {};
  try { data = JSON.parse(text); } catch { /* HTML response — check cookies */ }

  // Success indicators
  const hasSessionCookie = merged.some((c) => c.startsWith("sessionid=") && !c.includes("sessionid=;"));
  const isAuthenticated =
    data.authenticated === true ||
    data.status === "ok" ||
    data.action === "LOGGED_IN" ||
    hasSessionCookie;

  if (!isAuthenticated) {
    const errMsg = data.message ?? data.errors?.nonce?.[0] ?? "Invalid code or code expired";
    return { success: false, error: errMsg, errorType: "bad_code" };
  }

  // Extract session
  let sessionId = "";
  let newCsrf = csrfToken;
  let userId = "";
  for (const c of merged) {
    const sid = c.match(/sessionid=([^;]+)/); if (sid) sessionId = sid[1];
    const csrf = c.match(/csrftoken=([^;]+)/); if (csrf) newCsrf = csrf[1];
    const ds = c.match(/ds_user_id=([^;]+)/); if (ds) userId = ds[1];
  }

  if (!sessionId) {
    return { success: false, error: "Code accepted but no session cookie received", errorType: "no_session" };
  }

  clearPendingCheckpoint();
  return await finalizeSession({ sessionId, csrfToken: newCsrf, userId, username });
}
