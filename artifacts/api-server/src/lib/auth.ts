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

// ── Public result type ─────────────────────────────────────────────────────────

export interface LoginResult {
  success: boolean;
  userId?: string;
  username?: string;
  fullName?: string;
  profilePicUrl?: string;
  isVerified?: boolean;
  error?: string;
  errorType?: string;
}

// ── CSRF + rollout_hash bootstrap ──────────────────────────────────────────────

interface CsrfBootstrap {
  csrfToken: string;
  cookies: string[];
  cookieStr: string;
  ajaxRev: string; // X-Instagram-AJAX (rollout hash)
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
async function fetchCsrfBootstrap(): Promise<CsrfBootstrap> {
  let csrfToken = "";
  let ajaxRev = "1009848701"; // known-good fallback
  let cookies: string[] = [];

  try {
    const resp = await fetch(`${IG_WEB_BASE}/accounts/login/`, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "Accept-Encoding": "gzip, deflate, br",
        "Upgrade-Insecure-Requests": "1",
        "Sec-Fetch-Mode": "navigate",
        "Sec-Fetch-Dest": "document",
        "Sec-Fetch-Site": "none",
      },
      redirect: "follow",
    });

    cookies = getSetCookies(resp.headers);

    // Extract csrftoken from cookies first
    for (const c of cookies) {
      const m = c.match(/csrftoken=([^;]+)/);
      if (m) { csrfToken = m[1]; break; }
    }

    // Parse HTML for csrftoken and rollout_hash
    const html = await resp.text();

    if (!csrfToken) {
      for (const p of [/"csrf_token"\s*:\s*"([^"]+)"/, /csrftoken=([A-Za-z0-9_-]{20,})/]) {
        const m = html.match(p);
        if (m) { csrfToken = m[1]; break; }
      }
    }

    // rollout_hash lives in the inline JS bundle — multiple known patterns
    for (const p of [
      /"rollout_hash"\s*:\s*"([^"]+)"/,
      /LSD\s*,\s*\[\],\s*\{"token"\s*:\s*"([^"]+)"\}/,
      /"client_revision"\s*:\s*(\d+)/,
      /X-Instagram-AJAX['"]\s*:\s*['"]([^'"]+)['"]/,
    ]) {
      const m = html.match(p);
      if (m) { ajaxRev = m[1]; break; }
    }
  } catch (err) {
    logger.debug({ err }, "auth: CSRF bootstrap fetch failed — using fallback values");
  }

  // Final fallbacks
  if (!csrfToken) csrfToken = randomBytes(16).toString("hex");
  if (!cookies.some((c) => c.startsWith("csrftoken="))) {
    cookies.push(`csrftoken=${csrfToken}`);
  }

  return { csrfToken, cookies, cookieStr: cookieStringFrom(cookies), ajaxRev };
}

// ── Path 1: Web endpoint + version-0 password ──────────────────────────────────

