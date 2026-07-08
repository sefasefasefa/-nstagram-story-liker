/**
 * Instagram checkpoint / challenge handler.
 *
 * auth_platform checkpoints (/auth_platform/?apc=…) use Instagram's mobile
 * challenge API (i.instagram.com/api/v1/challenge/) which returns JSON and
 * reliably triggers SMS/email codes.
 *
 * Legacy /challenge/{userId}/{token}/ checkpoints use the web form flow.
 */

import { randomBytes, randomUUID } from "crypto";
import { logger } from "./logger.js";
import { finalizeSession } from "./auth-shared.js";
import type { LoginResult } from "./auth-types.js";

const IG_WEB_BASE  = "https://www.instagram.com";
const IG_API_BASE  = "https://i.instagram.com";
const MOBILE_UA    =
  "Instagram 275.0.0.27.98 Android (33/13; 420dpi; 1080x2337; Xiaomi; 2201116PG; topaz; qcom; en_US; 453779684)";

// ── State ─────────────────────────────────────────────────────────────────────

export interface CheckpointState {
  checkpointUrl: string;          // as returned by Instagram (may be relative)
  cookies: string[];              // Set-Cookie values from the failed login
  csrfToken: string;
  username: string;
  // Which client type produced this checkpoint. The challenge session Instagram
  // creates is bound to the client that triggered it — an auth_platform checkpoint
  // born from the browser-style web login (accounts/login/ajax) is only solvable
  // through the www.instagram.com JSON API with browser headers; one born from the
  // real mobile private API is only solvable through i.instagram.com with Android
  // headers. Crossing the two makes Instagram silently reply {action:"close"}.
  origin: "web" | "mobile";
  // Populated after startChallenge():
  verifyMethod?: "sms" | "email" | "unknown";
  contact?: string;               // masked phone/email
  usesMobileApi?: boolean;        // true → use i.instagram.com/api/v1/challenge/ for verify
  usesWebPlatformApi?: boolean;   // true → use www.instagram.com/api/v1/challenge/ for verify
  mobileUuid?: string;
  mobileDeviceId?: string;
}

let pending: CheckpointState | null = null;

export function setPendingCheckpoint(state: CheckpointState): void { pending = state; }
export function getPendingCheckpoint(): CheckpointState | null { return pending; }
export function clearPendingCheckpoint(): void { pending = null; }

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
    if (key.toLowerCase() === "set-cookie")
      out.push(...val.split(/,\s*(?=[A-Za-z0-9_-]+=)/));
  });
  return out;
}

function mergeCookies(base: string[], incoming: string[]): string[] {
  const map = new Map<string, string>();
  for (const c of [...base, ...incoming]) map.set(c.split("=")[0].trim(), c);
  return Array.from(map.values());
}

function absorb(state: CheckpointState, headers: Headers): void {
  const fresh = getSetCookies(headers);
  if (fresh.length) {
    state.cookies = mergeCookies(state.cookies, fresh);
    for (const c of fresh) {
      const m = c.match(/csrftoken=([^;]+)/);
      if (m) state.csrfToken = m[1];
    }
  }
}

// ── Mobile API challenge (auth_platform) ─────────────────────────────────────

async function mobileHeaders(state: CheckpointState): Promise<Record<string, string>> {
  return {
    "User-Agent":      MOBILE_UA,
    Accept:            "*/*",
    "X-IG-App-ID":     "567067343352427",
    "X-ASBD-ID":       "198387",
    "X-CSRFToken":     state.csrfToken,
    "Accept-Language": "en-US,en;q=0.9",
    // Instagram's edge now rejects i.instagram.com requests missing these —
    // even from a "mobile" client — with a bare "SecFetch Policy violation." body.
    "Sec-Fetch-Site":  "same-origin",
    "Sec-Fetch-Mode":  "cors",
    "Sec-Fetch-Dest":  "empty",
    Origin:            IG_WEB_BASE,
    Referer:           new URL(state.checkpointUrl, IG_WEB_BASE).toString(),
    Cookie:            cookieStrFrom(state.cookies),
  };
}

/** True when Instagram's edge rejected the request outright (e.g. "SecFetch Policy violation.")
 *  rather than returning its normal JSON challenge payload. Callers must not treat this as a
 *  benign "unknown method" case — the request never reached the challenge flow at all. */
