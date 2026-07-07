/**
 * Shared helpers used by both auth.ts and checkpoint.ts.
 */

import { setSession } from "./session.js";
import type { LoginResult } from "./auth-types.js";

const IG_API_BASE = "https://i.instagram.com";

export async function finalizeSession(params: {
  sessionId: string;
  csrfToken: string;
  userId?: string;
  username: string;
}): Promise<LoginResult> {
  const { sessionId, csrfToken, userId = "", username } = params;

  let fullName = "", profilePicUrl = "", isVerified = false, finalUsername = username;
  try {
    const userResp = await fetch(`${IG_API_BASE}/api/v1/users/${userId}/info/`, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "X-IG-App-ID": "936619743392459",
        Cookie: `sessionid=${sessionId}; csrftoken=${csrfToken}; ds_user_id=${userId}`,
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
