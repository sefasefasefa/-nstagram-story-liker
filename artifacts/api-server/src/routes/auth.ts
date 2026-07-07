import { Router } from "express";
import { instagramLogin, instagramLogout } from "../lib/auth.js";
import { getSession, setSession, clearSession, isSessionActive } from "../lib/session.js";
import type { LoginCredentials, SessionInput } from "@workspace/api-zod";

const router = Router();

// POST /auth/login
router.post("/auth/login", async (req, res) => {
  const { username, password } = req.body as LoginCredentials;
  if (!username || !password) {
    res.status(400).json({ success: false, error: "username and password are required" });
    return;
  }
  const result = await instagramLogin(username, password);
  res.status(result.success ? 200 : 401).json(result);
});

// POST /auth/logout
router.post("/auth/logout", async (_req, res) => {
  await instagramLogout();
  res.json({ success: true, message: "Logged out" });
});

// GET /auth/me
router.get("/auth/me", (_req, res) => {
  const session = getSession();
  if (!isSessionActive() || !session) {
    res.json({ loggedIn: false });
    return;
  }
  res.json({
    loggedIn: true,
    userId: session.userId,
    username: session.username,
    fullName: session.fullName,
    profilePicUrl: session.profilePicUrl,
    isVerified: session.isVerified ?? false,
  });
});

// GET /session
router.get("/session", (_req, res) => {
  const session = getSession();
  res.json({
    active: isSessionActive(),
    username: session?.username,
    userId: session?.userId,
    csrfToken: session?.csrfToken ? "***" + session.csrfToken.slice(-4) : undefined,
    hasSessionId: !!session?.sessionId,
  });
});

// POST /session (manual cookie injection)
router.post("/session", (req, res) => {
  const body = req.body as SessionInput;
  if (!body.sessionId || !body.csrfToken) {
    res.status(400).json({ success: false, error: "sessionId and csrfToken are required" });
    return;
  }
  setSession({
    sessionId: body.sessionId,
    csrfToken: body.csrfToken,
    username: body.username,
    userId: body.userId,
    dsUserId: body.dsUserId,
  });
  const session = getSession()!;
  res.json({
    active: true,
    username: session.username,
    userId: session.userId,
    csrfToken: "***" + session.csrfToken.slice(-4),
    hasSessionId: true,
  });
});

// DELETE /session
router.delete("/session", (_req, res) => {
  clearSession();
  res.json({ success: true, message: "Session cleared" });
});

export default router;
