/**
 * Instagram authentication — three-path strategy (cheapest first):
 *
 *  Path 1 · Web endpoint + version-0 password  (www.instagram.com/accounts/login/ajax/)
 *            No public-key fetch needed — enc_password = #PWD_INSTAGRAM_BROWSER:0:{ts}:{pw}
 *            CSRF fetched from login page; rollout_hash extracted for X-Instagram-AJAX.
 *            If CSRF page is blocked, falls back to a random CSRF token (Instagram only
 *            validates that X-CSRFToken == csrftoken cookie, not the value itself).
 *
 *  Path 2 · Mobile private API + version-0 password  (i.instagram.com/api/v1/accounts/login/)
 *            Different endpoint, mobile UA, no IP-block on key fetch.
 *
 *  Path 3 · Web endpoint + full AES-256-GCM / SealedBox encryption  (fallback)
 *            Requires fetching Instagram's public key — blocked on most datacenter IPs.
 *
 * Only falls back to the next path on a network-level failure (couldn't reach Instagram).
 * If Instagram responded (any HTTP status, any JSON), that path's result is returned as-is.
 */

import { createCipheriv, randomBytes, randomUUID } from "crypto";
import _sodium from "libsodium-wrappers";
import { setSession, clearSession, getSession, buildInstagramHeaders } from "./session.js";
import { logger } from "./logger.js";
import { setPendingCheckpoint } from "./checkpoint.js";
import { finalizeSession } from "./auth-shared.js";
import type { LoginResult } from "./auth-types.js";

const IG_WEB_BASE = "https://www.instagram.com";
const IG_API_BASE = "https://i.instagram.com";

// ── Shared helpers ─────────────────────────────────────────────────────────────

function cookieStringFrom(cookies: string[]): string {
  return cookies.map((c) => c.split(";")[0]).join("; ");
}

function getSetCookies(headers: Headers): string[] {
  if (typeof (headers as any).getSetCookie === "function") {
    return (headers as any).getSetCookie() as string[];
  }
  const result: string[] = [];
  headers.forEach((val, key) => {
    if (key.toLowerCase() === "set-cookie") {
      result.push(...val.split(/,\s*(?=[A-Za-z0-9_-]+=)/));
    }
  });
  return result;
}

export type { LoginResult } from "./auth-types.js";

// ── CSRF + rollout_hash bootstrap ──────────────────────────────────────────────

interface CsrfBootstrap {
  csrfToken: string;
  cookies: string[];
  cookieStr: string;
  ajaxRev: string;         // X-Instagram-AJAX (rollout hash)
  publicKey?: string;      // base64 — embedded in login page HTML
  publicKeyId?: number;    // key_id — embedded in login page HTML
}

/**
 * Fetch Instagram's login page to obtain:
 *  - csrftoken cookie
 *  - rollout_hash (X-Instagram-AJAX)
 *  - any other initial cookies (mid, ig_did, …)
 *
 * All values fall back to safe defaults if the page is blocked so the login
 * attempt can still proceed.
 */
/**
 * Try several Instagram URLs to obtain an initial csrftoken cookie.
 * The /accounts/login/ page is often 429-rate-limited from datacenter IPs;
 * these alternatives are lighter and less aggressively rate-limited.
 */
async function fetchCsrfToken(): Promise<{ csrfToken: string; cookies: string[] }> {
  const CANDIDATE_URLS = [
    // Lightweight public pages that set csrftoken without triggering aggressive rate-limits
    `${IG_WEB_BASE}/`,
    `${IG_WEB_BASE}/accounts/login/`,
    `${IG_API_BASE}/api/v1/si/fetch_headers/?challenge_type=signup&guid=${randomUUID().replace(/-/g, "")}`,
  ];

  for (const url of CANDIDATE_URLS) {
    try {
      const resp = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Site": "none",
        },
        redirect: "follow",
      });
      const cookies = getSetCookies(resp.headers);
      for (const c of cookies) {
        const m = c.match(/csrftoken=([^;]+)/);
        if (m) {
          logger.debug({ url, csrfToken: m[1].slice(0, 8) + "…" }, "auth: got CSRF from URL");
          return { csrfToken: m[1], cookies };
        }
      }
    } catch { /* try next */ }
  }

  // All sources failed — generate a token and set it ourselves.
  // Instagram validates that X-CSRFToken == csrftoken cookie, not that the value
  // is server-issued, so a consistent self-generated pair still passes CSRF checks.
  const csrfToken = randomBytes(16).toString("hex");
  logger.debug({ csrfToken: csrfToken.slice(0, 8) + "…" }, "auth: using generated CSRF token");
  return { csrfToken, cookies: [`csrftoken=${csrfToken}`] };
}

