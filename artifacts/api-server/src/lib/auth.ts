import { createCipheriv, randomBytes } from "crypto";
import _sodium from "libsodium-wrappers";
import { setSession, clearSession, getSession, buildInstagramHeaders } from "./session.js";

const IG_WEB_BASE = "https://www.instagram.com";
const IG_API_BASE = "https://i.instagram.com";

// ── Helpers ─────────────────────────────────────────────────────────────────

const CHROME_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36";

/** Shared browser-like headers for all Instagram web requests. */
function browserHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    "User-Agent": CHROME_UA,
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "sec-ch-ua": '"Google Chrome";v="125", "Chromium";v="125", "Not.A/Brand";v="24"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"Windows"',
    "Sec-Fetch-Site": "same-origin",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Dest": "empty",
    ...extra,
  };
}

/** Collapse a rawSetCookie array into a single Cookie: header value. */
function cookieStringFrom(rawSetCookie: string[]): string {
  return rawSetCookie.map((c) => c.split(";")[0]).join("; ");
}

/**
 * Fetch a fresh CSRF token and all initial cookies from the Instagram home page.
 * Returns the full cookie jar so subsequent steps can present them to Instagram.
 */
async function fetchInitialCsrf(): Promise<{ csrfToken: string; rawSetCookie: string[]; cookieStr: string }> {
  const resp = await fetch(`${IG_WEB_BASE}/accounts/login/`, {
    headers: {
      ...browserHeaders(),
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Sec-Fetch-Mode": "navigate",
      "Sec-Fetch-Dest": "document",
      "Sec-Fetch-Site": "none",
      "Upgrade-Insecure-Requests": "1",
    },
    redirect: "follow",
  });

  const rawSetCookie: string[] = [];
  resp.headers.forEach((val, key) => {
    if (key.toLowerCase() === "set-cookie") rawSetCookie.push(val);
  });

  const cookieStr = cookieStringFrom(rawSetCookie);

  // Extract CSRF token from cookies first, then fall back to HTML
  let csrfToken = "";
  for (const cookie of rawSetCookie) {
    const m = cookie.match(/csrftoken=([^;]+)/);
    if (m) { csrfToken = m[1]; break; }
  }
  if (!csrfToken) {
    const html = await resp.text();
    const m = html.match(/"csrf_token":"([^"]+)"/);
    if (m) csrfToken = m[1];
  }
  return { csrfToken, rawSetCookie, cookieStr };
}

/**
 * Fetch Instagram's current public key for password encryption.
 * Requires the full cookie jar from fetchInitialCsrf so Instagram doesn't
 * reject the request as a bot (missing mid / ig_did cookies).
 */
async function fetchPublicKey(
  csrfToken: string,
  cookieStr: string,
): Promise<{ publicKey: string; keyId: number }> {
  const resp = await fetch(
    `${IG_WEB_BASE}/api/v1/web/accounts/login/ajax/get_public_key/`,
    {
      headers: browserHeaders({
        Accept: "*/*",
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "129477",
        "X-CSRFToken": csrfToken,
        "X-Requested-With": "XMLHttpRequest",
        "X-Instagram-AJAX": "1009848701",
        Referer: `${IG_WEB_BASE}/accounts/login/`,
        Origin: IG_WEB_BASE,
        Cookie: cookieStr,
      }),
    }
  );
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    const hint = body.trimStart().startsWith("<")
      ? "Instagram rejected the request (possible IP block or rate-limit on this server)"
      : `HTTP ${resp.status}`;
    throw new Error(`Could not fetch Instagram public key: ${hint}`);
  }
  const text = await resp.text();
  let data: { public_key: string; key_id: string };
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("Could not fetch Instagram public key: response was not valid JSON");
  }
  return { publicKey: data.public_key, keyId: parseInt(data.key_id, 10) };
}

