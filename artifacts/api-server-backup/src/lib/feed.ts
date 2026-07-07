import { buildInstagramHeaders, getSession } from "./session.js";
import { addHistoryEntry } from "./history.js";
import { attemptAutoRefresh } from "./auto-session.js";

/**
 * Returns true when a response is an HTML page (Instagram login/checkpoint
 * redirect) masquerading as a success response.
 */
function isHtmlRedirect(resp: Response): boolean {
  const ct = resp.headers.get("content-type") ?? "";
  return ct.includes("text/html");
}

/** A synthetic 401 JSON response used when Instagram returns an HTML redirect. */
function htmlRedirectResponse(): Response {
  return new Response(
    JSON.stringify({ error: "Instagram returned a login redirect — session may need refresh" }),
    { status: 401, headers: { "content-type": "application/json" } }
  );
}

/** Fetch with automatic 401 → token-refresh → retry logic.
 *  Also converts "200 OK + HTML" responses (Instagram checkpoint pages)
 *  into a proper 401 so callers can handle them uniformly. */
async function igFetch(url: string, init: RequestInit): Promise<Response> {
  let resp = await fetch(url, init);

  // Treat HTML redirects the same as 401s
  if (resp.ok && isHtmlRedirect(resp)) resp = htmlRedirectResponse();

  if (resp.status === 401) {
    const ok = await attemptAutoRefresh();
    if (ok) {
      // Rebuild auth headers entirely from the refreshed session.
      // Do NOT merge stale pre-refresh headers — that would re-send the old
      // Cookie / X-CSRFToken and produce another 401.
      const freshHeaders = buildInstagramHeaders();
      // Preserve any non-auth request-specific headers (Content-Type, etc.)
      // but let session headers win.
      const overrides = (init.headers as Record<string, string> | undefined) ?? {};
      const merged: Record<string, string> = {};
      for (const [k, v] of Object.entries(overrides)) {
        const lower = k.toLowerCase();
        if (lower !== "cookie" && lower !== "x-csrftoken") merged[k] = v;
      }
      resp = await fetch(url, { ...init, headers: { ...merged, ...freshHeaders } });
      // Check again — retried request might also get a checkpoint page
      if (resp.ok && isHtmlRedirect(resp)) resp = htmlRedirectResponse();
    }
  }
  return resp;
}

const IG_API_BASE = "https://i.instagram.com";

// ── Type helpers ─────────────────────────────────────────────────────────────

interface IgUser {
  pk: string;
  username: string;
  full_name?: string;
  profile_pic_url?: string;
  is_verified?: boolean;
}

interface IgImageCandidate { url: string; width: number; height: number }
interface IgVideoVersion { url: string }

interface IgMediaItem {
  pk: string;
  id: string;
  code?: string;
  media_type: number;
  image_versions2?: { candidates: IgImageCandidate[] };
  video_versions?: IgVideoVersion[];
  caption?: { text?: string } | null;
  like_count?: number;
  comment_count?: number;
  has_liked?: boolean;
  taken_at?: number;
  user?: IgUser;
  carousel_media?: IgMediaItem[];
}

// ── Mappers ───────────────────────────────────────────────────────────────────

function mapUser(u: IgUser) {
  return {
    userId: u.pk,
    username: u.username,
    fullName: u.full_name,
    profilePicUrl: u.profile_pic_url ?? "",
    isVerified: u.is_verified ?? false,
  };
}

function bestImage(item: IgMediaItem): string {
  const candidates = item.image_versions2?.candidates ?? [];
  return candidates[0]?.url ?? "";
}

function mapCarousel(items: IgMediaItem[]) {
  return items.map((c) => ({
    mediaId: c.pk,
    mediaType: c.media_type,
    imageUrl: bestImage(c),
    videoUrl: c.video_versions?.[0]?.url ?? null,
  }));
}

function mapTimelineItem(item: IgMediaItem) {
  return {
    mediaId: item.pk,
    shortcode: item.code ?? item.id,
    mediaType: item.media_type,
    imageUrl: bestImage(item),
    videoUrl: item.video_versions?.[0]?.url ?? null,
    caption: item.caption?.text ?? "",
    likeCount: item.like_count ?? 0,
    commentCount: item.comment_count ?? 0,
    hasLiked: item.has_liked ?? false,
    timestamp: item.taken_at ?? 0,
    author: item.user ? mapUser(item.user) : { userId: "", username: "", profilePicUrl: "" },
    carouselMedia: item.carousel_media ? mapCarousel(item.carousel_media) : [],
  };
}

