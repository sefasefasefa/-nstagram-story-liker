import { Router } from "express";
import {
  fetchTimeline,
  likeMedia,
  unlikeMedia,
  fetchStoriesTray,
  fetchUserStories,
  markStorySeen,
} from "../lib/feed.js";
import { startAutoLiker, stopAutoLiker, getStatus } from "../lib/auto-liker.js";
import type { SeenMutationInput } from "@workspace/api-zod";

const router = Router();

// GET /feed/timeline
router.get("/feed/timeline", async (req, res) => {
  const { maxId } = req.query as { maxId?: string };
  const result = await fetchTimeline(maxId);
  res.json(result);
});

// POST /feed/like/:mediaId
router.post("/feed/like/:mediaId", async (req, res) => {
  const { mediaId } = req.params;
  const result = await likeMedia(mediaId);
  res.status(result.success ? 200 : 400).json({ success: result.success, message: result.message });
});

// DELETE /feed/like/:mediaId
router.delete("/feed/like/:mediaId", async (req, res) => {
  const { mediaId } = req.params;
  const result = await unlikeMedia(mediaId);
  res.status(result.success ? 200 : 400).json({ success: result.success, message: result.message });
});

// GET /feed/stories/tray
router.get("/feed/stories/tray", async (_req, res) => {
  const result = await fetchStoriesTray();
  res.json(result);
});

// GET /feed/stories/reel/:userId
router.get("/feed/stories/reel/:userId", async (req, res) => {
  const { userId } = req.params;
  const result = await fetchUserStories(userId);
  res.json(result);
});

// POST /feed/stories/seen
router.post("/feed/stories/seen", async (req, res) => {
  const body = req.body as SeenMutationInput;
  if (!body.reelMediaId || !body.reelId || !body.reelMediaOwnerId) {
    res.status(400).json({ success: false, message: "reelMediaId, reelId, reelMediaOwnerId are required" });
    return;
  }
  const result = await markStorySeen(body);
  res.status(result.success ? 200 : 400).json({ success: result.success, message: result.message });
});

// GET /feed/auto-liker/status
router.get("/feed/auto-liker/status", (_req, res) => {
  res.json(getStatus());
});

// POST /feed/auto-liker/start
router.post("/feed/auto-liker/start", (req, res) => {
  const { intervalMs } = req.body as { intervalMs?: number };
  res.json(startAutoLiker(intervalMs));
});

// POST /feed/auto-liker/stop
router.post("/feed/auto-liker/stop", (_req, res) => {
  res.json(stopAutoLiker());
});

export default router;
