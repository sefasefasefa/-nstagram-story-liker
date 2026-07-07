import { Router } from "express";
import { getSession, setSession, clearSession, isSessionActive } from "../lib/session.js";
import type { SessionInput } from "@workspace/api-zod";

const router = Router();

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

router.delete("/session", (_req, res) => {
  clearSession();
  res.json({ success: true, message: "Session cleared" });
});

export default router;
