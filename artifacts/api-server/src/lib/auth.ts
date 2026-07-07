/**
 * Instagram authentication — two-path strategy:
 *
 *  Path 1 · Mobile private API  (i.instagram.com)
 *    - No public-key fetch step → works from datacenter IPs
 *    - Password sent as #PWD_INSTAGRAM:0:{ts}:{password} (version 0 = unencrypted)
 *    - Tried first on every login attempt
 *
 *  Path 2 · Web API  (www.instagram.com) — kept as fallback
 *    - Requires fetching Instagram's public encryption key
 *    - Blocked on cloud/datacenter IPs in most regions
 *    - Only attempted when the mobile path fails with a non-credential error
 */

import { createCipheriv, randomBytes, randomUUID } from "crypto";
import _sodium from "libsodium-wrappers";
import { setSession, clearSession, getSession, buildInstagramHeaders } from "./session.js";

const IG_WEB_BASE  = "https://www.instagram.com";
const IG_API_BASE  = "https://i.instagram.com";

// ── Shared helpers ────────────────────────────────────────────────────────────

/** Collapse Set-Cookie values into a single Cookie: header string. */
function cookieStringFrom(rawSetCookie: string[]): string {
  return rawSetCookie.map((c) => c.split(";")[0]).join("; ");
}

/**
 * Reliably extract all Set-Cookie header values from a fetch Response.
 * Node.js 18+ exposes headers.getSetCookie() returning each cookie separately.
 */
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

// ── Public result type ────────────────────────────────────────────────────────

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

// ── Path 1: Mobile private API ────────────────────────────────────────────────

const MOBILE_UA =
  "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2337; Xiaomi; 2201116PG; topaz; qcom; en_US; 453779684)";

/** Generate the random device fingerprint Instagram expects. */
function makeDeviceIds() {
  const uuid       = randomUUID();
  const phoneId    = randomUUID();
  const waterfallId = randomUUID();
  const deviceId   = "android-" + randomBytes(8).toString("hex");
  return { uuid, phoneId, waterfallId, deviceId };
}

/** Shared headers for mobile API calls. */
function mobileHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent":      MOBILE_UA,
    "X-IG-App-ID":     "567067343352427",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate",
    Accept:            "*/*",
    Connection:        "keep-alive",
    ...extra,
  };
}

/**
 * Fetch initial CSRF token from the mobile signup-headers endpoint.
 * This endpoint is public and returns a csrftoken cookie without requiring auth.
 */
async function fetchMobileCsrf(uuid: string): Promise<{ csrfToken: string; cookies: string[] }> {
  let csrfToken = "";
  let cookies: string[] = [];

  try {
    const resp = await fetch(
      `${IG_API_BASE}/api/v1/si/fetch_headers/?challenge_type=signup&guid=${uuid.replace(/-/g, "")}`,
      { headers: mobileHeaders() }
    );
    cookies = getSetCookies(resp.headers);
    for (const c of cookies) {
      const m = c.match(/csrftoken=([^;]+)/);
      if (m) { csrfToken = m[1]; break; }
    }
  } catch {
    // fall through — we'll use a random token
  }

  if (!csrfToken) {
    csrfToken = randomBytes(16).toString("hex");
    cookies.push(`csrftoken=${csrfToken}`);
  }

  return { csrfToken, cookies };
}

