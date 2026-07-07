import { createCipheriv, randomBytes } from "crypto";
import _sodium from "libsodium-wrappers";
import { setSession, clearSession, getSession, buildInstagramHeaders } from "./session.js";

const IG_WEB_BASE = "https://www.instagram.com";
const IG_API_BASE = "https://i.instagram.com";

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Fetch a fresh CSRF token and any initial cookies from the Instagram home page.
 */
async function fetchInitialCsrf(): Promise<{ csrfToken: string; rawSetCookie: string[] }> {
  const resp = await fetch(`${IG_WEB_BASE}/`, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml",
    },
    redirect: "follow",
  });

  const rawSetCookie: string[] = [];
  resp.headers.forEach((val, key) => {
    if (key.toLowerCase() === "set-cookie") rawSetCookie.push(val);
  });

  let csrfToken = "";
  for (const cookie of rawSetCookie) {
    const m = cookie.match(/csrftoken=([^;]+)/);
    if (m) { csrfToken = m[1]; break; }
  }
  // Fallback: parse from HTML meta tag
  if (!csrfToken) {
    const html = await resp.text();
    const m = html.match(/"csrf_token":"([^"]+)"/);
    if (m) csrfToken = m[1];
  }
  return { csrfToken, rawSetCookie };
}

/**
 * Fetch Instagram's current public key for password encryption.
 * Returns { publicKey (base64), keyId }.
 */
async function fetchPublicKey(csrfToken: string): Promise<{ publicKey: string; keyId: number }> {
  const resp = await fetch(
    `${IG_WEB_BASE}/api/v1/web/accounts/login/ajax/get_public_key/`,
    {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "X-IG-App-ID": "936619743392459",
        "X-CSRFToken": csrfToken,
        Referer: `${IG_WEB_BASE}/accounts/login/`,
        Cookie: `csrftoken=${csrfToken}`,
      },
    }
  );
  const data = (await resp.json()) as { public_key: string; key_id: string };
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
    // Step 1: get initial CSRF token
    const { csrfToken, rawSetCookie } = await fetchInitialCsrf();
    if (!csrfToken) {
      return { success: false, error: "Could not fetch CSRF token from Instagram", errorType: "csrf_failed" };
    }

    // Step 2: get encryption public key
    const { publicKey, keyId } = await fetchPublicKey(csrfToken);

    // Step 3: encrypt password
    const encryptedPassword = await encryptPassword(password, publicKey, keyId);

    // Step 4: build cookie header from initial response
    const cookieStr = rawSetCookie
      .map((c) => c.split(";")[0])
      .join("; ");

    // Step 5: POST login
    const body = new URLSearchParams({
      username,
      enc_password: encryptedPassword,
      queryParams: "{}",
      optIntoOneTap: "false",
    });

    const loginResp = await fetch(`${IG_WEB_BASE}/accounts/login/ajax/`, {
      method: "POST",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Content-Type": "application/x-www-form-urlencoded",
        "X-IG-App-ID": "936619743392459",
        "X-ASBD-ID": "129477",
        "X-CSRFToken": csrfToken,
        "X-Instagram-AJAX": "1009848701",
        "X-Requested-With": "XMLHttpRequest",
        Origin: IG_WEB_BASE,
        Referer: `${IG_WEB_BASE}/accounts/login/`,
        Cookie: cookieStr,
      },
      body: body.toString(),
    });

    const loginData = (await loginResp.json()) as {
      authenticated?: boolean;
      userId?: string;
      user?: boolean;
      message?: string;
      error_type?: string;
      checkpoint_url?: string;
      two_factor_required?: boolean;
    };

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
