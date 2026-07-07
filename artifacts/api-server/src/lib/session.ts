export interface SessionData {
  sessionId: string;
  csrfToken: string;
  username?: string;
  userId?: string;
  dsUserId?: string;
  fullName?: string;
  profilePicUrl?: string;
  isVerified?: boolean;
}

let currentSession: SessionData | null = null;

export function getSession(): SessionData | null {
  return currentSession;
}

export function setSession(data: SessionData): void {
  currentSession = data;
}

export function clearSession(): void {
  currentSession = null;
}

export function isSessionActive(): boolean {
  return currentSession !== null && !!currentSession.sessionId && !!currentSession.csrfToken;
}

export function buildInstagramHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "X-IG-App-ID": "936619743392459",
    "X-ASBD-ID": "129477",
    "X-IG-WWW-Claim": "0",
    "X-Instagram-AJAX": "1009848701",
    Accept: "*/*",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    Origin: "https://www.instagram.com",
    Referer: "https://www.instagram.com/",
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
  };

  if (currentSession) {
    headers["X-CSRFToken"] = currentSession.csrfToken;
    const cookieParts: string[] = [
      `csrftoken=${currentSession.csrfToken}`,
      `sessionid=${currentSession.sessionId}`,
    ];
    if (currentSession.dsUserId) {
      cookieParts.push(`ds_user_id=${currentSession.dsUserId}`);
    }
    headers["Cookie"] = cookieParts.join("; ");
  }

  return headers;
}