function isWafBlockBody(rawText: string): boolean {
  const t = rawText.trim();
  return t.length > 0 && !t.startsWith("{") && !t.startsWith("[");
}

// ── Web-platform API challenge (auth_platform, born from a browser-style login) ──
// Same JSON endpoint shape as the mobile private API, but served on www.instagram.com
// with browser identity (web X-IG-App-ID, Chrome UA, XHR headers) instead of the
// Android app identity — because the challenge session is bound to whichever client
// (web vs mobile) actually triggered the checkpoint.

async function webPlatformHeaders(state: CheckpointState): Promise<Record<string, string>> {
  return {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    Accept:             "*/*",
    "X-IG-App-ID":      "936619743392459",
    "X-ASBD-ID":        "198387",
    "X-CSRFToken":      state.csrfToken,
    "X-Requested-With": "XMLHttpRequest",
    "X-IG-WWW-Claim":   "0",
    "Accept-Language":  "en-US,en;q=0.9",
    "Sec-Fetch-Site":   "same-origin",
    "Sec-Fetch-Mode":   "cors",
    "Sec-Fetch-Dest":   "empty",
    Origin:             IG_WEB_BASE,
    Referer:            new URL(state.checkpointUrl, IG_WEB_BASE).toString(),
    Cookie:             cookieStrFrom(state.cookies),
  };
}