// ── API calls ─────────────────────────────────────────────────────────────────

export async function fetchTimeline(maxId?: string) {
  const start = Date.now();
  const url = new URL(`${IG_API_BASE}/api/v1/feed/timeline/`);
  if (maxId) url.searchParams.set("max_id", maxId);

  let statusCode = 0;
  try {
    const resp = await igFetch(url.toString(), {
      method: "GET",
      headers: buildInstagramHeaders(),
    });
    statusCode = resp.status;
    addHistoryEntry({ endpoint: url.toString(), method: "GET", statusCode, durationMs: Date.now() - start, success: resp.ok, label: "Timeline Feed" });

    if (!resp.ok) {
      const text = await resp.text();
      return { items: [], moreAvailable: false, error: `HTTP ${resp.status}: ${text.slice(0, 200)}` };
    }

    const json = (await resp.json()) as {
      feed_items?: Array<{ media_or_ad?: IgMediaItem }>;
      items?: IgMediaItem[];
      next_max_id?: string;
      more_available?: boolean;
      num_results?: number;
    };

    const rawItems: IgMediaItem[] =
      json.feed_items?.map((fi) => fi.media_or_ad).filter(Boolean) as IgMediaItem[] ??
      json.items ?? [];

    const items = rawItems.map(mapTimelineItem);
    return {
      items,
      nextMaxId: json.next_max_id ?? null,
      moreAvailable: json.more_available ?? false,
    };
  } catch (err) {
    addHistoryEntry({ endpoint: url.toString(), method: "GET", statusCode: 0, durationMs: Date.now() - start, success: false, label: "Timeline Feed" });
    return { items: [], moreAvailable: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function likeMedia(mediaId: string): Promise<{ success: boolean; message?: string }> {
  const start = Date.now();
  const url = `${IG_API_BASE}/api/v1/media/${mediaId}/like/`;

  const session = getSession();
  const headers = {
    ...buildInstagramHeaders(),
    "Content-Type": "application/x-www-form-urlencoded",
  };

  try {
    const body = new URLSearchParams({
      media_id: mediaId,
      ...(session?.userId ? { d: "0" } : {}),
    });
    const resp = await igFetch(url, { method: "POST", headers, body: body.toString() });
    addHistoryEntry({ endpoint: url, method: "POST", statusCode: resp.status, durationMs: Date.now() - start, success: resp.ok, label: `Like: ${mediaId}` });
    return { success: resp.ok, message: resp.ok ? "Liked" : `HTTP ${resp.status}` };
  } catch (err) {
    addHistoryEntry({ endpoint: url, method: "POST", statusCode: 0, durationMs: Date.now() - start, success: false, label: `Like: ${mediaId}` });
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function unlikeMedia(mediaId: string): Promise<{ success: boolean; message?: string }> {
  const start = Date.now();
  const url = `${IG_API_BASE}/api/v1/media/${mediaId}/unlike/`;
  const headers = { ...buildInstagramHeaders(), "Content-Type": "application/x-www-form-urlencoded" };

  try {
    const body = new URLSearchParams({ media_id: mediaId });
    const resp = await igFetch(url, { method: "POST", headers, body: body.toString() });
    addHistoryEntry({ endpoint: url, method: "POST", statusCode: resp.status, durationMs: Date.now() - start, success: resp.ok, label: `Unlike: ${mediaId}` });
    return { success: resp.ok, message: resp.ok ? "Unliked" : `HTTP ${resp.status}` };
  } catch (err) {
    addHistoryEntry({ endpoint: url, method: "POST", statusCode: 0, durationMs: Date.now() - start, success: false, label: `Unlike: ${mediaId}` });
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchStoriesTray() {
  const start = Date.now();
  const url = `${IG_API_BASE}/api/v1/feed/reels_tray/`;

  try {
    const resp = await igFetch(url, { headers: buildInstagramHeaders() });
    addHistoryEntry({ endpoint: url, method: "GET", statusCode: resp.status, durationMs: Date.now() - start, success: resp.ok, label: "Stories Tray" });

    if (!resp.ok) return { reels: [], error: `HTTP ${resp.status}` };

    const json = (await resp.json()) as {
      tray?: Array<{
        id?: string;
        user?: IgUser;
        latest_reel_media?: number;
        expiring_at?: number;
        seen?: number | null;
        has_besties_media?: boolean;
      }>;
    };

    const reels = (json.tray ?? []).map((t) => ({
      userId: t.id ?? t.user?.pk ?? "",
      user: t.user ? mapUser(t.user) : { userId: "", username: "", profilePicUrl: "" },
      latestReelMedia: t.latest_reel_media ?? 0,
      expiringAt: t.expiring_at ?? 0,
      seen: t.seen ?? null,
      hasBestiesMedia: t.has_besties_media ?? false,
    }));

    return { reels };
  } catch (err) {
    addHistoryEntry({ endpoint: url, method: "GET", statusCode: 0, durationMs: Date.now() - start, success: false, label: "Stories Tray" });
    return { reels: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchUserStories(userId: string) {
  const start = Date.now();
  const url = `${IG_API_BASE}/api/v1/feed/reels_media/?reel_ids=${userId}`;

  try {
    const resp = await igFetch(url, { headers: buildInstagramHeaders() });
    addHistoryEntry({ endpoint: url, method: "GET", statusCode: resp.status, durationMs: Date.now() - start, success: resp.ok, label: `User Stories: ${userId}` });

    if (!resp.ok) return { userId, items: [], error: `HTTP ${resp.status}` };

    const json = (await resp.json()) as {
      reels_media?: Array<{
        user?: IgUser;
        items?: Array<{
          pk?: string;
          id?: string;
          media_type?: number;
          image_versions2?: { candidates: IgImageCandidate[] };
          video_versions?: IgVideoVersion[];
          expiring_at?: number;
          taken_at?: number;
          has_liked?: boolean;
          viewer_count?: number;
        }>;
      }>;
    };

    const reel = json.reels_media?.[0];
    const user = reel?.user ? mapUser(reel.user) : { userId, username: "", profilePicUrl: "" };

    const items = (reel?.items ?? []).map((s) => ({
      storyId: s.pk ?? s.id ?? "",
      mediaType: s.media_type ?? 1,
      imageUrl: s.image_versions2?.candidates?.[0]?.url ?? "",
      videoUrl: s.video_versions?.[0]?.url ?? null,
      expiringAt: s.expiring_at ?? 0,
      takenAt: s.taken_at ?? 0,
      hasLiked: s.has_liked ?? false,
      viewCount: s.viewer_count ?? null,
    }));

    return { userId, user, items };
  } catch (err) {
    addHistoryEntry({ endpoint: url, method: "GET", statusCode: 0, durationMs: Date.now() - start, success: false, label: `User Stories: ${userId}` });
    return { userId, items: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function markStorySeen(payload: {
  reelMediaId: string;
  reelId: string;
  reelMediaOwnerId: string;
  reelMediaTakenAt: number;
  viewSeenAt: number;
}): Promise<{ success: boolean; message?: string }> {
  const start = Date.now();
  const url = `${IG_API_BASE}/api/v1/media/seen/?reel=1&live_vod=0`;
  const headers = { ...buildInstagramHeaders(), "Content-Type": "application/x-www-form-urlencoded" };

  const body = new URLSearchParams({
    reelMediaId: payload.reelMediaId,
    reelId: payload.reelId,
    reelMediaOwnerId: payload.reelMediaOwnerId,
    reelMediaTakenAt: String(payload.reelMediaTakenAt),
    viewSeenAt: String(payload.viewSeenAt),
  });

  try {
    const resp = await igFetch(url, { method: "POST", headers, body: body.toString() });
    addHistoryEntry({ endpoint: url, method: "POST", statusCode: resp.status, durationMs: Date.now() - start, success: resp.ok, label: "Mark Story Seen" });
    return { success: resp.ok };
  } catch (err) {
    addHistoryEntry({ endpoint: url, method: "POST", statusCode: 0, durationMs: Date.now() - start, success: false, label: "Mark Story Seen" });
    return { success: false, message: err instanceof Error ? err.message : String(err) };
  }
}