/**
 * Encrypt the password using Instagram's version-10 scheme:
 *  AES-256-GCM(password, k, iv=0) + libsodium SealedBox(k, publicKey)
 * Returns the "#PWD_INSTAGRAM_BROWSER:10:{ts}:{payload_b64}" string.
 */
async function encryptPassword(
  password: string,
  publicKeyB64: string,
  keyId: number
): Promise<string> {
  await _sodium.ready;
  const sodium = _sodium;

  const timestamp = Math.floor(Date.now() / 1000);

  // 1. Random 32-byte symmetric key
  const symKey = randomBytes(32);

  // 2. Encrypt password with AES-256-GCM (IV = 12 zero bytes, AAD = timestamp string)
  const iv = Buffer.alloc(12, 0);
  const cipher = createCipheriv("aes-256-gcm", symKey, iv);
  cipher.setAAD(Buffer.from(timestamp.toString(), "utf8"));
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag(); // 16 bytes

  // 3. Seal the symmetric key with Instagram's public key using libsodium SealedBox
  //    Output: ephemeral_pk (32) || encrypted_symKey_with_mac (48) = 80 bytes
  const serverPublicKey = sodium.from_base64(publicKeyB64, sodium.base64_variants.ORIGINAL);
  const sealedKey = sodium.crypto_box_seal(new Uint8Array(symKey), serverPublicKey);

  // 4. Build final payload
  const payload = Buffer.concat([
    Buffer.from([1]),                                        // enc version byte
    Buffer.from([keyId & 0xff, (keyId >> 8) & 0xff]),       // key_id as LE uint16
    Buffer.from(sealedKey),                                  // 80 bytes
    authTag,                                                 // 16 bytes AES auth tag
    ciphertext,                                              // encrypted password
  ]);

  return `#PWD_INSTAGRAM_BROWSER:10:${timestamp}:${payload.toString("base64")}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

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

export async function instagramLogin(
  username: string,
  password: string
): Promise<LoginResult> {
  try {
    // Step 1: load the login page — captures mid, ig_did, csrftoken, etc.
    const { csrfToken, cookieStr } = await fetchInitialCsrf();
    if (!csrfToken) {
      return { success: false, error: "Could not fetch CSRF token from Instagram", errorType: "csrf_failed" };
    }

    // Step 2: get encryption public key — pass the full cookie jar so Instagram
    //         doesn't flag the request as a bot (missing mid/ig_did cookies)
    const { publicKey, keyId } = await fetchPublicKey(csrfToken, cookieStr);

    // Step 3: encrypt password
    const encryptedPassword = await encryptPassword(password, publicKey, keyId);

    // Step 4: POST login — same cookie jar + full browser headers
    const loginBody = new URLSearchParams({
      username,
      enc_password: encryptedPassword,
      queryParams: "{}",
      optIntoOneTap: "false",
    });

    const loginResp = await fetch(`${IG_WEB_BASE}/accounts/login/ajax/`, {
      method: "POST",
      headers: browserHeaders({
        "Content-Type": "application/x-www-form-urlencoded",
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "129477",
        "X-CSRFToken": csrfToken,
        "X-Instagram-AJAX": "1009848701",
        "X-Requested-With": "XMLHttpRequest",
        Origin: IG_WEB_BASE,
        Referer: `${IG_WEB_BASE}/accounts/login/`,
        Cookie: cookieStr,
      }),
      body: loginBody.toString(),
    });

    if (!loginResp.ok && loginResp.status !== 400) {
      // Non-400 error (e.g. 429 rate-limit, 5xx, or HTML redirect) — don't try to parse JSON
      const body = await loginResp.text().catch(() => "");
      const hint = body.trimStart().startsWith("<")
        ? "Instagram returned an HTML page — possible rate-limit, IP block, or checkpoint"
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
    try {
      loginData = JSON.parse(loginText);
    } catch {
      const hint = loginText.trimStart().startsWith("<")
        ? "Instagram returned an HTML page — possible rate-limit, IP block, or checkpoint"
        : "Instagram login response was not valid JSON";
      return { success: false, error: hint, errorType: "parse_error" };
    }

    if (loginData.checkpoint_url) {
      return {
        success: false,
        error: "Checkpoint required — Instagram needs additional verification. Try logging in from a browser first.",
        errorType: "checkpoint",
      };
    }

    if (loginData.two_factor_required) {
      return {
        success: false,
        error: "Two-factor authentication required. Please disable 2FA temporarily or use a session cookie.",
        errorType: "two_factor",
      };
    }

    if (!loginData.authenticated) {
      return {
        success: false,
        error: loginData.message ?? "Invalid username or password",
        errorType: loginData.error_type ?? "bad_password",
      };
    }

    // Step 6: extract session cookies from login response
    const loginCookies: string[] = [];
    loginResp.headers.forEach((val, key) => {
      if (key.toLowerCase() === "set-cookie") loginCookies.push(val);
    });

    let sessionId = "";
    let newCsrfToken = csrfToken;
    let dsUserId = loginData.userId ?? "";

    for (const cookie of loginCookies) {
      const sid = cookie.match(/sessionid=([^;]+)/);
      if (sid) sessionId = sid[1];
      const csrf = cookie.match(/csrftoken=([^;]+)/);
      if (csrf) newCsrfToken = csrf[1];
      const ds = cookie.match(/ds_user_id=([^;]+)/);
      if (ds) dsUserId = ds[1];
    }

    if (!sessionId) {
      return { success: false, error: "Login appeared to succeed but no session cookie was returned", errorType: "no_session" };
    }

    // Step 7: fetch user info with the new session
    const userResp = await fetch(
      `${IG_API_BASE}/api/v1/users/${dsUserId || loginData.userId}/info/`,
      {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "X-IG-App-ID": "936619743392459",
          Cookie: `sessionid=${sessionId}; csrftoken=${newCsrfToken}; ds_user_id=${dsUserId}`,
        },
      }
    );

    let fullName = "";
    let profilePicUrl = "";
    let isVerified = false;
    let finalUsername = username;

    if (userResp.ok) {
      const userJson = (await userResp.json()) as {
        user?: {
          full_name?: string;
          profile_pic_url?: string;
          is_verified?: boolean;
          username?: string;
        };
      };
      fullName = userJson.user?.full_name ?? "";
      profilePicUrl = userJson.user?.profile_pic_url ?? "";
      isVerified = userJson.user?.is_verified ?? false;
      finalUsername = userJson.user?.username ?? username;
    }

    // Step 8: persist session
    setSession({
      sessionId,
      csrfToken: newCsrfToken,
      username: finalUsername,
      userId: dsUserId || loginData.userId,
      dsUserId: dsUserId || loginData.userId,
      fullName,
      profilePicUrl,
      isVerified,
    });

    return {
      success: true,
      userId: dsUserId || loginData.userId,
      username: finalUsername,
      fullName,
      profilePicUrl,
      isVerified,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { success: false, error: message, errorType: "exception" };
  }
}

export async function instagramLogout(): Promise<void> {
  const session = getSession();
  if (!session) return;

  try {
    await fetch(`${IG_WEB_BASE}/accounts/logout/ajax/`, {
      method: "POST",
      headers: {
        ...buildInstagramHeaders(),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ one_tap_app_login: "0" }).toString(),
    });
  } catch {
    // best-effort
  } finally {
    clearSession();
  }
}

export async function fetchCurrentUserInfo() {
  const session = getSession();
  if (!session?.userId) return null;

  try {
    const resp = await fetch(
      `${IG_API_BASE}/api/v1/users/${session.userId}/info/`,
      { headers: buildInstagramHeaders() }
    );
    if (!resp.ok) return null;
    const json = (await resp.json()) as { user?: Record<string, unknown> };
    return json.user ?? null;
  } catch {
    return null;
  }
}