async function loginViaWebV0(username: string, password: string): Promise<LoginResult> {
  const { csrfToken, cookieStr, ajaxRev } = await fetchCsrfBootstrap();
  const timestamp = Math.floor(Date.now() / 1000);
  // Version 0: password carried in plaintext inside the envelope — no public-key fetch needed
  const encPassword = `#PWD_INSTAGRAM_BROWSER:0:${timestamp}:${password}`;

  let resp: Response;
  try {
    resp = await fetch(`${IG_WEB_BASE}/accounts/login/ajax/`, {
      method: "POST",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
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
        Origin:   IG_WEB_BASE,
        Referer:  `${IG_WEB_BASE}/accounts/login/`,
        Cookie:   cookieStr,
      },
      body: new URLSearchParams({
        username,
        enc_password:  encPassword,
        queryParams:   "{}",
        optIntoOneTap: "false",
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

  if (data.checkpoint_url) {
    return { success: false, error: "Checkpoint required — verify your account in a browser first.", errorType: "checkpoint" };
  }
  if (data.two_factor_required) {
    return { success: false, error: "Two-factor authentication required. Disable 2FA or use Session Manager to paste cookies.", errorType: "two_factor" };
  }
  if (!data.authenticated) {
    return { success: false, error: data.message ?? "Invalid username or password", errorType: data.error_type ?? "bad_password" };
  }

  // Extract session cookies
  const loginCookies = getSetCookies(resp.headers);
  let sessionId = "", newCsrfToken = csrfToken, dsUserId = data.userId ?? "";
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

  if (data.checkpoint_url) {
    return { success: false, error: "Checkpoint required — verify your account in a browser first.", errorType: "checkpoint" };
  }
  if (data.two_factor_required) {
    return { success: false, error: "Two-factor authentication required. Disable 2FA or use Session Manager.", errorType: "two_factor" };
  }
  if (!data.logged_in_user || data.status !== "ok") {
    return { success: false, error: data.message ?? data.error_type ?? `HTTP ${resp.status}`, errorType: data.error_type ?? "bad_password" };
  }

  const loginCookies = getSetCookies(resp.headers);
  let sessionId = "", newCsrfToken = csrfToken;
  const userId = String(data.logged_in_user.pk ?? "");
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
  try {
    ({ publicKey, keyId } = await fetchPublicKey(csrfToken, cookieStr, ajaxRev));
  } catch (err) {
    return { success: false, error: String(err), errorType: "ip_block" };
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
      body: new URLSearchParams({ username, enc_password: encPassword, queryParams: "{}", optIntoOneTap: "false" }).toString(),
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

  if (data.checkpoint_url) return { success: false, error: "Checkpoint required.", errorType: "checkpoint" };
  if (data.two_factor_required) return { success: false, error: "Two-factor authentication required.", errorType: "two_factor" };
  if (!data.authenticated) return { success: false, error: data.message ?? "Invalid username or password", errorType: data.error_type ?? "bad_password" };

  const loginCookies = getSetCookies(resp.headers);
  let sessionId = "", newCsrfToken = csrfToken, dsUserId = data.userId ?? "";
  for (const c of loginCookies) {
    const sid  = c.match(/sessionid=([^;]+)/);  if (sid)  sessionId    = sid[1];
    const csrf = c.match(/csrftoken=([^;]+)/);  if (csrf) newCsrfToken = csrf[1];
    const ds   = c.match(/ds_user_id=([^;]+)/); if (ds)   dsUserId     = ds[1];
  }
  if (!sessionId) return { success: false, error: "No sessionid returned", errorType: "no_session" };

  return await finalizeSession({ sessionId, csrfToken: newCsrfToken, userId: dsUserId || data.userId, username });
}

// ── Shared: fetch user info and persist session ────────────────────────────────

async function finalizeSession(params: { sessionId: string; csrfToken: string; userId?: string; username: string }): Promise<LoginResult> {
  const { sessionId, csrfToken, userId = "", username } = params;

  let fullName = "", profilePicUrl = "", isVerified = false, finalUsername = username;
  try {
    const userResp = await fetch(`${IG_API_BASE}/api/v1/users/${userId}/info/`, {
      headers: {
        "User-Agent":  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "X-IG-App-ID": "936619743392459",
        Cookie:        `sessionid=${sessionId}; csrftoken=${csrfToken}; ds_user_id=${userId}`,
      },
    });
    if (userResp.ok) {
      const j = await userResp.json() as { user?: { full_name?: string; profile_pic_url?: string; is_verified?: boolean; username?: string } };
      fullName      = j.user?.full_name ?? "";
      profilePicUrl = j.user?.profile_pic_url ?? "";
      isVerified    = j.user?.is_verified ?? false;
      finalUsername = j.user?.username ?? username;
    }
  } catch { /* optional enrichment */ }

  setSession({ sessionId, csrfToken, username: finalUsername, userId, dsUserId: userId, fullName, profilePicUrl, isVerified });
  return { success: true, userId, username: finalUsername, fullName, profilePicUrl, isVerified };
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Attempt login across three paths, returning the first result where Instagram
 * actually responded (regardless of success/failure).  Only advances to the next
 * path on a pure network error (couldn't reach Instagram at all).
 */
export async function instagramLogin(username: string, password: string): Promise<LoginResult> {
  // Path 1 — web V0 (no public key needed)
  const r1 = await loginViaWebV0(username, password);
  if (r1.errorType !== "network") return r1;

  // Path 2 — mobile V0
  const r2 = await loginViaMobileApi(username, password);
  if (r2.errorType !== "network") return r2;

  // Path 3 — web full encryption (last resort)
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