async function loginViaMobileApi(username: string, password: string): Promise<LoginResult> {
  const { uuid, phoneId, waterfallId, deviceId } = makeDeviceIds();
  const { csrfToken, cookies: initCookies } = await fetchMobileCsrf(uuid);
  const cookieStr = cookieStringFrom(initCookies);
  const timestamp = Math.floor(Date.now() / 1000);

  // Version 0: password is sent unencrypted inside the #PWD_INSTAGRAM envelope.
  // The mobile private API accepts this; no server-fetched public key is needed.
  const encPassword = `#PWD_INSTAGRAM:0:${timestamp}:${password}`;

  const body = new URLSearchParams({
    username,
    enc_password:       encPassword,
    device_id:          deviceId,
    guid:               uuid,
    phone_id:           phoneId,
    waterfall_id:       waterfallId,
    _uuid:              uuid,
    _csrftoken:         csrfToken,
    login_attempt_count: "0",
  });

  let resp: Response;
  try {
    resp = await fetch(`${IG_API_BASE}/api/v1/accounts/login/`, {
      method:  "POST",
      headers: mobileHeaders({
        "Content-Type": "application/x-www-form-urlencoded",
        "X-CSRFToken":  csrfToken,
        Cookie:         cookieStr,
      }),
      body: body.toString(),
    });
  } catch (err) {
    return { success: false, error: `Network error: ${String(err)}`, errorType: "network" };
  }

  const text = await resp.text().catch(() => "");

  // A non-JSON HTML response almost always means an IP/geo block on this endpoint
  if (text.trimStart().startsWith("<")) {
    return {
      success: false,
      error: "Mobile API returned an HTML page — IP may be geo-blocked on this endpoint too",
      errorType: "ip_block",
    };
  }

  let data: {
    logged_in_user?: {
      pk?: string | number;
      username?: string;
      full_name?: string;
      profile_pic_url?: string;
      is_verified?: boolean;
    };
    message?: string;
    error_type?: string;
    checkpoint_url?: string;
    two_factor_required?: boolean;
    status?: string;
  };

  try {
    data = JSON.parse(text);
  } catch {
    return { success: false, error: `Mobile API response was not JSON: ${text.slice(0, 200)}`, errorType: "parse_error" };
  }

  if (data.checkpoint_url) {
    return {
      success: false,
      error: "Checkpoint required — Instagram needs additional verification. Log in from a browser first.",
      errorType: "checkpoint",
    };
  }

  if (data.two_factor_required) {
    return {
      success: false,
      error: "Two-factor authentication required. Disable 2FA or use the Session Manager to paste cookies.",
      errorType: "two_factor",
    };
  }

  if (!data.logged_in_user || data.status !== "ok") {
    const reason = data.message ?? data.error_type ?? `HTTP ${resp.status}`;
    return { success: false, error: reason, errorType: data.error_type ?? "bad_password" };
  }

  // Extract session cookies from the login response
  const loginCookies = getSetCookies(resp.headers);
  let sessionId = "";
  let newCsrfToken = csrfToken;
  const userId = String(data.logged_in_user.pk ?? "");

  for (const c of loginCookies) {
    const sid  = c.match(/sessionid=([^;]+)/);  if (sid)  sessionId    = sid[1];
    const csrf = c.match(/csrftoken=([^;]+)/);  if (csrf) newCsrfToken = csrf[1];
  }

  if (!sessionId) {
    return { success: false, error: "Login succeeded but no sessionid cookie was returned", errorType: "no_session" };
  }

  const user = data.logged_in_user;
  setSession({
    sessionId,
    csrfToken: newCsrfToken,
    username:     user.username ?? username,
    userId,
    dsUserId:     userId,
    fullName:     user.full_name ?? "",
    profilePicUrl: user.profile_pic_url ?? "",
    isVerified:   user.is_verified ?? false,
  });

  return {
    success: true,
    userId,
    username:     user.username ?? username,
    fullName:     user.full_name ?? "",
    profilePicUrl: user.profile_pic_url ?? "",
    isVerified:   user.is_verified ?? false,
  };
}

// ── Path 2: Web API (fallback) ────────────────────────────────────────────────

const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

function browserHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent":        CHROME_UA,
    "Accept-Language":   "en-US,en;q=0.9",
    "Accept-Encoding":   "gzip, deflate, br",
    "sec-ch-ua":         '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    "sec-ch-ua-mobile":  "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Site":    "same-origin",
    "Sec-Fetch-Mode":    "cors",
    "Sec-Fetch-Dest":    "empty",
    ...extra,
  };
}

