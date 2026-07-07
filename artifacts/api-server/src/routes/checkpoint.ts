import { Router } from "express";
import {
  getPendingCheckpoint,
  startCheckpointChallenge,
  verifyCheckpointCode,
  clearPendingCheckpoint,
} from "../lib/checkpoint.js";
const router = Router();

// GET /auth/checkpoint/status
// Returns whether a checkpoint is pending and what method will be used.
router.get("/auth/checkpoint/status", (_req, res) => {
  const cp = getPendingCheckpoint();
  if (!cp) {
    res.json({ pending: false });
    return;
  }
  res.json({
    pending: true,
    method: cp.verifyMethod ?? null,
    contact: cp.contact ?? null,
  });
});

// POST /auth/checkpoint/request-code
// Navigates the checkpoint page and asks Instagram to send a verification code.
router.post("/auth/checkpoint/request-code", async (_req, res) => {
  const cp = getPendingCheckpoint();
  if (!cp) {
    res.status(400).json({ success: false, error: "No pending checkpoint" });
    return;
  }
  const result = await startCheckpointChallenge();
  res.json(result);
});

// POST /auth/checkpoint/verify
// Submits the user-entered code to Instagram to complete login.
router.post("/auth/checkpoint/verify", async (req, res) => {
  const { code } = req.body as { code?: string };
  if (!code || code.trim().length < 4) {
    res.status(400).json({ success: false, error: "A verification code is required" });
    return;
  }
  const result = await verifyCheckpointCode(code.trim());
  res.json(result);
});

// DELETE /auth/checkpoint
// Cancel the pending checkpoint (user gave up).
router.delete("/auth/checkpoint", (_req, res) => {
  clearPendingCheckpoint();
  res.json({ success: true });
});

export default router;