async function fetchCsrfBootstrap(): Promise<CsrfBootstrap> {
  const ajaxRev = "1009848701"; // known-good fallback; Instagram accepts slightly stale values
  let publicKey: string | undefined;
  let publicKeyId: number | undefined;

  const { csrfToken, cookies } = await fetchCsrfToken();

  // Attempt to extract the public key from the login page HTML (best-effort; often 429).
  try {
    const resp = await fetch(`${IG_WEB_BASE}/accounts/login/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        Cookie: `csrftoken=${csrfToken}`,
      },
      redirect: "follow",
    });
    if (resp.ok) {
      const html = await resp.text();
      const pkMatch  = html.match(/"public_key"\s*:\s*"([A-Za-z0-9+/=]{20,})"/);
      const kidMatch = html.match(/"key_id"\s*:\s*"?(\d+)"?/);
      if (pkMatch)  publicKey   = pkMatch[1];
      if (kidMatch) publicKeyId = parseInt(kidMatch[1], 10);
    }
  } catch { /* best-effort — proceed without embedded key */ }

  if (!cookies.some((c) => c.startsWith("csrftoken="))) {
    cookies.push(`csrftoken=${csrfToken}`);
  }

  logger.debug({ csrfOk: !!csrfToken, publicKeyFound: !!publicKey }, "auth: bootstrap ready");
  return { csrfToken, cookies, cookieStr: cookieStringFrom(cookies), ajaxRev, publicKey, publicKeyId };
}

// ── Path 1: Web endpoint + version-0 password ──────────────────────────────────

/**
 * jazoest is a checksum Instagram uses to verify the CSRF token hasn't been tampered with.
 * Formula: "2" + sum_of_ascii_values_of_csrf_token
 */
function computeJazoest(csrfToken: string): string {
  const sum = csrfToken.split("").reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  return "2" + sum;
}

async function loginViaWebV0(username: string, password: string): Promise<LoginResult> {
  const { csrfToken, cookies, cookieStr, ajaxRev } = await fetchCsrfBootstrap();
  const timestamp = Math.floor(Date.now() / 1000);
  // Version 0: plaintext password — no public-key fetch needed
  const encPassword = `#PWD_INSTAGRAM_BROWSER:0:${timestamp}:${password}`;
  const jazoest = computeJazoest(csrfToken);

  let resp: Response;
  try {
    resp = await fetch(`${IG_WEB_BASE}/accounts/login/ajax/`, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Content-Type":     "application/x-www-form-urlencoded",
        "X-IG-App-ID":      "936619743392459",
        "X-ASBD-ID":        "198387",
        "X-CSRFToken":      csrfToken,
        "X-Instagram-AJAX": ajaxRev,
        "X-Requested-With": "XMLHttpRequest",
        "X-IG-WWW-Claim":   "0",
        "Accept-Language":  "en-US,en;q=0.9",
        "Accept-Encoding":  "gzip, deflate, br",
        "Sec-Fetch-Site":   "same-origin",
        "Sec-Fetch-Mode":   "cors",
        "Sec-Fetch-Dest":   "empty",
        Origin:  IG_WEB_BASE,
        Referer: `${IG_WEB_BASE}/accounts/login/`,
        Cookie:  cookieStr,
      },
      // mid belongs only in Cookie header, not the POST body
      body: new URLSearchParams({
        username,
        enc_password:  encPassword,
        queryParams:   JSON.stringify({ next: "/" }),
        optIntoOneTap: "false",
        jazoest,
      }).toString(),
    });
  } catch (err) {
    return { success: false, error: `Network error: ${String(err)}`, errorType: "network" };
  }

  const text = await resp.text().catch(() => "");
  logger.info({ path: "web-v0", status: resp.status, preview: text.slice(0, 300) }, "auth: login response");

  if (text.trimStart().startsWith("<")) {
    return { success: false, error: "Instagram returned an HTML page (IP block or rate-limit)", errorType: "ip_block" };
  }

  let data: {
    authenticated?: boolean;
    userId?: string;
    message?: string;
    error_type?: string;
    checkpoint_url?: string;
    two_factor_required?: boolean;
  };
  try { data = JSON.parse(text); }
  catch { return { success: false, error: `Response was not JSON: ${text.slice(0, 200)}`, errorType: "parse_error" }; }

  // Extract session cookies early — needed for checkpoint state
  const loginCookies = getSetCookies(resp.headers);
  let sessionId = "", newCsrfToken = csrfToken, dsUserId = data.userId ?? "";

  if (data.checkpoint_url) {
    for (const c of loginCookies) {
      const csrf = c.match(/csrftoken=([^;]+)/); if (csrf) newCsrfToken = csrf[1];
    }
    setPendingCheckpoint({
      checkpointUrl: data.checkpoint_url,
      cookies: [...cookies, ...loginCookies],
      csrfToken: newCsrfToken,
      username,
      origin: "web",
    });
    return { success: false, error: "Doğrulama gerekiyor", errorType: "checkpoint", checkpointUrl: data.checkpoint_url };
  }
  if (data.two_factor_required) {
    return { success: false, error: "Two-factor authentication required. Disable 2FA or use Session Manager to paste cookies.", errorType: "two_factor" };
  }
  if (!data.authenticated) {
    return { success: false, error: data.message ?? "Invalid username or password", errorType: data.error_type ?? "bad_password" };
  }
  for (const c of loginCookies) {
    const sid  = c.match(/sessionid=([^;]+)/);  if (sid)  sessionId    = sid[1];
    const csrf = c.match(/csrftoken=([^;]+)/);  if (csrf) newCsrfToken = csrf[1];
    const ds   = c.match(/ds_user_id=([^;]+)/); if (ds)   dsUserId     = ds[1];
  }
  if (!sessionId) {
    return { success: false, error: "Login succeeded but no sessionid cookie was returned", errorType: "no_session" };
  }

  return await finalizeSession({ sessionId, csrfToken: newCsrfToken, userId: dsUserId || data.userId, username });
}