async function fetchInitialCsrf(): Promise<{ csrfToken: string; rawSetCookie: string[]; cookieStr: string }> {
  let rawSetCookie: string[] = [];
  let csrfToken = "";

  try {
    const resp = await fetch(`${IG_WEB_BASE}/accounts/login/`, {
      headers: {
        ...browserHeaders(),
        Accept:              "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Sec-Fetch-Mode":    "navigate",
        "Sec-Fetch-Dest":    "document",
        "Sec-Fetch-Site":    "none",
        "Upgrade-Insecure-Requests": "1",
      },
      redirect: "follow",
    });
    rawSetCookie.push(...getSetCookies(resp.headers));
    for (const c of rawSetCookie) {
      const m = c.match(/csrftoken=([^;]+)/);
      if (m) { csrfToken = m[1]; break; }
    }
    if (!csrfToken) {
      const html = await resp.text();
      for (const p of [/"csrf_token":"([^"]+)"/, /csrftoken=([A-Za-z0-9_-]{20,})/, /"token":"([A-Za-z0-9_-]{20,})"/]) {
        const m = html.match(p);
        if (m) { csrfToken = m[1]; break; }
      }
    }
  } catch { /* fall through */ }

  if (!csrfToken) csrfToken = randomBytes(16).toString("hex");
  if (!rawSetCookie.some((c) => c.startsWith("csrftoken="))) {
    rawSetCookie.push(`csrftoken=${csrfToken}`);
  }
  return { csrfToken, rawSetCookie, cookieStr: cookieStringFrom(rawSetCookie) };
}

