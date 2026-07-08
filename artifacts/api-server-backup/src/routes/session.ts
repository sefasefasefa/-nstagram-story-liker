import { Router } from "express";
import { finalizeSession } from "../lib/auth-shared.js";

const router = Router();

// POST /session/from-id
// Accept just a sessionId (no csrfToken needed) — fetches csrfToken + user info
// from Instagram automatically. Used when the user pastes a cookie after
// completing checkpoint verification in their own browser.
router.post("/session/from-id", async (req, res) => {
  const { sessionId } = req.body as { sessionId?: string };
  if (!sessionId || sessionId.trim().length < 10) {
    res.status(400).json({ success: false, error: "Geçersiz sessionId" });
    return;
  }
  const sid = sessionId.trim();

  // Fetch csrfToken + userId from Instagram homepage
  let csrfToken = "";
  let userId = "";
  let username = "";
  try {
    const r = await fetch("https://www.instagram.com/", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        Cookie: `sessionid=${sid}`,
        Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    const setCookies = typeof (r.headers as any).getSetCookie === "function"
      ? (r.headers as any).getSetCookie() as string[]
      : (() => {
          const out: string[] = [];
          r.headers.forEach((v, k) => { if (k.toLowerCase() === "set-cookie") out.push(...v.split(/,\s*(?=[A-Za-z0-9_-]+=)/)); });
          return out;
        })();
    for (const c of setCookies) {
      const csrf = c.match(/csrftoken=([^;]+)/); if (csrf) csrfToken = csrf[1];
      const ds   = c.match(/ds_user_id=([^;]+)/); if (ds)   userId   = ds[1];
    }
    if (!csrfToken) {
      // Fall back: extract from html
      const html = await r.text();
      const csrfMatch = html.match(/"csrf_token":"([^"]+)"/);
      if (csrfMatch) csrfToken = csrfMatch[1];
      const uidMatch  = html.match(/"ds_user_id":"([^"]+)"/);
      if (uidMatch)  userId    = uidMatch[1];
      const unMatch   = html.match(/"username":"([^"]+)"/);
      if (unMatch)   username  = unMatch[1];
    }
  } catch (err) {
    res.status(502).json({ success: false, error: `Instagram'a bağlanılamadı: ${String(err)}` });
    return;
  }

  if (!csrfToken) {
    res.status(401).json({ success: false, error: "SessionId geçersiz veya süresi dolmuş — Instagram'dan csrftoken alınamadı." });
    return;
  }

  const result = await finalizeSession({ sessionId: sid, csrfToken, userId, username: username || "unknown" });
  res.json(result);
});

// NOTE: GET/POST/DELETE /session are owned by auth.ts (mounted earlier in
// routes/index.ts) — do not redefine them here to avoid shadowed duplicates.

export default router;