// ── Path 2: Mobile private API + version-0 ────────────────────────────────────

const MOBILE_UA =
  "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2337; Xiaomi; 2201116PG; topaz; qcom; en_US; 453779684)";

async function fetchMobileCsrf(uuid: string): Promise<{ csrfToken: string; cookies: string[] }> {
  let csrfToken = "";
  let cookies: string[] = [];
  try {
    const resp = await fetch(
      `${IG_API_BASE}/api/v1/si/fetch_headers/?challenge_type=signup&guid=${uuid.replace(/-/g, "")}`,
      {
        headers: {
          "User-Agent":      MOBILE_UA,
          "X-IG-App-ID":     "567067343352427",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate",
        },
      }
    );
    cookies = getSetCookies(resp.headers);
    for (const c of cookies) {
      const m = c.match(/csrftoken=([^;]+)/);
      if (m) { csrfToken = m[1]; break; }
    }
  } catch { /* fall through */ }

  if (!csrfToken) { csrfToken = randomBytes(16).toString("hex"); cookies.push(`csrftoken=${csrfToken}`); }
  return { csrfToken, cookies };
}

async function loginViaMobileApi(username: string, password: string): Promise<LoginResult> {
  const uuid = randomUUID();
  const phoneId = randomUUID();
  const waterfallId = randomUUID();
  const deviceId = "android-" + randomBytes(8).toString("hex");

  const { csrfToken, cookies: initCookies } = await fetchMobileCsrf(uuid);
  const cookieStr = cookieStringFrom(initCookies);
  const timestamp = Math.floor(Date.now() / 1000);
  const encPassword = `#PWD_INSTAGRAM:0:${timestamp}:${password}`;

  let resp: Response;
  try {
    resp = await fetch(`${IG_API_BASE}/api/v1/accounts/login/`, {
      method: "POST",
      headers: {
        "User-Agent":      MOBILE_UA,
        "Content-Type":    "application/x-www-form-urlencoded",
        "X-IG-App-ID":     "567067343352427",
        "X-CSRFToken":     csrfToken,
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate",
        Cookie:            cookieStr,
      },
      body: new URLSearchParams({
        username,
        enc_password:        encPassword,
        device_id:           deviceId,
        guid:                uuid,
        phone_id:            phoneId,
        waterfall_id:        waterfallId,
        _uuid:               uuid,
        _csrftoken:          csrfToken,
        login_attempt_count: "0",
      }).toString(),
    });
  } catch (err) {
    return { success: false, error: `Network error: ${String(err)}`, errorType: "network" };
  }

  const text = await resp.text().catch(() => "");
  logger.info({ path: "mobile-v0", status: resp.status, preview: text.slice(0, 300) }, "auth: login response");

  if (text.trimStart().startsWith("<")) {
    return { success: false, error: "Mobile API returned an HTML page (IP block)", errorType: "ip_block" };
  }

  let data: {
    logged_in_user?: { pk?: string | number; username?: string; full_name?: string; profile_pic_url?: string; is_verified?: boolean };
    message?: string;
    error_type?: string;
    checkpoint_url?: string;
    two_factor_required?: boolean;
    status?: string;
  };
  try { data = JSON.parse(text); }
  catch { return { success: false, error: `Response was not JSON: ${text.slice(0, 200)}`, errorType: "parse_error" }; }

  const loginCookies = getSetCookies(resp.headers);
  let sessionId = "", newCsrfToken = csrfToken;
  const userId = String(data.logged_in_user?.pk ?? "");

  if (data.checkpoint_url) {
    for (const c of loginCookies) {
      const csrf = c.match(/csrftoken=([^;]+)/); if (csrf) newCsrfToken = csrf[1];
    }
    setPendingCheckpoint({
      checkpointUrl: data.checkpoint_url,
      cookies: [...initCookies, ...loginCookies],
      csrfToken: newCsrfToken,
      username,
      origin: "mobile",
    });
    return { success: false, error: "Doğrulama gerekiyor", errorType: "checkpoint", checkpointUrl: data.checkpoint_url };
  }
  if (data.two_factor_required) {
    return { success: false, error: "Two-factor authentication required. Disable 2FA or use Session Manager.", errorType: "two_factor" };
  }
  if (!data.logged_in_user || data.status !== "ok") {
    return { success: false, error: data.message ?? data.error_type ?? `HTTP ${resp.status}`, errorType: data.error_type ?? "bad_password" };
  }
  for (const c of loginCookies) {
    const sid  = c.match(/sessionid=([^;]+)/);  if (sid)  sessionId    = sid[1];
    const csrf = c.match(/csrftoken=([^;]+)/);  if (csrf) newCsrfToken = csrf[1];
  }
  if (!sessionId) {
    return { success: false, error: "Login succeeded but no sessionid was returned", errorType: "no_session" };
  }

  const user = data.logged_in_user;
  setSession({
    sessionId,
    csrfToken:    newCsrfToken,
    username:     user.username ?? username,
    userId,
    dsUserId:     userId,
    fullName:     user.full_name ?? "",
    profilePicUrl: user.profile_pic_url ?? "",
    isVerified:   user.is_verified ?? false,
  });
  return { success: true, userId, username: user.username ?? username, fullName: user.full_name ?? "", profilePicUrl: user.profile_pic_url ?? "", isVerified: user.is_verified ?? false };
}