async function fetchPublicKey(csrfToken: string, cookieStr: string): Promise<{ publicKey: string; keyId: number }> {
  const resp = await fetch(`${IG_WEB_BASE}/api/v1/web/accounts/login/ajax/get_public_key/`, {
    headers: browserHeaders({
      Accept:               "*/*",
      "X-IG-App-ID":        "936619743392459",
      "X-ASBD-ID":          "129477",
      "X-CSRFToken":        csrfToken,
      "X-Requested-With":   "XMLHttpRequest",
      "X-Instagram-AJAX":   "1009848701",
      Referer:              `${IG_WEB_BASE}/accounts/login/`,
      Origin:               IG_WEB_BASE,
      Cookie:               cookieStr,
    }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    const hint = body.trimStart().startsWith("<")
      ? "Instagram rejected the request (IP block or rate-limit)"
      : `HTTP ${resp.status}`;
    throw new Error(`Could not fetch Instagram public key: ${hint}`);
  }
  const data = await resp.json() as { public_key: string; key_id: string };
  return { publicKey: data.public_key, keyId: parseInt(data.key_id, 10) };
}

async function encryptPassword(password: string, publicKeyB64: string, keyId: number): Promise<string> {
  await _sodium.ready;
  const sodium = _sodium;
  const timestamp = Math.floor(Date.now() / 1000);
  const symKey  = randomBytes(32);
  const iv      = Buffer.alloc(12, 0);
  const cipher  = createCipheriv("aes-256-gcm", symKey, iv);
  cipher.setAAD(Buffer.from(timestamp.toString(), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const authTag    = cipher.getAuthTag();
  const serverPK   = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  const sealedKey  = sodium.crypto_box_seal(new Uint8Array(symKey), serverPK);
  const payload    = Buffer.concat([
    Buffer.from([1]),
    Buffer.from([keyId & 0xff, (keyId >> 8) & 0xff]),
    Buffer.from(sealedKey),
    authTag,
    ciphertext,
  ]);
  return `#PWD_INSTAGRAM_BROWSER:10:${timestamp}:${payload.toString("base64")}`;
}

async function loginViaWebApi(username: string, password: string): Promise<LoginResult> {
  try {
    const { csrfToken, cookieStr } = await fetchInitialCsrf();
    const { publicKey, keyId }     = await fetchPublicKey(csrfToken, cookieStr);
    const encryptedPassword        = await encryptPassword(password, publicKey, keyId);

    const loginResp = await fetch(`${IG_WEB_BASE}/accounts/login/ajax/`, {
      method: "POST",
      headers: browserHeaders({
        "Content-Type":       "application/x-www-form-urlencoded",
        "X-IG-App-ID":        "936619743392459",
        "X-ASBD-ID":          "129477",
        "X-CSRFToken":        csrfToken,
        "X-Instagram-AJAX":   "1009848701",
        "X-Requested-With":   "XMLHttpRequest",
        Origin:               IG_WEB_BASE,
        Referer:              `${IG_WEB_BASE}/accounts/login/`,
        Cookie:               cookieStr,
      }),
      body: new URLSearchParams({
        username,
        enc_password:   encryptedPassword,
        queryParams:    "{}",
        optIntoOneTap:  "false",
      }).toString(),
    });

    if (!loginResp.ok && loginResp.status !== 400) {
      const body = await loginResp.text().catch(() => "");
      const hint = body.trimStart().startsWith("<")
        ? "Instagram returned an HTML page — rate-limit, IP block, or checkpoint"
        : `HTTP ${loginResp.status}`;
      return { success: false, error: hint, errorType: "upstream_error" };
    }

    const loginText = await loginResp.text();
    let loginData: {
      authenticated?: boolean;
      userId?: string;
      user?: boolean;
      message?: string;
      error_type?: string;
      checkpoint_url?: string;
      two_factor_required?: boolean;
    };
    try { loginData = JSON.parse(loginText); }
    catch {
      return { success: false, error: "Instagram login response was not valid JSON", errorType: "parse_error" };
    }

    if (loginData.checkpoint_url) {
      return { success: false, error: "Checkpoint required — verify your account in a browser first.", errorType: "checkpoint" };
    }
    if (loginData.two_factor_required) {
      return { success: false, error: "Two-factor authentication required. Disable 2FA or use session cookies.", errorType: "two_factor" };
    }
    if (!loginData.authenticated) {
      return { success: false, error: loginData.message ?? "Invalid username or password", errorType: loginData.error_type ?? "bad_password" };
    }

    const loginCookies = getSetCookies(loginResp.headers);
    let sessionId = "";
    let newCsrfToken = csrfToken;
    let dsUserId = loginData.userId ?? "";
    for (const c of loginCookies) {
      const sid  = c.match(/sessionid=([^;]+)/);  if (sid)  sessionId    = sid[1];
      const csrf = c.match(/csrftoken=([^;]+)/);  if (csrf) newCsrfToken = csrf[1];
      const ds   = c.match(/ds_user_id=([^;]+)/); if (ds)   dsUserId     = ds[1];
    }
    if (!sessionId) {
      return { success: false, error: "Login succeeded but no sessionid cookie was returned", errorType: "no_session" };
    }

    // Fetch user info
    let fullName = "", profilePicUrl = "", isVerified = false, finalUsername = username;
    try {
      const userResp = await fetch(`${IG_API_BASE}/api/v1/users/${dsUserId || loginData.userId}/info/`, {
        headers: {
          "User-Agent":  CHROME_UA,
          "X-IG-App-ID": "936619743392459",
          Cookie:        `sessionid=${sessionId}; csrftoken=${newCsrfToken}; ds_user_id=${dsUserId}`,
        },
      });
      if (userResp.ok) {
        const userJson = await userResp.json() as { user?: { full_name?: string; profile_pic_url?: string; is_verified?: boolean; username?: string } };
        fullName       = userJson.user?.full_name ?? "";
        profilePicUrl  = userJson.user?.profile_pic_url ?? "";
        isVerified     = userJson.user?.is_verified ?? false;
        finalUsername  = userJson.user?.username ?? username;
      }
    } catch { /* optional */ }

    setSession({ sessionId, csrfToken: newCsrfToken, username: finalUsername, userId: dsUserId || loginData.userId, dsUserId: dsUserId || loginData.userId, fullName, profilePicUrl, isVerified });
    return { success: true, userId: dsUserId || loginData.userId, username: finalUsername, fullName, profilePicUrl, isVerified };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err), errorType: "exception" };
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Try mobile API first (no IP block on key fetch), fall back to web API.
 */
export async function instagramLogin(username: string, password: string): Promise<LoginResult> {
  const mobileResult = await loginViaMobileApi(username, password);

  // If mobile succeeded, or failed with a credential/checkpoint/2FA error
  // (those would fail on the web path too) — return immediately.
  if (
    mobileResult.success ||
    mobileResult.errorType === "bad_password" ||
    mobileResult.errorType === "checkpoint" ||
    mobileResult.errorType === "two_factor"
  ) {
    return mobileResult;
  }

  // Mobile path hit an IP/network/parse error — try the web path as fallback.
  const webResult = await loginViaWebApi(username, password);
  if (webResult.success || webResult.errorType !== "ip_block") {
    return webResult;
  }

  // Both paths failed — return a combined error.
  return {
    success: false,
    error: `Both login paths failed. Mobile: ${mobileResult.error}. Web: ${webResult.error}. Use Session Manager to paste cookies manually.`,
    errorType: "ip_block",
  };
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