async function startWebPlatformChallenge(state: CheckpointState): Promise<StartChallengeResult> {
  const uuid     = randomUUID().replace(/-/g, "");
  const deviceId = "web-" + randomBytes(8).toString("hex");
  state.mobileUuid     = uuid;
  state.mobileDeviceId = deviceId;

  const hdrs = await webPlatformHeaders(state);
  const infoUrl =
    `${IG_WEB_BASE}/api/v1/challenge/` +
    `?challenge_url=${encodeURIComponent(state.checkpointUrl)}` +
    `&guid=${uuid}&device_id=${deviceId}&_uuid=${uuid}`;

  let method: "sms" | "email" | "unknown" = "unknown";
  let contact: string | undefined;

  try {
    const r = await fetch(infoUrl, { headers: hdrs });
    absorb(state, r.headers);
    const rawText = await r.text();
    logger.info({ status: r.status, body: rawText.slice(0, 400) }, "checkpoint: web-platform GET raw");

    if (isWafBlockBody(rawText)) {
      logger.warn({ status: r.status, body: rawText.slice(0, 200) }, "checkpoint: web-platform GET blocked by edge (non-JSON)");
      return {
        success: false,
        error: `Instagram bu isteği reddetti (${rawText.trim().slice(0, 120)}). Sunucunun IP adresi engellenmiş olabilir.`,
      };
    }

    const data = JSON.parse(rawText) as any;
    logger.info({ stepName: data.step_name, phone: data.phone_number, email: data.email, action: data.action }, "checkpoint: web-platform GET");

    if (data.phone_number) { method = "sms";   contact = data.phone_number; }
    else if (data.email)   { method = "email"; contact = data.email; }
  } catch (err) {
    logger.warn({ err }, "checkpoint: web-platform GET failed");
    return { success: false, error: `Instagram'a bağlanılamadı: ${String(err)}` };
  }

  state.verifyMethod = method;
  state.contact      = contact;

  const choice = method === "email" ? "0" : "1";
  const body = new URLSearchParams({
    choice,
    _uuid:      uuid,
    _csrftoken: state.csrfToken,
    guid:       uuid,
    device_id:  deviceId,
  }).toString();

  try {
    const r = await fetch(`${IG_WEB_BASE}/api/v1/challenge/`, {
      method: "POST",
      headers: {
        ...await webPlatformHeaders(state),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    absorb(state, r.headers);
    const rawText = await r.text();
    logger.info({ status: r.status, body: rawText.slice(0, 400) }, "checkpoint: web-platform choice POST raw");

    if (isWafBlockBody(rawText)) {
      logger.warn({ status: r.status, body: rawText.slice(0, 200) }, "checkpoint: web-platform choice POST blocked by edge (non-JSON)");
      return {
        success: false,
        error: `Instagram bu isteği reddetti (${rawText.trim().slice(0, 120)}). Sunucunun IP adresi engellenmiş olabilir.`,
      };
    }

    const data = JSON.parse(rawText) as any;
    logger.info({ stepName: data.step_name, status: r.status, action: data.action }, "checkpoint: web-platform choice POST");

    if (data.action === "close" && !data.phone_number && !data.email) {
      // Instagram closed the challenge without offering a code — this checkpoint
      // can't be resolved via the web-platform JSON API for this session either.
      return {
        success: false,
        error: "Instagram bu oturum için doğrulama kodu göndermeyi reddetti. Hesap, bu sunucudan gelen girişleri script/bot olarak işaretlemiş olabilir.",
      };
    }

    if (data.step_name === "verify_code" || r.ok) {
      state.usesWebPlatformApi = true;
      if (data.phone_number && !contact) { method = "sms"; contact = data.phone_number; state.verifyMethod = "sms"; state.contact = contact; }
      if (data.email && !contact)        { method = "email"; contact = data.email; state.verifyMethod = "email"; state.contact = contact; }
      return { success: true, method, contact };
    }

    return { success: false, error: data.message ?? "Instagram doğrulama kodu gönderemedi" };
  } catch (err) {
    logger.warn({ err }, "checkpoint: web-platform choice POST failed");
    return { success: false, error: String(err) };
  }
}

async function verifyWebPlatform(state: CheckpointState, code: string): Promise<LoginResult> {
  const uuid     = state.mobileUuid     ?? randomUUID().replace(/-/g, "");
  const deviceId = state.mobileDeviceId ?? "web-" + randomBytes(8).toString("hex");

  let resp: Response;
  try {
    resp = await fetch(`${IG_WEB_BASE}/api/v1/challenge/`, {
      method: "POST",
      headers: {
        ...await webPlatformHeaders(state),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        security_code: code,
        _uuid:         uuid,
        _csrftoken:    state.csrfToken,
        guid:          uuid,
        device_id:     deviceId,
      }).toString(),
    });
  } catch (err) {
    return { success: false, error: `Network error: ${String(err)}`, errorType: "network" };
  }

  absorb(state, resp.headers);
  const text = await resp.text().catch(() => "");
  logger.info({ status: resp.status, preview: text.slice(0, 200) }, "checkpoint: web-platform verify");

  if (isWafBlockBody(text)) {
    logger.warn({ status: resp.status, body: text.slice(0, 200) }, "checkpoint: web-platform verify blocked by edge (non-JSON)");
    return {
      success: false,
      error: `Instagram bu isteği reddetti (${text.trim().slice(0, 120)}). Sunucunun IP adresi engellenmiş olabilir.`,
      errorType: "ip_block",
    };
  }

  let data: any = {};
  try { data = JSON.parse(text); } catch { /* HTML response */ }

  if (data.logged_in_user) {
    const u = data.logged_in_user;
    const cookies = state.cookies;
    let sessionId = "", csrfToken = state.csrfToken, userId = String(u.pk ?? "");
    for (const c of cookies) {
      const sid  = c.match(/sessionid=([^;]+)/);  if (sid)  sessionId  = sid[1];
      const csrf = c.match(/csrftoken=([^;]+)/);  if (csrf) csrfToken  = csrf[1];
    }
    if (!sessionId) return { success: false, error: "Code accepted but no session cookie received", errorType: "no_session" };
    clearPendingCheckpoint();
    return await finalizeSession({ sessionId, csrfToken, userId, username: u.username ?? state.username });
  }

  if (data.step_name === "verify_code") {
    return { success: false, error: "Kod hatalı veya süresi dolmuş. Lütfen tekrar dene.", errorType: "bad_code" };
  }

  const errMsg = data.message ?? data.errors?.nonce?.[0] ?? "Kod geçersiz veya süresi dolmuş.";
  return { success: false, error: errMsg, errorType: "bad_code" };
}

async function startMobileChallenge(state: CheckpointState): Promise<StartChallengeResult> {
  const uuid     = randomUUID().replace(/-/g, "");
  const deviceId = "android-" + randomBytes(8).toString("hex");
  state.mobileUuid     = uuid;
  state.mobileDeviceId = deviceId;

  const hdrs = await mobileHeaders(state);

  // Step 1 — GET challenge info
  const infoUrl =
    `${IG_API_BASE}/api/v1/challenge/` +
    `?challenge_url=${encodeURIComponent(state.checkpointUrl)}` +
    `&guid=${uuid}&device_id=${deviceId}&_uuid=${uuid}`;

  let method: "sms" | "email" | "unknown" = "unknown";
  let contact: string | undefined;

  try {
    const r = await fetch(infoUrl, { headers: hdrs });
    absorb(state, r.headers);
    const rawText = await r.text();
    logger.info({ status: r.status, body: rawText.slice(0, 400) }, "checkpoint: mobile GET raw");

    if (isWafBlockBody(rawText)) {
      logger.warn({ status: r.status, body: rawText.slice(0, 200) }, "checkpoint: mobile GET blocked by edge (non-JSON)");
      return {
        success: false,
        error: `Instagram bu isteği reddetti (${rawText.trim().slice(0, 120)}). Sunucunun IP adresi engellenmiş olabilir.`,
      };
    }

    const data = JSON.parse(rawText) as any;
    logger.info({ stepName: data.step_name, phone: data.phone_number, email: data.email }, "checkpoint: mobile GET");

    if (data.phone_number) { method = "sms";   contact = data.phone_number; }
    else if (data.email)   { method = "email"; contact = data.email; }
    else if (data.step_name === "delta_login_review") {
      // Instagram wants the user to confirm the login — no code needed
      // Try to approve automatically
      method = "unknown";
    }
  } catch (err) {
    logger.warn({ err }, "checkpoint: mobile GET failed");
    return { success: false, error: `Instagram'a bağlanılamadı: ${String(err)}` };
  }

  state.verifyMethod = method;
  state.contact      = contact;

  // Step 2 — POST choice to trigger code send
  const choice = method === "email" ? "0" : "1";
  const body = new URLSearchParams({
    choice,
    _uuid:      uuid,
    _csrftoken: state.csrfToken,
    guid:       uuid,
    device_id:  deviceId,
  }).toString();

  try {
    const r = await fetch(`${IG_API_BASE}/api/v1/challenge/`, {
      method: "POST",
      headers: {
        ...await mobileHeaders(state),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });
    absorb(state, r.headers);
    const rawText = await r.text();
    logger.info({ status: r.status, body: rawText.slice(0, 400) }, "checkpoint: mobile choice POST raw");

    if (isWafBlockBody(rawText)) {
      logger.warn({ status: r.status, body: rawText.slice(0, 200) }, "checkpoint: mobile choice POST blocked by edge (non-JSON)");
      return {
        success: false,
        error: `Instagram bu isteği reddetti (${rawText.trim().slice(0, 120)}). Sunucunun IP adresi engellenmiş olabilir.`,
      };
    }

    const data = JSON.parse(rawText) as any;
    logger.info({ stepName: data.step_name, status: r.status }, "checkpoint: mobile choice POST");

    if (data.step_name === "verify_code" || r.ok) {
      state.usesMobileApi = true;
      if (data.phone_number && !contact) { method = "sms"; contact = data.phone_number; state.verifyMethod = "sms"; state.contact = contact; }
      if (data.email && !contact)        { method = "email"; contact = data.email; state.verifyMethod = "email"; state.contact = contact; }
      return { success: true, method, contact };
    }

    return { success: false, error: data.message ?? "Instagram doğrulama kodu gönderemedi" };
  } catch (err) {
    logger.warn({ err }, "checkpoint: mobile choice POST failed");
    return { success: false, error: String(err) };
  }
}

// ── Web/legacy challenge (/challenge/{userId}/{token}/) ────────────────────────

async function startWebChallenge(state: CheckpointState): Promise<StartChallengeResult> {
  const cookieStr = cookieStrFrom(state.cookies);
  const base      = state.checkpointUrl.startsWith("http")
    ? state.checkpointUrl
    : `${IG_WEB_BASE}${state.checkpointUrl}`;

  // GET the challenge page to extract the form action + contact info
  let challengeUrl = base;
  let method: "sms" | "email" | "unknown" = "unknown";
  let contact: string | undefined;

  try {
    const r = await fetch(base, {
      headers: {
        "User-Agent":  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Accept:        "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
        "X-CSRFToken": state.csrfToken,
        Cookie:        cookieStr,
      },
      redirect: "follow",
    });
    absorb(state, r.headers);
    const html = await r.text();

    const actionMatch =
      html.match(/action="(\/challenge\/[^"]+)"/) ||
      html.match(/["'](\/challenge\/[a-zA-Z0-9_\-/]+\/)["']/);
    if (actionMatch) challengeUrl = `${IG_WEB_BASE}${actionMatch[1]}`;

    const phoneMatch = html.match(/\+[\d*\s]+[\d]{2}/) || html.match(/"phone_number"\s*:\s*"([^"]+)"/);
    const emailMatch = html.match(/[a-z*]+@[a-z*]+\.[a-z]+/)  || html.match(/"email"\s*:\s*"([^@"]+@[^"]+)"/);
    if (phoneMatch) { method = "sms";   contact = phoneMatch[1] ?? phoneMatch[0]; }
    else if (emailMatch) { method = "email"; contact = emailMatch[1] ?? emailMatch[0]; }
  } catch (err) {
    logger.warn({ err }, "checkpoint: web GET failed");
  }

  state.verifyMethod = method;
  state.contact      = contact;

  // POST choice
  const choices = method === "email" ? ["0", "1"] : ["1", "0"];
  for (const choice of choices) {
    try {
      const r = await fetch(challengeUrl, {
        method: "POST",
        headers: {
          "User-Agent":       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
          "Content-Type":     "application/x-www-form-urlencoded",
          "X-CSRFToken":      state.csrfToken,
          "X-Requested-With": "XMLHttpRequest",
          Cookie:             cookieStrFrom(state.cookies),
          Origin:             IG_WEB_BASE,
          Referer:            base,
        },
        body: new URLSearchParams({ choice }).toString(),
      });
      absorb(state, r.headers);
      const text = await r.text().catch(() => "");
      logger.info({ choice, status: r.status, isJson: !text.trimStart().startsWith("<") }, "checkpoint: web choice POST");

      // If we got JSON back that's a success indicator
      if (!text.trimStart().startsWith("<")) {
        try {
          const data = JSON.parse(text) as any;
          if (data.status === "ok" || data.action === "CHALLENGE") {
            state.usesMobileApi = false;
            return { success: true, method, contact };
          }
        } catch { /* not JSON */ }
      }
    } catch (err) {
      logger.warn({ err, choice }, "checkpoint: web choice POST error");
    }
  }

  // Even if choice POST returned HTML, the code may have been sent — let user try
  state.usesMobileApi = false;
  return { success: true, method, contact };
}

// ── Public API ────────────────────────────────────────────────────────────────

export interface StartChallengeResult {
  success: boolean;
  method?: "sms" | "email" | "unknown";
  contact?: string;
  error?: string;
}

export async function startCheckpointChallenge(): Promise<StartChallengeResult> {
  if (!pending) return { success: false, error: "No pending checkpoint" };

  const isAuthPlatform = pending.checkpointUrl.includes("auth_platform") || pending.checkpointUrl.includes("apc=");
  if (isAuthPlatform) {
    // The challenge session Instagram created is bound to whichever client
    // (web login vs mobile app login) actually triggered it — crossing the two
    // makes Instagram silently reply {action:"close"} without ever sending a code.
    return pending.origin === "mobile"
      ? await startMobileChallenge(pending)
      : await startWebPlatformChallenge(pending);
  }
  return await startWebChallenge(pending);
}

export async function verifyCheckpointCode(code: string): Promise<LoginResult> {
  if (!pending) return { success: false, error: "No pending checkpoint", errorType: "no_checkpoint" };

  if (pending.usesMobileApi) {
    return await verifyMobile(pending, code);
  }
  if (pending.usesWebPlatformApi) {
    return await verifyWebPlatform(pending, code);
  }
  return await verifyWeb(pending, code);
}

// ── Mobile verify ─────────────────────────────────────────────────────────────

async function verifyMobile(state: CheckpointState, code: string): Promise<LoginResult> {
  const uuid     = state.mobileUuid     ?? randomUUID().replace(/-/g, "");
  const deviceId = state.mobileDeviceId ?? "android-" + randomBytes(8).toString("hex");

  let resp: Response;
  try {
    resp = await fetch(`${IG_API_BASE}/api/v1/challenge/`, {
      method: "POST",
      headers: {
        ...await mobileHeaders(state),
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        security_code: code,
        _uuid:         uuid,
        _csrftoken:    state.csrfToken,
        guid:          uuid,
        device_id:     deviceId,
      }).toString(),
    });
  } catch (err) {
    return { success: false, error: `Network error: ${String(err)}`, errorType: "network" };
  }

  absorb(state, resp.headers);
  const text = await resp.text().catch(() => "");
  logger.info({ status: resp.status, preview: text.slice(0, 200) }, "checkpoint: mobile verify");

  if (isWafBlockBody(text)) {
    logger.warn({ status: resp.status, body: text.slice(0, 200) }, "checkpoint: mobile verify blocked by edge (non-JSON)");
    return {
      success: false,
      error: `Instagram bu isteği reddetti (${text.trim().slice(0, 120)}). Sunucunun IP adresi engellenmiş olabilir.`,
      errorType: "ip_block",
    };
  }

  let data: any = {};
  try { data = JSON.parse(text); } catch { /* HTML response */ }

  if (data.logged_in_user) {
    const u = data.logged_in_user;
    const cookies = state.cookies;
    let sessionId = "", csrfToken = state.csrfToken, userId = String(u.pk ?? "");
    for (const c of cookies) {
      const sid  = c.match(/sessionid=([^;]+)/);  if (sid)  sessionId  = sid[1];
      const csrf = c.match(/csrftoken=([^;]+)/);  if (csrf) csrfToken  = csrf[1];
    }
    if (!sessionId) return { success: false, error: "Code accepted but no session cookie received", errorType: "no_session" };
    clearPendingCheckpoint();
    return await finalizeSession({ sessionId, csrfToken, userId, username: u.username ?? state.username });
  }

  if (data.step_name === "verify_code") {
    return { success: false, error: "Kod hatalı veya süresi dolmuş. Lütfen tekrar dene.", errorType: "bad_code" };
  }

  const errMsg = data.message ?? data.errors?.nonce?.[0] ?? "Kod geçersiz veya süresi dolmuş.";
  return { success: false, error: errMsg, errorType: "bad_code" };
}

// ── Web verify ────────────────────────────────────────────────────────────────

async function verifyWeb(state: CheckpointState, code: string): Promise<LoginResult> {
  const base = state.checkpointUrl.startsWith("http")
    ? state.checkpointUrl
    : `${IG_WEB_BASE}${state.checkpointUrl}`;

  let resp: Response;
  try {
    resp = await fetch(base, {
      method: "POST",
      headers: {
        "User-Agent":       "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "Content-Type":     "application/x-www-form-urlencoded",
        "X-CSRFToken":      state.csrfToken,
        "X-Requested-With": "XMLHttpRequest",
        Cookie:             cookieStrFrom(state.cookies),
        Origin:             IG_WEB_BASE,
        Referer:            base,
      },
      body: new URLSearchParams({ security_code: code }).toString(),
    });
  } catch (err) {
    return { success: false, error: `Network error: ${String(err)}`, errorType: "network" };
  }

  absorb(state, resp.headers);
  const text = await resp.text().catch(() => "");
  logger.info({ status: resp.status, preview: text.slice(0, 200) }, "checkpoint: web verify");

  let data: any = {};
  try { data = JSON.parse(text); } catch { /* HTML */ }

  const hasSession = state.cookies.some((c) => c.startsWith("sessionid=") && !c.includes("sessionid=;"));
  if (data.authenticated === true || hasSession) {
    let sessionId = "", csrfToken = state.csrfToken, userId = "";
    for (const c of state.cookies) {
      const sid  = c.match(/sessionid=([^;]+)/);  if (sid)  sessionId = sid[1];
      const csrf = c.match(/csrftoken=([^;]+)/);  if (csrf) csrfToken = csrf[1];
      const ds   = c.match(/ds_user_id=([^;]+)/); if (ds)   userId    = ds[1];
    }
    if (!sessionId) return { success: false, error: "Code accepted but no session cookie received", errorType: "no_session" };
    clearPendingCheckpoint();
    return await finalizeSession({ sessionId, csrfToken, userId, username: state.username });
  }

  const errMsg = data.message ?? data.errors?.nonce?.[0] ?? "Kod geçersiz veya süresi dolmuş.";
  return { success: false, error: errMsg, errorType: "bad_code" };
}
