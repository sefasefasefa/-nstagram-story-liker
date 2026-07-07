import { buildInstagramHeaders } from "./session.js";
import { addHistoryEntry } from "./history.js";
import { attemptAutoRefresh } from "./auto-session.js";

const IG_API_BASE = "https://i.instagram.com";
const IG_WEB_BASE = "https://www.instagram.com";

export interface ProxyResult {
  success: boolean;
  data?: unknown;
  endpoint: string;
  method: string;
  statusCode: number;
  durationMs: number;
  requestHeaders: Record<string, string>;
  timestamp: string;
  error?: string;
}

async function proxyRequest(
  url: string,
  method: "GET" | "POST",
  label: string,
  options?: { body?: string; extraHeaders?: Record<string, string> }
): Promise<ProxyResult> {
  const start = Date.now();
  const headers = { ...buildInstagramHeaders(), ...(options?.extraHeaders ?? {}) };
  const timestamp = new Date().toISOString();

  let statusCode = 0;
  let success = false;
  let data: unknown;
  let error: string | undefined;

  try {
    let resp = await fetch(url, {
      method,
      headers,
      body: options?.body,
    });

    // 401 → try to refresh session and retry once
    if (resp.status === 401) {
      const refreshed = await attemptAutoRefresh();
      if (refreshed) {
        const freshHeaders = { ...buildInstagramHeaders(), ...(options?.extraHeaders ?? {}) };
        resp = await fetch(url, { method, headers: freshHeaders, body: options?.body });
      }
    }

    statusCode = resp.status;
    success = resp.ok;
    const text = await resp.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    if (!resp.ok) {
      error = `HTTP ${resp.status}: ${resp.statusText}`;
    }
  } catch (err) {
    statusCode = 0;
    error = err instanceof Error ? err.message : String(err);
    success = false;
    data = null;
  }

  const durationMs = Date.now() - start;

  // Sanitize headers for storage (remove Cookie/sessionid for security)
  const safeHeaders = { ...headers };
  if (safeHeaders["Cookie"]) {
    safeHeaders["Cookie"] = safeHeaders["Cookie"].replace(
      /sessionid=[^;]+/,
      "sessionid=***REDACTED***"
    );
  }

  addHistoryEntry({ endpoint: url, method, statusCode, durationMs, success, label });

  return { success, data, endpoint: url, method, statusCode, durationMs, requestHeaders: safeHeaders, timestamp, error };
}

export async function fetchProfile(username: string): Promise<ProxyResult> {
  const url = `${IG_API_BASE}/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`;
  return proxyRequest(url, "GET", `Profile: ${username}`);
}

export async function fetchUserInfo(userId: string): Promise<ProxyResult> {
  const url = `${IG_API_BASE}/api/v1/users/${encodeURIComponent(userId)}/info/`;
  return proxyRequest(url, "GET", `User Info: ${userId}`);
}

export async function fetchPost(shortcode: string): Promise<ProxyResult> {
  // PolarisPostRootQuery — doc_id 27128499623469141 (current as of June 2026)
  const variables = JSON.stringify({ shortcode, share_id: "" });
  const url = `${IG_WEB_BASE}/graphql/query`;
  const body = new URLSearchParams({
    doc_id: "27128499623469141",
    variables,
    "__relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider": "false",
  }).toString();
  return proxyRequest(url, "POST", `Post: ${shortcode}`, {
    body,
    extraHeaders: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

export async function fetchReels(shortcode: string): Promise<ProxyResult> {
  const variables = JSON.stringify({ shortcode });
  const url = `${IG_WEB_BASE}/graphql/query`;
  const body = new URLSearchParams({
    doc_id: "7950326061742207",
    variables,
  }).toString();
  return proxyRequest(url, "POST", `Reels: ${shortcode}`, {
    body,
    extraHeaders: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

export async function fetchHashtag(tag: string, after?: string): Promise<ProxyResult> {
  const variables: Record<string, unknown> = { tag_name: tag, first: 12 };
  if (after) variables["after"] = after;
  const url = `${IG_WEB_BASE}/graphql/query`;
  const body = new URLSearchParams({
    doc_id: "298b92c8d7cad703f7565aa892ede943",
    variables: JSON.stringify(variables),
  }).toString();
  return proxyRequest(url, "POST", `Hashtag: #${tag}`, {
    body,
    extraHeaders: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

export async function fetchStories(): Promise<ProxyResult> {
  const url = `${IG_API_BASE}/api/v1/feed/reels_tray/`;
  return proxyRequest(url, "GET", "Stories Tray");
}

export async function fetchUserFeed(userId: string, after?: string): Promise<ProxyResult> {
  const variables: Record<string, unknown> = { id: userId, first: 12 };
  if (after) variables["after"] = after;
  const url = `${IG_WEB_BASE}/graphql/query`;
  const body = new URLSearchParams({
    doc_id: "9310670392322965",
    variables: JSON.stringify(variables),
  }).toString();
  return proxyRequest(url, "POST", `Feed: ${userId}`, {
    body,
    extraHeaders: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

export async function fetchComments(shortcode: string, after?: string): Promise<ProxyResult> {
  const variables: Record<string, unknown> = { shortcode, first: 20 };
  if (after) variables["after"] = after;
  const url = `${IG_WEB_BASE}/graphql/query`;
  const body = new URLSearchParams({
    doc_id: "33ba35852cb50da46f5b5e889df7d159",
    variables: JSON.stringify(variables),
  }).toString();
  return proxyRequest(url, "POST", `Comments: ${shortcode}`, {
    body,
    extraHeaders: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}

export async function fetchCustomGraphQL(
  docId: string,
  variables: Record<string, unknown>
): Promise<ProxyResult> {
  const url = `${IG_WEB_BASE}/graphql/query`;
  const body = new URLSearchParams({
    doc_id: docId,
    variables: JSON.stringify(variables),
  }).toString();
  return proxyRequest(url, "POST", `GraphQL doc_id: ${docId}`, {
    body,
    extraHeaders: { "Content-Type": "application/x-www-form-urlencoded" },
  });
}