// ── Path 3: Web endpoint + full AES-256-GCM encryption (fallback) ─────────────

async function fetchPublicKey(csrfToken: string, cookieStr: string, ajaxRev: string): Promise<{ publicKey: string; keyId: number }> {
  const resp = await fetch(`${IG_WEB_BASE}/api/v1/web/accounts/login/ajax/get_public_key/`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept:             "*/*",
      "X-IG-App-ID":      "936619743392459",
      "X-ASBD-ID":        "198387",
      "X-CSRFToken":      csrfToken,
      "X-Requested-With": "XMLHttpRequest",
      "X-Instagram-AJAX": ajaxRev,
      "X-IG-WWW-Claim":   "0",
      Referer:  `${IG_WEB_BASE}/accounts/login/`,
      Origin:   IG_WEB_BASE,
      Cookie:   cookieStr,
    },
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(body.trimStart().startsWith("<")
      ? `Could not fetch public key: IP block (HTTP ${resp.status})`
      : `Could not fetch public key: HTTP ${resp.status}`);
  }
  const data = await resp.json() as { public_key: string; key_id: string };
  return { publicKey: data.public_key, keyId: parseInt(data.key_id, 10) };
}

async function encryptPassword(password: string, publicKeyB64: string, keyId: number): Promise<string> {
  await _sodium.ready;
  const sodium = _sodium;
  const ts = Math.floor(Date.now() / 1000);
  const symKey = randomBytes(32);
  const cipher = createCipheriv("aes-256-gcm", symKey, Buffer.alloc(12, 0));
  cipher.setAAD(Buffer.from(ts.toString(), "utf8"));
  const ct     = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const tag    = cipher.getAuthTag();
  const pk     = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  const sealed = sodium.crypto_box_seal(new Uint8Array(symKey), pk);
  const payload = Buffer.concat([Buffer.from([1]), Buffer.from([keyId & 0xff, (keyId >> 8) & 0xff]), Buffer.from(sealed), tag, ct]);
  return `#PWD_INSTAGRAM_BROWSER:10:${ts}:${payload.toString("base64")}`;
}

async function loginViaWebFullEncryption(username: string, password: string): Promise<LoginResult> {
  let bootstrap: CsrfBootstrap;
  try { bootstrap = await fetchCsrfBootstrap(); }
  catch (err) { return { success: false, error: `CSRF fetch failed: ${String(err)}`, errorType: "network" }; }

  const { csrfToken, cookieStr, ajaxRev } = bootstrap;
  let publicKey: string, keyId: number;

  // Use the public key embedded in the login page HTML if available —
  // avoids the separate get_public_key endpoint that is blocked on most datacenter IPs.
  if (bootstrap.publicKey && bootstrap.publicKeyId !== undefined) {
    publicKey = bootstrap.publicKey;
    keyId = bootstrap.publicKeyId;
    logger.info({ keyId, path: "web-full" }, "auth: using embedded public key from login page HTML");
  } else {
    // Fall back to dedicated API endpoint
    try {
      ({ publicKey, keyId } = await fetchPublicKey(csrfToken, cookieStr, ajaxRev));
    } catch (err) {
      return { success: false, error: String(err), errorType: "ip_block" };
    }
  }

  const encPassword = await encryptPassword(password, publicKey, keyId);

  let resp: Response;
  try {
    resp = await fetch(`${IG_WEB_BASE}/accounts/login/ajax/`, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Content-Type":     "application/x-www-form-urlencoded",
        "X-IG-App-ID":      "936619743392459",
        "X-ASBD-ID":        "198387",
        "X-CSRFToken":      csrfToken,
        "X-Instagram-AJAX": ajaxRev,
        "X-Requested-With": "XMLHttpRequest",
        "X-IG-WWW-Claim":   "0",
        Origin:  IG_WEB_BASE,
        Referer: `${IG_WEB_BASE}/accounts/login/`,
        Cookie:  cookieStr,
      },
      body: new URLSearchParams({
        username,
        enc_password:  encPassword,
        queryParams:   JSON.stringify({ next: "/" }),
        optIntoOneTap: "false",
        jazoest:       computeJazoest(csrfToken),
      }).toString(),
    });
  } catch (err) {
    return { success: false, error: `Network error: ${String(err)}`, errorType: "network" };
  }

  const text = await resp.text().catch(() => "");
  logger.info({ path: "web-full", status: resp.status, preview: text.slice(0, 300) }, "auth: login response");

  if (text.trimStart().startsWith("<")) {
    return { success: false, error: "Instagram returned an HTML page (IP block)", errorType: "ip_block" };
  }

  let data: { authenticated?: boolean; userId?: string; message?: string; error_type?: string; checkpoint_url?: string; two_factor_required?: boolean };
  try { data = JSON.parse(text); }
  catch { return { success: false, error: `Response was not JSON`, errorType: "parse_error" }; }

  const loginCookies = getSetCookies(resp.headers);
  let sessionId = "", newCsrfToken = csrfToken, dsUserId = data.userId ?? "";

  if (data.checkpoint_url) {
    for (const c of loginCookies) {
      const csrf = c.match(/csrftoken=([^;]+)/); if (csrf) newCsrfToken = csrf[1];
    }
    setPendingCheckpoint({
      checkpointUrl: data.checkpoint_url,
      cookies: [...bootstrap.cookies, ...loginCookies],
      csrfToken: newCsrfToken,
      username,
      origin: "web",
    });
    return { success: false, error: "Doğrulama gerekiyor", errorType: "checkpoint", checkpointUrl: data.checkpoint_url };
  }
  if (data.two_factor_required) return { success: false, error: "Two-factor authentication required.", errorType: "two_factor" };
  if (!data.authenticated) return { success: false, error: data.message ?? "Invalid username or password", errorType: data.error_type ?? "bad_password" };

  for (const c of loginCookies) {
    const sid  = c.match(/sessionid=([^;]+)/);  if (sid)  sessionId    = sid[1];
    const csrf = c.match(/csrftoken=([^;]+)/);  if (csrf) newCsrfToken = csrf[1];
    const ds   = c.match(/ds_user_id=([^;]+)/); if (ds)   dsUserId     = ds[1];
  }
  if (!sessionId) return { success: false, error: "No sessionid returned", errorType: "no_session" };

  return await finalizeSession({ sessionId, csrfToken: newCsrfToken, userId: dsUserId || data.userId, username });
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attempt login across three paths, returning the first result where Instagram
 * actually responded (regardless of success/failure).  Only advances to the next
 * path on a pure network error (couldn't reach Instagram at all).
 */
export async function instagramLogin(username: string, password: string): Promise<LoginResult> {
  // Path 1 — web V0 (no public key needed; skips the blocked get_public_key endpoint)
  const r1 = await loginViaWebV0(username, password);
  // Only escalate on pure network failures — if Instagram responded (any JSON), use it.
  // RuntimeException signals a server-side request-format issue, not a bad credential,
  // so we also escalate on that to give Path 2 a chance.
  if (r1.errorType !== "network" && r1.errorType !== "RuntimeException") return r1;

  // Path 2 — mobile V0 (different endpoint and UA)
  const r2 = await loginViaMobileApi(username, password);
  if (r2.errorType !== "network") return r2;

  // Path 3 — web full encryption (last resort; requires public key from HTML or API)
  return loginViaWebFullEncryption(username, password);
}

// ── Logout ────────────────────────────────────────────────────────────────────

export async function instagramLogout(): Promise<void> {
  const session = getSession();
  if (!session) return;
  try {
    await fetch(`${IG_WEB_BASE}/accounts/logout/ajax/`, {
      method:  "POST",
      headers: { ...buildInstagramHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
      body:    new URLSearchParams({ one_tap_app_login: "0" }).toString(),
    });
  } catch { /* best-effort */ }
  finally { clearSession(); }
}

// ── Current user info ─────────────────────────────────────────────────────────

export async function fetchCurrentUserInfo() {
  const session = getSession();
  if (!session?.userId) return null;
  try {
    const resp = await fetch(`${IG_API_BASE}/api/v1/users/${session.userId}/info/`, { headers: buildInstagramHeaders() });
    if (!resp.ok) return null;
    const json = await resp.json() as { user?: Record<string, unknown> };
    return json.user ?? null;
  } catch { return null; }
}
